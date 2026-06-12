// supabase/functions/image-proxy/index.ts
//
// TURN image-generation proxy (the "Higgsfield approach").
//
// WHY THIS EXISTS
//   The TURN web app runs entirely in the browser. This Edge Function runs on
//   Supabase's servers, holds each provider's API key as a SERVER SECRET, and
//   makes the call server-side. The browser calls THIS function; this function
//   calls the provider. No provider key ever touches the browser. It serves two
//   providers:
//     • OpenAI GPT Image — MUST be proxied: OpenAI blocks direct cross-origin
//       browser calls, so the page can't reach it at all.
//     • Google Nano Banana (Gemini) — CAN run from the browser, but is routed
//       here too so that NO provider key lives client-side ("fully key-free").
//
// SECURITY
//   - Only signed-in TURN users may call it: we verify the caller's Supabase
//     access token resolves to a real user (anonymous/anon-key calls are rejected).
//   - Provider keys live only in the function's environment (`OPENAI_API_KEY`,
//     `GOOGLE_API_KEY`), never in client code or localStorage.
//
// DEPLOY (you must run these — I can't deploy from the design environment):
//   1. Log in (no global install — runs via npx):  npx supabase login
//   2. Link your project:                          npx supabase link --project-ref vubenblfdzginlqiglzw
//   3. Set the server secrets (your provider keys): npx supabase secrets set OPENAI_API_KEY=sk-...
//                                                   npx supabase secrets set GOOGLE_API_KEY=...
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

