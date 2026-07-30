// ── fal.ai PRICE-DRIFT CHECKER (admin-only, read-only) ───────────────────────
//
// Cinema Machine's credit costs derive at runtime from the provider-USD table
// in app/pricing.jsx (TURN_PRICING). That only stays honest while the table
// matches fal's REAL prices. fal has no pricing API, but its public model
// search endpoint (https://fal.ai/api/models?keywords=<slug>) returns each
// model's `pricingInfoOverride` — the same "you will be charged $X/second"
// text shown on the model page, WITHOUT the bot-protected HTML shell.
//
// This function fetches that text for every model in TURN_PRICING, parses the
// current USD prices, and returns machine-readable items the browser diffs
// against its live table. It NEVER writes anything: applying new numbers is a
// separate, admin-reviewed click in the app (turn_app_config
// "pricing-overrides", written by the browser under admin RLS).
//
// FAIL-SAFE BY DESIGN:
//   • a price is only emitted when its specific regex matches AND the number
//     passes sanity bounds; anything else lands in `failures` and produces NO
//     diff — never a zero/garbage price.
//   • token-priced models (GPT Image 2, Nano Banana 2 Lite, Seedance's
//     token-formula resolutions) don't state a flat per-image/per-second price,
//     so we emit the parsed TOKEN RATE as a "rate" item. The client scales the
//     existing table value by rate/referenceRate — a rate that halves halves
//     the table price — and remembers the applied rate as the next reference.
//
// Response: { ok, checkedAt, items:[AbsItem|RateItem], failures:[{model,reason}] }
//   AbsItem  = { kind:"abs",  path, usd, source }
//   RateItem = { kind:"rate", id, rate, unit, defaultRef, paths, source, note }
//
// Auth: requires a signed-in ADMIN (same email allowlist as image-proxy).
// Deploy (per project convention — server-side bundling, JWT verification ON):
//   npx -y supabase@latest functions deploy pricing-watch --project-ref <ref> --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const ADMIN_EMAILS = ["admin@infinitestudioai.com"];
const FAL_SEARCH = "https://fal.ai/api/models?keywords=";
const UA =
  "Mozilla/5.0 (compatible; CinemaMachine-PricingWatch/1.0; admin price audit)";

// ── parse helpers ────────────────────────────────────────────────────────────
function money(s: string): number {
  return Number(String(s).replace(/,/g, ""));
}
function firstMatch(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const v = money(m[1]);
  return Number.isFinite(v) ? v : null;
}
// sanity bounds — a parsed number outside these is treated as a parse failure
function sanePrice(v: number | null): v is number {
  return v !== null && Number.isFinite(v) && v > 0.0005 && v < 100;
}
function saneRate(v: number | null): v is number {
  return v !== null && Number.isFinite(v) && v > 0.00005 && v < 10000;
}

type Item =
  | { kind: "abs"; path: string; usd: number; source: string }
  | {
    kind: "rate";
    id: string;
    rate: number;
    unit: string;
    defaultRef: number;
    paths: string[];
    source: string;
    note: string;
  };
type Failure = { model: string; reason: string };

class Collector {
  items: Item[] = [];
  failures: Failure[] = [];
  constructor(private source: string) {}
  abs(path: string, usd: number | null, what: string) {
    if (sanePrice(usd)) this.items.push({ kind: "abs", path, usd, source: this.source });
    else this.failures.push({ model: this.source, reason: what + " not found/insane" });
  }
  rate(
    id: string,
    rate: number | null,
    unit: string,
    defaultRef: number,
    paths: string[],
    note: string,
  ) {
    if (saneRate(rate)) {
      this.items.push({ kind: "rate", id, rate, unit, defaultRef, paths, source: this.source, note });
    } else this.failures.push({ model: this.source, reason: id + " rate not found/insane" });
  }
  fail(reason: string) {
    this.failures.push({ model: this.source, reason });
  }
}

