import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitroV2Plugin } from "@tanstack/nitro-v2-vite-plugin";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({ srcDirectory: "app" }),
    nitroV2Plugin({ preset: "node-server" }),
    viteReact(),
  ],
});
