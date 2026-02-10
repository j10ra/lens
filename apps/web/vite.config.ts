import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitroV2Plugin } from "@tanstack/nitro-v2-vite-plugin";
import viteReact from "@vitejs/plugin-react";

// Nitro's cloudflare-pages preset wipes dist/client/ during server build.
// Save client assets after the client build so we can restore them post-build.
function preserveClientAssets(): Plugin {
  const backupDir = join(process.cwd(), ".client-assets");
  return {
    name: "preserve-client-assets",
    writeBundle(options) {
      console.log(`[preserve-assets] writeBundle dir=${options.dir}`);
      const assetsDir = join(options.dir!, "assets");
      if (existsSync(assetsDir)) {
        console.log(`[preserve-assets] Found assets, copying to ${backupDir}`);
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
