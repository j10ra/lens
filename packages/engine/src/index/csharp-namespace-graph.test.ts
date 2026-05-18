import { describe, expect, it } from "vitest";
import { resolveCsharpEdges } from "./csharp-namespace-graph.js";

describe("resolveCsharpEdges", () => {
  it("emits one edge per file that owns the namespace in a using", () => {
    const files = [
      { path: "App/Foo.cs", namespaces: ["App.Foo"], imports: ["App.Models"] },
      { path: "App/Models/User.cs", namespaces: ["App.Models"], imports: [] },
      { path: "App/Models/Order.cs", namespaces: ["App.Models"], imports: [] },
    ];
    const edges = resolveCsharpEdges(files);
    expect(edges).toEqual(
      expect.arrayContaining([
        { sourcePath: "App/Foo.cs", targetPath: "App/Models/User.cs" },
        { sourcePath: "App/Foo.cs", targetPath: "App/Models/Order.cs" },
      ]),
    );
    expect(edges).toHaveLength(2);
  });

  it("silently drops external usings (no owner in repo)", () => {
    const files = [{ path: "App/Foo.cs", namespaces: ["App.Foo"], imports: ["System", "System.Linq", "App.Bar"] }];
    const edges = resolveCsharpEdges(files);
    expect(edges).toEqual([]);
  });

  it("does not emit self-edges", () => {
    const files = [{ path: "App/Foo.cs", namespaces: ["App.Foo"], imports: ["App.Foo"] }];
    const edges = resolveCsharpEdges(files);
    expect(edges).toEqual([]);
  });

  it("dedupes when the same edge would be emitted twice", () => {
    const files = [
      { path: "App/Foo.cs", namespaces: ["App.Foo"], imports: ["App.Models", "App.Models"] },
      { path: "App/Models/User.cs", namespaces: ["App.Models"], imports: [] },
    ];
    expect(resolveCsharpEdges(files)).toEqual([{ sourcePath: "App/Foo.cs", targetPath: "App/Models/User.cs" }]);
  });

  it("caps owners per namespace at 5 (ambiguity guard)", () => {
    const files = [
      { path: "App/Caller.cs", namespaces: ["App.Caller"], imports: ["App.Many"] },
      ...Array.from({ length: 8 }, (_, i) => ({
        path: `App/Many/Type${i}.cs`,
        namespaces: ["App.Many"],
        imports: [],
      })),
    ];
    const edges = resolveCsharpEdges(files);
    expect(edges).toHaveLength(5);
    expect(edges.every((e) => e.sourcePath === "App/Caller.cs")).toBe(true);
  });
});
