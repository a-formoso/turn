# PLAN / SPEC — Character Voices + Lip-Sync (ElevenLabs → Seedance 2.0)

> **Status: PLAN ONLY. Nothing in `app/` is built from this yet.** This document is a proposal
> for review. The Story Pipeline insertion wording in §2 is a *proposal* — `docs/Story Pipeline.md`
> stays untouched until the user approves the exact wording.
>
> Branding rule (inherited): everything user-facing is **the Infinite Studio method**. Never name
> the underlying vendors in MUSE-facing copy beyond what the model picker already exposes.

---

## 0. The organising principle: **audio-first / audio-as-clock**

The line is rendered **before** the video. Its **duration is the spine everything else is cut to:**

- The rendered dialogue clip's length **sets the video clip length** — we don't guess a duration, the
  performance dictates it.
- The **boundaries between lines are the cut points.** Man speaks 3.2s → cut → woman 2.8s → cut →
  two-shot 1.5s. The sequence of audio durations *is* the edit rhythm.
- A line longer than Seedance's max clip length is **split at a sentence/beat boundary** — audio-first
  makes that split natural and measurable instead of arbitrary.

**Reframing:** audio is not "an asset attached to a shot." Audio is **the clock the shots are cut to.**
This is the difference between this plan and a naïve "generate video, then dub it."

---

## 1. The two-tier model (locked from prior discussion)

The app already models characters at two altitudes; voice splits the same way, plus a third (timing):

| Altitude | Visual (exists today) | Voice (this plan) |
|---|---|---|
| **Identity** — canonical, locked | Character Sheet + **Cameo** likeness-lock (`cameo.jsx`, `cameoMeta`) | **Locked `voiceLock`** on the character (a `voiceId` + settings) |
| **Performance** — one line, one moment | **Shot frame** (`shots.jsx`, per beat) | **One rendered audio line** per shot's `dialogue` |
| **Timing** — *new* | (n/a — stills) | The line's **duration → clip length + cut point** |

> A character's voice is to the cameo what a line's audio is to the shot frame — and the audio's
> length is to the cut what nothing in the still pipeline was.

---

## 2. Where it fits in the pipeline — **proposed** (for approval)

The Art Room is **Step 9** (`Props → Characters → Locations → Style Bible → Shot List → Storyboard`).
Voice needs (a) a casting/lock home in pre-production and (b) a new performance/assembly step after
Storyboard. Two proposed edits to `docs/Story Pipeline.md`:

**(A) Add a "Voices" tab to the Step 9 Art Room tab order:**

> `Props → Characters → Voices → Locations → Style Bible → Shot List → Storyboard`
>
> **Voices** — each speaking character gets a **locked voice** the way Cameo locks a face. A voice is
> **designed from the character's own bible** (age, identity, archetype, drive), **picked from a
> library**, or **cloned from a real voice sample** (consent-gated, exactly like a cameo). Locking
> writes a canonical `voiceId` so the same character sounds identical in every line. *(Auto-draft a
> candidate voice spec the first time the Art Room opens, mirroring the silent cast auto-draft; the
> user auditions and locks — never silently committed.)*

**(B) Add a new Step 10 after Storyboard:**

> ### 10. The Stage — performance & assembly *(audio-first)*
> Storyboard lays out the still frames in sequence; the **Stage** turns each into a moving shot.
> **Audio leads:** each shot's `dialogue` is rendered through the speaking character's **locked
> voice**; the line's **duration sets the clip length and the cut point**. The shot's **frame**
> (already produced in Shot List) plus the **line audio** are handed to the video model, which
> **lip-syncs the performance to the audio**. Multi-character shots attach **one reference audio per
> speaker**, bound to the right face. The sequence of line durations becomes the **edit timeline** —
> cuts fall on line boundaries; lines longer than one clip are split at a sentence/beat boundary.

*Nothing here is written into `Story Pipeline.md` until the wording is approved.*

---

## 2A. The Stage UI — canonical layout *(approved 2026-06-15)*

Step 10 is realised as a **two-pane workspace** — a render-control **dock** on the left, a clip
**board** on the right — adapted from a standard AI-video tool, but with every input **fed by the
pipeline** instead of hand-uploaded. The filmmaker never assembles a clip from scratch; they
**approve and render** one the story already defined.

**Top bar:** project title · a **Board ↔ Timeline** toggle · a media filter `frames | voice | clips`
· batch + export actions.
- **Board** = the generation / review grid (below).
- **Timeline** = the existing audio-driven cut-rhythm assembly already in `app/stage.jsx` (the §0
  clock made visible). One toggle keeps both surfaces.

