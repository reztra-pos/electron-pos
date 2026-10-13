import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes the built files load correctly from file:// inside Electron
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
