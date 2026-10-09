import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset paths allow the built app to run from a project subpath.
  base: "./",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
