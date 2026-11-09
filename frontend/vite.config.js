import { defineConfig } from "vite";
import wails from "@wailsio/runtime/plugins/vite";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  plugins: [wails("./bindings")],
  // Both windows are pages of their own: without this only index.html is built
  // and the Setup window opens on nothing.
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        setup: "setup.html",
      },
    },
  },
});
