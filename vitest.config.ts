import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/core/context.ts",
        "src/core/final-package-validation.ts",
        "src/orchestrator.ts",
        "src/core/tools.ts",
        "src/core/workspace.ts"
      ],
      thresholds: {
        "src/core/context.ts": {
          lines: 85,
          functions: 85,
          branches: 75,
          statements: 85
        },
        "src/core/final-package-validation.ts": {
          lines: 85,
          functions: 85,
          branches: 75,
          statements: 85
        },
        "src/orchestrator.ts": {
          lines: 55,
          functions: 55,
          branches: 45,
          statements: 55
        },
        "src/core/tools.ts": {
          lines: 75,
          functions: 75,
          branches: 70,
          statements: 75
        },
        "src/core/workspace.ts": {
          lines: 70,
          functions: 70,
          branches: 60,
          statements: 70
        }
      }
    }
  }
});
