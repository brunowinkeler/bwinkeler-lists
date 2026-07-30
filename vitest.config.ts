import { configDefaults, defineConfig } from 'vitest/config';

// Root Vitest runner. Playwright specs under e2e/ are excluded and run via
// `npm run e2e` instead.
export default defineConfig({
  test: {
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
