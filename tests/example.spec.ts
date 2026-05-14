import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Fixed: The actual title is "Browser Tools"
  await expect(page).toHaveTitle(/Browser Tools/);
});

test('can search for tools', async ({ page }) => {
  await page.goto('/');

  // Best practice: use getByPlaceholder
  const searchInput = page.getByPlaceholder(/Search tools/i);
  await expect(searchInput).toBeVisible();

  await searchInput.fill('Base64');

  // Fixed: Target the heading specifically to avoid strict mode violation (multiple matches)
  await expect(page.getByRole('heading', { name: /Base64/i })).toBeVisible();
});
