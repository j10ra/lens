import { Badge } from "@lens/ui";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface GrepMatch {
  path: string;
  score: number;
  isHub: boolean;
  exports: string[];
}

interface CommandPaletteProps {
  repoPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
  open: boolean;
}

const API = "http://localhost:4111/api/dashboard";

export function CommandPalette({ repoPath, onSelect, onClose, open }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GrepMatch[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const grepRes = await fetch(`${API}/grep`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoPath, query: query.trim(), limit: 10 }),
        }).then((r) => r.json());

        const allMatches: GrepMatch[] = [];
        for (const term of grepRes.terms ?? []) {
          for (const m of grepRes.results?.[term] ?? []) {
            if (!allMatches.find((x) => x.path === m.path)) {
              allMatches.push(m);
            }
          }
        }
        setResults(allMatches.slice(0, 10));
        setSelectedIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, repoPath]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIdx]) {
        e.preventDefault();
        onSelect(results[selectedIdx].path);
        onClose();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, selectedIdx, onSelect, onClose],
  );

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-lg border border-border bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files, functions, symbols..."
            className="h-10 flex-1 bg-transparent text-sm focus:outline-none"
          />
          {loading && (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {results.length > 0 && (
          <div className="max-h-64 overflow-auto py-1">
            {results.map((r, i) => (
              <button
                key={r.path}
                type="button"
                onClick={() => {
                  onSelect(r.path);
                  onClose();
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  i === selectedIdx ? "bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <span className="flex-1 truncate font-mono">{r.path}</span>
                {r.isHub && (
                  <Badge variant="outline" className="text-[9px]">
                    hub
                  </Badge>
                )}
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{r.score.toFixed(1)}</span>
              </button>
            ))}
          </div>
        )}

        {query.length >= 2 && results.length === 0 && !loading && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">No results</div>
        )}
      </div>
    </div>
  );
}
