# SKILL — The TURN Story Pipeline

> **Ownership & governance.** This document is owned by the project manager (the user).
> It is the canonical, step-by-step process the assistant follows when building a story in TURN.
> **The assistant MUST NOT add, remove, reorder, or change any step without the user's explicit
> prior permission.** Propose changes; wait for a yes. The user may edit this file freely at any time.
>
> Branding rule (inherited from CLAUDE.md): everything here is **the Infinite Studio method**.
> Never name McKee / Robert McKee / Claude / Anthropic in any user-facing or MUSE-facing output.

---

## Purpose
A single, repeatable spine for turning a raw idea into a fully-written, structurally-sound short
film — so every story starts from the user's *own* seed and grows its own world, instead of
inheriting sample-story names/characters. (Starting from the bundled sample is for demo only;
real authoring should always begin at Step 1.)

---

## The pipeline

### 0. Format & Framework  *(format added 2026-06-11; framework added 2026-06-11 by owner-delegated decision; Hero's Journey + Story Circle added 2026-06-12 by owner approval)*
The user first chooses **what we are making** — film · short · commercial · micro-drama ·
series · documentary (the registry in `app/formats.jsx`; default **Film**, so one click
preserves the classic flow) — and, on the same screen, **how it should be told**: the
narrative FRAMEWORK (the registry in `app/frameworks.jsx`; default **Three-Act Turns**,
the classic method; alternatives: **Kishōtenketsu**, four movements where the *ten*
recontextualizes rather than clashes; **Hero's Journey**, the twelve-stage mythic round
across Departure/Initiation/Return; **Story Circle**, eight steps — you · need · go ·
search · find · take · return · change — over four act bands. Hero's Journey and Story
Circle added 2026-06-12 with owner approval). The format sets the spine's **target scene count
and runtime**, the screenplay emphasis, and downstream room/Stage defaults; the framework
sets the **act bands, the audit question, and the build/doctor criteria**. Both change
the *size and telling* of what's built — never the steps below.

### 1. Seed
The user provides a seed: a logline, a premise, or a rough idea. Nothing is assumed beyond it.

### 2. Research → Synopsis  *(the new, defining step; amended 2026-06-12 by owner approval: framework-shaped synopsis, seed pass-through, format-aware research)*
Before any structure is built, expand the seed into a synopsis using the
**Three Pillars of Research** (the Infinite Studio research method). The assistant may **search the
web** to gather real, grounding material for the Fact pillar. Three owner-approved rules:
- **The writer's original seed rides along** into research and synopsis as canon — its names,
  details and questions survive even when the chosen logline compressed them away.
- **The research lenses are format-aware** (registry `researchBrief`): a commercial researches the
  product, audience and category codes; a documentary researches the real subject, access and
  verifiability; a micro-drama researches the scroll-stopping hook. Films keep the classic lenses.
- **The synopsis takes the FRAMEWORK's shape** (registry `synopsis.paras`): three-act keeps the
  classic three paragraphs below verbatim; Kishōtenketsu writes Ki / Shō / Ten / Ketsu;
  Hero's Journey writes Departure / Initiation / Return; Story Circle writes You & Need /
  Go & Search / Find & Take / Return & Change.

- **Memory** — inward: honest, universal emotional truths the seed touches (family, betrayal, joy).
- **Imagination** — living the characters' hours and days in the mind until scenes feel like déjà vu;
  surfacing hidden connections.
- **Fact** — outward: real historical, social, technical or place detail (web research allowed/encouraged)
  so the world is specific and cliché-proof.

Output the synopsis in the framework's shape — for THREE-ACT, this exact classic shape:

```
SYNOPSIS: [Title]

The Setup
[Paragraph 1 — the world, the protagonist, the inciting situation]

The Confrontation / Complication
[Paragraph 2 — escalating conflict, the midpoint turn, mounting stakes]

The Resolution
[Paragraph 3 — crisis, climax, the irreversible final change]
```

The synopsis is the source of truth the rest of the build derives from — including **unique,
setting-appropriate character names** (never role-words like "Antagonist", never recycled sample names).

### 3. Build the spine to the format's target, in the framework's grammar  *(amended 2026-06-11; framework clause by owner-delegated decision)*
From the synopsis, build a full spine at the **format's target scene count** (Film = the
classic 16), using the **framework's act grammar** (Three-Act keeps today's exact build
language; Kishōtenketsu builds four movements where the *ten* is a recontextualization,
never a conflict escalation; Hero's Journey builds the mythic round where every trial
costs; Story Circle builds the descent-and-return where every gain carries a price): the **scenes**, then the **premise**, **controlling idea**,
**setting**, and **cast**, then **beats + screenplay** for every scene — threading
continuity scene to scene.

