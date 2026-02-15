Based on the LENS context pack provided, I already have the answer directly from the ranked file.

## Voyage AI Embedding Configuration

| Parameter | Value |
|-----------|-------|
| **Model** | `voyage-code-3` |
| **Dimensions** | `1024` |
| **Batch Size** | `32` |
| **API URL** | `https://api.voyageai.com/v1/embeddings` |

The configuration is defined in `apps/encore/index/lib/models.ts:12` — the single source of truth for external model configurations. The batch size of 32 was chosen because Voyage's max is 120K tokens/batch, and code chunks average ~500 tokens.

Note: There's also a newer implementation in `packages/engine/src/index/embed.ts` which uses:
- `MAX_BATCH_TOKENS = 100,000` (Voyage limit 120k, 100k for safety)
- `POOL_SIZE = 32` (concurrency)
- `MAX_API_CALLS = 2000` (rate limit protection)

---

## Report

- **Tool calls**: 0
- **Files read**: 0 (context pack provided the answer)
- **Key findings**:
  - Voyage model: `voyage-code-3` with 1024 dimensions
  - Batch size: 32 (conservative for 120K token limit)
  - Dual implementations: Encore app + engine package
