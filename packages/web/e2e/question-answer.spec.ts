import { expect, test } from '@playwright/test';

// Smoke test du chemin complet question -> réponse (13a) -> trace (13b), à
// travers un vrai navigateur contre le front et l'API réellement démarrés -
// scripts/smoke-test.sh (11d) couvre déjà l'API seule, ce test couvre ce
// qu'un check API-only ne peut pas voir : le flux SSE côté navigateur et le
// rendu réel des écrans.
test('asking a real question renders a sourced answer and its trace', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Posez votre question juridique').fill('Quelle est la vitesse maximale sur autoroute ?');
  await page.getByRole('button', { name: 'Demander' }).click();

  // Le premier événement d'activité arrive après le premier appel modèle
  // (nœud "route", ~4 s en pratique, observé en direct pendant 13b) - marge
  // généreuse plutôt qu'un timeout par défaut trop juste.
  await expect(
    page.getByRole('list', { name: "Étapes suivies par l'agent" }).getByRole('listitem').first(),
  ).toBeVisible({ timeout: 15_000 });

  await expect(page.getByRole('heading', { name: 'Règle principale' })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.verdict')).not.toBeEmpty();

  const openTraceButton = page.getByRole('button', { name: 'Voir le raisonnement' });
  await expect(openTraceButton).toBeVisible();
  await openTraceButton.click();

  const tracePanel = page.getByRole('complementary', { name: "Raisonnement de l'agent" });
  await expect(tracePanel).toBeVisible();
  await expect(tracePanel.locator('.trace .step').first()).toBeVisible();

  await tracePanel.getByRole('link', { name: 'Ouvrir la page complète de la trace ↗' }).click();

  await expect(page).toHaveURL(/\/trace\//);
  await expect(page.getByRole('heading', { name: 'Trace de l’agent' })).toBeVisible();
  await expect(page.locator('.trace .step').first()).toBeVisible();
});
