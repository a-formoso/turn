// ============================================================================
// Cinema Machine — Stripe webhook  (Supabase Edge Function)
//
// Turns a paid subscription into generation credits. Metadata-driven: it reads
// `app`, `tier` and `plan_credits` off the PRODUCT, so changing a plan's credits
// is a Stripe dashboard edit — never a code change. It ignores any product whose
// `app` metadata isn't "cinema-machine", so your Academy / mentorship products
// on the same Stripe account never grant app credits.
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

/** Read tier + credits off a subscription's product metadata. Returns null for
 *  anything that isn't a Cinema Machine plan (so other brand products are ignored). */
function readPlan(sub: Stripe.Subscription): { tier: string; credits: number } | null {
  const price = sub.items?.data?.[0]?.price as Stripe.Price | undefined;
  const product = price?.product;                       // expanded to the full object
  const md = (product && typeof product === "object" ? (product as Stripe.Product).metadata : null) || {};
  if (md.app !== "cinema-machine") return null;
  const credits = parseInt(md.plan_credits ?? "0", 10);
  if (!Number.isFinite(credits) || credits <= 0) return null;
  return { tier: md.tier || "member", credits };
}

/** Find the app user behind a Stripe customer (renewals/cancellations carry the
 *  customer, not the client_reference_id — we stored the mapping on first purchase). */
async function uidByCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await admin.from("turn_credits")
    .select("owner").eq("stripe_customer_id", customerId).maybeSingle();
  return (data as { owner?: string } | null)?.owner ?? null;
}

async function setPlan(uid: string, sub: Stripe.Subscription, customerId: string) {
  const plan = readPlan(sub);
  if (!plan) return;
  await admin.rpc("turn_set_plan", {
    uid,
    new_tier: plan.tier,
    monthly_credits: plan.credits,
    sub_id: sub.id,
    customer_id: customerId,
    renews: new Date((sub.current_period_end ?? 0) * 1000).toISOString(),
  });
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
        if (s.mode === "subscription" && s.client_reference_id && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string, {
            expand: ["items.data.price.product"],
          });
          await setPlan(s.client_reference_id, sub, s.customer as string);
        }
        break;
      }
      // MONTHLY renewal — refill to the plan allowance (mapped via stored customer)
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.billing_reason === "subscription_cycle" && inv.subscription) {
          const uid = await uidByCustomer(inv.customer as string);
          if (uid) {
            const sub = await stripe.subscriptions.retrieve(inv.subscription as string, {
              expand: ["items.data.price.product"],
            });
            await setPlan(uid, sub, inv.customer as string);
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
