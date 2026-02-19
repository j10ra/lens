function pad(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + " ".repeat(width - str.length);
}

export function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, (row[i] ?? "").length), 0);
    return Math.max(h.length, maxRow);
  });

  console.log(headers.map((h, i) => pad(h, widths[i]!)).join("  "));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell ?? "", widths[i]!)).join("  "));
  }
}
