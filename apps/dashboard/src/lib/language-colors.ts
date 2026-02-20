const LANG_COLORS: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f7df1e",
  json: "#a5a5a5",
  markdown: "#6b7280",
  css: "#9333ea",
  html: "#ef4444",
  shell: "#4ade80",
  yaml: "#f59e0b",
  sql: "#06b6d4",
};

const DEFAULT_COLOR = "#6b7280";

export function languageColor(lang: string | null): string {
  if (!lang) return DEFAULT_COLOR;
  return LANG_COLORS[lang.toLowerCase()] ?? DEFAULT_COLOR;
}
