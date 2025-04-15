import { test, expect } from '@playwright/test';

// Adjust the URL if your dev server runs elsewhere
const APP_URL = 'http://localhost:5173';

test.describe('Lattice Connect Local Test UI', () => {
  test('loads the main page and finds the main heading', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(
      page.getByRole('heading', { name: /Lattice Connect Local Test UI/i })
    ).toBeVisible();
  });

  // Example: test connect form interaction (mock backend or run real backend for full E2E)
  test('shows error on invalid connect payload', async ({ page }) => {
    await page.goto(APP_URL);
    const input = page.getByPlaceholder('Device Info (JSON)');
    const button = page.getByRole('button', { name: /Connect/i });
    await input.fill('not a json');
    await button.click();
    await expect(page.getByText(/error/i)).toBeVisible();
  });
});
