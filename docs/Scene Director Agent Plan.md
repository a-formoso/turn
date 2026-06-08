# PLAN / SPEC — The Scene Director agent (visual consistency)

> **Status: PLAN ONLY.** Nothing in `app/` is built from this yet. It builds directly on the
> per-scene **anchor** mechanism already shipped in the Shot List (`shot.anchor` + anchor-as-first-
> reference in `collectShotRefs`). The Director is the *orchestration + QC loop* on top of that.

---

## 0. One line

A bounded-loop agent that takes a scene from a shot list to a **consistent set of generated frames**,
hands-off: it sets the look once (the anchor), generates the rest against it, **looks at the results**,
and **regenerates the ones that drifted** — then asks you to approve.

It's the durable answer to "individual shots come out random." The anchor stops *most* drift; the
Director adds the **feedback loop** that single-pass generation can't do.

---

## 1. The problem it solves

Manual generation today is: generate each shot, eyeball it, manually regenerate the bad ones. That's
slow, inconsistent, and there's no rubric — you notice the obvious misses and miss the subtle ones
(a slightly different hijab colour, a re-lit room, a wandering eyeline). The Director makes the
look-setting → generation → **inspection** → **repair** cycle automatic and rule-based.

---

## 2. Where it lives & how it's launched

The existing **Agents panel** (Writers' Room) operates on *story* (`ctx.model = {scenes, beats,
continuity, drafts}`). The Director is an **Art Room / Shot List** concern — it needs shots, generated
images and the asset store, which that ctx doesn't carry.

**Proposal:** launch it from the **Shot List** with a **"Direct scene"** button on each scene group
(and a **"Direct the whole film"** in the header), reusing the agent engine's **reasoning trace +
approval-card UI** (`agents-ui.jsx`) but driven by an extended **visual ctx** (§8). Per-scene is the
natural unit, because the anchor is per-scene.

---

## 3. The pipeline (one scene)

Mirrors the Continuity Repair bounded loop (`agentContinuityRepair` in `app/agents.jsx`): plan → act →
observe → propose → repeat until clean or capped.

```
PLAN     emit: "Directing Scene 03 — 6 shots. Anchor: shot 3.1 (WS establishing)."
ANCHOR   if the anchor has no frame → generate it first (char sheets + location plate + Style Bible
         grade; NO anchor-ref, it IS the anchor). This is the scene's look-master.
SEQUENCE for each remaining shot IN ORDER → generate referencing the anchor frame (the mechanism we
         built) (+ optionally the previous shot for motion continuity). emit progress per shot.
QC       vision pass — for each generated shot, compare it to the anchor (+ the character sheets)
         across the consistency rubric (§4). Score each dimension; collect flags.
         emit: "QC: 4/6 consistent. Flagged 3.4 (Amina's wardrobe drifted), 3.5 (grade too warm)."
REPAIR   bounded loop (max ~2 per shot): regenerate each flagged shot with a CORRECTIVE instruction
         derived from the QC reason (an edit: "match the anchor's cool blue grade; hijab is navy"),
         and a heavier anchor weighting. Re-QC the repaired shot. Stop at the cap or when it passes.
APPROVE  ctx.propose() → an approval card per scene: the frames (kept / repaired / still-flagged),
         with Keep all · Re-run flagged · Discard. Generation is expensive, so this is gated (§7).
