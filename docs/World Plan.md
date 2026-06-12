# Worlds Plan — explorable location spaces for shot consistency

> **SHELVED 2026-06-12 by owner decision** — the feature was built, verified
> live (Blockade + Marble), and then removed the same day: the pano scouting
> flow didn't earn its place over the existing plates + anchors. The full
> implementation lives in git history (428cb95…87a9dc3, removal commit after);
> reviving it is a revert away. Provider keys may remain set server-side.

*Spec for solving location consistency the way the user framed it (2026-06-12):
"create a world from an image, walk inside it, frame a shot, take the shot
with characters in it." Reference product: OpenArt's Create World (3D world →
WASD navigation → framing rectangle → Take Shot with character library).*

## The problem it solves

Today a location is locked by a **6-panel coverage plate** + a per-scene
**anchor frame**, and every other shot is derived from the anchor as a
re-frame. That holds identity well *within* a scene, but:

1. The camera can only go where a re-frame can plausibly take it — there is
   no way to *scout* the space and pick an angle that doesn't exist yet.
2. Cross-scene returns to the same location can drift (different anchor,
   different implied geometry).
3. The user can't *see* the space as a space — only as six fixed views.

The OpenArt-style answer: make the location a **navigable panorama** the user
can look around in, frame inside, and shoot from — every shot then inherits
the same baked geometry and light because it literally comes from the same
image of the space.

## What TURN can honestly build (buildless, no 3D engine)

A true gaussian-splat 3D world is out of reach for a CDN-React app — but the
core of the UX is not the 3D; it's **one continuous image of the space +
framing inside it**. That is achievable with:

- **A 360° equirectangular panorama per location** ("the world plate").
  ENGINES (chosen 2026-06-12, the "shortcut tier"): **Blockade Labs Skybox**
  (purpose-built 360° generator, ~30-60s, includes a depth map) and **World
  Labs Marble** (true explorable 3D gaussian-splat world, ~5 min — its result
  ALSO includes a pano, which we store identically; the splat file stays on
  their CDN, linked from the card). Both run behind the image-proxy's
  `task:"world"` with server-secret keys (BLOCKADE_API_KEY, WORLDLABS_API_KEY)
  and a stateless start/poll pattern — no Edge Function held open.
- **A pano viewer** (Three.js from CDN, ~150 lines: sphere + texture +
  pointer-drag look + wheel FOV). WASD isn't needed for v1 — LOOK + ZOOM
  covers the OpenArt flow's actual value (frame-hunting); the framing
  rectangle is the viewer's own viewport crop.
- **Take Shot = crop + compose**: the framed view is captured (canvas crop of
  the pano at the current yaw/pitch/FOV) and becomes the LOCATION LOCK
  reference for that shot's generation — composed with the scene's grade,
  the character sheets and the prop sheets exactly like today's anchor-derive
  path. The pano crop replaces/augments the anchor as the geometry truth.

## Phases

### Phase 1 — the world plate *(medium)*
1. `Location card → "Create world"`: generates a 2:1 equirect pano from the
   location spec + depth grid (one new prompt builder `buildWorldPanoPrompt`;
   render via the existing image pipeline, stored as a location asset
   `world-<locId>` next to the coverage plate).
2. Show-scoped like other shared assets when the location is bible-owned.

### Phase 2 — the scout viewer *(medium)*
1. Three.js pano viewer in a modal ("Scout this location"): drag to look,
   wheel/[] for FOV, aspect-true framing rectangle for the project's format
   (16:9 / 9:16 from the format registry).
2. "Take view" captures the framed crop (client canvas) and saves it as a
   **view asset** on the location (named, reusable — e.g. "toward the door,
   35mm"). Views are listed on the location card.

### Phase 3 — shots shoot FROM the world *(the payoff)*
1. A shot card gains "Frame in world" (when its location has a world plate):
   opens the scout viewer, the taken view becomes that shot's location
   reference — passed to generation as the geometry lock alongside (or
   instead of) the scene anchor.
2. The Scene Director prefers world views when they exist: anchor = the
   scene's first world view; QC compares against the pano crop.
3. Characters ride in exactly as today (sheets as reference images) — the
   world fixes the SPACE; the cast pipeline already fixes the PEOPLE.

### Out of scope (deliberately)
- True 3D / WASD translation through the space (splats, depth meshes) — the
  pano gives 90% of the consistency for 5% of the engineering.
- Per-shot relighting of the pano (the grade still applies at the shot).
- World editing ("move the couch") — regenerate the plate instead.

## Costs (image-model spend)
One pano per location (≈1 generation, same cost class as a coverage plate);
views are free (client-side crops); shots cost the same as today.

## Sequencing

| Step | Size | Depends on |
|---|---|---|
| P1 world plate prompt + asset | M | — |
| P2 pano viewer + views | M | P1, Three.js CDN |
| P3 shots from views + Scene Director preference | M | P2 |
