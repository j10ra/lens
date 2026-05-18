import { builtinModules } from "node:module";
import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

const nodeExternals = [
	// better-sqlite3 handled by cjsExternals plugin — NOT listed here
	...builtinModules,
	...builtinModules.map((m) => `node:${m}`),
];

const stripShebang: Plugin = {
	name: "strip-shebang",
	setup(build) {
		build.onLoad({ filter: /index\.ts$/ }, async (args) => {
			const { readFile } = await import("node:fs/promises");
			const src = await readFile(args.path, "utf-8");
			if (src.startsWith("#!")) {
				return { contents: src.replace(/^#![^\n]*\n/, ""), loader: "ts" };
			}
			return undefined;
		});
	},
};

// Node v24 ESM resolver can't resolve CJS packages without `exports` field.
// esbuild generates `import X from "better-sqlite3"` which fails.
// This plugin intercepts the resolve and provides a virtual module that uses require() instead.
//
// @ast-grep/napi ships per-platform .node binaries via optionalDependencies;
// esbuild can't statically analyze its `require('./ast-grep-napi.<platform>.node')`
// switch and tries to bundle every variant. Same treatment.
const cjsExternals: Plugin = {
	name: "cjs-externals",
	setup(build) {
		build.onResolve(
			{ filter: /^(better-sqlite3|@ast-grep\/napi|@ast-grep\/lang-csharp)$/ },
			(args) => ({
				path: args.path,
				namespace: "cjs-extern",
			}),
		);
		build.onLoad({ filter: /.*/, namespace: "cjs-extern" }, (args) => {
			// Use a variable so esbuild doesn't statically analyze the require() call
			let contents = `const _mod = "${args.path}"; const _impl = require(_mod);\nexport default _impl;\n`;
			if (args.path === "@ast-grep/napi") {
				// Re-export named bindings used by engine code (CJS module.exports → ESM named)
				contents += `export const parse = _impl.parse;
export const parseAsync = _impl.parseAsync;
export const parseFiles = _impl.parseFiles;
export const findInFiles = _impl.findInFiles;
export const Lang = _impl.Lang;
export const SgNode = _impl.SgNode;
export const SgRoot = _impl.SgRoot;
export const registerDynamicLanguage = _impl.registerDynamicLanguage;
`;
			}
			return { contents, loader: "js" };
		});
	},
};

export default defineConfig({
	entry: {
		cli: "packages/cli/src/index.ts",
		daemon: "apps/daemon/src/index.ts",
	},
	format: ["esm"],
	splitting: false,
	// clean: false — build:publish does rm -rf before first build.
	// Watch mode must NOT wipe publish/ (node_modules, drizzle, dashboard live there).
	clean: false,
	target: "node20",
	external: nodeExternals,
	noExternal: [/^(?!better-sqlite3)/],
	banner: {
		js: [
			"#!/usr/bin/env node",
			'import { createRequire as __cjsRequire } from "node:module";',
			'import { fileURLToPath as __fileURLToPath } from "node:url";',
			'import { dirname as __dirnameFn } from "node:path";',
			"const require = __cjsRequire(import.meta.url);",
			"const __filename = __fileURLToPath(import.meta.url);",
			"const __dirname = __dirnameFn(__filename);",
		].join("\n"),
	},
	outExtension: () => ({ js: ".js" }),
	outDir: "publish",
	esbuildPlugins: [cjsExternals, stripShebang],
});
