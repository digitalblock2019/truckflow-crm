import { test, expect, Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@truckflow.com');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/', { timeout: 10000 });
}

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
    // Click on the name to enter edit mode
    const nameEl = page.locator('.text-base.font-bold.text-navy.cursor-pointer');
    await nameEl.click();

    // Input should appear
    const nameInput = page.locator('input').first();
    await expect(nameInput).toBeVisible();

    // Change and save
    await nameInput.fill('Admin Test Name');
    await page.click('button:has-text("Save")');

    // Should show updated name
    await expect(page.locator('text=Admin Test Name')).toBeVisible({ timeout: 5000 });

    // Restore original name
    const updatedName = page.locator('.text-base.font-bold.text-navy.cursor-pointer');
    await updatedName.click();
    const input2 = page.locator('input').first();
    await input2.fill('Admin User');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Admin User')).toBeVisible({ timeout: 5000 });
  });

  test('shows salary slips section', async ({ page }) => {
    await expect(page.locator('text=Salary Slips')).toBeVisible();
    // Year dropdown should exist
    await expect(page.locator('select')).toBeVisible();
  });

  test('shows change password form', async ({ page }) => {
    await expect(page.locator('text=Change Password')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
});
