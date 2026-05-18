import { describe, expect, it } from "vitest";
import { runPatternImpl } from "./pattern.js";

describe("runPatternImpl", () => {
  it("matches function declarations in TypeScript source", async () => {
    const files = [
      {
        path: "src/sample.ts",
        content: `
          export function greet(name: string) { return "hi " + name; }
          export function add(a: number, b: number) { return a + b; }
        `,
      },
    ];

    const result = await runPatternImpl({
      pattern: "function $NAME($$$) { $$$ }",
      language: "typescript",
      files,
      limit: 10,
    });

    expect(result.matches.length).toBe(2);
    expect(result.matches[0].path).toBe("src/sample.ts");
    expect(result.matches.map((m) => m.captures.NAME).sort()).toEqual(["add", "greet"]);
  });

  it("respects limit", async () => {
    const files = [{ path: "a.ts", content: "function a(){}\nfunction b(){}\nfunction c(){}" }];

    const result = await runPatternImpl({
      pattern: "function $N() {}",
      language: "typescript",
      files,
      limit: 2,
    });

    expect(result.matches.length).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("returns empty matches when pattern doesn't match", async () => {
    const result = await runPatternImpl({
      pattern: "class $N {}",
      language: "typescript",
      files: [{ path: "a.ts", content: "const x = 1;" }],
      limit: 10,
    });

    expect(result.matches).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("supports csharp language", async () => {
    const files = [
      {
        path: "Foo.cs",
        content: `
          using System;
          namespace App {
            public class Foo {
              public void Bar() {}
            }
          }
        `,
      },
    ];

    const result = await runPatternImpl({
      pattern: "public class $C { $$$ }",
      language: "csharp",
      files,
      limit: 10,
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].captures.C).toBe("Foo");
  });
});
