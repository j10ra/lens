The maximum commit count analyzed during git history analysis is **2000**.

This is defined by the `MAX_COMMITS` constant on line 9 in `packages/engine/src/index/git-analysis.ts`, which is used in the git log command on line 25 with the `-n` flag.

Additionally, there's a `MAX_FILES_PER_COMMIT = 20` limit (line 10) that skips commits with more than 20 files, and a `RECENT_DAYS = 90` window (line 11) for tracking "recent" activity.

## Report

- **Tool calls**: 2
- **Files read**: 1
- **Key findings**:
  - Maximum commits analyzed: **2000** (`MAX_COMMITS` constant)
  - Commits with >20 files are skipped (`MAX_FILES_PER_COMMIT`)
  - Recent activity window: 90 days (`RECENT_DAYS`)
  - Git command used: `git log --name-only --format=%H %aI --no-merges -n 2000`
