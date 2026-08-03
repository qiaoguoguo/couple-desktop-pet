import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "shared/**/*.test.ts",
      "deploy/**/*.test.ts",
    ],
    setupFiles: ["src/test/setup.ts"],
  },
});
