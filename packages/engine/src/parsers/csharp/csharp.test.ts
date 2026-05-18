import { describe, expect, it } from "vitest";
import { extractCsharpImports } from "./imports.js";
import { extractCsharpNamespaces } from "./namespaces.js";

describe("extractCsharpImports", () => {
  it("returns each using namespace as a string", () => {
    const src = `
      using System;
      using System.Linq;
      using App.Models;
      using static System.Math;
      using Alias = App.Services;
      namespace Foo { class Bar {} }
    `;
    const result = extractCsharpImports(src);
    expect(result).toEqual(
      expect.arrayContaining(["System", "System.Linq", "App.Models", "System.Math", "App.Services"]),
    );
  });

  it("returns empty array when no usings", () => {
    expect(extractCsharpImports("namespace X { class Y {} }")).toEqual([]);
  });
});

describe("extractCsharpNamespaces", () => {
  it("handles block-scoped namespace", () => {
    const src = `
      namespace App.Models {
        public class User {}
      }
    `;
    expect(extractCsharpNamespaces(src)).toEqual(["App.Models"]);
  });

  it("handles file-scoped namespace (C# 10+)", () => {
    const src = `
      namespace App.Services;
      public class UserService {}
    `;
    expect(extractCsharpNamespaces(src)).toEqual(["App.Services"]);
  });

  it("handles multiple namespaces in one file", () => {
    const src = `
      namespace App.A { class A1 {} }
      namespace App.B { class B1 {} }
    `;
    expect(extractCsharpNamespaces(src).sort()).toEqual(["App.A", "App.B"]);
  });

  it("returns empty when no namespace declared", () => {
    expect(extractCsharpNamespaces("class Foo {}")).toEqual([]);
  });
});

import { csharpParser } from "./index.js";
import { extractCsharpSymbols } from "./symbols.js";

describe("extractCsharpSymbols", () => {
  it("extracts classes, interfaces, structs, enums, records", () => {
    const src = `
      namespace App {
        public class User {}
        internal interface IRepo {}
        public struct Point { public int X; }
        public enum Status { Active, Inactive }
        public record Money(decimal Amount, string Currency);
      }
    `;
    const symbols = extractCsharpSymbols(src);
    const names = symbols.map((s) => s.name).sort();
    expect(names).toEqual(["IRepo", "Money", "Point", "Status", "User"]);
    expect(symbols.find((s) => s.name === "User")?.kind).toBe("class");
    expect(symbols.find((s) => s.name === "IRepo")?.kind).toBe("interface");
    expect(symbols.find((s) => s.name === "Status")?.kind).toBe("enum");
  });

  it("marks public types as exported, others as not", () => {
    const src = `
      public class Pub {}
      internal class Priv {}
      class Default {}
    `;
    const symbols = extractCsharpSymbols(src);
    expect(symbols.find((s) => s.name === "Pub")?.exported).toBe(true);
    expect(symbols.find((s) => s.name === "Priv")?.exported).toBe(false);
    expect(symbols.find((s) => s.name === "Default")?.exported).toBe(false);
  });

  it("captures line numbers", () => {
    const src = "class A {}\n\nclass B {}";
    const symbols = extractCsharpSymbols(src);
    expect(symbols.find((s) => s.name === "A")?.line).toBe(1);
    expect(symbols.find((s) => s.name === "B")?.line).toBe(3);
  });
});

describe("csharpParser facade", () => {
  it("registers 'csharp' as its language", () => {
    expect(csharpParser.languages).toContain("csharp");
  });

  it("returns public type names from extractExports", () => {
    const src = "public class A {}\ninternal class B {}\npublic interface IThing {}";
    expect(csharpParser.extractExports(src).sort()).toEqual(["A", "IThing"]);
  });

  it("resolveImport returns null (C# resolves via namespace graph pass)", () => {
    expect(csharpParser.resolveImport("System", "src/Foo.cs", new Set())).toBeNull();
  });
});
