// electron.vite.config.ts
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "path";
var __electron_vite_injected_dirname = "H:\\projects\\cursor_projects\\TEd_trackIT\\trackIT_v2";
var electron_vite_config_default = defineConfig({
  main: {
    build: {
      lib: {
        entry: "electron/main.ts"
      },
      rollupOptions: {
        external: ["electron-squirrel-startup"]
      }
    }
  },
  preload: {
    build: {
      lib: {
        entry: "electron/preload.ts"
      },
      rollupOptions: {
        external: ["electron"]
      }
    }
  },
  renderer: {
    root: ".",
    build: {
      rollupOptions: {
        input: {
          index: path.join(__electron_vite_injected_dirname, "index.html")
        }
      }
    },
    resolve: {
      alias: {
        "@": path.resolve(__electron_vite_injected_dirname, "src")
      }
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
