export interface TaskAnalysis {
  keywords: string[];
  likely_files: string[];
  scope: "narrow" | "broad";
  task_type: "fix" | "feature" | "refactor" | "test" | "explore";
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "must", "to", "of",
  "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "and", "but", "or", "not", "no", "so", "if", "then", "than", "that",
  "this", "it", "its", "all", "each", "every", "any", "some", "my",
  "our", "your", "their", "what", "which", "who", "how", "when", "where",
  "add", "make", "create", "update", "change", "modify", "implement",
  "please", "want", "like", "use", "get", "set",
]);

const TYPE_HINTS: Record<string, TaskAnalysis["task_type"]> = {
  fix: "fix", bug: "fix", error: "fix", broken: "fix", crash: "fix", issue: "fix",
  add: "feature", feature: "feature", implement: "feature", new: "feature", create: "feature",
  refactor: "refactor", clean: "refactor", reorganize: "refactor", restructure: "refactor",
  test: "test", spec: "test", coverage: "test",
  explore: "explore", understand: "explore", explain: "explore", find: "explore",
};

/** Fast keyword extraction — no LLM call.
 *  Extracts meaningful terms from the goal, matches against repo map paths. */
export function analyzeTask(goal: string, repoMap: string): TaskAnalysis {
  // Extract keywords: filter stopwords, keep meaningful terms
  const words = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  // Dedupe preserving order
  const keywords = [...new Set(words)].slice(0, 6);

  // Also keep multi-word phrases (bigrams) from the goal
  const goalLower = goal.toLowerCase();
  const bigrams: string[] = [];
  const rawWords = goalLower.split(/\s+/);
  for (let i = 0; i < rawWords.length - 1; i++) {
    const pair = `${rawWords[i]} ${rawWords[i + 1]}`;
    if (!STOPWORDS.has(rawWords[i]) || !STOPWORDS.has(rawWords[i + 1])) {
      bigrams.push(pair);
    }
  }
  keywords.push(...bigrams.slice(0, 2));

  // Match likely files from repo map
  const mapLines = repoMap.split("\n");
  const likely_files: string[] = [];
  for (const line of mapLines) {
    const match = line.match(/^[\s]*(\S+?)(?:\/?\s*—)/);
    if (!match) continue;
    const path = match[1];
    if (keywords.some((k) => path.toLowerCase().includes(k) || goalLower.includes(path.toLowerCase()))) {
      likely_files.push(path);
    }
  }

  // Detect task type from hint words
  let task_type: TaskAnalysis["task_type"] = "feature";
  for (const word of rawWords) {
    if (TYPE_HINTS[word]) {
      task_type = TYPE_HINTS[word];
      break;
    }
  }

  // Scope: narrow if few keywords and few likely files
  const scope = keywords.length <= 3 && likely_files.length <= 2 ? "narrow" : "broad";

  return { keywords, likely_files, scope, task_type };
}
