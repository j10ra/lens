import { parse } from "@ast-grep/napi";
import { ensureCsharpRegistered } from "./register.js";

const PATTERNS = [
  "namespace $NS { $$$ }", // block-scoped
  "namespace $NS;", // file-scoped (C# 10+)
];

export function extractCsharpNamespaces(content: string): string[] {
  ensureCsharpRegistered();
  const root = parse("csharp", content).root();
  const found = new Set<string>();
  for (const pattern of PATTERNS) {
    for (const node of root.findAll(pattern)) {
      const ns = node.getMatch("NS");
      if (ns) found.add(ns.text());
    }
  }
  return Array.from(found);
}