**Left — the Render dock** (reuses the Art Room engine-dock `NbDock` shell). For the selected shot:
- **Model** — Seedance 2.0 (via the media-proxy).
- **First frame** — auto-filled from the shot's rendered frame (Shot List). **End frame** —
  auto-chained to the *next* shot's frame for continuity. *No manual upload.*
- **Prompt** — auto-composed from the beat / shot, editable.
- **Voice** — the character's **locked-voice line** shown as a waveform (not a toggle): the Phase-2
  `lineAudio`.
- **Duration** — **read-only, locked to the line's measured `durationMs`** ("3.2s · from voice").
  This is §0 audio-as-clock surfaced in the UI — the user never picks a duration.
- **Resolution** + **Generate** with a credit cost and a per-scene estimate ("≈ 6 clips · 90 cr"),
  reusing the Coordinator cost-preview pattern (`CoordConfirm` / `preProdStatus`).

**Right — the clip Board**, **grouped by scene in cut order** (not a freeform grid). Each clip card:
keyframe thumbnail + play, **status chips** (`voice ✓ / video ✓ / pending`), duration, and a
tie-back to its shot. Scene headers show progress ("Scene 04 · 3 / 6 clips"). Empty / blocked states
read honestly ("frame ready", "needs voice", "rendering").

**Build dependency:** the dock is the **Phase 3** surface; its Voice + Duration fields only light up
once **Phase 1 (voices)** and **Phase 2 (line audio)** exist to feed them. Board/Timeline + the
status board can ship on top of today's shell first; the render controls activate per phase.

---

## 3. Data-model additions (additive, mirrors what exists)

**Design rule — two layers.** *Tone is identity (frozen); pacing & emotion are performance (per line).*
A character has **one** locked voice (timbre) and **many** deliveries. So the voice's identity lives in
`voiceLock`; how a specific line is delivered lives on the line. `stability`/`style` are **defaults** on
the lock that individual lines **override** — a whispered confession and a scream share a voice, not a
delivery. (This is the refined "Vocal Profile": the original "tone + pacing" anchor is split, because
tone and pacing live at different altitudes.)

**On the character — the IDENTITY layer (sibling to `coreBody` / `cameoMeta`):**
```js
// voiceSpec = the human-readable TIMBRE descriptor that drives Voice Design (or describes a clone).
// TONE ONLY — no pacing/emotion here (those are per-line). Never a real actor's name; describe the
// quality instead ("low gravelly baritone, clipped delivery"), not "Actor A's tone".
voiceSpec: string,            // e.g. "low gravelly baritone, dry, controlled, faint regional edge"

voiceLock: {
  voiceId: string,            // canonical ElevenLabs voice id — THE LOCK (identical in every scene)
  voiceName: string,
  source: "designed" | "library" | "cloned",
  modelId: string,            // "eleven_multilingual_v2" (consistent) | a v3 expressive model
  // DEFAULT settings = the neutral baseline; individual lines override per delivery (see below).
  // NB: stability/style here are the v2-family sliders. With v3, `stability` becomes a MODE
  // (creative|natural|robust) and emotion is inline delivery TAGS, not `style` — see line layer.
  defaults: {
    stability: 0.70,          // ~70% neutral baseline (LOWER = more emotional/variable, less consistent)
    similarity: 0.75,         // ElevenLabs default
    style:      0.10,         // keep low (0–0.15) for realism; 0.5+ = stylized (costs stability/latency)
    speed:      1.0,
    speakerBoost: true
  },
  consent: boolean,           // required when source === "cloned" (biometric, like cameo)
  sync: boolean,              // local-only by default; cloud opt-in (cameo rule)
  provenance: { subject, iso, date }
}
```

**On the shot / line — the PERFORMANCE layer (sibling to the shot frame asset):**
```js
lineAudio: {
  audioUrl: string,           // signed/idb url to the .mp3
  durationMs: number,         // THE CLOCK — sets clip length + cut
  text: string,               // the rendered line (= sh.dialogue; its punctuation/line-breaks ARE pacing)
  voiceId: string,            // which locked voice produced it (identity)
  // DELIVERY — overrides voiceLock.defaults for THIS line only, drawn from the shot's emotional beat.
  delivery: {
    stability: 0.40,          // tense/emotional line → ~0.35–0.45; calm line → keep the 0.70 default
    style:     0.0,           // v2-family only
    speed:     1.0,           // pacing knob, alongside the text's own punctuation
    tags:      []             // v3 only: inline emotion/delivery tags, e.g. ["whispers"], ["angry"]
  },
  hash: string                // sha(text + voiceId + RESOLVED settings) → skip re-render if unchanged
}
clipLenMs: number,            // derived from durationMs (+ lead/tail padding)
// "Resolved settings" = voiceLock.defaults merged with the line's delivery overrides.
```

