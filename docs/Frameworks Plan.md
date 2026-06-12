# Narrative frameworks — implementation plan

> **Status: SPEC, not yet built.** Owner: Alexandre. Two steps touch the canonical
> pipeline in `docs/Story Pipeline.md` and need explicit owner approval before
> implementation — flagged ⚠️ below. Companion to `docs/Formats Plan.md`:
> **format** says how big/what shape the production is; **framework** says how the
> story is *told*. They are orthogonal axes on a project (a 9:16 micro-drama can
> be Kishōtenketsu; a feature can be three-act).

## Principle

The spine's primitive — **a charge per scene** — is framework-neutral and stays
untouched. Everything Western-specific lives one layer up, and the codebase keeps
that layer surprisingly thin. "The Infinite Studio method" remains the umbrella:
the method is structure-first filmmaking; frameworks are interchangeable lenses
inside it. (Branding rule applies: never name McKee in any user-facing output.)

## Where the framework actually lives today (the complete inventory)

| Coupling | Where | What it hardcodes |
|---|---|---|
| **The audit rule** | `turnInfo(sc)` `app/spine.jsx:6` (+ duplicate `sd_turnInfo` in `app/agents.jsx:68`) | turned = sign flip or Δ≥2; `resolution` kind exempt — pure conflict-doctrine |
| **Act bands** | `scene.act` (1–3), `actNames {Setup, Complication, Resolution}` `spine.jsx:172`, roman-numeral ruler | three acts and their names |
| **Milestone vocabulary** | `KIND_LABEL` `spine.jsx:56` | Inciting Incident, Act Climax, Midpoint, Crisis, Story Climax, Resolution |
| **Verdict copy** | Inspector `inspector.jsx:141` ("This scene turns / doesn't turn", scissors icon), Audit view sub ("if a scene doesn't turn, cut it") | the cut-it doctrine |
| **The spine builder** | `spineBatch` ranges in `app/ai.jsx` ("all of ACT I… midpoint… Act II climax / lowest point…"), per-scene `a:1–3` | three-act escalation grammar |
| **Story Doctor** | `agents.jsx` audit loop | flags non-turning scenes, weak act climaxes; proposes re-charges |
| **Beats** | drive/react rows, `turnAt` | action-vs-reaction conflict beats |
| **Shot Designer / Scene Director** | coverage language | "land its turn on its most expressive size" |

Good news: every consumer of the rule already goes through `turnInfo` (or its one
duplicate), the ruler already groups **arbitrary consecutive `scene.act` integers**,
and `window.turnProject` (built for formats Phase 2) gives paramless code a path to
the project. The abstraction is cheap.

## The definition object — single source of truth

New file `app/frameworks.jsx` (mirror of `formats.jsx`):

```js
const FRAMEWORKS = [
  { id:"threeact", label:"Three-Act Turns", icon:"graph",
    blurb:"Conflict-driven. Every scene turns a value.",
    acts:[ {n:1,name:"Setup"}, {n:2,name:"Complication"}, {n:3,name:"Resolution"} ],
    kinds:{ incite:"Inciting Incident", "act-climax":"Act Climax", midpoint:"Mid-Act Climax",
            crisis:"Crisis", "story-climax":"Story Climax", resolution:"Resolution" },
    audit:{
      rule:(sc)=>{ /* EXACTLY today's turnInfo body — frozen */ },
      okTitle:"This scene turns", flagTitle:"This scene doesn't turn",
      subline:"If a scene doesn't turn, cut it", flagIcon:"scissors" },
    spineActRanges:[ /* today's two half-prompts, verbatim */ ],
    doctorCriteria:"flag scenes that open and close on the same charge; strengthen weak act climaxes",
    beatVocab:{ a:"Drive", b:"React", turnLabel:"the turn" } },

  { id:"kishotenketsu", label:"Kishōtenketsu", icon:"layers",
    blurb:"Four movements. The twist recontextualizes — no clash required.",
    acts:[ {n:1,name:"Ki — Introduction"}, {n:2,name:"Shō — Development"},
           {n:3,name:"Ten — Twist"}, {n:4,name:"Ketsu — Reconciliation"} ],
    kinds:{ plant:"Planting", deepen:"Deepening", ten:"The Twist",
            "re-read":"Recontextualization", ketsu:"Reconciliation" },
    audit:{
      rule:(sc)=>{ /* band-aware: see Audit semantics below */ },
      okTitle:"This scene carries its movement", flagTitle:"This scene is inert",
      subline:"Ki plants · Shō deepens · Ten re-reads everything · Ketsu reconciles",
      flagIcon:"alert" },
    spineActRanges:[ /* four-movement build prompts — ten is a RECONTEXTUALIZATION,
                        explicitly NOT a conflict escalation */ ],
    doctorCriteria:"the ten must make the reader re-read every scene before it — audit it as a question, not arithmetic; flag shō scenes that repeat instead of deepen; the ketsu must reconcile, not defeat",
    beatVocab:{ a:"Present", b:"Deepen", turnLabel:"the re-read" } },
];
function frameworkOf(project){ /* normalize like formatOf; default threeact */ }
```

