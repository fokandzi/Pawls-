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
  build: {
    // Keep the client and SSR Rollup graphs from forming one large chunk.
    // This is especially important in the low-memory deployment sandbox.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("react")) return "react";
          if (id.includes("stripe")) return "stripe";
          return "vendor";
        },
      },
    },
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
