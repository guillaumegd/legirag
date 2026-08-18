import { defineConfig, devices } from '@playwright/test';

// Un smoke test contre une instance déjà démarrée (dev server ou conteneur
// Docker, item 11d) - pas de webServer auto-démarré ici, même logique que
// scripts/smoke-test.sh pour l'API : ce test vérifie ce qui tourne déjà, il
// ne l'orchestre pas.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
