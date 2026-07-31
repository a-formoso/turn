# TURN — project notes

Story-architecture app for AI filmmakers (value charges, scenes that turn, beats → script).
Branding: the method is **the Infinite Studio method** — MUSE must never name McKee / Robert McKee / Claude / Anthropic (there's a system-prompt rule + a `scrubBrand()` safety net in `app/ai.jsx`).

## 📐 Story-building process — follow the skill
When building a story (New Story → spine, Adaptation, or any seed→script flow), follow the canonical
pipeline in **`docs/Story Pipeline.md`**. It is owned by the user — **do not add, remove, reorder, or
change any step without their explicit prior permission.** Propose changes and wait for a yes.

## ⚠️ Keep MUSE's product knowledge in sync
MUSE (the in-app AI co-writer) answers users' how-to / product questions from a **single capability manifest**: the `APP_FEATURES` array in `app/ai.jsx`. It is the source of truth fed into MUSE's system prompt via `appBrief()`.

**Whenever you add, rename, or change a user-facing feature, update `APP_FEATURES` in `app/ai.jsx` in the same change.** If you don't, MUSE will give users outdated or confabulated answers. MUSE is also instructed to say "I'm not sure" rather than guess about anything not in that list.

## 🛡️ MUSE answer protocol
How MUSE is allowed to answer users (scope, confidentiality, tone, refusals, staying in character) is governed by **`docs/MUSE Protocol.md`**. The protocol is enforced in code by `museSystemPrompt()` in `app/ai.jsx` (the system prompt), with `scrubBrand()` and `museFinalAnswer()` as safety nets. **If you change one, change the other** so the doc and the prompt stay in sync. MUSE is the floating help assistant (`app/muse.jsx`, voice + chat) — it only answers; it never edits the story.

## 🔀 Two working copies — never reason about Replit from branch names
Work happens in **two places**: this local repo and the **Replit workspace**. Either can be ahead.

**Before proposing any `reset --hard`, merge, sync-conflict resolution, or "Replit is behind" claim:**

1. **Push from Replit first.** In the Replit *Shell* (not the agent chat), on separate lines — chaining
   with `&&` hides failures, because `git commit` exits non-zero on "nothing to commit" and silently
   skips the push:
   ```
   git status --short && git log --oneline -5
   git push -u origin HEAD
   ```
2. **Then** compare on GitHub: `git fetch origin --prune` and `git rev-list --left-right --count <branch>...origin/main`.

**The `origin/replit*` branches are stale checkpoints and say NOTHING about the workspace's real state.**
On 2026-08-01 they read 200 commits behind while the live Replit workspace was 14 commits *ahead* of
`main`, holding four days of unpushed work (fal price-drift watcher, Stripe grant-failure persistence,
a storage service-role/RLS fix). Acting on the branch names would have destroyed all of it.

**Label every command with the machine it runs on.** `~/.supabase/access-token` and the Supabase CLI
deploy exist only on the Mac; running them in Replit fails with a confusing auth error.

**Deploying `image-proxy` from one machine silently reverts the other's edits to it** — the edge
function is deployed whole from a local file, not merged. Always `git pull` before `supabase functions
deploy`, or you overwrite fixes made elsewhere.

## Architecture
- `app/story-data.jsx` — sample film (The Matrix) data: SCENES, BEATS, SCREENPLAY, FACTS + CONTINUITY map.
- `app/ai.jsx` — model wiring (drafting, polish, scene authoring, MUSE chat, agent helpers: aiSuggestTurn/aiPlantLine/aiTableRead/aiBuildSpine) + `APP_FEATURES`.
- `app/agents.jsx` — bounded-loop agent engine + 4 agents (Story Doctor, Continuity Repair, Adaptation, Table-Read). Each works on a working `model` and gates changes behind `propose()`.
- `app/agents-ui.jsx` — Writers' Room modal: agent picker, reasoning trace, approval cards.
- `app/spine.jsx` — value-charge graph + filmstrip + DragScroll pan.
- `app/inspector.jsx` — editable scene/beats/analysis panel.
- `app/script.jsx` — Script view, continuity checker, version history.
- `app/chrome.jsx` — top bar + left rail. `app/app.jsx` — state + composition (scenes, beatsMap, drafts, continuityMap, agent ctx factory).
