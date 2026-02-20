export function normalizePosix(p: string): string {
  const parts: string[] = []
  for (const seg of p.split("/")) {
    if (seg === "..") parts.pop()
    else if (seg !== "." && seg !== "") parts.push(seg)
  }
  return parts.join("/")
}