**New asset kind `"audio"`** in the persistence layer; **`turn_audios`** cloud table parallel to
`turn_generations` (`storage_path`, `meta`, `history`), `.mp3` instead of `.png`; IDB store
`turn-audio-{id}`. Reuses the existing signed-URL / RLS machinery in `cloud.jsx`.

---

## 4. Generation infrastructure (mirror `imagegen.jsx`)

New `voicegen.jsx`, structurally a twin of the nb* layer:

- `elGenerate(text, { voiceId, settings }) → { audioUrl, durationMs }` — TTS one line.
- `elDesignVoice(descriptor) → [candidates]` — ElevenLabs **Voice Design** (text→voice) for "designed".
- `elPickLibrary(query) → [voices]` — Voice Library browse for "picked".
- `elCloneVoice(samples, consent) → voiceId` — instant/professional clone for "cloned" (consent-gated).
- `elCommit(id, audioUrl, meta)` — versioned persist (local 3-tier or cloud), mirrors `nbCommit`.
- `useVoiceGen(opts)` hook mirroring `useImageGen` (`generate`, `gening`, `audioUrl`, `durationMs`,
  version history, clear) — a `VoiceCard` reuses the `SheetFrame` shell with a **waveform + play head**
  instead of an image.

**All keys server-side** (user's choice #2): extend the existing `image-proxy` Supabase Edge Function
into a generic **media-proxy** (`task: "image" | "voice" | "video"`) or add sibling functions. The
browser never holds the ElevenLabs or Seedance key.

---

## 5. ElevenLabs — what's possible (the three origins)

- **Designed** → Voice Design API: a text descriptor (we build it from the character bible — the same
  fields that drive the visual sheet) returns candidate voices to audition and lock.
- **Picked** → Voice Library: browse/select a prebuilt voice, lock its id.
- **Cloned** → instant/professional voice clone from uploaded samples. **Consent-gated and local-first,
  exactly like a cameo face** — this is the most sensitive path and reuses the cameo consent UX.
- **Per-line render** → TTS endpoint; settings: `stability`, `similarity_boost`, `style`, `speed`,
  model (multilingual / expressive). **Duration** comes back with the render; the **alignment /
  timestamps** response gives per-character timing — useful later for precise cuts *and* captions.
- **Two layers, two control schemes** *(tone = locked voice; pacing/emotion = per-line delivery — see §3)*.
  With **v2** models, deliveries are the `stability`/`style`/`speed` sliders. With the **v3** expressive
  model, `stability` becomes a *mode* (creative | natural | robust) and emotion is done with **inline
  tags** (`[whispers]`, `[angry]`) instead of `style`. The line layer carries both forms (`delivery.style`
  *and* `delivery.tags`) so a character can switch model without reshaping the data. *(Verify exact
  defaults/model ids against current ElevenLabs docs at build time — their API moves.)*
- **Cost discipline:** per-character lock = a handful of calls; per-line TTS across a script = hundreds.
  Cache by `hash(text+voiceId+settings)` and **skip unchanged lines** (same instinct as image version
  history, but here it's also the bill).

---

## 6. Seedance 2.0 — what we must confirm before wiring (the "what's possible" checklist)

The user's own research (treat as provisional) indicates Seedance 2.0 **accepts reference audio and
lip-syncs to it** — image + 1..N audio refs + prompt, with time-range directives. That's the native
path this plan assumes. Before building the hand-off, the chosen provider/endpoint must answer:

1. **Inputs:** does it take `(key image, [audio refs], prompt)` in one call? Max # of audio refs?
2. **Audio-as-clock:** does the **clip length follow the audio length**, or do we pass a target
   duration? (User's principle: audio length = clip length. Confirm the contract.)
3. **Max clip length** (so we know where to split long lines).
4. **Speaker binding:** with multiple audio refs, how is each bound to the right character — by prompt
   description, by slot order, or by an explicit map? (This is the top mis-binding risk.)
5. **Tone/style transfer:** does it *mimic the timbre* of the ref audio, or only sync mouth timing? (The
   user's Test 4 saw sync degrade when style-transfer was on — we need to know which knob.)
6. **Time-range directives** (Test 3): supported syntax for "at 0–3s X happens, at 3–6s Y".
7. **Determinism/seed:** can we pin a seed for reproducible retries?
8. **Async contract:** submit→poll→signed-url, latency, and failure/refund behaviour (for the proxy).

### 6A. ANSWERED — provider chosen: fal.ai, `reference-to-video` *(2026-06-15)*

Endpoint confirmed and feasibility checked against fal.ai's official ByteDance Seedance 2.0 API
(also on Volcengine Ark / Replicate / PiAPI). **We use the `reference-to-video` variant — it's the exact
frame + line-audio → lip-synced-clip shape this plan assumed.**

- **Model id:** `bytedance/seedance-2.0/reference-to-video` (or `…/fast/reference-to-video`, 720p cap).
- **Auth:** `FAL_KEY` (server secret, set via `supabase secrets set FAL_KEY=…` — never the browser).
- **Inputs:** `image_urls` (≤9 — the **shot frame** goes here), `audio_urls` (≤3, **combined ≤15s** — the
  **locked-voice line**), `video_urls` (≤3), `prompt` (refs assets as `@Image1` / `@Audio1`), `duration`
  (`auto` or **4–15**s), `resolution` (480/720/**1080p**), `aspect_ratio` (incl. **9:16** for micro-drama),
  `generate_audio` (bool), `seed`. Total ≤12 files.
- **Output:** `{ video:{ url, content_type, file_name, file_size }, seed }` — a signed `fal.media` mp4 URL.
- **Async:** submit → poll/`webhook`/`subscribe` → result. Good for the proxy.

Checklist resolutions (1–8 above):
1. ✅ one call takes (image + audio refs + prompt). 2. ⚠️ **duration is a PARAMETER** (auto | 4–15s), not
auto-bound to audio length — so we **pass our measured `lineAudio.durationMs`** (clamped 4–15s) as `duration`;
our §0 clock drives it. 3. ✅ **max 15s** (= our `clipMax`; long lines split at sentence/beat as planned).
4. ⚠️ **no explicit per-face map** — multi-speaker binding is **prompt-driven** (`@Audio1 is spoken by the
woman on the left`); this remains the top mis-binding risk → Phase-0 Lab Tests 2 & 4. 5. lip-sync is
phoneme-level; style/motion transfer is separate (test which knob). 6. time-range is via prompt/camera
directives (not a structured field) — validate in the Lab. 7. ✅ `seed`. 8. ✅ submit→poll→signed-url; confirm
refund-on-failure behaviour at build time.

- **Cost (flag):** priced **per second of output** (~$0.24–0.30/s fast/standard on fal; varies by
  resolution/provider). A 15s clip ≈ $3.60–4.50; a ~50-clip micro-drama ≈ low hundreds → the Coordinator's
  cost-preview gate (`CoordConfirm`/`preProdStatus`) must extend to the Stage video render before batching.

> **Decided 2026-06-15:** Seedance 2.0 via **fal.ai `reference-to-video`** is the Phase-3 provider; `FAL_KEY`
> is a server secret in the same proxy. §6 is no longer an open question — Phase 3 is unblocked.

---

## 7. Phase 0 — the "Lip-Sync Lab" (test harness spec; not built)

A minimal sandbox that mirrors the user's reference screenshot — the fastest way to validate Seedance
**without** ElevenLabs (audio can be **uploaded**, decoupling the two vendors):

- **Inputs:** one **key image** slot + **N audio slots** (`loc_woman.mp3`, `loc_man.mp3`, …) + a prompt
  box (with optional time-range sections).
- **Output:** the returned clip + a **run log** (inputs, durations, seed, sample #) so variance is
  measurable across re-runs.
- **Why upload-first:** tests 1–3 below need only *audio + Seedance*; ElevenLabs generation bolts on
  later as Phase 1. This gets you testing the moment an endpoint exists.

### Test matrix (carried from discussion)

**Methodological rule #1 — isolate the two stages.** Voice *generation* (ElevenLabs) and *lip-sync*
(Seedance) are separate failure points. Test each alone before testing them fused, or a bad result is
un-diagnosable.

| # | Test | Probes | Watch for |
|---|---|---|---|
| 1 | Single voice ref | baseline sync | clip length vs line length |
| 2 | Multiple voice refs | turn-taking | **right voice → right face** binding |
| 3 | Tone/style transfer | timbre mimic vs timing-only | sync degradation (user's Test 4) |
| 4 | **Mis-binding (failure of #2)** | swap slots / ambiguous desc | voices crossing over |
| 5 | **Duration vs clip limit** | overrun a max-length clip | truncation / speed-up / mid-word cut → sets split rule |
| 6 | **Emotion ↔ sync tradeoff** | extreme expression + tight sync together | which degrades the other |
| 7 | **Cross-shot voice consistency** *(our pipeline)* | same locked voice over 3 shots | identity drift |
| 8 | **Audio-quality sensitivity** | clean TTS vs noisy clone | does input quality alone move sync |
| 9 | **Language/accent** | non-English via ElevenLabs multilingual | sync survival |
| 10 | **Determinism** | same inputs ×3 | variance before trusting one sample |

**Don'ts / wasted tests:** long monologues in one clip (known limit — chunk instead); fusing
"clone fidelity" with "preserves our locked voice" (separate them); single-seed conclusions; prompts
that fight the audio ("he shouts" over a calm track) unless conflict-resolution is the explicit test.

---

## 8. Phased build plan (each phase independently useful)

- **Phase 0 — Lip-Sync Lab** *(needs only a Seedance endpoint)*: upload image + mp3s + prompt → clip +
  run log. Runs tests 1–10.
- **Phase 1 — Voices tab + lock**: ElevenLabs design / library / clone via the media-proxy; `voiceLock`
  on the character; auto-drafted spec + audition + lock (consent-gated clone).
- **Phase 2 — Line audio at the Shot stage**: render each shot's `dialogue` through the locked voice;
  capture `durationMs`; wire **audio-as-clock** into `clipLenMs` and the long-line split rule.
- **Phase 3 — Seedance production path**: shot frame + locked-voice line audio → lip-synced clip;
  cut points derived from durations.
- **Phase 4 — Storyboard → Stage**: assemble clips on the audio-driven timeline (Step 10).

---

## 8A. Phase 1 → 2 — the audio slice (the first increment, detailed)

This lands **before any video**. It needs **only ElevenLabs** (no Seedance), and is independently
valuable: the Stage's *estimated* durations become **real measured ones**, and the cut can be
**heard**. Build this slice first; Phase 0/3 (Seedance) proceed in parallel and converge later.

### Shared infrastructure
- **media-proxy** — extend the Supabase `image-proxy` Edge Function to accept `task:"voice"` (the §4/§9
  decision; sibling functions are the fallback). The **ElevenLabs key is a server secret**; the browser
  only ever calls the proxy. Sub-routes: `tts`, `voiceDesign`, `voiceLibrary`, `voiceClone`.
- **Asset kind `"audio"`** — `turn_audios` cloud table + `turn-audio-{id}` IDB store, `.mp3` (per §3),
  reusing the `cloud.jsx` signed-URL / RLS machinery.
- **`app/voicegen.jsx`** — a structural twin of `imagegen.jsx`: `elGenerate / elDesignVoice /
  elPickLibrary / elCloneVoice / elCommit / useVoiceGen` (§4), cached by
  `hash(text + voiceId + resolvedSettings)` so unchanged lines never re-spend.

### Phase 1 — Voices tab (Art Room)
- **Tab order:** `Characters → Props → Voices → Locations → Style → Shots → Storyboard`.
- **VoiceCard per speaking character** — reuses the `SheetFrame` shell with a **waveform + play head**
  instead of an image. Three origins (§5):
  - **Designed** — build a `voiceSpec` from the bible (age / identity / archetype / drive) → Voice
    Design → audition 2-3 candidates → **lock** `voiceLock.voiceId`.
  - **Library** — browse / pick a prebuilt voice, lock its id.
  - **Cloned** — upload samples, **consent-gated + local-first exactly like Cameo** (reuse the cameo
    consent UX) → instant clone → lock.
- **Auto-draft** a candidate `voiceSpec` on first Art Room open (mirrors the silent cast auto-draft);
  the user **auditions and locks — never silently committed.**
- Writes `voiceLock { voiceId, voiceName, source, modelId, defaults, consent, sync, provenance }` (§3).
- **Scope:** only characters who actually have `dialogue` need a voice — surface the count ("4 of 6
  speak"). Add a **"Voices" stage to `preProdStatus`** (locked / speaking) so it shows in the
  readiness strip and the Coordinator estimate.
- **Acceptance:** every speaking character can be locked to a `voiceId`; re-open shows the lock;
  cloned voices honour consent + local-first.

### Phase 2 — line audio = the clock
- **Render** each shot's `dialogue` through its `voiceLock` (resolved settings = `defaults` ⊕ the
  line's `delivery`) → `lineAudio { audioUrl, durationMs, text, voiceId, delivery, hash }` (§3).
- **Audio-as-clock swap:** replace the Stage's estimated `shotDur` with the **measured `durationMs`**
  everywhere it drives `clipLenMs`, the cut-rhythm bar, the `sceneSequences` partition, and the
  runtime summary. (`app/stage.jsx` uses estimates today — this is the one-line-of-truth swap.)
- **Long-line split:** a line whose `durationMs` exceeds the clip max splits at a **sentence / beat
  boundary** (the rule §0 promised) — each part its own `lineAudio` + sub-clip.
- **Multi-speaker shots:** one `lineAudio` per speaker (sets up Phase 3's per-face binding).
- **Batch:** "Voice all lines" renders every shot's dialogue, one at a time, progress + cancel,
  **skipping unchanged** lines by hash, behind a **cost preview** (Coordinator pattern).
- **Stage surfacing:** the render dock's **Voice** field shows the `lineAudio` waveform and
  **Duration** shows the locked `durationMs`; un-voiced lines read "needs voice".
- **Acceptance:** with voices locked, "Voice all lines" populates `lineAudio`; the Stage timeline
  **re-times to measured durations**; re-runs skip unchanged lines; the Stage is fully usable (you can
  hear the cut) **with zero Seedance dependency.**

### Deferred by this slice
Seedance video (Phase 3) and the player / export — gated on the §6 endpoint checklist and the Phase 0
Lab. The render dock's frame/model/Generate controls stay inert until Phase 3. Phase 1→2 stands alone.

### ElevenLabs API key — required scopes (restricted key, server-side only)
The Phase 1→2 slice maps to exactly these ElevenLabs endpoint permissions — grant these, **No Access**
to everything else (especially all *Administration* scopes):

| ElevenLabs scope | Access | Why |
|---|---|---|
| **Text to Speech** | Access | per-line render + timestamps (Phase 2) |
| **Voice Generation** | Access | Voice Design — the "designed" origin (Phase 1) |
| **Voices** | **Write** | clone + create + list library (Phase 1) |
| **Models** | Access | list / select the TTS model (optional) |
| **Forced Alignment** | Access | precise word timing for cuts + captions (optional) |
| *all others, incl. all Administration* | **No Access** | least privilege — an app key is not an admin key |

The key is held **only** as the media-proxy server secret — never shipped to the browser.

---

## 9. Risks & cross-cutting decisions

- **Consent / licensing** for voice cloning — reuse the cameo consent gate; local-first, cloud opt-in.
- **Cost** — per-line TTS + per-clip video; cache by hash, skip unchanged, batch with a cancel.
- **Clip-length limits** — audio-first turns "where to cut" into a measured sentence/beat split.
- **Proxy shape** — extend `image-proxy` → generic media-proxy vs new functions (decide at Phase 1).
- **Governance** — `Story Pipeline.md` edits only after the §2 wording is approved.
- **MUSE sync** — when shipped, add `APP_FEATURES` entries (Voices tab; the Stage) and check
  `MUSE Protocol.md`, per CLAUDE.md, so MUSE describes them accurately.

---

## 10. Open questions for the user

1. Seedance provider/route (so the proxy contract in §6 can be filled in). **— RESOLVED:** fal.ai
   `bytedance/seedance-2.0/reference-to-video`, `FAL_KEY` server secret. Full contract in §6A.
2. ElevenLabs account/key for Phase 1. **— in progress:** a restricted, server-side key is being
   created with the §8A scopes (Text to Speech + Voice Generation + Voices·Write; Models + Forced
   Alignment optional). ⚠️ The account shows an **unpaid invoice** — voice generation will fail until
   that's cleared, so settle it before relying on the key.
3. Approve the §2 pipeline wording (Voices tab + Step 10) — or amend it. **— still open** (the
   `Story Pipeline.md` edit waits on this).

> **Decided 2026-06-15:** §2A Stage UI (dock + board, Board/Timeline toggle, pipeline-fed inputs,
> locked duration) is the **canonical** Stage layout. §8A defines the **Phase 1→2 audio slice** as the
> first build increment (ElevenLabs only, no Seedance).
