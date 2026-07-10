# Replit Git Workflow Prompt (reusable)

A copy-paste prompt for Replit's AI agent that puts any imported project on a safe,
branch-only git workflow — Replit works on its own branch, GitHub is the bridge,
and `main` stays a reviewed trunk owned by your primary machine.

**Fill in the three placeholders before pasting:**

| Placeholder | What to put there |
|---|---|
| `<REPO_URL>` | The GitHub repo both copies sync through, e.g. `https://github.com/you/project.git` |
| `<BRANCH>` | The branch Replit owns, e.g. `replit` |
| `<KNOWN FIXES — optional>` | Any specific change you already know you want made (or delete the section) |

---

## The prompt

> This project is a copy of a repository I also develop on another machine. From here
> on, GitHub is the sync bridge between the two copies, and you must follow a strict
> git workflow. Do the following, then report back:
>
> **1. Confirm the git remote.** Run `git remote -v` and tell me the result. It should
> point at `<REPO_URL>`. If it doesn't — or if this project has no git history at all —
> stop and tell me before changing anything. Don't guess and don't create a new repo.
>
> **2. Never commit or push to `main`.** `main` is my reviewed trunk, managed from my
> other machine. All your work goes on a branch called `<BRANCH>`. Create it now if it
> doesn't exist (`git checkout -b <BRANCH>`) and stay on it for everything you do.
> Before any push, show me `git status` and `git log --oneline -5` and wait for my
> go-ahead. Never force-push. Never rebase or otherwise rewrite published history.
>
> **3. Push branch-only.** When I approve, push with `git push -u origin <BRANCH>`.
> I'll pull that branch to my primary machine and merge it into `main` myself after
> review. Do not open or merge anything into `main` from your side.
>
> **4. Confirm push auth.** Make sure Replit's GitHub connector is linked to this repo
> with push access. If a push fails on authentication or permissions, stop and tell
> me — do not work around it with tokens, remote changes, or a different repo.
>
> **5. Keep changes minimal and visible.** Make the smallest change that accomplishes
> the task. Do not reformat files you aren't otherwise editing, do not upgrade or add
> dependencies, and do not change `.gitignore`, CI config, or environment/secret files
> unless I explicitly ask. If a task seems to require any of those, propose it first.
>
> **6. Commit hygiene.** Small, single-purpose commits with clear messages. If you
> generate scratch files while working, don't commit them.
>
> **<KNOWN FIXES — optional>** There is a specific change I already want applied on
> the `<BRANCH>` branch: `<describe the exact change, the file, and how to verify it>`.
> Make that change, verify it as described, and commit it — nothing else alongside it.
>
> For now, do steps 1–4 (plus the known fix if given) and report back. Do not start
> any other improvement tasks — including ones you or Replit suggest — without my
> explicit approval.

---

## Why it's shaped this way

- **Branch-only + no force-push** protects `main` from being clobbered by an agent —
  the primary machine stays the only writer on the trunk.
- **"Stop and tell me" on remote/auth surprises** prevents the agent from "helpfully"
  creating a fresh repo or new remote, which silently forks your history.
- **Minimal-change + no-dependency rules** keep agent diffs reviewable when they land
  on your primary machine.
- **The suggestions freeze** (last line) matters: Replit's agent proactively proposes
  its own tasks (build-system swaps, deploy steps). Those are real decisions that
  belong to you, made on the working copy — not auto-applied to a mirror.

## The matching routine on your primary machine

```bash
git fetch origin
git log --oneline main..origin/<BRANCH>   # review what Replit did
git diff main...origin/<BRANCH>           # inspect the actual changes
git merge origin/<BRANCH>                 # merge into main when satisfied
git push origin main
```

One writer at a time on `main`: as long as changes flow one direction at a time
(Replit → GitHub → primary, or primary → GitHub → Replit), the copies never fork.

## Known Replit behavior: Publish auto-commits to `main`

Every click of Replit's **Publish/Republish** button creates a local commit on `main`
("Published your App", author `Replit Agent <agent@replit.com>`, trailer
`Replit-Commit-Author: Deployment`). This is platform bookkeeping — not your agent,
not configurable off — and it makes `git pull --ff-only` fail with "diverging
branches" after every publish.

These commits are disposable: the deployed app lives in Replit's infrastructure and
the real source of truth is GitHub. The standing sync ritual on Replit is therefore:

```bash
git fetch origin && git reset --hard origin/main   # discard publish bookkeeping, match GitHub
```

then Republish. Never try to merge or push the "Published your App" commits — reset
them away each time.
