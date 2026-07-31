// ============================================================================
// Cinema Machine — Stripe webhook  (Supabase Edge Function)
//
// Turns a paid subscription into generation credits, and one-off credit packs into
// top-ups. Metadata-driven: it reads `app`, `tier` and `plan_credits` off plan
// PRODUCTS, and `app`, `kind=credit_pack`, `pack_credits` off pack PRODUCTS, so
// changing grants is a Stripe dashboard edit. It ignores any product whose `app`
// metadata isn't "cinema-machine", so your Academy / mentorship products on the
// same Stripe account never grant app credits.
//
// SETUP (once):
//   1. supabase functions deploy stripe-webhook --no-verify-jwt
//        (Stripe calls this unauthenticated — JWT verification MUST be off.)
//   2. In Stripe → Developers → Webhooks → add endpoint:
//        https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//        events: checkout.session.completed, invoice.paid,
//                customer.subscription.deleted
//      Copy the endpoint's "Signing secret" (whsec_…).
//   3. Set the secrets:
//        supabase secrets set STRIPE_SECRET_KEY=sk_test_…
//        supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_…
//      (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// The customer's Supabase user id rides in as the Checkout `client_reference_id`
// (the app appends ?client_reference_id=<uid> to the payment link) — so we know
// exactly whose balance to credit, with no email matching.
// ============================================================================
import Stripe from "npm:stripe@16";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,   // service role — bypasses RLS
);

/** A grant the webhook could not perform. Logged loudly AND persisted to
 *  public.turn_grant_failures so missed credits are findable without Stripe access. */
async function reportGrantFailure(args: {
  event: Stripe.Event;
  reason: string;
  customerId?: string | null;
  sessionId?: string | null;
  subId?: string | null;
  productId?: string | null;
  uid?: string | null;
  details?: Record<string, unknown>;
}) {
  const row = {
    event_id: args.event.id,
    event_type: args.event.type,
    reason: args.reason,
    stripe_customer_id: args.customerId ?? null,
    stripe_session_id: args.sessionId ?? null,
    stripe_sub_id: args.subId ?? null,
    stripe_product_id: args.productId ?? null,
    uid: args.uid ?? null,
    details: args.details ?? {},
  };
  // Greppable marker — `GRANT_FAILURE` — with every id needed to trace it in Stripe.
  console.error(`GRANT_FAILURE reason=${args.reason}`, JSON.stringify(row));
  const { error } = await admin.from("turn_grant_failures").insert(row);
  if (error) console.error("GRANT_FAILURE_PERSIST_ERROR:", error.message, JSON.stringify(row));
}

/** Read tier + credits off a subscription's product metadata. Returns the plan,
 *  or a failure reason when the product isn't a valid Cinema Machine plan.
 *  `app !== "cinema-machine"` is NOT a failure — other brand products on the same
 *  Stripe account are deliberately ignored (reason "other_app" lets callers skip silently). */
function readPlan(sub: Stripe.Subscription):
  | { ok: true; tier: string; credits: number; productId: string | null }
  | { ok: false; reason: string; productId: string | null; details: Record<string, unknown> } {
  const price = sub.items?.data?.[0]?.price as Stripe.Price | undefined;
  const product = price?.product;                       // expanded to the full object
  const productId = typeof product === "string" ? product
    : (product && typeof product === "object" ? (product as Stripe.Product).id : null);
  const md = (product && typeof product === "object" ? (product as Stripe.Product).metadata : null) || {};
  if (md.app !== "cinema-machine") {
    return md.app
      ? { ok: false, reason: "other_app", productId, details: { app: md.app } }
      : { ok: false, reason: "missing_app_metadata", productId, details: { metadata: md } };
  }
  const credits = parseInt(md.plan_credits ?? "0", 10);
  if (!Number.isFinite(credits) || credits <= 0) {
    return { ok: false, reason: "invalid_plan_credits", productId, details: { plan_credits: md.plan_credits ?? null, tier: md.tier ?? null } };
  }
  return { ok: true, tier: md.tier || "member", credits, productId };
}

/** Read a one-off credit-pack grant from a Checkout line item's product metadata. */
function readCreditPack(product: Stripe.Price.Product | undefined | null): number {
  const md = (product && typeof product === "object" && !("deleted" in product)
    ? (product as Stripe.Product).metadata
    : null) || {};
  if (md.app !== "cinema-machine" || md.kind !== "credit_pack") return 0;
  const credits = parseInt(md.pack_credits ?? "0", 10);
  return Number.isFinite(credits) && credits > 0 ? credits : 0;
}

/** Find the app user behind a Stripe customer (renewals/cancellations carry the
 *  customer, not the client_reference_id — we stored the mapping on first purchase). */
async function uidByCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await admin.from("turn_credits")
    .select("owner").eq("stripe_customer_id", customerId).maybeSingle();
  return (data as { owner?: string } | null)?.owner ?? null;
}

