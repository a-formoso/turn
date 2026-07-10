# TURN website palette — "Paper & Ink"

The colour system for the marketing site (the signed-out landing page), inspired by
ElevenLabs' editorial restraint: neutral paper layers + near-black ink do all the
layout and typography work, and **colour is reserved for exactly one thing — the
story's direction** (green up, red down). Keep it that way: if a new element needs
emphasis, reach for a paper/ink step first, not a new colour.

**Source of truth in code:** the CSS custom properties defined on `.landing` in
`app/styles.css` (the `WEBSITE PALETTE` block). This document mirrors them for
reuse in brand assets (decks, social cards, ads, future pages).

## Paper — the surfaces

| Token | Hex | Name | Use |
|---|---|---|---|
| `--lpw-bg` | `#FCFCFB` | Paper | Page background |
| `--lpw-glass` | `rgba(252,252,251,.86)` | Paper, frosted | Sticky nav backdrop (with blur) |
| `--lpw-card` | `#F6F6F4` | Bone | Card fills |
| `--lpw-card-2` | `#F1F1EE` | Bone, pressed | Hover states, faint chart grid |
| `--lpw-line` | `#E8E8E5` | Hairline | Page grid rails & section rules |
| `--lpw-line-2` | `#E1E1DD` | Hairline, firm | Control borders (buttons, inputs) |

## Ink — the type and the black

| Token | Hex | Name | Use |
|---|---|---|---|
| `--lpw-ink` | `#0F1012` | Ink | Headlines & primary text |
| `--lpw-ink-2` | `#3C3F44` | Ink, soft | List/body text on white |
| `--lpw-sub` | `#5D6066` | Slate | Secondary text, captions |
| `--lpw-black` | `#0D0D0E` | Carbon | Primary buttons, featured pricing card |

## Charge — the only colour on the page

| Token | Hex | Name | Use |
|---|---|---|---|
| `--pos` | `#13955E` | Rise | Checkmarks (and the in-app story graph's up-turns) |
| `--pos-bright` | `#5AD398` | Rise, lit | Green on Carbon (checks inside the black pricing card) |
| `--neg` | `#D2493E` | Fall | Reserved (carries the in-app story graph's down-turns) |
| `--neg-bright` | `#E2685C` | Fall, lit | Red on Carbon (the hero spine's down-closing scene nodes) |
| `--lpw-accent` | `#E0742B` | Reel | Warm cinematic orange — the hero's rotating word; the page's one warm accent |
| `--pos-line` | `rgba(19,149,94,.35)` | Rise, faint | Subtle green borders/rings |

## Rules of use

1. **One colour family per meaning.** Green/red mean story direction — never reuse
   them for success/error UI states on the marketing site.
2. **Emphasis comes from ink, not colour.** Bigger/darker type, the Carbon button,
   or a black card — before any colour.
3. **Hairlines are the decoration.** The full-page grid (vertical rails + full-width
   rules, "+" intersections) is the visual signature; don't add shadows or gradients.
4. **Buttons:** Carbon pill = primary; white pill with `--lpw-line-2` border = secondary.
   On Carbon surfaces, invert (white pill, Carbon text).
5. **Text on colour:** avoid it. The only text-on-colour is white on Carbon.

> Note: the in-app (signed-in) dark theme has its own variables (`--bg-*`, `--txt-*`,
> `--pos`, `--neg` in `app/styles.css`); this palette governs the website only.