### 4. Structural core — the Spine
Every story is a sequence of scenes, each carrying a **value charge** (opening → closing, e.g. +2 → −1).
The **Spine view** plots that charge across all scenes so the rhythm of the whole arc is visible.
Each scene must **turn** a value (open and close differ in sign or by ≥2). The **continuity / turn check**
flags scenes that don't turn, and setups/payoffs that are missing or out of order.

### 5. Writing each scene (the nested layers)
A scene is built from **beats** — an action/reaction subtext map (editable: add, reorder, delete,
mark the turning beat). The **screenplay prose** is generated *from* those beats. The Script view
shows the screenplay with a left gutter indicating which beat each block expands.

### 6. Drafting controls
- **Draft with MUSE** — drafts the one selected scene (authors beats first if it has none, then writes the script).
- **Auto-draft all** — drafts every still-undrafted scene in order, threading continuity.
- **Polish / Re-polish** — rewrites drafted prose to final quality while keeping beats locked.
- **Version history** — every draft and polish is kept; Revert / Redo move between versions.

### 7. Working across the whole story — the Writers' Room agents
**Story Doctor** (finds the weakest structural link, proposes a fix, re-audits), **Continuity Repair**,
**Adaptation** (full build-from-source), **Table-Read**. Each proposes changes the user approves,
with one-click Undo.

### 8. MUSE
The in-app co-writer answers how-to / product questions and helps draft, all framed in the
Infinite Studio method vocabulary (values, charges, beats, turns).

