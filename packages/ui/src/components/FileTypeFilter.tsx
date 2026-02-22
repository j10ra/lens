import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";

export interface FileTypeFilterOption {
  value: string;
  label: string;
  count: number;
}

interface FileTypeFilterProps {
  options: FileTypeFilterOption[];
  selected: ReadonlySet<string>;
  onToggleOption: (value: string) => void;
  onToggleAll: () => void;
  className?: string;
}

export function FileTypeFilter({ options, selected, onToggleOption, onToggleAll, className }: FileTypeFilterProps) {
  const allSelected = options.length > 0 && selected.size === options.length;

  return (
    <div className={cn("min-h-0 flex flex-1 flex-col border-b border-border px-2 py-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">File Types</div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onToggleAll}
          disabled={options.length === 0}
          className="h-6 px-1.5 text-[10px]"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </Button>
      </div>

      <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {options.length === 0 && <div className="px-1 text-[10px] text-muted-foreground">No file types found.</div>}

        {options.map((option) => {
          const checked = selected.has(option.value);

          return (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onToggleOption(option.value)}
              className={cn(
                "h-6 w-full justify-start gap-2 px-1.5 font-mono text-[11px]",
                checked ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Checkbox checked={checked} className="pointer-events-none size-3.5" aria-hidden />
              <span className="truncate">{option.label}</span>
              <span className="ml-auto text-[10px] text-muted-foreground/70">{option.count}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
