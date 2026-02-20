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
const cjsExternals: Plugin = {
	name: "cjs-externals",
	setup(build) {
		build.onResolve({ filter: /^better-sqlite3$/ }, () => ({
			path: "better-sqlite3",
			namespace: "cjs-extern",
		}));
		build.onLoad({ filter: /.*/, namespace: "cjs-extern" }, (args) => ({
			// Use a variable so esbuild doesn't statically analyze the require() call
			contents: `const _mod = "${args.path}"; export default require(_mod);`,
			loader: "js",
		}));
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
			"const require = __cjsRequire(import.meta.url);",
		].join("\n"),
	},
	outExtension: () => ({ js: ".js" }),
	outDir: "publish",
	esbuildPlugins: [cjsExternals, stripShebang],
});
