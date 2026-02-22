import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitroV2Plugin } from "@tanstack/nitro-v2-vite-plugin";
import viteReact from "@vitejs/plugin-react";

function preserveClientAssets(): Plugin {
  const backupDir = join(process.cwd(), ".client-assets");
  return {
    name: "preserve-client-assets",
    writeBundle(options) {
      const assetsDir = join(options.dir!, "assets");
      if (existsSync(assetsDir)) {
        cpSync(assetsDir, backupDir, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({ srcDirectory: "app" }),
    nitroV2Plugin({ preset: "cloudflare-pages" }),
    viteReact(),
    preserveClientAssets(),
  ],
});
