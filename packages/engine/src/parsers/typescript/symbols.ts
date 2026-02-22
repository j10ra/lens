import { Node, Project, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type { ParsedSymbol, SymbolKind } from "../types.js";

const MAX_SYMBOLS = 500;

const project = new Project({
  useInMemoryFileSystem: true,
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
});

const VIRTUAL_FILE_PATH = "/virtual/symbols.tsx";

function variableKind(kind: VariableDeclarationKind): SymbolKind {
  if (kind === VariableDeclarationKind.Const) return "const";
  if (kind === VariableDeclarationKind.Let) return "let";
  return "var";
}

function pushSymbol(symbols: ParsedSymbol[], seen: Set<string>, symbol: ParsedSymbol): void {
  if (symbols.length >= MAX_SYMBOLS) return;
  const key = `${symbol.kind}:${symbol.name}:${symbol.line}`;
  if (seen.has(key)) return;
  seen.add(key);
  symbols.push(symbol);
}

export function extractSymbols(content: string): ParsedSymbol[] {
  const sourceFile = project.createSourceFile(VIRTUAL_FILE_PATH, content, { overwrite: true });

  const symbols: ParsedSymbol[] = [];
  const seen = new Set<string>();

  for (const fn of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = fn.getName();
    if (!name) continue;
    pushSymbol(symbols, seen, {
      name,
      kind: "function",
      line: fn.getStartLineNumber(),
      exported: fn.isExported(),
    });
  }

  for (const cls of sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
    const name = cls.getName();
    const classExported = cls.isExported();
    if (name) {
      pushSymbol(symbols, seen, {
        name,
        kind: "class",
        line: cls.getStartLineNumber(),
        exported: classExported,
      });
    }
    for (const method of cls.getMethods()) {
      const methodName = method.getName();
      pushSymbol(symbols, seen, {
        name: name ? `${name}.${methodName}` : methodName,
        kind: "method",
        line: method.getStartLineNumber(),
        exported: classExported,
      });
    }
  }

  for (const iface of sourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)) {
    pushSymbol(symbols, seen, {
      name: iface.getName(),
      kind: "interface",
      line: iface.getStartLineNumber(),
      exported: iface.isExported(),
    });
  }

  for (const alias of sourceFile.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration)) {
    pushSymbol(symbols, seen, {
      name: alias.getName(),
      kind: "type",
      line: alias.getStartLineNumber(),
      exported: alias.isExported(),
    });
  }

  for (const enm of sourceFile.getDescendantsOfKind(SyntaxKind.EnumDeclaration)) {
    pushSymbol(symbols, seen, {
      name: enm.getName(),
      kind: "enum",
      line: enm.getStartLineNumber(),
      exported: enm.isExported(),
    });
  }

  for (const mod of sourceFile.getDescendantsOfKind(SyntaxKind.ModuleDeclaration)) {
    pushSymbol(symbols, seen, {
      name: mod.getName(),
      kind: "namespace",
      line: mod.getStartLineNumber(),
      exported: mod.isExported(),
    });
  }

  for (const stmt of sourceFile.getVariableStatements()) {
    const kind = variableKind(stmt.getDeclarationKind());
    for (const decl of stmt.getDeclarations()) {
      const nameNode = decl.getNameNode();
      if (!Node.isIdentifier(nameNode)) continue;
      pushSymbol(symbols, seen, {
        name: nameNode.getText(),
        kind,
        line: decl.getStartLineNumber(),
        exported: stmt.isExported(),
      });
    }
  }

  sourceFile.forget();
  return symbols;
}
