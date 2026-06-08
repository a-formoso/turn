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

*User will supply the endpoint once the plan + feasibility are agreed.*

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

1. Seedance provider/route (so the proxy contract in §6 can be filled in).
2. ElevenLabs account/key available for Phase 1 (Phase 0 can run upload-only without it).
3. Approve the §2 pipeline wording (Voices tab + Step 10) — or amend it.
