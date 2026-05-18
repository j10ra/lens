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
