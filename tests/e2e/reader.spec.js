import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? 'demo@feedwire.local';
const password = process.env.E2E_PASSWORD ?? 'demopassword123';

test.describe('reader flow', () => {
  test('login, open a story and switch to the Persian tab', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/reader|\/$/);

    const firstStory = page.locator('[data-item-id]').first();
    await expect(firstStory).toBeVisible();
    await firstStory.getByRole('link').first().click();
    await page.waitForURL(/\/item\/\d+/);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const persianTab = page.getByRole('tab', { name: /فارسی/ });
    if (await persianTab.count()) {
      await persianTab.press('Enter');
      await expect(page.getByRole('tabpanel')).toBeVisible();
    }
  });
});
