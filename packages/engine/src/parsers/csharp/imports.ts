import { parse } from "@ast-grep/napi";
import { ensureCsharpRegistered } from "./register.js";

// C# `using` forms covered:
//   using System;
//   using System.Linq;
//   using static System.Math;
//   using Alias = App.Services;
// All return the right-hand namespace path as a flat dotted string.

const PATTERNS = ["using $NS;", "using static $NS;", "using $ALIAS = $NS;"];

export function extractCsharpImports(content: string): string[] {
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
