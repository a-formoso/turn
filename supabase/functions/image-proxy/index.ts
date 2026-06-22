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
//                                                   npx supabase secrets set ELEVENLABS_API_KEY=...  (voice — the Stage)
//                                                   npx supabase secrets set FAL_KEY=...             (video — Seedance via fal.ai)
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
  const model = body.model || "gpt-image-2";
  const prompt = (body.prompt || "").toString();
  const aspect = body.aspect || "16:9";
  const quality = body.quality || "high";
  const imageSize = body.imageSize || "2K";
  const groundSearch = !!body.groundSearch;
  const groundImageSearch = !!body.groundImageSearch;
  const images: string[] = Array.isArray(body.images) ? body.images : [];
  const task = body.task || "image";
  const messages: any[] = Array.isArray(body.messages) ? body.messages : [];

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

  // ── task: VOICE (ElevenLabs) — powers the Voices tab + per-line audio (Stage) ──
  // No `prompt`; branches on `op`. Key = the ELEVENLABS_API_KEY server secret.
  //   "tts"        → render a line WITH per-character timing → audio + durationMs (the clock).
  //   "design"     → Voice Design previews from a text descriptor (the "designed" origin).
  //   "saveVoice"  → lock a chosen preview into a permanent voice_id.
  //   "listVoices" → the account's voices (the "picked" origin).
  //   "clone"      → instant clone from uploaded samples (consent-gated client-side).
  // ElevenLabs field names/model ids move — confirm against current docs at deploy.
  if (task === "voice") {
    const elKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!elKey) return json({ error: "Server is missing ELEVENLABS_API_KEY. Set it with: supabase secrets set ELEVENLABS_API_KEY=..." }, 500);
    const EL = "https://api.elevenlabs.io/v1";
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
        const r = await fetch(`${EL}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${encodeURIComponent(fmt)}`, {
          method: "POST",
          headers: { "xi-api-key": elKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            model_id: (body.modelId || "eleven_multilingual_v2").toString(),
            voice_settings: {
              stability: s.stability ?? 0.5,
              similarity_boost: s.similarity ?? 0.75,
              style: s.style ?? 0.0,
              speed: s.speed ?? 1.0,
              use_speaker_boost: s.speakerBoost ?? true,
            },
          }),
        });
        if (!r.ok) return json({ error: await elErr(r), status: r.status }, 200);
        const data = await r.json();
        const ends = (data.alignment && data.alignment.character_end_times_seconds) || [];
        const durationMs = ends.length ? Math.round(Number(ends[ends.length - 1]) * 1000) : 0;
        return json({ audioB64: data.audio_base64, mime: "audio/mpeg", durationMs, alignment: data.alignment || null });
      }

      // Voice Design — returns candidate previews (each with a generated_voice_id).
      if (op === "design") {
        const description = (body.description || "").toString();
        if (!description) return json({ error: "Voice design needs a description." }, 400);
        const r = await fetch(`${EL}/text-to-voice/design`, {
          method: "POST",
          headers: { "xi-api-key": elKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            voice_description: description,
            ...(body.modelId ? { model_id: String(body.modelId) } : {}),
            ...(body.text ? { text: String(body.text) } : { auto_generate_text: true }),
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
        const form = new FormData();
        form.append("model_id", (body.modelId || "scribe_v1").toString());
        form.append("file", blob, "answer." + ext);
        if (body.languageCode) form.append("language_code", String(body.languageCode));
        const r = await fetch(`${EL}/speech-to-text`, { method: "POST", headers: { "xi-api-key": elKey }, body: form });
        if (!r.ok) return json({ error: await elErr(r), status: r.status }, 200);
        const data = await r.json();
        return json({ text: (data.text || "").toString() });
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
  // Key = the FAL_KEY server secret. Model defaults to reference-to-video (frame +
  // line audio → lip-synced clip). See docs/Voice & Lip-Sync (Seedance) Plan.md §6A.
  if (task === "video") {
    const falKey = Deno.env.get("FAL_KEY");
    if (!falKey) return json({ error: "Server is missing FAL_KEY. Set it with: supabase secrets set FAL_KEY=..." }, 500);
    const ALLOWED = new Set([
      "bytedance/seedance-2.0/reference-to-video", "bytedance/seedance-2.0/fast/reference-to-video",
      "bytedance/seedance-2.0/image-to-video",     "bytedance/seedance-2.0/fast/image-to-video",
      "bytedance/seedance-2.0/text-to-video",      "bytedance/seedance-2.0/fast/text-to-video",
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
        const input: any = {
          prompt: (body.prompt || "").toString(),
          resolution: (body.resolution || "720p").toString(),
          duration: (body.duration != null ? String(body.duration) : "auto"),
          aspect_ratio: (body.aspectRatio || "auto").toString(),
          generate_audio: body.generateAudio !== false,
        };
        if (Array.isArray(body.image_urls) && body.image_urls.length) input.image_urls = body.image_urls;
        if (Array.isArray(body.video_urls) && body.video_urls.length) input.video_urls = body.video_urls;
        if (Array.isArray(body.audio_urls) && body.audio_urls.length) input.audio_urls = body.audio_urls;
        if (body.image_url) input.image_url = String(body.image_url);
        if (body.end_image_url) input.end_image_url = String(body.end_image_url);
        if (body.seed != null) input.seed = body.seed;
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
