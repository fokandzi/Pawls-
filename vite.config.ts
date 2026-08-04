import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import fs from "fs";
import path from "path";

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart(),
    viteReact(),
    // Inject build timestamp into service worker for auto-updates
    {
      name: "sw-version",
      closeBundle() {
        const swPath = path.resolve(__dirname, "dist/client/sw.js");
        if (fs.existsSync(swPath)) {
          let content = fs.readFileSync(swPath, "utf-8");
          content = content.replace("{{BUILD_TIME}}", String(Date.now()));
          fs.writeFileSync(swPath, content);
        }
      },
    },
  ],
});
