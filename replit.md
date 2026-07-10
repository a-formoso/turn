# TURN — Cinema Machine

Story-architecture app for AI filmmakers. Build a spine, write scenes that turn, develop beats into a screenplay, design cast and world, storyboard the film.

## Stack

- **Buildless React 18** — no bundler; Babel standalone compiles JSX in-browser
- **Supabase** — auth + cloud storage (anon key in `app/supabase-config.js`); app works offline on localStorage when signed out
- **Static file server** — `node .claude/serve.js` on port 5000

## How to run

```
node .claude/serve.js
```

The workflow "Start application" is already configured and will start this automatically.

## Project layout

- `TURN.html` — entry point; loads all scripts in order
- `app/` — all React components (`.jsx`) and styles
- `app/ai.jsx` — model wiring, MUSE chat, agent helpers, `APP_FEATURES` manifest
- `app/app.jsx` — top-level state and composition
- `app/chrome.jsx` — top bar + left rail
- `app/spine.jsx` — value-charge graph + filmstrip
- `app/agents.jsx` — bounded-loop agent engine
- `app/story-data.jsx` — sample film data (The Matrix)
- `docs/` — pipeline, protocol, and plan docs
- `.claude/serve.js` — static file server

## Important conventions (see AGENTS.md for full details)

- **MUSE branding**: never name McKee / Robert McKee / Codex / Anthropic in MUSE output; `scrubBrand()` in `ai.jsx` is the safety net
- **APP_FEATURES** in `ai.jsx` is the source of truth for MUSE's product knowledge — update it whenever you add or rename a user-facing feature
- **Story pipeline** in `docs/Story Pipeline.md` is user-owned — do not reorder or change steps without explicit permission
- **MUSE protocol** in `docs/MUSE Protocol.md` and `museSystemPrompt()` must stay in sync

## User preferences