async function setPlan(uid: string, sub: Stripe.Subscription, customerId: string, event: Stripe.Event, sessionId?: string | null) {
  const plan = readPlan(sub);
  if (!plan.ok) {
    // Other-brand products on the same Stripe account are ignored by design.
    if (plan.reason !== "other_app") {
      await reportGrantFailure({
        event, reason: plan.reason, customerId, sessionId: sessionId ?? null,
        subId: sub.id, productId: plan.productId, uid, details: plan.details,
      });
    }
    return;
  }
  const { error } = await admin.rpc("turn_set_plan", {
    uid,
    new_tier: plan.tier,
    monthly_credits: plan.credits,
    sub_id: sub.id,
    customer_id: customerId,
    renews: new Date((sub.current_period_end ?? 0) * 1000).toISOString(),
  });
  if (error) throw error;   // 500 → Stripe retries, instead of silently dropping the grant
}

async function addCreditPack(uid: string, session: Stripe.Checkout.Session, event: Stripe.Event) {
  const items = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ["data.price.product"],
  });
  let credits = 0;
  let sawCinemaProduct = false;
  const badProducts: Array<Record<string, unknown>> = [];
  for (const item of items.data) {
    const product = item.price?.product;
    const md = (product && typeof product === "object" && !("deleted" in product)
      ? (product as Stripe.Product).metadata : null) || {};
    if (md.app === "cinema-machine") {
      sawCinemaProduct = true;
      const grant = readCreditPack(product);
      if (grant) {
        credits += grant * Math.max(1, item.quantity ?? 1);
      } else {
        badProducts.push({
          product_id: typeof product === "string" ? product : (product as Stripe.Product)?.id ?? null,
          kind: md.kind ?? null, pack_credits: md.pack_credits ?? null,
        });
      }
    }
  }
  if (!credits) {
    if (sawCinemaProduct || items.data.length === 0) {
      // A cinema-machine payment produced ZERO credits — never swallow this.
      await reportGrantFailure({
        event,
        reason: sawCinemaProduct ? "pack_zero_credits" : "no_line_items",
        customerId: (session.customer as string) ?? null,
        sessionId: session.id, uid: session.client_reference_id,
        productId: (badProducts[0]?.product_id as string) ?? null,
        details: { bad_products: badProducts, line_items: items.data.length },
      });
    }
    return;
  }
  const { error } = await admin.rpc("turn_apply_pack_once", {
    event_id: event.id,
    uid,
    amount: credits,
    event_type: event.type,
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Bad signature: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      // FIRST purchase — the only event carrying client_reference_id (the app uid)
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "subscription" && !s.client_reference_id && s.subscription) {
          // Paid subscription with no app uid attached — we cannot credit anyone.
          // Only flag it when it's actually a cinema-machine plan (other brands
          // on the same Stripe account legitimately checkout without a uid).
          const sub = await stripe.subscriptions.retrieve(s.subscription as string, {
            expand: ["items.data.price.product"],
          });
          const plan = readPlan(sub);
          if (plan.ok || plan.reason !== "other_app") {
            await reportGrantFailure({
              event, reason: "missing_client_reference_id",
              customerId: (s.customer as string) ?? null, sessionId: s.id,
              subId: sub.id, productId: plan.productId,
              details: plan.ok ? { tier: plan.tier, credits: plan.credits } : plan.details,
            });
          }
        }
        if (s.mode === "subscription" && s.client_reference_id && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string, {
            expand: ["items.data.price.product"],
          });
          await setPlan(s.client_reference_id, sub, s.customer as string, event, s.id);
        }
        if (s.mode === "payment" && s.client_reference_id) {
          await addCreditPack(s.client_reference_id, s, event);
        }
        if (s.mode === "payment" && !s.client_reference_id) {
          // Only flag it when the payment actually contains a cinema-machine pack.
          const items = await stripe.checkout.sessions.listLineItems(s.id, {
            limit: 100, expand: ["data.price.product"],
          });
          const cinema = items.data.some((it) => {
            const p = it.price?.product;
            return !!(p && typeof p === "object" && !("deleted" in p) &&
              (p as Stripe.Product).metadata?.app === "cinema-machine");
          });
          if (cinema) {
            await reportGrantFailure({
              event, reason: "missing_client_reference_id",
              customerId: (s.customer as string) ?? null, sessionId: s.id,
            });
          }
        }
        break;
      }
      // MONTHLY renewal — refill to the plan allowance (mapped via stored customer)
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.billing_reason === "subscription_cycle" && inv.subscription) {
          const uid = await uidByCustomer(inv.customer as string);
          const sub = await stripe.subscriptions.retrieve(inv.subscription as string, {
            expand: ["items.data.price.product"],
          });
          if (uid) {
            await setPlan(uid, sub, inv.customer as string, event);
          } else {
            const plan = readPlan(sub);
            // Unknown customers only matter when it's OUR product being renewed.
            if (plan.ok || plan.reason !== "other_app") {
              await reportGrantFailure({
                event, reason: "unknown_customer",
                customerId: (inv.customer as string) ?? null,
                subId: inv.subscription as string, productId: plan.productId,
                details: plan.ok ? { tier: plan.tier, credits: plan.credits } : plan.details,
              });
            }
          }
        }
        break;
      }
      // CANCELLATION — drop the plan; the user keeps any credits already paid for
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = await uidByCustomer(sub.customer as string);
        if (uid) await admin.rpc("turn_end_plan", { uid });
        break;
      }
    }
  } catch (err) {
    console.error("handler error:", (err as Error).message);
    return new Response("handler error", { status: 500 });   // Stripe will retry
  }

  return new Response("ok", { status: 200 });
});