**Audit semantics for Kishōtenketsu** (the honest design decision): a deterministic
charge-rule can't test "does the twist recontextualize?". So the audit splits:

- **Deterministic layer** (per band, runs everywhere `turnInfo` runs today):
  ki/shō scenes pass unless *inert* (Δ0 **and** same charges as the previous
  scene); a **ten** scene must shift the running pattern (sign reversal or Δ≥2 —
  the only band keeping a hard rule); ketsu is exempt (like `resolution` today).
- **Agentic layer**: the Story Doctor (and the Audit view's per-scene "ask the
  Doctor" affordance, Phase 3) puts the real question to the model — *"re-reading
  scenes 1–N with the ten in mind: what recontextualizes, and what doesn't?"* —
  surfacing prose findings instead of a scissors verdict.

## Phases

### Phase 1 — the seam *(medium; no pipeline touch, no behavior change)*
1. `app/frameworks.jsx` registry + `frameworkOf(project)`; `project.framework`
   stored as registry id; missing/legacy → `threeact`.
2. **`turnInfo` keeps its signature** and delegates:
   `turnInfo(sc) → frameworkOf(window.turnProject).audit.rule(sc)`. Delete the
   `sd_turnInfo` duplicate in `agents.jsx` (route to `window.turnInfo`).
3. Act bands read `frameworkOf(project).acts` (names + count); `KIND_LABEL`
   becomes `kindLabelFor(project)`; roman ruler already handles 4 acts.
4. Inspector verdict + Audit sub-line copy read `framework.audit`.
   **Acceptance:** three-act projects render byte-identical; the registry's
   threeact entry IS the frozen current behavior.

### Phase 2 — choosing + building *(medium; ⚠️ two pipeline approvals)*
1. ⚠️ **New Story**: the Step 0 screen gains a second row — "How should it be
   told?" (Three-Act Turns · Kishōtenketsu), defaulting to Three-Act so one click
   preserves today's flow. (Amends pipeline Step 0; owner approval required.)
2. ⚠️ **Spine builder**: `spineBatch` takes `framework.spineActRanges` instead of
   the hardcoded act language (today's text becomes the threeact entry, verbatim);
   per-scene `a:` spans the framework's act count. Kishōtenketsu's prompt forbids
   conflict-escalation phrasing for the ten. (Amends pipeline Step 3 wording.)
3. `aiAuthorScene` / `aiSuggestTurn` / beats labels read `beatVocab` +
   `doctorCriteria` ("the turn" vs "the re-read").

### Phase 3 — the agents and deeper surfaces *(medium)*
1. Story Doctor reads `doctorCriteria`; for Kishōtenketsu it runs the re-read
   question against the ten and reports prose findings (no auto re-charge of
   ki/shō scenes to force turns).
2. Audit view verdict column per framework; Analysis tab copy; Shot Designer's
   "land the turn" line becomes framework-aware via `beatVocab.turnLabel`.
3. `themeArgues` (idea/counter-idea) stays for both — the dialectic is part of
   the umbrella method, not the act grammar. Revisit only if Kishōtenketsu use
   shows it fighting the form.

## Cross-cutting
- **MUSE/`APP_FEATURES`** updated each phase; framework badge next to the format
  badge on the project chip (`THREE-ACT` / `KISHŌTENKETSU`).
- **Shows**: framework lives per-EPISODE (episodes of one show may differ); the
  bible carries no framework.
- **Shipped 2026-06-12 (owner approval)**: **Hero's Journey** (three-act skin:
  Departure/Initiation/Return acts, twelve stage milestones, classic turn rule,
  elixir exempt) and **Story Circle** (four act bands of two steps each —
  you/need · go/search · find/take · return/change — classic turn rule, change
  exempt). Both are pure registry entries plus `assignPlotPoints` stage maps;
  the spine builder reads any framework's `spine` grammar generically.
- **Out of scope for now**: beat-sheet presets (trademarked brands), per-scene
  framework mixing, retroactive conversion of an existing story between frameworks
  (charges survive, `act`/`kind` need remapping — ship as a Doctor proposal,
  not an automatic migration).

## Sequencing & sizing

| Step | Size | Depends on |
|---|---|---|
| P1 registry + turnInfo seam + bands/copy | M | — |
| P2 chooser + spine builder | M | P1, ⚠️ both approvals |
| P3 Doctor + Audit/Analysis + agents | M | P1 (P2 for full effect) |
