import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Bound local startup/memory pressure while retaining parallel coverage.
    maxWorkers: 4,
    include: ['packages/*/test/**/*.test.ts'],
    passWithNoTests: false,
    environmentOptions: {
      happyDOM: {
        settings: {
          disableJavaScriptEvaluation: true,
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          disableIframePageLoading: true,
        },
      },
    },
  },
});
