// Single source of truth for all external model configuration.
// Change model names, API URLs, batch sizes, and secrets here.

import { secret } from "encore.dev/config";

// --- Embeddings (Voyage AI) ---
// Secret: encore secret set --type dev VoyageApiKey
export const VoyageApiKey = secret("VoyageApiKey");
export const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
export const EMBEDDING_MODEL = "voyage-code-3";
export const EMBEDDING_DIM = 1024;
export const EMBEDDING_BATCH_SIZE = 32; // Voyage max 120K tokens/batch; code chunks avg ~500 tokens

// --- Purpose Summaries (OpenRouter) ---
// Secret: encore secret set --type dev OpenRouterApiKey
export const OpenRouterApiKey = secret("OpenRouterApiKey");
export const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
export const PURPOSE_MODEL = "qwen/qwen3-coder:free";
export const PURPOSE_BATCH_LIMIT = 200;
export const PURPOSE_CONCURRENCY = 10;
