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
    fs: {
      strict: false,
    },
  },
})