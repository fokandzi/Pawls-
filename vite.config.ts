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
    //
    // IMPORTANT: do NOT split node_modules into multiple named buckets
    // (e.g. separate "react" vs "vendor" chunks). Splitting interdependent
    // CJS-style packages (react <-> scheduler/react-dom) across chunks creates
    // an ESM circular import; the vendor chunk evaluates first and calls
    // React's lazy exports getter before react's module body has run, throwing
    // "Cannot set properties of undefined (setting 'Activity')" at module
    // evaluation time. That kills hydration site-wide (all onClick dead, SSR
    // HTML still renders, zero console errors). One shared vendor chunk avoids
    // the cycle entirely.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
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
