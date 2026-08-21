import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Isolation tests need a live local Supabase instance (Docker) and run
    // under their own config/CI job -- keep them out of the fast default
    // suite so `npm test` never requires Docker.
    exclude: ["**/node_modules/**", "tests/isolation/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
