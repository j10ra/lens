# RLM — Integration Guide for Claude Code

RLM provides repo-aware context to Claude Code via CLI commands invoked through Bash.

---

## Prerequisites

**RLM daemon must be running** (typically as a background service). Start once:

```bash
cd /Volumes/Drive/__x/RLM && encore run
```

Verify CLI is available:

```bash
rlm --version
rlm daemon stats
```

---

## Integration: CLAUDE.md

Add a `./CLAUDE.md` file to any project with these instructions:

```markdown
## RLM — Repo Context Daemon

This project is indexed by RLM. When making changes:

### Core Commands

- `rlm task "<goal>"` — Get context pack with repo map, relevant files, recent activity
- `rlm search "<query>"` — Find code patterns, function definitions, usage examples
- `rlm read <path>` — Fetch full file content (use after search)
- `rlm run "<command>"` — Execute tests/builds (sandboxed: npm, cargo, python, git)
- `rlm status` — Check index freshness and embedding coverage

### Setup (first time for this repo)

1. Register this repo: `rlm repo register`
2. Verify: `rlm status`

### Multi-Repo Management

- `rlm repo list` — Show all registered repos with stats
- `rlm repo remove --yes` — Remove this repo's data

### How It Works

- Auto-indexes on first run, then tracks git changes
- Semantic search available when embeddings ready (~100% status)
- Background worker refreshes stale repos every 5 minutes
- All data isolated per repo (chunks, embeddings, traces)
```

Claude Code will read these instructions and invoke `rlm` commands via Bash when appropriate.

---

## Quickstart for Any Project

```bash
# 1. In your project directory, create .claude/CLAUDE.md with the content above
# 2. Register the repo
rlm repo register

# 3. Done — Claude Code will now use RLM when you ask it to make changes
```

---

## Example Workflow

```bash
# You: "Fix the failing auth tests"
# Claude: Runs `rlm task "fix failing auth tests"` → gets relevant files
#          Runs `rlm search "auth test"` → finds test files
#          Reads files with `rlm read`
#          Makes changes
#          Runs `rlm run "npm test"` to verify
```

---

## Troubleshooting

**Daemon not responding:**

```bash
cd /Volumes/Drive/__x/RLM && encore run
```

**Repo not found:**

```bash
rlm repo register
rlm status
```

**Search returns empty:**

```bash
rlm index --force
rlm status
```

**Check all repos:**

```bash
rlm repo list
```
