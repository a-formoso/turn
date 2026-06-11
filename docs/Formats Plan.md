# Formats — implementation plan

> **Status: SPEC, not yet built.** Owner: Alexandre. One step of this plan (the format
> picker inside New Story) touches the canonical pipeline in `docs/Story Pipeline.md`,
> which requires explicit owner approval before implementation — flagged below as ⚠️.

## Principle

Formats (film · short · commercial · micro-drama · series · documentary) change **what's
inside the rooms, not the pipeline**. Development → Pre-production → Production → Post
holds for all of them. No new rooms; no new tabs; format is a lens the existing studio
reads from.

## Where the code is today (facts the plan builds on)

- `project.format` already exists as **freeform text** ("Feature Film" in the sample) and
  is only used decoratively in exports. No logic reads it.
- The spine builder **hardcodes 16 scenes** (`aiBuildSpine` in `app/ai.jsx`, the
  two-half stitcher) and the pipeline doc specifies "16-scene spine".
- New Story (`app/newstory.jsx`) is a 3-step intake: `seed → loglines → synopsis`.
- Rooms/tabs are format-blind; the Stage clip budget is a constant
  (`CLIP_MAX_SECONDS = 15` in `app/shots.jsx`).
- Cloud schema: one `turn_projects` row per film, the whole story in one `doc` jsonb.
  No grouping layer.

---

## Phase 1 — Format as a first-class project property  *(small)*

**1.1 The registry — single source of truth.** New file `app/formats.jsx`:

```js
const FORMATS = [
  { id:"film",       label:"Film",        icon:"film",    scenes:[14,18], runtimeMin:15,  aspect:"16:9",
    screenplay:"full", blurb:"A complete short film — the full method." },
  { id:"short",      label:"Short",       icon:"clapper", scenes:[6,10],  runtimeMin:5,   aspect:"16:9",
    screenplay:"full", blurb:"One idea, one turn, a few minutes." },
  { id:"commercial", label:"Commercial",  icon:"bolt",    scenes:[3,5],   runtimeMin:1,   aspect:"16:9",
    screenplay:"light", blurb:"A product story in 30–60 seconds." },
  { id:"microdrama", label:"Micro-drama", icon:"phone",   scenes:[6,8],   runtimeMin:2,   aspect:"9:16",
    screenplay:"full", blurb:"Vertical episodes that hook in seconds." },
  { id:"series",     label:"Series",      icon:"layers",  scenes:[12,16], runtimeMin:10,  aspect:"16:9",
    screenplay:"full", blurb:"Episodes that share one world.", needsShow:true },
  { id:"documentary",label:"Documentary", icon:"globe",   scenes:[10,14], runtimeMin:10,  aspect:"16:9",
    screenplay:"interview", blurb:"Real subjects, a found structure." },
];
```
Each entry also carries (added in later phases, all in this one object): `tabs` relevance,
`emptyCopy` per tab, `spineBrief` (a sentence merged into the spine-builder prompt),
`stage` budgets. **Everything format-aware reads from this registry — nothing checks
`format` ids inline.**

**1.2 Storage.** `project.format` becomes one of the registry ids (string). Migration:
hydration treats a missing/legacy freeform value as `"film"` (`formatOf(project)` helper
in `formats.jsx` does the normalization; all consumers call it).

**1.3 ⚠️ New Story step 0 — "What are we making?"** *(requires pipeline-doc approval)*
A card row (registry-driven: icon, label, blurb) before the seed step:
`format → seed → loglines → synopsis`. Default selection "Film" so one click-through
preserves today's behavior. On approval, `docs/Story Pipeline.md` gains a "Step 0 —
Format" section and the step list in `app/newstory.jsx` adds `"format"`.
**Until approved, Phase 1 ships without this step** (format defaults to "film" and can
be changed from the project chip).

**1.4 Visible identity.** Format badge on the project chip (`ProjectSwitcher` row +
top-bar chip): small mono tag (`FILM`, `COMMERCIAL`, …). The hero's rotating words on
the landing and this taxonomy now match — same vocabulary, page to product.

