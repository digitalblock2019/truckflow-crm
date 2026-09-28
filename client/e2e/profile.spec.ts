import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Profile Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/profile');
    await expect(page.locator('text=My Profile')).toBeVisible({ timeout: 5000 });
  });

  test('displays user info', async ({ page }) => {
    await expect(page.locator('text=admin@truckflow.com')).toBeVisible();
  });

  test('can edit name', async ({ page }) => {
    const nameSelector = '.text-base.font-bold.text-navy.cursor-pointer';

    // Read the current name rather than assuming one — the seeded admin's
    // name differs between environments, and hardcoding it made this test
    // fail on a correctly-working page.
    const original = (await page.locator(nameSelector).innerText()).trim();

    await page.locator(nameSelector).click();
    // Scoped to visible text inputs — the avatar's hidden file input sits
    // earlier in the DOM and wins a bare input.first().
    const nameInput = page.locator('input[type="text"]:visible, input:not([type]):visible').first();
    await expect(nameInput).toBeVisible();

    await nameInput.fill('Admin Test Name');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Admin Test Name')).toBeVisible({ timeout: 10000 });

    // Put it back so re-runs start from the same state.
    await page.locator(nameSelector).click();
    await page.locator('input[type="text"]:visible, input:not([type]):visible').first().fill(original);
    await page.click('button:has-text("Save")');
    await expect(page.locator(nameSelector)).toHaveText(original, { timeout: 10000 });
  });

  test('shows salary slips section', async ({ page }) => {
    await expect(page.locator('text=Salary Slips')).toBeVisible();
    // Year dropdown should exist
    await expect(page.locator('select')).toBeVisible();
  });

  test('shows change password form', async ({ page }) => {
    // "Change Password" is both the card heading and its submit button, so
    // this has to be scoped or strict mode rejects the ambiguity.
    await expect(page.locator('text=Change Password').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
});
