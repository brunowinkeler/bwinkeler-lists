import { defineConfig } from 'vitest/config';

// Root test runner. Per-workspace environments (node vs jsdom) are configured
// as projects are added in their respective phases.
export default defineConfig({
  test: {
    passWithNoTests: true,
  },
});