**1.5 Spine targets.** `aiBuildSpine` takes the registry's `scenes` range + `spineBrief`
instead of the hardcoded 16 (16 stays exactly the "film" entry, so the current pipeline
is unchanged for films). ⚠️ Also a pipeline-doc touch ("Build the 16-scene spine" →
"Build the spine to the format's target"); same approval gate.

**Acceptance:** existing projects load unchanged as "film"; a new commercial project
builds a 3–5 scene spine; the badge shows everywhere a project is named.

## Phase 2 — Format-aware rooms  *(medium)*

- **Tab relevance, not removal.** `ART_TABS` stays one list; the registry's `tabs` map
  marks tabs `core | optional | hidden` per format. Hidden = not rendered (e.g. a
  commercial hides nothing in pre-production but a documentary may hide Cameo);
  optional tabs render with format-specific empty-state copy from `emptyCopy`
  (e.g. documentary Characters: "Your subjects — the real people on camera").
- **Screenplay emphasis.** `screenplay:"light"` (commercial) keeps the Script view but
  the drafter writes VO/super/action-block copy instead of feature scene work;
  `"interview"` (documentary) drafts interview questions + narration beds. This is
  prompt-level only — one `screenplayBrief` string per format fed to `aiDraftScene`.
- **Stage budgets.** `stage:{ clipMax:15, aspect:"9:16"|"16:9", targetTotal:seconds }`
  per format; `CLIP_MAX_SECONDS` becomes `clipMaxFor(project)`, and the Shots tab's
  default aspect follows the format (micro-drama boards vertical).
- **Agents read the format.** One line in each agent's context block ("FORMAT: a
  60-second commercial — keep coverage tight, sell the product beat") — the registry's
  `spineBrief` reused.

**Acceptance:** switching a project's format re-labels empty states and Stage budgets
without touching stored story data.

## Phase 3 — The Show layer (series / micro-drama)  *(large — the one structural change)*

- **Schema:** new `turn_shows` table `{ id, owner, title, bible jsonb, created_at,
  updated_at }` + nullable `turn_projects.show_id` and `episode_no` (additive,
  backwards-compatible). RLS mirrors `turn_projects`.
- **The bible** holds the shared world: cast, locations, props, lookbook, grade presets.
  Episode docs keep their own scenes/beats/drafts/shots and **reference bible entities
  by id**. Hydration merges bible entities into the working state read-only-by-default
  (editing a bible entity prompts: "change for the whole show, or just this episode?").
- **The hard part — shared reference sheets:** generated assets are keyed per project
  (`nbUseCloud(projectId, uid)`); bible entities must store assets under a
  **show-scoped prefix** so every episode resolves the same character sheet. This is a
  storage-pathing change in `cloud.jsx`/`image-slot.js` and is the riskiest piece —
  build behind the `needsShow` formats only.
- **UI:** the project switcher gains one level — Show → episodes (E01, E02…), "New
  episode" clones nothing except the bible link. The room structure is untouched.

**Acceptance:** two episodes of one show render the same character sheet from one
generation; deleting an episode never deletes bible assets.

## Cross-cutting

- **MUSE / `APP_FEATURES`** updated at each phase (CLAUDE.md rule).
- **Landing**: the rotating words become claims the product literally fulfils; keep them
  in sync with shipped formats.
- **Out of scope:** per-format pricing, the Post room, collaborative shows.

## Sequencing & sizing

| Step | Size | Depends on |
|---|---|---|
| 1.1–1.2 registry + storage | S | — |
| 1.4 badge | S | 1.1 |
| 1.5 spine targets | M | 1.1, ⚠️ pipeline approval |
| 1.3 New Story step 0 | S | ⚠️ pipeline approval |
| Phase 2 rooms/Stage | M | Phase 1 |
| Phase 3 Show layer | L | Phase 1 (2 optional) |