REPORT   emit done: "Scene 03 directed — 6 frames, 3 repaired, 1 still needs your eye (3.6: hands)."
```

Whole-film mode runs this per scene in story order, each scene independent (its own anchor).

---

## 4. The consistency rubric (what QC checks)

Each generated shot is judged against the **anchor** and the **character sheets**, per dimension →
`pass | minor | fail` + a one-line reason + a suggested corrective instruction (fed into the repair regen):

| Dimension | Checks against |
|---|---|
| **Identity / face** | character sheet + anchor — same person, bone structure, skin tone |
| **Wardrobe & accessories** | anchor + sheet — same clothes, colours, worn props |
| **Lighting & colour grade** | anchor — the scene's look (this is the big drift source) |
| **Location & geometry** | anchor + location plate — same space, materials, layout |
| **Prop continuity** | the right carried/worn props present and consistent |
| **Shot grammar** | the shot's own spec — did it actually render the requested size/angle/lens? |
| **Gross errors** | hands/anatomy/extra limbs/text artifacts/duplicate people |

The overall verdict = worst dimension (one `fail` flags the shot). Minor issues are reported but not
auto-repaired unless the user opts into strict mode.

---

## 5. New primitives required (the two pieces that don't exist yet)

**(a) Headless shot-frame generation** — `generateShotFrame(shot, ctx, {anchorUrl, editInstruction})`.
Mirrors `generatePropSheet` (`app/props.jsx`): builds the shot prompt (`combinedShotPrompt`), collects
refs (anchor + location plate + character/prop sheets — the same `collectShotRefs` logic), calls
`nbGenerate` through the proxy (GPT Image 2), commits under `shot.id` via `nbCommit` (which already
versions, so repairs are non-destructive and revertible). The agent calls this directly — no mounted card.

**(b) Vision QC** — `qcCompare({anchorUrl, candidateUrl, sheetUrls, rubric}) → {dimensions:[{name,
verdict,reason,fix}], overall}`. A **multimodal model call** (the model *looks* at the images) returning
structured JSON. Routed through the proxy's **`text` task with image inputs**.
> **Dependency:** confirm the `image-proxy` `text` task accepts image content (vision). If not, it's a
> small proxy extension. This is the one genuinely new capability the Director needs.

---

## 6. Guardrails (bounded-loop philosophy, like the other agents)

- **Bounded:** max shots per run, **max ~2 repair iterations per shot** (never loop forever on a shot
  the model can't nail — flag it for a human instead, exactly like Continuity Repair stops on a
  declined fix).
- **Cost ceiling:** a hard cap on total generations per run; stop and report if hit.
- **Non-destructive:** every (re)generation goes through `nbCommit` version history; nothing is lost,
  and the final keep/discard is gated by `propose()`.
- **Cancellable:** check `ctx.cancelled()` between every shot and every QC call.
- **Transient-tolerant:** wrap generation in the **network retry** (the `ERR_NAME_NOT_RESOLVED` /
  "failed to send request" class) so a DNS blip doesn't abort a 6-shot run. (This is the retry already
  proposed for `proxyGenerate` — the Director makes it a hard requirement.)

---

## 7. Approval / UX model — TWO gates

Because generation costs money and time:

1. **Plan gate (before spending):** `propose()` a plan card — *"Generate the anchor + 5 shots, then QC
   and repair up to 2 each — about 6–16 image generations. Proceed?"* with a cost/time estimate.
2. **Results gate (after generating):** `propose()` a results card per scene — thumbnails of every
   frame tagged kept / repaired / still-flagged, with **Keep all · Re-run flagged · Discard**.

The reasoning trace (`ctx.emit`) streams the whole time so you can watch it think and cancel.

---

## 8. The extended (visual) ctx the Director needs

Beyond the text agents' `ctx.model`:

```js
ctx.shotsFor(sceneId)        // ordered shots + their anchor
ctx.gen.shotFrame(shot, opts)// headless generation primitive (§5a) -> url
ctx.vision.qc(args)          // vision QC primitive (§5b) -> verdict
ctx.asset.get(id) / has(id)  // read generated frames (nbGetImage/nbLoadImage)
ctx.refs(shot)               // the resolved reference stack (reuses collectShotRefs)
ctx.emit / propose / cancelled / sync   // same as today
```

A small **visual ctx factory** sits alongside the existing agent ctx factory in `app/app.jsx`.

---

## 9. Scope

- **Direct scene** — one scene (the default unit; one anchor).
- **Direct the whole film** — every scene in order, each independent.
- A **strict** toggle — repair `minor` drift too, not just `fail` (more generations, tighter result).

---

## 10. Cost & time (rough)

Per 6-shot scene: 1 anchor + 5 shots = 6 base generations, + QC calls (cheap-ish vision), + repairs
(say 2 shots × 1 retry = 2) ≈ **8 image gens + ~8 vision calls**. The plan gate shows this up front so
there are no surprises. Whole-film = sum of scenes; runs sequentially with a single cancel.

---

## 11. Phased build

- **Phase A — Headless generation** (`generateShotFrame`) + the **transient retry**. Lets the agent
  generate at all, and immediately benefits manual batch generation too.
- **Phase B — Director without QC**: anchor → ordered sequence → plan/results gates. Already valuable
  (automates the anchor-first workflow end-to-end).
- **Phase C — Vision QC + repair loop**: add `qcCompare` (confirm/extend the proxy vision task), the
  rubric, and the bounded repair. This is the part that makes it *self-correcting*.
- **Phase D — Whole-film + strict mode + cost dashboard.**

Each phase is independently useful; B is shippable on its own.

---

## 12. Open questions for the user

1. **Vision QC routing** — does the `image-proxy` `text` task already accept image inputs, or do we
   extend it? (Determines whether Phase C is "wire it up" or "extend the function".)
2. **Anchor authority** — when QC says the anchor *itself* is weak (bad hands, off-model), should the
   Director offer to regenerate the anchor (and then re-derive the scene), or leave the anchor to you?
3. **Launch surface** — "Direct scene" buttons in the Shot List (proposed), or a new entry in the
   Agents panel with the visual ctx?
4. **Auto-apply vs gate** — keep both gates (plan + results), or let power users run fully unattended
   with just a cost cap?
