## Report

- **Tool calls**: 8 (3 Grep, 5 Read)
- **Files read**: 5
- **Key findings**:
  - **Model name**: `voyage-code-3` — defined in `apps/encore/index/lib/models.ts:10` and `apps/daemon/src/cloud-capabilities.ts:63`
  - **Dimensions**: `1024` — defined in `apps/encore/index/lib/models.ts:11` (also confirmed in migration `apps/encore/repo/migrations/009_voyage_1024_dim.up.sql:5`)
  - **Batch size**: `32` — defined in `apps/encore/index/lib/models.ts:12` (Voyage max is 120K tokens/batch; code chunks avg ~500 tokens)
