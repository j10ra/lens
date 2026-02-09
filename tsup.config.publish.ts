import { builtinModules } from "node:module";
import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

const nodeExternals = [
	"better-sqlite3",
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

export default defineConfig({
	entry: {
		cli: "packages/cli/src/index.ts",
		daemon: "apps/daemon/src/index.ts",
	},
	format: ["esm"],
	splitting: false,
	clean: true,
	target: "node20",
	external: nodeExternals,
	noExternal: [/^(?!better-sqlite3)/],
	banner: {
		js: [
			"#!/usr/bin/env node",
			'import { createRequire as __createRequire } from "node:module";',
			'import { fileURLToPath as __fileURLToPath } from "node:url";',
			'import { dirname as __dirname_ } from "node:path";',
			"const require = __createRequire(import.meta.url);",
			"const __filename = __fileURLToPath(import.meta.url);",
			"const __dirname = __dirname_(__filename);",
		].join("\n"),
	},
	outExtension: () => ({ js: ".js" }),
	outDir: "publish",
	esbuildPlugins: [stripShebang],
});
