import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: resolve(currentDirectory, "../console/public"),
  define: { "import.meta.env.VITE_OYNK_SURFACE": JSON.stringify("control") },
  server: {
    host: "0.0.0.0",
    port: 5176,
    strictPort: true,
    // Control imports its screens from Console outside this Vite root.
    // Polling keeps those shared files fresh when macOS file events are missed.
    watch: { usePolling: true, interval: 300 },
    fs: { allow: [resolve(currentDirectory, ".."), resolve(currentDirectory, "../../packages")] },
    proxy: { "/api": { target: "http://127.0.0.1:4020", changeOrigin: true } },
  },
});