async function falPricingText(slug: string): Promise<string> {
  const res = await fetch(FAL_SEARCH + encodeURIComponent(slug), {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error("fal search HTTP " + res.status);
  const data = await res.json();
  const item = (data?.items || []).find((x: { id?: string }) => x?.id === slug);
  if (!item) throw new Error("model not in fal search results");
  // strip markdown bold so regexes see plain "$0.15 per image"
  return String(item.pricingInfoOverride || "").replace(/\*+/g, "");
}

// ── per-model checks — one entry per fal page we watch ──────────────────────
// Reference token rates (defaultRef) are the rates that correspond to the
// table committed in app/pricing.jsx on 2026-07-25. After the admin applies a
// change, the browser stores the applied rate in the overrides config
// (tokenRefs), which supersedes defaultRef — so a change is never re-applied.
const CHECKS: Array<{ slug: string; run: (t: string, c: Collector) => void }> = [
  {
    // Nano Banana Pro → gemini-3-pro-image. Flat $/image (1K & 2K), 4K double.
    slug: "fal-ai/nano-banana-pro",
    run(t, c) {
      const base = firstMatch(t, /\$\s*([\d.,]+)\s*per image/i);
      c.abs("image.providerUsd.gemini-3-pro-image.1K", base, "per-image price");
      c.abs("image.providerUsd.gemini-3-pro-image.2K", base, "per-image price");
      if (sanePrice(base) && /4K outputs? will be charged at double/i.test(t)) {
        c.abs("image.providerUsd.gemini-3-pro-image.4K", base * 2, "4K price");
      } else c.fail("4K 'double' multiplier text not found");
    },
  },
  {
    // Nano Banana 2 → gemini-3.1-flash-image. Flat $/image at 1K; the page
    // states explicit 2K / 4K multipliers ("charged at 1.5 times and 2 times").
    slug: "fal-ai/nano-banana-2",
    run(t, c) {
      const base = firstMatch(t, /\$\s*([\d.,]+)\s*per image/i);
      c.abs("image.providerUsd.gemini-3.1-flash-image.1K", base, "per-image price");
      const m = t.match(
        /2K and 4K outputs? will be charged at\s*([\d.,]+)\s*times and\s*([\d.,]+)\s*times/i,
      );
      if (sanePrice(base) && m) {
        c.abs("image.providerUsd.gemini-3.1-flash-image.2K", base * money(m[1]), "2K price");
        c.abs("image.providerUsd.gemini-3.1-flash-image.4K", base * money(m[2]), "4K price");
      } else c.fail("2K/4K multiplier text not found");
    },
  },
  {
    // Nano Banana 2 Lite → gemini-3.1-flash-lite-image. Token-priced (per-1M
    // image output tokens); scale the whole tier column by the rate change.
    slug: "google/nano-banana-2-lite",
    run(t, c) {
      const rate = firstMatch(t, /Image tokens \(per 1M\):[^\n]*?\$\s*([\d.,]+)\s*output/i);
      c.rate(
        "nb2-lite-image-output-tokens",
        rate,
        "$/1M image output tokens",
        37.5, // rate in force when the 07-25 table was written
        [
          "image.providerUsd.gemini-3.1-flash-lite-image.1K",
          "image.providerUsd.gemini-3.1-flash-lite-image.2K",
          "image.providerUsd.gemini-3.1-flash-lite-image.4K",
        ],
        "derived: table × (new rate / reference rate)",
      );
    },
  },
  {
    // GPT Image 2 — token-priced; per-quality USD scales with the image output
    // token rate. Reference $60/1M matches the 07-25 table (high $0.317); the
    // 2026-07-30 manual check found the live rate at $30/1M → high ≈ $0.158.
    slug: "openai/gpt-image-2",
    run(t, c) {
      const rate = firstMatch(t, /Image tokens \(per 1M\):[^\n]*?\$\s*([\d.,]+)\s*output/i);
      c.rate(
        "gpt-image-2-image-output-tokens",
        rate,
        "$/1M image output tokens",
        60,
        [
          "image.providerUsd.gpt-image-2.low",
          "image.providerUsd.gpt-image-2.medium",
          "image.providerUsd.gpt-image-2.high",
        ],
        "derived: table × (new rate / reference rate)",
      );
    },
  },
  {
    // Seedance 2.0 Standard — 720p/1080p stated flat $/second; 480p and 4K are
    // token-formula priced, so those scale with their per-1000-token rates.
    slug: "bytedance/seedance-2.0/image-to-video",
    run(t, c) {
      c.abs(
        "video.providerUsdPerSecond.seedance-2.0.standard.720p",
        firstMatch(t, /720p[^$]*?\$\s*([\d.,]+)\s*\/\s*second/i),
        "720p $/second",
      );
      c.abs(
        "video.providerUsdPerSecond.seedance-2.0.standard.1080p",
        firstMatch(t, /1080p[^$]*?\$\s*([\d.,]+)\s*\/\s*second/i),
        "1080p $/second",
      );
      c.rate(
        "seedance-std-sd-tokens",
        firstMatch(t, /\$\s*([\d.,]+)\s*per 1000 tokens for\s*480p/i),
        "$/1000 tokens (480p–1080p)",
        0.014,
        ["video.providerUsdPerSecond.seedance-2.0.standard.480p"],
        "derived: table × (new rate / reference rate)",
      );
      c.rate(
        "seedance-std-4k-tokens",
        firstMatch(t, /\$\s*([\d.,]+)\s*per 1000 tokens for\s*4k/i),
        "$/1000 tokens (4K)",
        0.008,
        ["video.providerUsdPerSecond.seedance-2.0.standard.4K"],
        "derived: table × (new rate / reference rate)",
      );
    },
  },
  {
    // Seedance 2.0 Fast — 720p stated flat $/second; 480p token-formula.
    slug: "bytedance/seedance-2.0/fast/image-to-video",
    run(t, c) {
      c.abs(
        "video.providerUsdPerSecond.seedance-2.0.fast.720p",
        firstMatch(t, /720p[^$]*?\$\s*([\d.,]+)\s*\/\s*second/i),
        "720p $/second",
      );
      c.rate(
        "seedance-fast-tokens",
        firstMatch(t, /\$\s*([\d.,]+)\s*per 1000 tokens/i),
        "$/1000 tokens",
        0.0112,
        ["video.providerUsdPerSecond.seedance-2.0.fast.480p"],
        "derived: table × (new rate / reference rate)",
      );
    },
  },
  {
    // Kling 3.0 Standard — Cinema Machine renders with NATIVE AUDIO ON, so the
    // "(audio on)" per-second price is the one the table carries (flat across
    // resolutions, matching fal's flat pricing).
    slug: "fal-ai/kling-video/v3/standard/image-to-video",
    run(t, c) {
      const usd = firstMatch(t, /or\s*\$\s*([\d.,]+)\s*\(audio on\)/i);
      for (const r of ["480p", "720p", "1080p"]) {
        c.abs(`video.providerUsdPerSecond.kling-3.0.standard.${r}`, usd, "audio-on $/second");
      }
    },
  },
  {
    // Kling 3.0 Pro — same shape as Standard.
    slug: "fal-ai/kling-video/v3/pro/image-to-video",
    run(t, c) {
      const usd = firstMatch(t, /or\s*\$\s*([\d.,]+)\s*\(audio on\)/i);
      for (const r of ["480p", "720p", "1080p"]) {
        c.abs(`video.providerUsdPerSecond.kling-3.0.pro.${r}`, usd, "audio-on $/second");
      }
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  // ── auth: signed-in ADMIN only (mirrors image-proxy's own check) ───────────
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in required." }, 401);
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) return json({ error: "Sign in required." }, 401);
    if (!ADMIN_EMAILS.includes(String(user.email || "").toLowerCase())) {
      return json({ error: "Admin only." }, 403);
    }
  } catch (_e) {
    return json({ error: "Could not verify your session." }, 401);
  }

  const items: Item[] = [];
  const failures: Failure[] = [];
  await Promise.all(CHECKS.map(async (chk) => {
    const c = new Collector(chk.slug);
    try {
      const text = await falPricingText(chk.slug);
      if (!text.trim()) throw new Error("empty pricing text");
      chk.run(text, c);
    } catch (e) {
      c.fail(String((e as Error)?.message || e));
    }
    items.push(...c.items);
    failures.push(...c.failures);
  }));

  return json({ ok: true, checkedAt: new Date().toISOString(), items, failures });
});
