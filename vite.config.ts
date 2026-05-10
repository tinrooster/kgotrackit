import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import packageJson from "./package.json"

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Use IPv4 loopback so the dev URL works when `localhost` is broken (e.g. commented-out hosts entries).
    host: "127.0.0.1",
    port: 5173,
    fs: {
      strict: false,
    },
    proxy: {
      // Forward /schematic/* to the local EasySchematic dev server (port 5174).
      // This makes the iframe same-origin in dev so postMessage works without CORS.
      "/schematic": {
        target: "http://127.0.0.1:5174",
        rewrite: (path) => path.replace(/^\/schematic/, ""),
        changeOrigin: true,
        ws: true,
      },
    },
  },
})