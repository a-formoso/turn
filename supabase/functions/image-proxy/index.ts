// supabase/functions/image-proxy/index.ts
//
// TURN generation proxy.
//
// WHY THIS EXISTS
//   The TURN web app runs entirely in the browser. This Edge Function runs on
//   Supabase's servers and makes provider calls server-side. It can use either
//   a signed-in user's per-request key (sent from their local browser store) or
//   the platform's provider key from SERVER SECRETS. Image generation is fal.ai
//   first: the client sends provider:"fal" and this function maps TURN model ids
//   to fal.ai Nano Banana / GPT Image routes. Writing/text providers, Stage video,
//   and ElevenLabs voice-library operations keep their existing routes.
//
// SECURITY
//   - Only signed-in TURN users may call it: we verify the caller's Supabase
//     access token resolves to a real user (anonymous/anon-key calls are rejected).
//   - Platform keys live in the function's environment. User-supplied keys are
//     accepted only in the signed-in request body and are never returned.
//
// DEPLOY (you must run these — I can't deploy from the design environment):
//   1. Log in (no global install — runs via npx):  npx supabase login
//   2. Link your project:                          npx supabase link --project-ref vubenblfdzginlqiglzw
//   3. Set the server secrets (your provider keys): npx supabase secrets set OPENAI_API_KEY=sk-...
//                                                   npx supabase secrets set GOOGLE_API_KEY=...
//                                                   npx supabase secrets set ELEVENLABS_API_KEY=...  (voice — the Stage)
//                                                   npx supabase secrets set FAL_KEY=...             (images + video via fal.ai)
//   4. Deploy:                                      npx supabase functions deploy image-proxy --no-verify-jwt
//   5. In app/supabase-config.js set  imageProxy: true
//
//   NOTE on --no-verify-jwt: this function verifies the user itself (sb.auth.getUser
//   below) and answers the CORS OPTIONS preflight. If you deploy WITHOUT that flag,
//   Supabase's gateway enforces its own JWT check first and rejects the browser's
//   unauthenticated preflight with 401 — so every call fails. The flag hands auth to
//   this function; sign-in is still required, just enforced here rather than upstream.
//
// Adding more providers later: branch on `provider` below and add its call +
// secret (e.g. REPLICATE_API_TOKEN). The client already sends { provider, model }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// GPT Image 2 accepts custom dimensions (multiples of 16, max edge 3840).
// Map TURN's resolution tier + native aspect to exact provider output pixels.
// These are generated dimensions, not a client-side upscale after the fact.
function sizeForAspect(aspect: string, imageSize: string): string {
  const tier = ["1K", "2K", "4K"].includes(imageSize) ? imageSize : "2K";
  const sizes: Record<string, Record<string, string>> = {
    "16:9": { "1K": "1280x720",  "2K": "2048x1152", "4K": "3840x2160" },
    "9:16": { "1K": "720x1280",  "2K": "1152x2048", "4K": "2160x3840" },
    "21:9": { "1K": "1344x576", "2K": "2688x1152", "4K": "3808x1632" },
    "1:1":  { "1K": "1024x1024", "2K": "2048x2048", "4K": "3840x3840" },
    "3:4":  { "1K": "768x1024",  "2K": "1536x2048", "4K": "2880x3840" },
    "4:3":  { "1K": "1024x768",  "2K": "2048x1536", "4K": "3840x2880" },
  };
  return (sizes[aspect] || sizes["16:9"])[tier];
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:(.*?);base64,(.*)$/.exec(dataUrl || "");
  if (!m) return null;
  const mime = m[1] || "image/png";
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000);
    bin += String.fromCharCode(...chunk);
  }
  return btoa(bin);
}