### 9. Pre-production — the Art Room (visual pipeline)
Once the script exists, the **Art Room** turns it into a visual reference package (separate from the
Writers' Room). Tabs, left-to-right: **Props → Characters → Locations → Style Bible → Shot List → Storyboard**.
Each entity gets a canonical, reusable reference so every generated image stays consistent.

- **"Draft all" batch drafters are consistent across tabs.** Each tab's primary action fills every
  card's full written spec from the script in one pass — the same fields the per-card "Draft details"
  writes, and exactly what the **Master reference prompt** is built from:
  - **Draft all props** → Object, Significance, Look dev. (Props also runs the full props pipeline here:
    it first pulls any missing worn/carried items in from the cast, then drafts the specs, then maps every
    prop to the scenes it appears in — so there's no separate "Pull from cast" button. A per-card
    "Re-map scenes" button on each prop re-tags just that prop's scenes after a script change without
    re-drafting its spec.)
  - **Draft all characters** → Identity, Wardrobe, Props & accessories, Continuity (appearance states,
    where the script shows the look change), Look dev. **The cast is auto-drafted once, silently, the
    first time the Art Room is opened** (any tab) — only for characters that have no spec yet, never
    overwriting drafted or hand-edited ones — so the user normally skips this step entirely. Each
    undrafted card shows a quiet inline "Drafting from script…" status while it runs. The manual
    "Draft" button only appears when some character still lacks a spec (e.g. one added by hand, or if
    auto-draft didn't finish); once the whole cast is drafted it disappears. This makes the intended
    order: **Props → Draft all → Generate all → Characters → Generate all** (characters last, because a
    character sheet ingests its owned props' generated sheets as visual references).
  - **Draft all locations** → The space, Significance, Staging · Depth Grid, Look dev. (Locations also runs
    the full locations pipeline here: it first pulls any missing places in from the script's sluglines and
    refreshes existing scene chips, then drafts the specs, then stages each depth grid — so there's no
    separate "Pull from script" button.)
  Time-of-day variants are **not** part of "Draft all locations": they're optional, user-curated alternate
  plates (a Night/Day/weather version you choose to add), not a spec field that feeds the master prompt —
  so they stay a manual, additive choice. None of the batch drafters generate images; they only write the
  spec (the spec-first gate then unlocks generation).
- **"Generate all" batch image generation.** Next to each tab's "Draft all" is a **"Generate all
  props / characters / locations"** button that renders the reference sheet/plate for every **drafted**
  card in turn (one at a time, with a progress count and a Cancel). Undrafted/hand-added cards with no
  spec are skipped (nothing to build a good image from). If some cards already have a sheet you get a
  choice — **Generate N missing** or **Regenerate all** — so you never silently overwrite finished art.
  The same engine powers the per-scene **"Generate all in Scene X"** action; only one batch runs at a time.

- **Locations** are derived from the script's sluglines; each gets a multi-angle **coverage plate**
  and time-of-day variants. **Spec before render:** every location first gets a written **design spec**
  — *architecture, materials, lighting, significance, render style* (the AI "Draft" / "Draft all" pass
  writes these from the script). Those five fields ARE the plate prompt, so the spec must exist
  **before** a plate is generated. For locations **derived from the script**, one click does both —
  "Draft & Generate" auto-drafts the spec from the linked scenes, then renders. For **hand-added**
  locations (no script source to draft from), generation is **gated**: the "Regenerate plate" button
  stays disabled with a hint, and the spec fold opens by default, until the spec is written. This
  script-vs-manual rule is shared across **Props, Characters and Locations** — derived entities keep
  one-click Draft & Generate; hand-added ones must be described first.
- **Style Bible grade is NOT baked into location plates.** A location can span scenes with different
  looks, so its coverage plate renders **grade-neutral**; the card shows only an informational chip of
  which preset(s) its scenes use. The 60/30/10 Style Bible grade is a per-scene property applied
  **downstream at the shot**, never on the location plate. Style is assigned in the **Style Bible** tab.
- **Depth-Grid Staging (per location).** Each location owns a **3×3 depth grid** — Background /
  Midground / Foreground × Left / Center / Right — plus **Floor**, **Scale Class** and **Camera/Lens**.
  Named landmark roles: **Wall A** (centre-background primary landmark), **Wall B / Wall C** (left/right
  midground framing elements), foreground veils (**L1 / R1**), and the midground centre reserved for the
  **Subject**. **Cells are optional** — an empty cell means open space, so linear or open locations are
  never forced into a box. **Draft staging** fills the grid from the script; when the grid has content it
  feeds the plate prompt as spatially-explicit depth language (so images get true fg/mid/bg separation).
  The grid is the **canonical landmark layer a location owns**; Shots inherit and vary it.
- **Shot List (the convergence tab).** One beat → one shot. **"Draft all shots"** reads each scene's beats +
  screenplay and proposes real coverage (establish wide → tighten → land the turn on a push-in CU), giving each
  shot a **size · angle · move · lens**, the subject(s)/prop(s) in frame, an action line, an editable
  **composition** note and any dialogue. Shots are **grouped by scene** (per-scene Re-draft / Add shot / Generate
  scene); "Draft all shots" is **non-destructive** (only breaks down scenes that have none yet). Each frame is
  generated by composing five layers into one image: the scene's **Style Bible grade** (where the 60/30/10 grade
  is finally applied), the **location plate + depth-grid framing scoped to the shot size**, and the **character
  and prop sheets** passed as reference images for cross-shot continuity. **"Generate all shots"** batch-renders
  every frame (one at a time, skip/regenerate). **"Export shot list"** opens a printable AD-style table (Save as
  PDF). The Storyboard tab lays these frames out in sequence next.

---

## Implementation status (keep this honest)
- Steps **3–8** exist in code today (Adaptation agent, Spine, beats→script, drafting controls, Writers' Room, MUSE).
- Step **2 (Research → Synopsis)** is **now built** (`aiResearchSynopsis` in `app/ai.jsx`, the synopsis-review
  step in `app/newstory.jsx`, threaded into the spine build via `composeStoryBrief`). The New Story flow is
  now: seed → loglines → **research → synopsis (review/edit)** → spine. The model has no live web, so the Fact
  pillar draws on the model's own world knowledge (period, place, the protagonist's role through four lenses:
  what happens / how it feels / frustrating / lovely).
- `APP_FEATURES` in `app/ai.jsx` has been updated so MUSE can describe the stage.

---

## Change log
- *(created)* — initial pipeline codified from the manager's 8-step spec + the Three Pillars of Research.
- *(Step 2 shipped)* — Research → Synopsis built into the New Story flow: 3-pillar research + editable
  three-paragraph synopsis, reviewed before the spine builds, then threaded into spine/world/cast generation.
- *(Step 9 added)* — Pre-production / Art Room documented, including per-location **Depth-Grid Staging**
  (3×3 + Floor + Scale Class + Camera, optional cells, AI "Draft staging", feeds the plate prompt). Added
  with the user's explicit permission; the grid lives on Locations now and Shots will inherit it later.
