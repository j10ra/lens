# RLM — Local Repo Language Model Daemon

## Implementation Plan

Master tracker for building the RLM daemon. Each phase has its own file with granular tasks.

### Architecture Overview

```
┌─────────────┐       HTTP        ┌──────────────────────────┐
│  rlm CLI    │ ◄──────────────► │  Encore.ts Daemon        │
│  (any repo) │                   │                          │
└─────────────┘                   │  ┌────────────────────┐  │
                                  │  │ Services:          │  │
                                  │  │  health             │  │
                                  │  │  repo               │  │
                                  │  │  index              │  │
                                  │  │  search             │  │
                                  │  │  summary            │  │
                                  │  │  context            │  │
                                  │  │  patch              │  │
                                  │  │  runner             │  │
                                  │  └────────────────────┘  │
                                  │            │              │
                                  │  ┌─────────▼──────────┐  │
                                  │  │ Postgres + pgvector │  │
                                  │  └────────────────────┘  │
                                  └──────────────────────────┘
```

### Project Structure (target)

```
RLM/
├── apps/
│   └── rlm/                    # Encore.ts app
│       ├── health/             # Health service
│       ├── repo/               # Repo registration + management
│       ├── index/              # File discovery + chunking
│       ├── search/             # Grep + vector search + rerank
│       ├── summary/            # File/dir summaries + cache
│       ├── context/            # Context pack builder
│       ├── patch/              # Diff generation + application
│       ├── runner/             # Test/build execution
│       └── migrations/         # SQL migrations (pgvector, tables)
├── packages/
│   └── rlm-cli/               # CLI binary (Node/Bun)
│       ├── src/
│       │   ├── commands/       # register, task, search, read
│       │   └── util/           # repo detection, http client, formatter
│       └── package.json
├── plan/                       # This folder — implementation tracker
└── package.json                # Monorepo root
```

### Phase Tracker

| Phase | Name                        | File                   | Status      |
|-------|-----------------------------|------------------------|-------------|
| 0     | Foundations                 | [phase-0.md](phase-0.md) | [x] Done    |
| 1     | CLI Bridge                  | [phase-1.md](phase-1.md) | [ ] Pending |
| 2     | Indexing + Chunking         | [phase-2.md](phase-2.md) | [ ] Pending |
| 3     | Embeddings + Vector Search  | [phase-3.md](phase-3.md) | [ ] Pending |
| 4     | Summaries + Repo Memory     | [phase-4.md](phase-4.md) | [ ] Pending |
| 5     | Context Pack Builder        | [phase-5.md](phase-5.md) | [ ] Pending |
| 6     | Patch + Apply + Run         | [phase-6.md](phase-6.md) | [ ] Pending |
| 7     | Multi-Repo Support          | [phase-7.md](phase-7.md) | [ ] Pending |

### Engineering Decisions

- **Runtime:** Encore.ts (local daemon)
- **Prerequisite:** Docker (for Postgres)
- **Storage:** Postgres
- **Embeddings:** pgvector extension
- **LLM:** Z.ai GLM-4.7 (reasoning + patches)
- **CLI:** Node/Bun executable, callable from any repo
- **Monorepo:** apps/ + packages/ layout