const CREDIT_SCALE = 10;
const BASE_PROVIDER_USD_PER_CREDIT = 0.30;
const IMAGE_PROVIDER_USD: Record<string, Record<string, number>> = {
  "gemini-3.1-flash-lite-image": { "1K": 0.034, "2K": 0.050, "4K": 0.076 },
  "gemini-3.1-flash-image": { "1K": 0.067, "2K": 0.101, "4K": 0.151 },
  "gemini-3-pro-image": { "1K": 0.134, "2K": 0.134, "4K": 0.240 },
  "gpt-image-2": { low: 0.009, medium: 0.080, high: 0.317 },
};
const TEXT_PROVIDER_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 15, output: 75 },
  "claude-fable-5": { input: 25, output: 100 },
  "gemini-3.5-flash": { input: 0.35, output: 1.05 },
  "gpt-5.5": { input: 10, output: 30 },
  "kimi-k3": { input: 2, output: 8 },
  "kimi-k2.7-code": { input: 0.5, output: 2 },
  default: { input: 1, output: 4 },
};
function creditsFromProviderUsd(usd: number): number {
  return Math.max(1, Math.ceil(((Number(usd) || 0) / BASE_PROVIDER_USD_PER_CREDIT) * CREDIT_SCALE));
}
function imageUsageEstimate(model: string, imageSize: string, quality: string) {
  const table = IMAGE_PROVIDER_USD[model] || {};
  const key = /^gpt-image/i.test(model || "") ? (quality || "medium") : (imageSize || "2K");
  const providerCostUsd = Number(table[key] ?? table.medium ?? table["2K"] ?? 0);
  return { providerCostUsd, credits: creditsFromProviderUsd(providerCostUsd) };
}
function normaliseTextUsage(provider: string, data: any) {
  const u = data?.usage || data?.usageMetadata || data?.usage_metadata || {};
  if (provider === "anthropic") {
    return {
      inputTokens: Number(u.input_tokens || 0) || 0,
      outputTokens: Number(u.output_tokens || 0) || 0,
    };
  }
  if (provider === "google") {
    return {
      inputTokens: Number(u.promptTokenCount || u.prompt_token_count || 0) || 0,
      outputTokens: Number(u.candidatesTokenCount || u.candidates_token_count || 0) || 0,
    };
  }
  return {
    inputTokens: Number(u.prompt_tokens || 0) || 0,
    outputTokens: Number(u.completion_tokens || 0) || 0,
  };
}
function textUsageEstimate(provider: string, model: string, usage: { inputTokens: number; outputTokens: number }, usageKind: string) {
  if (usageKind === "muse") return { providerCostUsd: 0, credits: 0 };
  const rates = TEXT_PROVIDER_USD_PER_1M[model] || TEXT_PROVIDER_USD_PER_1M.default;
  const input = Math.max(0, Number(usage.inputTokens) || 0);
  const output = Math.max(0, Number(usage.outputTokens) || 0);
  const visionMultiplier = usageKind === "vision" ? 1.5 : 1;
  const providerCostUsd = (((input / 1000000) * rates.input) + ((output / 1000000) * rates.output)) * visionMultiplier;
  return { providerCostUsd, credits: creditsFromProviderUsd(providerCostUsd) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  // ── auth: require a real signed-in user (not the anon key) ──────────────────
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  let authUser: any = null;
  let sbAuth: any = null;
  if (!token) return json({ error: "Sign in to use server-side image generation." }, 401);
  try {
    sbAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error } = await sbAuth.auth.getUser(token);
    if (error || !user) {
      return json({ error: "Sign in to use server-side image generation." }, 401);
    }
    authUser = user;
  } catch (_e) {
    return json({ error: "Could not verify your session." }, 401);
  }

  // ── ENTITLEMENT GATE (server-side — the REAL paywall) ───────────────────────
  //   Cinema Machine has NO free tier. A signed-in account may generate ONLY if
  //   it is on a paid plan (writer/director/studio) OR still holds credits (e.g.
  //   a cancelled subscriber's leftover balance). A brand-new account (plan
  //   'none'/'free', 0 credits) is refused HERE. The browser gate is only UX —
  //   this is what actually stops free text/image/video generation, since every
  //   task below runs on the platform's own provider keys.
  const ADMIN_EMAILS = ["admin@infinitestudioai.com"];
  const isAdmin = ADMIN_EMAILS.includes(String(authUser.email || "").toLowerCase());
  let accountPlan = "none";
  let accountRemaining = 0;
  if (!isAdmin) {
    try {
      // RLS policy turn_credits_select_own lets a user read their OWN row via the
      // user-scoped client. No row yet (never funded) → unentitled → refuse.
      const { data: rows } = await sbAuth
        .from("turn_credits")
        .select("plan, remaining")
        .eq("owner", authUser.id)
        .limit(1);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row) {
        accountPlan = String(row.plan || "none").toLowerCase().trim();
        accountRemaining = Number(row.remaining) || 0;
      }
    } catch (_e) { /* read failure → treat as unentitled, fail closed */ }
    const paid = accountPlan === "writer" || accountPlan === "director" || accountPlan === "studio";
    if (!paid && accountRemaining <= 0) {
      return json({
        error: "no_plan",
        message: "Choose a plan to start creating — every generation runs on your plan's credits.",
      }, 402);
    }
  }

  // ── parse request ───────────────────────────────────────────────────────────
  let body: any;
  try { body = await req.json(); } catch (_e) { return json({ error: "Bad request body." }, 400); }
  const provider = body.provider || "openai";
  const model = body.model || "gpt-image-2";
  const prompt = (body.prompt || "").toString();
  const aspect = body.aspect || "16:9";
  const quality = body.quality || "high";
  const imageSize = body.imageSize || "2K";
  // OpenAI's SUPPORTED moderation-sensitivity control for gpt-image models: "low" is the
  // least-restrictive ALLOWED setting (fewer false positives on legitimate creative
  // content) — it does NOT disable safety; genuinely prohibited content is still blocked.
  const moderation = (typeof body.moderation === "string" && /^(low|auto)$/.test(body.moderation))
    ? body.moderation
    : (/^gpt-image/.test(model) ? "low" : "");
  const groundSearch = !!body.groundSearch;
  const groundImageSearch = !!body.groundImageSearch;
  const images: string[] = Array.isArray(body.images) ? body.images : [];
  const task = body.task || "image";
  const usageKind = String(body.usageKind || (images.length && task === "text" ? "vision" : task)).toLowerCase();
  const messages: any[] = Array.isArray(body.messages) ? body.messages : [];
  const cleanApiKey = (k: unknown) => String(k || "")
    .replace(/[\s\u00a0\u200b-\u200d\ufeff]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim();
  const userApiKey = (id: string): string => {
    const keys = body && body.userApiKeys && typeof body.userApiKeys === "object" ? body.userApiKeys : {};
    return cleanApiKey(keys[id]);
  };
  const providerKey = (id: string, envName: string): string => userApiKey(id) || cleanApiKey(Deno.env.get(envName));
  const missingKey = (label: string, envName: string): string =>
    `${label} is not configured on the server. An administrator can add it in TURN's API Keys modal for testing or set the ${envName} server secret.`;
  const mediaExt = (mime: string): string => {
    const m = (mime || "").toLowerCase();
    if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
    if (m.includes("webp")) return "webp";
    if (m.includes("gif")) return "gif";
    if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
    if (m.includes("wav")) return "wav";
    if (m.includes("mp4")) return "mp4";
    if (m.includes("webm")) return "webm";
    return "png";
  };
  const videoInputUrl = async (src: unknown, kind: string, idx: number): Promise<string> => {
    const s = String(src || "");
    if (!s || !/^data:/i.test(s)) return s;
    const blob = dataUrlToBlob(s);
    if (!blob) return s;
    const bucket = Deno.env.get("TURN_BUCKET") || "turn-assets";
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(36).slice(2)).replace(/-/g, "");
    const path = `${authUser.id}/stage-tmp/${Date.now()}-${kind}-${idx}-${id}.${mediaExt(blob.type || "")}`;
    // Staging uses the SERVICE-ROLE client, not the user-scoped sbAuth: auth and the
    // entitlement gate have already run above, and user-client storage writes depend
    // on the live RLS policies on storage.objects — a missing/drifted insert policy
    // turns EVERY generation with reference inputs into "new row violates row-level
    // security policy". Service role bypasses RLS; the path still scopes the file to
    // the user's own folder, and signed URLs expire after 1h.
    const sbStage = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const up = await sbStage.storage.from(bucket).upload(path, blob, {
      contentType: blob.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) throw new Error(`Could not stage ${kind} input for generation: ${up.error.message || "storage upload failed"}`);
    const signed = await sbStage.storage.from(bucket).createSignedUrl(path, 3600);
    if (signed.error || !signed.data?.signedUrl) throw new Error(`Could not sign staged ${kind} input for generation.`);
    return signed.data.signedUrl;
  };
  const videoInputUrls = async (arr: unknown, kind: string): Promise<string[]> => {
    const out: string[] = [];
    for (const [i, src] of (Array.isArray(arr) ? arr : []).entries()) {
      const u = await videoInputUrl(src, kind, i + 1);
      if (u) out.push(u);
    }
    return out;
  };
  const ensureCanSpend = (credits: number) => {
    const need = Math.max(0, Math.ceil(Number(credits) || 0));
    if (isAdmin || need <= 0 || accountRemaining >= need) return null;
    return json({
      error: "insufficient_credits",
      message: `This generation needs ${need} credits, but this account has ${accountRemaining}.`,
      creditsRequired: need,
      creditsRemaining: accountRemaining,
    }, 402);
  };
  const recordUsage = async (payload: {
    kind?: string; providerName?: string; modelName?: string; taskName?: string;
    credits?: number; status?: string; requestId?: string; inputTokens?: number;
    outputTokens?: number; providerCostUsd?: number; metadata?: Record<string, unknown>;
  }) => {
    const credits = Math.max(0, Math.ceil(Number(payload.credits) || 0));
    if (isAdmin) return { credits: 0, remaining: accountRemaining, plan: accountPlan };
    const { data, error } = await sbAuth.rpc("turn_record_usage_event", {
      event_kind: payload.kind || "generation",
      provider_name: payload.providerName || provider,
      model_name: payload.modelName || model,
      task_name: payload.taskName || task,
      credit_cost: credits,
      usage_status: payload.status || "succeeded",
      request_key: payload.requestId || null,
      input_token_count: payload.inputTokens ?? null,
      output_token_count: payload.outputTokens ?? null,
      provider_cost: payload.providerCostUsd ?? null,
      usage_metadata: payload.metadata || {},
    });
    if (error) {
      if (/INSUFFICIENT_CREDITS/i.test(error.message || "")) {
        throw new Error("This generation completed, but the account did not have enough credits to record the spend. Add credits and try again.");
      }
      throw new Error(error.message || "Could not record usage.");
    }
    const row = Array.isArray(data) ? data[0] : data;
    accountRemaining = Number(row?.remaining ?? accountRemaining) || 0;
    accountPlan = String(row?.plan || accountPlan || "none");
    return { credits, remaining: accountRemaining, plan: accountPlan };
  };

  // ── task: TEXT completion (powers spec drafting, MUSE, and the agents) ────────
  // The client folds any system prompt into the user message, so we just pass the
  // messages through to the provider's chat API and return the completion text.
  if (task === "text") {
    if (!messages.length) return json({ error: "No messages supplied." }, 400);
    if (usageKind !== "muse") {
      const block = ensureCanSpend(1);
      if (block) return block;
    }
    const finishText = async (providerName: string, modelName: string, providerData: any, text: string, vision: boolean) => {
      const tokens = normaliseTextUsage(providerName, providerData);
      const estimate = textUsageEstimate(providerName, modelName, tokens, usageKind);
      const usage = await recordUsage({
        kind: "generation",
        providerName,
        modelName,
        taskName: "text",
        credits: estimate.credits,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        providerCostUsd: estimate.providerCostUsd,
        metadata: { usageKind, vision, totalTokens: tokens.inputTokens + tokens.outputTokens },
      });
      return json({ text, vision, usage: { ...usage, ...estimate, ...tokens, totalTokens: tokens.inputTokens + tokens.outputTokens } });
    };
    if (provider === "google") {
      const gkey = providerKey("google", "GOOGLE_API_KEY");
      if (!gkey) return json({ error: missingKey("Google", "GOOGLE_API_KEY") }, 500);
      const contents = messages.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content || "") }],
      }));
      // vision: data-URL images attach to the last user turn (powers the Scene Director's QC)
      if (images.length && contents.length) {
        const last = contents[contents.length - 1];
        for (const src of images) {
          const m2 = /^data:(.*?);base64,(.*)$/.exec(src || "");
          if (m2) last.parts.push({ inlineData: { mimeType: m2[1] || "image/jpeg", data: m2[2] } });
        }
      }
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(gkey)}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }) },
        );
        if (!r.ok) { let d = ""; try { d = (await r.json())?.error?.message || ""; } catch (_e) { /* noop */ } return json({ error: d || `Google error (${r.status}).`, status: r.status }, 200); }
        const data = await r.json();
        const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
        return await finishText("google", model, data, parts.map((p: any) => p.text || "").join(""), images.length > 0);
      } catch (e) { return json({ error: "Proxy failed to reach Google: " + (e?.message || e) }, 502); }
    }
    if (provider === "openai") {
      const apiKey = providerKey("openai", "OPENAI_API_KEY");
      if (!apiKey) return json({ error: missingKey("OpenAI", "OPENAI_API_KEY") }, 500);
      try {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: messages.map((m: any, i: number) => {
            const text = String(m.content || "");
            if (images.length && i === messages.length - 1)
              return { role: m.role || "user", content: [{ type: "text", text }, ...images.map((u: string) => ({ type: "image_url", image_url: { url: u } }))] };
            return { role: m.role || "user", content: text };
          }) }),
        });
        if (!r.ok) { let d = ""; try { d = (await r.json())?.error?.message || ""; } catch (_e) { /* noop */ } return json({ error: d || `OpenAI error (${r.status}).`, status: r.status }, 200); }
        const data = await r.json();
        return await finishText("openai", model, data, (((data.choices || [])[0] || {}).message || {}).content || "", images.length > 0);
      } catch (e) { return json({ error: "Proxy failed to reach OpenAI: " + (e?.message || e) }, 502); }
    }
    if (provider === "moonshot") {
      // Kimi (Moonshot AI) — OpenAI-compatible chat completions
      const mKey = providerKey("moonshot", "MOONSHOT_API_KEY");
      if (!mKey) return json({ error: missingKey("Moonshot (Kimi)", "MOONSHOT_API_KEY") }, 500);
      try {
        // K3 is a 2.8T deep reasoner (launched 2026-07-16): long drafts are SLOW,
        // especially under launch-week load. 380s (user ruling 2026-07-19) fits under
        // the paid-plan 400s function ceiling so medium drafts (~700 words at ~2 w/s)
        // can finish; if the platform gateway still kills at ~150s the client sees a
        // generic fetch error instead of this clean message. max_tokens bounds the
        // completion so generation time can't run unbounded.
        const r = await fetch("https://api.moonshot.ai/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(380000),
          headers: { Authorization: `Bearer ${mKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, max_tokens: 4096,
            messages: messages.map((m: any) => ({ role: m.role || "user", content: String(m.content || "") })) }),
        });
        if (!r.ok) { let d = ""; try { d = (await r.json())?.error?.message || ""; } catch (_e) { /* noop */ } return json({ error: d || `Moonshot error (${r.status}).`, status: r.status }, 200); }
        const data = await r.json();
        return await finishText("moonshot", model, data, (((data.choices || [])[0] || {}).message || {}).content || "", false);
      } catch (e) {
        if ((e as any)?.name === "TimeoutError") return json({ error: "Kimi took too long to answer — K3 is a brand-new deep-reasoning flagship, and this draft outran even the extended 6-minute server window. Try again, keep K3 for shorter tasks (analysis, alt lines), or switch the writing dock back to Auto for heavy drafting." }, 200);
        return json({ error: "Proxy failed to reach Moonshot: " + (e?.message || e) }, 502);
      }
    }
    if (provider === "anthropic") {
      const apiKey = providerKey("anthropic", "ANTHROPIC_API_KEY");
      if (!apiKey) return json({ error: missingKey("Anthropic", "ANTHROPIC_API_KEY") }, 500);
      // Anthropic takes system prompts as a top-level `system` field, not a message role.
      const sys = messages.filter((m: any) => m.role === "system").map((m: any) => String(m.content || "")).join("\n\n");
      const turns = messages
        .filter((m: any) => m.role !== "system")
        .map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }));
      // vision: image blocks attach to the last turn (powers the Scene Director's QC)
      if (images.length && turns.length) {
        const last = turns[turns.length - 1];
        const blocks: any[] = [{ type: "text", text: String(last.content || "") }];
        for (const src of images) {
          const m2 = /^data:(.*?);base64,(.*)$/.exec(src || "");
          if (m2) blocks.push({ type: "image", source: { type: "base64", media_type: m2[1] || "image/jpeg", data: m2[2] } });
        }
        last.content = blocks;
      }
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({ model, max_tokens: 4096, ...(sys ? { system: sys } : {}), messages: turns.length ? turns : [{ role: "user", content: "" }] }),
        });
        if (!r.ok) { let d = ""; try { d = (await r.json())?.error?.message || ""; } catch (_e) { /* noop */ } return json({ error: d || `Anthropic error (${r.status}).`, status: r.status }, 200); }
        const data = await r.json();
        return await finishText("anthropic", model, data, (data.content || []).map((p: any) => p.text || "").join(""), images.length > 0);
      } catch (e) { return json({ error: "Proxy failed to reach Anthropic: " + (e?.message || e) }, 502); }
    }
    return json({ error: `Text provider "${provider}" is not configured on this proxy.` }, 400);
  }

  // ── task: VOICE (ElevenLabs) — powers the Voices tab + per-line audio (Stage) ──
  // No `prompt`; branches on `op`. Key = userApiKeys.elevenlabs or ELEVENLABS_API_KEY.
  //   "tts"        → render a line WITH per-character timing → audio + durationMs (the clock).
  //   "design"     → Voice Design previews from a text descriptor (the "designed" origin).
  //   "saveVoice"  → lock a chosen preview into a permanent voice_id.
  //   "listVoices" → the account's voices (the "picked" origin).
  //   "clone"      → instant clone from uploaded samples (consent-gated client-side).
  // ElevenLabs field names/model ids move — confirm against current docs at deploy.
  if (task === "voice") {
    const elKey = providerKey("elevenlabs", "ELEVENLABS_API_KEY");
    const falVoiceKey = providerKey("fal", "FAL_KEY");
    // TTS and STT can run on fal's ElevenLabs endpoints (billed to the fal wallet), so
    // the direct ElevenLabs key is only HARD-required for the voice-library operations
    // (design / save / list / clone) that manage voices inside the ElevenLabs account.
    const _opWanted = (body.op || "tts").toString();
    const _falCanCover = (_opWanted === "tts" || _opWanted === "stt") && !!falVoiceKey;
    if (!elKey && !_falCanCover) return json({ error: missingKey("ElevenLabs", "ELEVENLABS_API_KEY") }, 500);
    const EL = "https://api.elevenlabs.io/v1";
    // run a fal ElevenLabs endpoint through the queue and return its result JSON
    const falVoiceRun = async (endpoint: string, input: any) => {
      const head = { "Authorization": "Key " + falVoiceKey, "Content-Type": "application/json" };
      const sub = await fetch("https://queue.fal.run/" + endpoint, {
        method: "POST", headers: head, body: JSON.stringify(input), signal: AbortSignal.timeout(380000) });
      if (!sub.ok) {
        // Keep fal's own words — a bare status code is what made the last round of
        // voice/image failures impossible to diagnose.
        let why = ""; try { why = (await sub.text()).slice(0, 400); } catch (_e) { /* noop */ }
        throw new Error(`fal ${endpoint} rejected the request (${sub.status})${why ? ": " + why : "."}`);
      }
      let out: any = await sub.json();
      if (out?.status_url && out?.response_url) {
        const okHost = (u: string) => { try { return new URL(u).host.endsWith("fal.run"); } catch (_e) { return false; } };
        if (!okHost(out.status_url) || !okHost(out.response_url)) throw new Error("Bad fal response URLs.");
        let done = false;
        for (let i = 0; i < 150; i++) {
          const sr = await fetch(out.status_url, { headers: { "Authorization": "Key " + falVoiceKey } });
          if (!sr.ok) throw new Error(`fal status failed (${sr.status}).`);
          const sd = await sr.json();
          const st = String(sd.status || "").toUpperCase();
          if (st === "COMPLETED") {
            const rr = await fetch(out.response_url, { headers: { "Authorization": "Key " + falVoiceKey } });
            if (!rr.ok) {
              // same rule as submit-time: keep fal's own words — but pull the human "msg"
              // out of the JSON detail so a phone toast doesn't drown in loc/type/url noise.
              let why = "";
              try {
                const raw = await rr.text();
                try {
                  const j = JSON.parse(raw);
                  const msgs = Array.isArray(j?.detail) ? j.detail.map((d: any) => d?.msg).filter(Boolean) : [];
                  why = (msgs.length ? msgs.join("; ") : (j?.message || j?.error || raw)).slice(0, 300);
                } catch (_p) { why = raw.slice(0, 300); }
              } catch (_e) { /* noop */ }
              throw new Error(`fal result failed (${rr.status})${why ? ": " + why : "."}`);
            }
            out = await rr.json(); done = true; break;
          }
          if (st === "FAILED" || st === "ERROR") throw new Error(String(sd?.error || sd?.detail || "fal voice request failed."));
          await new Promise((r) => setTimeout(r, 1500));
        }
        if (!done) throw new Error("fal voice request took too long.");
      }
      return out;
    };
    const op = (body.op || "tts").toString();
    const elErr = async (r: Response) => {
      let d = ""; try { const j = await r.json(); d = j?.detail?.message || (typeof j?.detail === "string" ? j.detail : "") || j?.message || ""; } catch (_e) { /* noop */ }
      return d || `ElevenLabs error (${r.status}).`;
    };
    try {
      // TTS WITH TIMESTAMPS — one call returns the audio AND per-character timing, so
      // we get the line's duration (the cut clock) and split points for free.
      if (op === "tts") {
        const voiceId = (body.voiceId || "").toString();
        const text = (body.text || "").toString();
        if (!voiceId || !text) return json({ error: "Voice render needs voiceId and text." }, 400);
        const s = body.settings || {};
        const fmt = (body.outputFormat || "mp3_44100_128").toString();
        const modelId = (body.modelId || "eleven_v3").toString();
        // Eleven v3 uses DISCRETE stability (0 creative / 0.5 natural / 1 robust) and
        // doesn't take style/speed — snap and trim the settings when v3 renders a line.
        const isV3 = modelId.startsWith("eleven_v3");
        const rawStab = Number(s.stability ?? 0.5);
        const voiceSettings = isV3
          ? { stability: rawStab < 0.25 ? 0.0 : rawStab > 0.75 ? 1.0 : 0.5,
              similarity_boost: s.similarity ?? 0.75,
              use_speaker_boost: s.speakerBoost ?? true }
          : { stability: s.stability ?? 0.5,
              similarity_boost: s.similarity ?? 0.75,
              style: s.style ?? 0.0,
              speed: s.speed ?? 1.0,
              use_speaker_boost: s.speakerBoost ?? true };
        // ROUTE ORDER: the direct ElevenLabs call stays PRIMARY — it is the only one that
        // carries the full voice settings (similarity, style, speed, speaker boost) and
        // returns per-character alignment. fal's mirror of the same models is the FALLBACK,
        // so a blocked ElevenLabs invoice stops billing, not the film.
        let elWhy = "";
        if (elKey) {
          const r = await fetch(`${EL}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${encodeURIComponent(fmt)}`, {
            method: "POST",
            headers: { "xi-api-key": elKey, "Content-Type": "application/json" },
            body: JSON.stringify({ text, model_id: modelId, voice_settings: voiceSettings }),
          });
          if (r.ok) {
            const data = await r.json();
            const ends = (data.alignment && data.alignment.character_end_times_seconds) || [];
            const durationMs = ends.length ? Math.round(Number(ends[ends.length - 1]) * 1000) : 0;
            return json({ audioB64: data.audio_base64, mime: "audio/mpeg", durationMs, alignment: data.alignment || null, via: "elevenlabs" });
          }
          elWhy = await elErr(r);
          if (!falVoiceKey) return json({ error: elWhy, status: r.status }, 200);
        }
        // Fallback: the same ElevenLabs models hosted on fal, billed to the fal wallet.
        // Custom voices are addressed by the same voice id; timestamps keep the cut clock.
        const falTtsEndpoint = modelId.indexOf("multilingual") >= 0 ? "fal-ai/elevenlabs/tts/multilingual-v2"
          : modelId.indexOf("turbo") >= 0 ? "fal-ai/elevenlabs/tts/turbo-v2.5"
          : "fal-ai/elevenlabs/tts/eleven-v3";
        let falWhy = "";
        try {
          const fd = await falVoiceRun(falTtsEndpoint, {
            text, voice: voiceId, timestamps: true, stability: voiceSettings.stability });
          const fUrl = fd?.audio?.url || fd?.audio_url || (typeof fd?.audio === "string" ? fd.audio : "");
          if (fUrl) {
            const ar = await fetch(fUrl);
            if (ar.ok) {
              const b64 = arrayBufferToBase64(await ar.arrayBuffer());
              const tsList = Array.isArray(fd?.timestamps) ? fd.timestamps : [];
              const last = tsList.length ? tsList[tsList.length - 1] : null;
              const durationMs = last ? Math.round(Number(last.end ?? last.end_time ?? last.time ?? 0) * 1000) : 0;
              return json({ audioB64: b64, mime: "audio/mpeg", durationMs,
                alignment: null, timestamps: tsList, via: "fal" });
            }
            falWhy = "fal returned an audio URL the proxy couldn't download.";
          } else { falWhy = "fal returned no audio."; }
        } catch (e) { falWhy = ((e as any)?.message || String(e)); }
        // a custom ElevenLabs voice can NEVER ride the fal backup (stock voices only) —
        // say so plainly instead of leaving "Voice not found" to be misread as downtime.
        if (/voice not found/i.test(falWhy)) falWhy += " The fal backup only renders STOCK ElevenLabs voices — this line's voice is custom, so the backup can't cover it; resolving the ElevenLabs invoice restores the primary route.";
        return json({ error: (elWhy ? elWhy + " Backup route also failed — " : "Voice rendering is unavailable — ") + falWhy }, 200);
      }

      // Voice Design — returns candidate previews (each with a generated_voice_id).
      // Defaults to the v3 design model (eleven_ttv_v3): noticeably better accent and
      // character adherence than the older multilingual_ttv_v2 the API defaults to.
      if (op === "design") {
        const description = (body.description || "").toString();
        if (!description) return json({ error: "Voice design needs a description." }, 400);
        const r = await fetch(`${EL}/text-to-voice/design`, {
          method: "POST",
          headers: { "xi-api-key": elKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            voice_description: description,
            model_id: String(body.modelId || "eleven_ttv_v3"),
            ...(body.text ? { text: String(body.text) } : { auto_generate_text: true }),
            ...(body.guidanceScale != null ? { guidance_scale: Number(body.guidanceScale) } : {}),
            ...(body.loudness != null ? { loudness: Number(body.loudness) } : {}),
            ...(body.quality != null ? { quality: Number(body.quality) } : {}),
            ...(body.seed != null ? { seed: Number(body.seed) } : {}),
          }),
        });
        if (!r.ok) return json({ error: await elErr(r), status: r.status }, 200);
        const data = await r.json();
        const previews = (data.previews || []).map((p: any) => ({
          generatedVoiceId: p.generated_voice_id,
          audioB64: p.audio_base_64 || p.audio_base64 || "",
          mime: "audio/mpeg",
        }));
        return json({ previews, text: data.text || "" });
      }

      // Lock a chosen preview → a permanent voice_id (the identity lock).
      if (op === "saveVoice") {
        const generatedVoiceId = (body.generatedVoiceId || "").toString();
        if (!generatedVoiceId) return json({ error: "Saving a voice needs a generatedVoiceId." }, 400);
        const name = (body.name || "Voice").toString();
        const r = await fetch(`${EL}/text-to-voice`, {
          method: "POST",
          headers: { "xi-api-key": elKey, "Content-Type": "application/json" },
          body: JSON.stringify({ voice_name: name, voice_description: (body.description || "").toString(), generated_voice_id: generatedVoiceId }),
        });
        if (!r.ok) return json({ error: await elErr(r), status: r.status }, 200);
        const data = await r.json();
        return json({ voiceId: data.voice_id || (data.voice && data.voice.voice_id) || "", name });
      }

      // The account's voices (for the "picked from library" origin).
      if (op === "listVoices") {
        const r = await fetch(`${EL}/voices`, { headers: { "xi-api-key": elKey } });
        if (!r.ok) return json({ error: await elErr(r), status: r.status }, 200);
        const data = await r.json();
        const voices = (data.voices || []).map((v: any) => ({
          voiceId: v.voice_id, name: v.name, category: v.category || "",
          previewUrl: v.preview_url || "", labels: v.labels || {},
        }));
        return json({ voices });
      }

      // Instant clone from uploaded samples (consent gated on the client, like a cameo).
      if (op === "clone") {
        const samples: string[] = Array.isArray(body.samples) ? body.samples : [];
        if (!samples.length) return json({ error: "Cloning needs at least one audio sample." }, 400);
        const form = new FormData();
        form.append("name", (body.name || "Cloned voice").toString());
        if (body.description) form.append("description", String(body.description));
        let i = 0;
        for (const src of samples) {
          const blob = dataUrlToBlob(src);
          if (blob) form.append("files", blob, `sample${i++}.mp3`);
        }
        const r = await fetch(`${EL}/voices/add`, { method: "POST", headers: { "xi-api-key": elKey }, body: form });
        if (!r.ok) return json({ error: await elErr(r), status: r.status }, 200);
        const data = await r.json();
        return json({ voiceId: data.voice_id || "", name: (body.name || "Cloned voice").toString() });
      }

      // Speech-to-text (Scribe) — transcribe a recorded answer (the "Talk it through" intake).
      // Client sends base64 audio + its mime; we hand it to ElevenLabs as a file upload.
      if (op === "stt") {
        const audioB64 = (body.audioB64 || "").toString();
        if (!audioB64) return json({ error: "Speech-to-text needs audio." }, 400);
        const mime = (body.mime || "audio/webm").toString();
        const blob = dataUrlToBlob("data:" + mime + ";base64," + audioB64);
        if (!blob) return json({ error: "Couldn't read the recorded audio." }, 400);
        const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
        // Same route order as TTS: direct ElevenLabs first, fal's Scribe as the backup.
        let sttWhy = "";
        if (elKey) {
          const form = new FormData();
          form.append("model_id", (body.modelId || "scribe_v1").toString());
          form.append("file", blob, "answer." + ext);
          if (body.languageCode) form.append("language_code", String(body.languageCode));
          const r = await fetch(`${EL}/speech-to-text`, { method: "POST", headers: { "xi-api-key": elKey }, body: form });
          if (r.ok) {
            const data = await r.json();
            return json({ text: (data.text || "").toString(), via: "elevenlabs" });
          }
          sttWhy = await elErr(r);
          if (!falVoiceKey) return json({ error: sttWhy, status: r.status }, 200);
        }
        // fal's Scribe endpoint takes a URL, so the recording is uploaded to fal storage first.
        let falSttWhy = "";
        try {
          const up = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
            method: "POST", headers: { "Authorization": "Key " + falVoiceKey, "Content-Type": "application/json" },
            body: JSON.stringify({ content_type: mime, file_name: "answer." + ext }),
          });
          if (!up.ok) throw new Error(`fal upload was refused (${up.status}).`);
          const ud = await up.json();
          const putUrl = (ud.upload_url || "").toString();
          const okHost = (() => { try { const h = new URL(putUrl).host; return h.endsWith("fal.ai") || h.endsWith("fal.media"); } catch (_e) { return false; } })();
          if (!putUrl || !okHost) throw new Error("fal returned no usable upload URL.");
          const put = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
          if (!put.ok || !ud.file_url) throw new Error(`Uploading the recording to fal failed (${put.status}).`);
          const fd = await falVoiceRun("fal-ai/elevenlabs/speech-to-text/scribe-v2", {
            audio_url: ud.file_url, tag_audio_events: false, diarize: false,
            ...(body.languageCode ? { language_code: String(body.languageCode) } : {}),
          });
          const txt = (fd?.text || "").toString();
          if (txt) return json({ text: txt, via: "fal" });
          falSttWhy = "fal transcribed nothing.";
        } catch (e) { falSttWhy = ((e as any)?.message || String(e)); }
        return json({ error: (sttWhy ? sttWhy + " Backup route also failed — " : "Speech-to-text is unavailable — ") + falSttWhy }, 200);
      }

      return json({ error: `Unknown voice op "${op}".` }, 400);
    } catch (e) {
      return json({ error: "Proxy failed to reach ElevenLabs: " + ((e as any)?.message || e) }, 502);
    }
  }

  // ── task: VIDEO (Seedance 2.0 via fal.ai) — the Stage's lip-synced clip render ──
  // Async (videos take minutes): the client SUBMITS, then POLLS until COMPLETED.
  //   "submit" → { requestId, statusUrl, responseUrl, status }
  //   "poll"   → { status } | { status:"COMPLETED", videoUrl, seed, contentType }
  // Key = userApiKeys.fal or FAL_KEY. Model defaults to reference-to-video (frame +
  // line audio → lip-synced clip). See docs/Voice & Lip-Sync (Seedance) Plan.md §6A.
  if (task === "video") {
    const falKey = providerKey("fal", "FAL_KEY");
    if (!falKey) return json({ error: missingKey("fal.ai", "FAL_KEY") }, 500);
    const ALLOWED = new Set([
      "bytedance/seedance-2.0/reference-to-video", "bytedance/seedance-2.0/fast/reference-to-video",
      "bytedance/seedance-2.0/image-to-video",     "bytedance/seedance-2.0/fast/image-to-video",
      "bytedance/seedance-2.0/text-to-video",      "bytedance/seedance-2.0/fast/text-to-video",
      "fal-ai/sora-2/image-to-video",              "fal-ai/sora-2/image-to-video/pro",
      "fal-ai/kling-video/v3/standard/image-to-video", "fal-ai/kling-video/v3/pro/image-to-video",
    ]);
    const model = (body.model || "bytedance/seedance-2.0/reference-to-video").toString();
    if (!ALLOWED.has(model)) return json({ error: `Video model "${model}" isn't allowed on this proxy.` }, 400);
    const op = (body.op || "submit").toString();
    const falHead = { "Authorization": "Key " + falKey, "Content-Type": "application/json" };
    const falErr = async (r: Response) => {
      let d = ""; try { const j = await r.json(); d = (typeof j?.detail === "string" ? j.detail : Array.isArray(j?.detail) ? j.detail.map((x: any) => x.msg || x).join("; ") : "") || j?.error || ""; } catch (_e) { /* noop */ }
      return d || `fal error (${r.status}).`;
    };
    try {
      if (op === "submit") {
        const isSora = model.indexOf("sora-2") >= 0;
        const imageUrls = await videoInputUrls(body.image_urls, "image");
        let input: any;
        if (isSora) {
          // Sora 2 (fal): ONE start image; duration snapped to its 4/8/12/16/20s grid;
          // resolution auto/720p (pro adds 1080p); aspect auto/16:9/9:16; audio is
          // always native — no generate_audio flag, no refs, no seed, no bitrate.
          const startImage = imageUrls[0] || (body.image_url ? await videoInputUrl(body.image_url, "image", 0) : "");
          if (!startImage) return json({ error: "Sora 2 needs a start image." }, 400);
          const want = Number(body.duration) || 4;
          const dur = [4, 8, 12, 16, 20].reduce((b, v) => Math.abs(v - want) < Math.abs(b - want) ? v : b, 4);
          const res = (body.resolution || "").toString();
          const asp = (body.aspectRatio || "auto").toString();
          input = {
            prompt: (body.prompt || "").toString(),
            image_url: startImage,
            duration: dur,   // INTEGER — fal's Sora schema rejects "8" as a string ("Input should be 4, 8, 12, 16 or 20")
            resolution: (res === "1080p" && model.endsWith("/pro")) ? "1080p" : (res === "720p" ? "720p" : "auto"),
            aspect_ratio: (asp === "9:16" || asp === "16:9") ? asp : "auto",
          };
        } else if (model.indexOf("kling-video") >= 0) {
          // Kling 3.0 (fal): ONE start image (+ optional end frame); audio is generated
          // NATIVELY by the model (speech incl.) — no audio/video refs. NATIVE MULTI-SHOT:
          // body.multi_prompt = [{prompt,duration}] renders each shot on its own prompt,
          // total clamped to Kling's 15s ceiling (trimming from the end).
          const startImage = imageUrls[0] || (body.image_url ? await videoInputUrl(body.image_url, "image", 0) : "");
          if (!startImage) return json({ error: "Kling 3.0 needs a start image." }, 400);
          input = {
            start_image_url: startImage,
            generate_audio: body.generateAudio !== false,
            negative_prompt: (body.negativePrompt || "blur, distort, low quality, captions, subtitles, watermark, burned-in text").toString(),
          };
          const mp = Array.isArray(body.multi_prompt)
            ? body.multi_prompt.map((s: any) => ({ prompt: String(s?.prompt || "").slice(0, 2000), duration: Math.max(1, Math.min(15, Math.round(Number(s?.duration) || 3))) })).filter((s: any) => s.prompt)
            : [];
          if (mp.length >= 2) {
            let total = 0; const kept: any[] = [];
            for (const s of mp) {
              if (total + s.duration > 15) { const left = 15 - total; if (left >= 1) kept.push({ ...s, duration: left }); break; }
              kept.push(s); total += s.duration;
            }
            input.multi_prompt = kept; input.shot_type = "customize";
          } else {
            input.prompt = (body.prompt || "").toString();
            input.duration = Math.max(3, Math.min(15, Math.round(Number(body.duration) || 5)));
          }
          if (body.end_image_url) input.end_image_url = await videoInputUrl(body.end_image_url, "image", 99);
        } else {
          const videoUrls = await videoInputUrls(body.video_urls, "video");
          const audioUrls = await videoInputUrls(body.audio_urls, "audio");
          input = {
            prompt: (body.prompt || "").toString(),
            resolution: (body.resolution || "720p").toString(),
            duration: (body.duration != null ? String(body.duration) : "auto"),
            aspect_ratio: (body.aspectRatio || "auto").toString(),
            generate_audio: body.generateAudio !== false,
          };
          if (imageUrls.length) input.image_urls = imageUrls;
          if (videoUrls.length) input.video_urls = videoUrls;
          if (audioUrls.length) input.audio_urls = audioUrls;
          if (body.image_url) input.image_url = await videoInputUrl(body.image_url, "image", 0);
          if (body.end_image_url) input.end_image_url = await videoInputUrl(body.end_image_url, "image", 99);
          if (body.seed != null) input.seed = body.seed;
          if (body.bitrateMode) input.bitrate_mode = body.bitrateMode === "high" ? "high" : "standard";
        }
        const r = await fetch("https://queue.fal.run/" + model, { method: "POST", headers: falHead, body: JSON.stringify(input) });
        if (!r.ok) return json({ error: await falErr(r), status: r.status }, 200);
        const data = await r.json();
        return json({ requestId: data.request_id, statusUrl: data.status_url, responseUrl: data.response_url, status: data.status || "IN_QUEUE" });
      }
      if (op === "poll") {
        // use the URLs fal handed back at submit (avoids the base-vs-subpath gotcha);
        // only ever attach the key to a fal.run host
        const statusUrl = (body.statusUrl || "").toString();
        const responseUrl = (body.responseUrl || "").toString();
        const okHost = (u: string) => { try { return new URL(u).host.endsWith("fal.run"); } catch (_e) { return false; } };
        if (!okHost(statusUrl) || !okHost(responseUrl)) return json({ error: "Bad poll URLs." }, 400);
        const sr = await fetch(statusUrl, { headers: { "Authorization": "Key " + falKey } });
        if (!sr.ok) return json({ error: await falErr(sr), status: sr.status }, 200);
        const sd = await sr.json();
        if (sd.status !== "COMPLETED") return json({ status: sd.status || "IN_PROGRESS" });
        const rr = await fetch(responseUrl, { headers: { "Authorization": "Key " + falKey } });
        if (!rr.ok) return json({ error: await falErr(rr), status: rr.status }, 200);
        const rd = await rr.json();
        const vurl = rd?.video?.url || "";
        if (!vurl) return json({ error: "fal returned no video." }, 200);
        return json({ status: "COMPLETED", videoUrl: vurl, seed: rd.seed, contentType: (rd?.video?.content_type) || "video/mp4" });
      }
      return json({ error: `Unknown video op "${op}".` }, 400);
    } catch (e) {
      return json({ error: "Proxy failed to reach fal: " + ((e as any)?.message || e) }, 502);
    }
  }

  if (!prompt) return json({ error: "No prompt supplied." }, 400);
  const imageUsage = imageUsageEstimate(model, imageSize, quality);
  const imageBlock = ensureCanSpend(imageUsage.credits);
  if (imageBlock) return imageBlock;
  const finishImage = async (payload: Record<string, unknown>, providerName = provider, modelName = model) => {
    const usage = await recordUsage({
      kind: "generation",
      providerName,
      modelName,
      taskName: "image",
      credits: imageUsage.credits,
      providerCostUsd: imageUsage.providerCostUsd,
      metadata: { aspect, quality, imageSize, referenceImages: images.length },
    });
    return json({ ...payload, usage: { ...usage, ...imageUsage } });
  };

  // ── provider: fal.ai image broker (Nano Banana + GPT Image) ────────────────
  if (provider === "fal") {
    const falKey = providerKey("fal", "FAL_KEY");
    if (!falKey) return json({ error: missingKey("fal.ai", "FAL_KEY") }, 500);

    const falImageModels: Record<string, { base: string; edit?: string; family: "nano" | "openai" }> = {
      // NOTE the namespace: Lite is published under google/, not fal-ai/. Pointing it at
      // fal-ai/nano-banana-2-lite 404s ("Application not found") — that is why it was dead.
      "gemini-3.1-flash-lite-image": { base: "google/nano-banana-2-lite", family: "nano" },
      "gemini-3.1-flash-image":      { base: "fal-ai/nano-banana-2",      family: "nano" },
      "gemini-3-pro-image":          { base: "fal-ai/nano-banana-pro",    family: "nano" },
      "gpt-image-2":                 { base: "openai/gpt-image-2", edit: "openai/gpt-image-2/edit", family: "openai" },
    };
    const cfg = falImageModels[model];
    if (!cfg) return json({ error: `Image model "${model}" is not allowed on the fal proxy.` }, 400);

    const falHead = { "Authorization": "Key " + falKey, "Content-Type": "application/json" };
    // fal returns 422 validation errors as { detail: [{loc,msg,type}, …] }. Returning that
    // array raw produced "[object Object],[object Object]" in the UI, which hid the actual
    // reason a model was rejected — the field it objected to is exactly what you need.
    const falErr = async (r: Response) => {
      let d = "";
      try {
        const j = await r.json();
        const detail = j?.detail;
        if (typeof detail === "string") d = detail;
        else if (Array.isArray(detail)) {
          d = detail.map((x: any) => {
            if (typeof x === "string") return x;
            const where = Array.isArray(x?.loc) ? x.loc.filter((p: any) => p !== "body").join(".") : "";
            const msg = x?.msg || x?.message || x?.type || JSON.stringify(x);
            return where ? `${where}: ${msg}` : msg;
          }).join("; ");
        } else if (detail && typeof detail === "object") d = JSON.stringify(detail);
        if (!d) d = j?.error || j?.message || JSON.stringify(j);
      } catch (_e) {
        try { d = await r.text(); } catch (_e2) { /* noop */ }
      }
      return String(d || "").slice(0, 400) || `fal error (${r.status}).`;
    };
    const okFalHost = (u: string) => {
      try { return new URL(u).host.endsWith("fal.run"); } catch (_e) { return false; }
    };
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      const imageUrls = await videoInputUrls(images, "image");
      const endpoint = cfg.family === "openai" && imageUrls.length && cfg.edit ? cfg.edit : cfg.base;
      const input: any = { prompt };

      if (cfg.family === "openai") {
        // fal's openai/gpt-image-2 wrapper does NOT take OpenAI's "WxH" string. Its schema
        // is either an enum (square_hd | landscape_16_9 | …) or an OBJECT {width,height}.
        // Sending the string returned 422 on every request, so GPT Image 2 never worked
        // through fal. Use the object form: it keeps TURN's exact aspect+resolution tiers,
        // which the enum cannot express (no 16:9 at 2K, no 21:9 at all).
        const wh = sizeForAspect(aspect, imageSize).split("x");
        const w = parseInt(wh[0], 10), h = parseInt(wh[1], 10);
        input.image_size = (Number.isFinite(w) && Number.isFinite(h)) ? { width: w, height: h } : "landscape_16_9";
        input.quality = quality || "medium";
        if (moderation) input.moderation = moderation;
        if (imageUrls.length) input.image_urls = imageUrls;
      } else {
        input.aspect_ratio = aspect || "16:9";
        input.resolution = imageSize || "2K";
        input.output_format = "png";
        input.num_images = 1;
        input.limit_generations = true;
        input.sync_mode = false;
        if (imageUrls.length) input.image_urls = imageUrls;
        if (groundSearch) input.enable_web_search = true;
      }

      const submit = await fetch("https://queue.fal.run/" + endpoint, {
        method: "POST",
        headers: falHead,
        body: JSON.stringify(input),
        // enqueue is a single POST — 30s is generous. The old 380s budget could
        // outlive the Supabase gateway's ~150s wall-clock: the isolate was then
        // hard-killed and the client got an opaque 502/503 instead of a real error.
        signal: AbortSignal.timeout(30000),
      });
      if (!submit.ok) return json({ error: await falErr(submit), status: submit.status }, 200);
      let result: any = await submit.json();

      if (result?.status_url && result?.response_url) {
        const statusUrl = String(result.status_url || "");
        const responseUrl = String(result.response_url || "");
        if (!okFalHost(statusUrl) || !okFalHost(responseUrl)) return json({ error: "Bad fal image response URLs." }, 200);
        let completed = false;
        // POLL BUDGET: 60 × 2s ≈ 2 min — safely under the gateway's ~150s wall-clock.
        // The old 190-iteration loop (~6.3 min) could never complete: the gateway
        // killed the isolate first, surfacing as an unexplained 502/503 client-side.
        // Renders that exceed the budget now return this function's OWN descriptive
        // "took too long" error instead of dying silently.
        for (let i = 0; i < 60; i++) {
          const sr = await fetch(statusUrl, { headers: { "Authorization": "Key " + falKey } });
          if (!sr.ok) return json({ error: await falErr(sr), status: sr.status }, 200);
          const sd = await sr.json();
          const st = String(sd.status || "").toUpperCase();
          if (st === "COMPLETED") {
            const rr = await fetch(responseUrl, { headers: { "Authorization": "Key " + falKey } });
            if (!rr.ok) return json({ error: await falErr(rr), status: rr.status }, 200);
            result = await rr.json();
            completed = true;
            break;
          }
          if (st === "FAILED" || st === "ERROR") return json({ error: sd?.error || sd?.detail || "fal image generation failed." }, 200);
          await wait(2000);
        }
        if (!completed) return json({ error: "fal.ai's render queue is congested — the image didn't finish within the server's time budget. Try again in a minute, or drop the quality/resolution a notch for a faster render." }, 200);
      }

      const imageList = Array.isArray(result?.images) ? result.images
        : Array.isArray(result?.data?.images) ? result.data.images
        : Array.isArray(result?.output?.images) ? result.output.images
        : [];
      const img = imageList[0] || result?.image || result?.data?.image || result?.output?.image || null;
      const b64 = (img && (img.b64_json || img.base64 || img.b64)) || result?.b64_json || result?.base64 || "";
      if (b64) return await finishImage({ b64, mime: (img && (img.content_type || img.mime_type)) || "image/png", falModel: endpoint, grounded: !!groundSearch }, "fal", model);

      const url = typeof img === "string" ? img : (img && (img.url || img.image_url)) || result?.url || "";
      if (!url) return json({ error: "fal returned no image." }, 200);
      const m = /^data:(.*?);base64,(.*)$/.exec(url);
      if (m) return await finishImage({ b64: m[2], mime: m[1] || "image/png", falModel: endpoint, grounded: !!groundSearch }, "fal", model);

      const u = new URL(url);
      const imageHeaders = u.host.endsWith("fal.run") ? { "Authorization": "Key " + falKey } : undefined;
      const ir = await fetch(url, { headers: imageHeaders });
      if (!ir.ok) return json({ error: `Could not download fal image (${ir.status}).` }, 200);
      const mime = ir.headers.get("content-type") || (img && (img.content_type || img.mime_type)) || "image/png";
      return await finishImage({ b64: arrayBufferToBase64(await ir.arrayBuffer()), mime, falModel: endpoint, grounded: !!groundSearch }, "fal", model);
    } catch (e) {
      if ((e as any)?.name === "TimeoutError")
        return json({ error: "fal.ai's queue didn't accept the submission within 30s — the request was cancelled server-side. Try again, or choose a faster quality/resolution." }, 200);
      return json({ error: "Proxy failed to reach fal: " + ((e as any)?.message || e) }, 502);
    }
  }

  // ── provider: Google (Nano Banana / Gemini) — mirrors the client's nbGenerate ──
  if (provider === "google") {
    const gkey = providerKey("google", "GOOGLE_API_KEY");
    if (!gkey) {
      return json({ error: missingKey("Google", "GOOGLE_API_KEY") }, 500);
    }
    // prompt text + optional reference/edit images, IMAGE response, aspect + size
    const parts: any[] = [{ text: prompt }];
    for (const src of images) {
      const m = /^data:(.*?);base64,(.*)$/.exec(src || "");
      if (m) parts.push({ inlineData: { mimeType: m[1] || "image/png", data: m[2] } });
    }
    const reqBody: any = {
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect, imageSize } },
    };
    if (groundSearch) {
      const isFlash = model === "gemini-3.1-flash-image";
      reqBody.tools = [{ googleSearch: (isFlash && groundImageSearch)
        ? { searchTypes: { webSearch: {}, imageSearch: {} } } : {} }];
    }
    try {
      const gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(gkey)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reqBody),
          // never hold the connection open forever — a hung Google call used to hang
          // the whole invoke and the client spun "Generating…" with no error
          signal: AbortSignal.timeout(380000) },
      );
      if (!gRes.ok) {
        let detail = "";
        try { const j = await gRes.json(); detail = j?.error?.message || ""; } catch (_e) { /* noop */ }
        return json({ error: detail || `Google error (${gRes.status}).`, status: gRes.status }, 200);
      }
      const gData = await gRes.json();
      const cand = (gData.candidates || [])[0] || {};
      const cparts = (cand.content || {}).parts || [];
      const img = cparts.find((p: any) => p.inlineData && p.inlineData.data);
      if (!img) return json({ error: "Google returned no image." }, 200);
      // report whether the model ACTUALLY grounded, so the client can badge accurately
      const gm = cand.groundingMetadata || cand.grounding_metadata || null;
      const chunks = gm && (gm.groundingChunks || gm.grounding_chunks || gm.groundingAttributions || []);
      const grounded = !!(gm && ((chunks && chunks.length) || gm.webSearchQueries || gm.searchEntryPoint));
      return await finishImage({ b64: img.inlineData.data, mime: img.inlineData.mimeType || "image/png", grounded }, "google", model);
    } catch (e) {
      if ((e as any)?.name === "TimeoutError")
        return json({ error: "Google took too long to answer (over 2 minutes) — the request was cancelled server-side. Try again; if it persists the Google account may be rate-limited or out of prepaid credits." }, 200);
      return json({ error: "Proxy failed to reach Google: " + (e?.message || e) }, 502);
    }
  }

  // ── provider: OpenAI (GPT Image) ────────────────────────────────────────────
  if (provider !== "openai") {
    return json({ error: `Provider "${provider}" is not configured on this proxy yet.` }, 400);
  }

  const apiKey = providerKey("openai", "OPENAI_API_KEY");
  if (!apiKey) {
    return json({ error: missingKey("OpenAI", "OPENAI_API_KEY") }, 500);
  }

  const size = sizeForAspect(aspect, imageSize);

  // ── call OpenAI server-side (no CORS here) ──────────────────────────────────
  try {
    let oaiRes: Response;
    if (images.length) {
      // image edit (reference images supplied) → multipart
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("quality", quality);
      if (moderation) form.append("moderation", moderation);
      let i = 0;
      for (const src of images) {
        const blob = dataUrlToBlob(src);
        if (blob) form.append("image[]", blob, `ref${i++}.png`);
      }
      oaiRes = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(380000),
      });
    } else {
      oaiRes = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        signal: AbortSignal.timeout(380000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, size, quality, n: 1, ...(moderation ? { moderation } : {}) }),
      });
    }

    if (!oaiRes.ok) {
      let detail = "";
      try { const j = await oaiRes.json(); detail = j?.error?.message || ""; } catch (_e) { /* noop */ }
      return json({ error: detail || `OpenAI error (${oaiRes.status}).`, status: oaiRes.status }, 200);
    }

    const data = await oaiRes.json();
    const d = (data.data || [])[0] || {};
    if (d.b64_json) return await finishImage({ b64: d.b64_json }, "openai", model);
    if (d.url) return await finishImage({ url: d.url }, "openai", model);
    return json({ error: "OpenAI returned no image." }, 200);
  } catch (e) {
    return json({ error: "Proxy failed to reach OpenAI: " + (e?.message || e) }, 502);
  }
});