// OpenAI wants a pixel size string; mirror the client's aspect→size mapping.
function sizeForAspect(aspect: string): string {
  if (aspect === "9:16") return "1024x1536";
  if (aspect === "21:9") return "1536x1024"; // closest wide size OpenAI offers
  return "1536x1024"; // 16:9-ish default
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  // ── auth: require a real signed-in user (not the anon key) ──────────────────
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (!token) return json({ error: "Sign in to use server-side image generation." }, 401);
  try {
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) {
      return json({ error: "Sign in to use server-side image generation." }, 401);
    }
  } catch (_e) {
    return json({ error: "Could not verify your session." }, 401);
  }

  // ── parse request ───────────────────────────────────────────────────────────
  let body: any;
  try { body = await req.json(); } catch (_e) { return json({ error: "Bad request body." }, 400); }
  const provider = body.provider || "openai";
  const model = body.model || "gpt-image-2-2026-04-21";
  const prompt = (body.prompt || "").toString();
  const aspect = body.aspect || "16:9";
  const quality = body.quality || "high";
  const imageSize = body.imageSize || "2K";
  const groundSearch = !!body.groundSearch;
  const groundImageSearch = !!body.groundImageSearch;
  const images: string[] = Array.isArray(body.images) ? body.images : [];
  const task = body.task || "image";
  const messages: any[] = Array.isArray(body.messages) ? body.messages : [];

  // ── task: WORLD (location consistency) — 360° skyboxes (Blockade Labs) and
  // explorable 3D worlds (World Labs Marble). Both are ASYNC at the provider, and
  // this function stays stateless: the client calls action:"start" to submit the
  // job (returns an id) and then polls action:"status" every few seconds. Keys
  // stay server secrets: BLOCKADE_API_KEY, WORLDLABS_API_KEY.
  if (task === "world") {
    const engine = (body.engine || "blockade").toString();
    const action = (body.action || "start").toString();

    if (engine === "blockade") {
      const bkey = Deno.env.get("BLOCKADE_API_KEY");
      if (!bkey) return json({ error: "Server is missing BLOCKADE_API_KEY. Get a key at skybox.blockadelabs.com/api, then: npx supabase secrets set BLOCKADE_API_KEY=... and redeploy image-proxy." }, 200);
      const bh = { "x-api-key": bkey, "Content-Type": "application/json" };
      try {
        if (action === "styles") {
          const r = await fetch("https://backend.blockadelabs.com/api/v1/skybox/styles", { headers: bh });
          if (!r.ok) return json({ error: `Blockade styles error (${r.status}).` }, 200);
          const arr = await r.json();
          return json({ styles: (Array.isArray(arr) ? arr : []).map((s: any) => ({ id: s.id, name: s.name, model: s.model_version })) });
        }
        if (action === "start") {
          let styleId = body.styleId;
          if (!styleId) {
            // default to a realistic style so film plates don't come back stylized
            const r0 = await fetch("https://backend.blockadelabs.com/api/v1/skybox/styles", { headers: bh });
            const arr = r0.ok ? await r0.json() : [];
            const list = Array.isArray(arr) ? arr : [];
            const pick = list.find((s: any) => /realistic/i.test(s.name || "")) || list[0];
            if (!pick) return json({ error: "Couldn't load Blockade styles to pick a default." }, 200);
            styleId = pick.id;
          }
          const payload: any = { skybox_style_id: styleId, prompt: (body.prompt || "").toString().slice(0, 1900) };
          if (body.negativeText) payload.negative_text = String(body.negativeText).slice(0, 580);
          if (body.initImageUrl) { payload.init_image = body.initImageUrl; payload.init_strength = body.initStrength || 0.5; }
          const r = await fetch("https://backend.blockadelabs.com/api/v1/skybox", {
            method: "POST", headers: bh, body: JSON.stringify(payload),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) return json({ error: (d && (d.error || d.message)) || `Blockade error (${r.status}).` }, 200);
          const reqObj = d.request || d;
          return json({ id: String(reqObj.id || ""), status: reqObj.status || "pending" });
        }
        // action === "status"
        const r = await fetch(`https://backend.blockadelabs.com/api/v1/imagine/requests/${encodeURIComponent(body.id || "")}`, { headers: bh });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: (d && (d.error || d.message)) || `Blockade status error (${r.status}).` }, 200);
        const q = d.request || d;
        const st = q.status || "pending";
        if (st === "error" || st === "abort") return json({ done: true, error: q.error_message || ("Blockade generation " + st + ".") });
        return json({ done: st === "complete", status: st,
          panoUrl: q.file_url || "", thumbUrl: q.thumb_url || "", depthUrl: q.depth_map_url || "" });
      } catch (e) { return json({ error: "Proxy failed to reach Blockade Labs: " + (e?.message || e) }, 502); }
    }

    if (engine === "marble") {
      const wkey = Deno.env.get("WORLDLABS_API_KEY");
      if (!wkey) return json({ error: "Server is missing WORLDLABS_API_KEY. Get a key at platform.worldlabs.ai/api-keys, then: npx supabase secrets set WORLDLABS_API_KEY=... and redeploy image-proxy." }, 200);
      const wh = { "WLT-Api-Key": wkey, "Content-Type": "application/json" };
      try {
        if (action === "start") {
          const world_prompt: any = body.imageUrl
            ? { type: "image", image_prompt: { source: "uri", uri: body.imageUrl }, ...(body.prompt ? { text_prompt: String(body.prompt).slice(0, 1900) } : {}) }
            : { type: "text", text_prompt: String(body.prompt || "").slice(0, 1900) };
          const r = await fetch("https://api.worldlabs.ai/marble/v1/worlds:generate", {
            method: "POST", headers: wh,
            body: JSON.stringify({ display_name: String(body.displayName || "TURN world").slice(0, 80), model: body.model || "marble-1.1", world_prompt }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) return json({ error: (d && (d.error?.message || d.message)) || `Marble error (${r.status}).` }, 200);
          const opId = d.operation_id || d.id || (typeof d.name === "string" ? d.name.split("/").pop() : "");
          if (!opId) return json({ error: "Marble accepted the job but returned no operation id." }, 200);
          return json({ id: String(opId), status: "pending" });
        }
        // action === "status"
        const r = await fetch(`https://api.worldlabs.ai/marble/v1/operations/${encodeURIComponent(body.id || "")}`, { headers: wh });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: (d && (d.error?.message || d.message)) || `Marble status error (${r.status}).` }, 200);
        if (!d.done) return json({ done: false, status: "processing" });
        if (d.error) return json({ done: true, error: d.error.message || "Marble generation failed." });
        const w = (d.response && (d.response.world || d.response)) || {};
        const a = w.assets || {};
        return json({ done: true, status: "complete",
          panoUrl: (a.imagery && a.imagery.pano_url) || "", thumbUrl: a.thumbnail_url || "",
          splatUrls: (a.splats && a.splats.spz_urls) || null,
          colliderUrl: (a.mesh && a.mesh.collider_mesh_url) || "",
          caption: a.caption || "", worldId: w.id || w.world_id || "" });
      } catch (e) { return json({ error: "Proxy failed to reach World Labs: " + (e?.message || e) }, 502); }
    }

    return json({ error: `World engine "${engine}" is not configured on this proxy.` }, 400);
  }

  // ── task: TEXT completion (powers spec drafting, MUSE, and the agents) ────────
  // The client folds any system prompt into the user message, so we just pass the
  // messages through to the provider's chat API and return the completion text.
  if (task === "text") {
    if (!messages.length) return json({ error: "No messages supplied." }, 400);
    if (provider === "google") {
      const gkey = Deno.env.get("GOOGLE_API_KEY");
      if (!gkey) return json({ error: "Server is missing GOOGLE_API_KEY." }, 500);
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
        return json({ text: parts.map((p: any) => p.text || "").join(""), vision: images.length > 0 });
      } catch (e) { return json({ error: "Proxy failed to reach Google: " + (e?.message || e) }, 502); }
    }
    if (provider === "openai") {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) return json({ error: "Server is missing OPENAI_API_KEY." }, 500);
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
        return json({ text: (((data.choices || [])[0] || {}).message || {}).content || "", vision: images.length > 0 });
      } catch (e) { return json({ error: "Proxy failed to reach OpenAI: " + (e?.message || e) }, 502); }
    }
    if (provider === "anthropic") {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) return json({ error: "Server is missing ANTHROPIC_API_KEY." }, 500);
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
        return json({ text: (data.content || []).map((p: any) => p.text || "").join(""), vision: images.length > 0 });
      } catch (e) { return json({ error: "Proxy failed to reach Anthropic: " + (e?.message || e) }, 502); }
    }
    return json({ error: `Text provider "${provider}" is not configured on this proxy.` }, 400);
  }

  if (!prompt) return json({ error: "No prompt supplied." }, 400);

  // ── provider: Google (Nano Banana / Gemini) — mirrors the client's nbGenerate ──
  if (provider === "google") {
    const gkey = Deno.env.get("GOOGLE_API_KEY");
    if (!gkey) {
      return json({ error: "Server is missing GOOGLE_API_KEY. Set it with: supabase secrets set GOOGLE_API_KEY=..." }, 500);
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
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reqBody) },
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
      return json({ b64: img.inlineData.data, mime: img.inlineData.mimeType || "image/png", grounded });
    } catch (e) {
      return json({ error: "Proxy failed to reach Google: " + (e?.message || e) }, 502);
    }
  }

  // ── provider: OpenAI (GPT Image) ────────────────────────────────────────────
  if (provider !== "openai") {
    return json({ error: `Provider "${provider}" is not configured on this proxy yet.` }, 400);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json({ error: "Server is missing OPENAI_API_KEY. Set it with: supabase secrets set OPENAI_API_KEY=sk-..." }, 500);
  }

  const size = sizeForAspect(aspect);

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
      let i = 0;
      for (const src of images) {
        const blob = dataUrlToBlob(src);
        if (blob) form.append("image[]", blob, `ref${i++}.png`);
      }
      oaiRes = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
    } else {
      oaiRes = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
      });
    }

    if (!oaiRes.ok) {
      let detail = "";
      try { const j = await oaiRes.json(); detail = j?.error?.message || ""; } catch (_e) { /* noop */ }
      return json({ error: detail || `OpenAI error (${oaiRes.status}).`, status: oaiRes.status }, 200);
    }

    const data = await oaiRes.json();
    const d = (data.data || [])[0] || {};
    if (d.b64_json) return json({ b64: d.b64_json });
    if (d.url) return json({ url: d.url });
    return json({ error: "OpenAI returned no image." }, 200);
  } catch (e) {
    return json({ error: "Proxy failed to reach OpenAI: " + (e?.message || e) }, 502);
  }
});
