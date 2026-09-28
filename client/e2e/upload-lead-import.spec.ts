import { test, expect, type Page } from '@playwright/test';
import { loginAsAdmin, uniqueMc } from './helpers';

/**
 * Uploads a CSV built in-memory. The page parses client-side, so this
 * exercises the real header-alias mapping rather than stubbing it.
 *
 * UploadZone builds its file input with document.createElement on click and
 * never renders one, so there's no input in the DOM to target — the file
 * chooser event is the only handle.
 */
async function uploadCsv(page: Page, filename: string, csv: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('Drop file here or click to browse').click(),
  ]);
  await chooser.setFiles({ name: filename, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText(`Preview: ${filename}`)).toBeVisible({ timeout: 15000 });
}

test.describe('Upload — lead type selector', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/upload');
  });

  test('offers all three data types and defaults to CarrierVault', async ({ page }) => {
    await uploadCsv(page, 'leads.csv', `mc_number,legal_name\n${uniqueMc()},E2E CARRIER\n`);

    const select = page.locator('select').first();
    await expect(select).toHaveValue('imported');
    const options = await select.locator('option').allInnerTexts();
    expect(options.join('|')).toContain('New Leads (CarrierVault)');
    expect(options.join('|')).toContain('Interested Leads');
    expect(options.join('|')).toContain('Sleeping Leads');
  });

  test('selecting a type updates the explanation under the selector', async ({ page }) => {
    await uploadCsv(page, 'leads.csv', `mc_number,legal_name\n${uniqueMc()},E2E CARRIER\n`);

    await page.locator('select').first().selectOption('sleeping_lead');
    await expect(page.getByText(/Sleeping Leads tab/i)).toBeVisible();
  });

  test('a file with no collisions imports without showing the comparison modal', async ({ page }) => {
    const mc = uniqueMc();
    await uploadCsv(page, 'fresh.csv', `mc_number,legal_name\n${mc},E2E FRESH CARRIER\n`);

    await page.getByRole('button', { name: /import 1 record/i }).click();

    await expect(page.getByText('Import Complete!')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Existing records found')).toHaveCount(0);
  });
});

test.describe('Upload — duplicate resolution modal', () => {
  test('a colliding MC# opens the comparison and resolves to an update', async ({ page }) => {
    await loginAsAdmin(page);

    // Seed a record through the UI-independent path first so the collision is
    // guaranteed, then re-upload the same MC# from a "sheet".
    const mc = uniqueMc();
    await page.goto('/upload');
    await uploadCsv(page, 'seed.csv', `mc_number,legal_name\n${mc},ORIGINAL CRM NAME\n`);
    await page.getByRole('button', { name: /import 1 record/i }).click();
    await expect(page.getByText('Import Complete!')).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /upload another file/i }).click();
    await uploadCsv(page, 'interested-sheet.csv', `mc_number,legal_name\n${mc},SHEET NAME\n`);
    await page.locator('select').first().selectOption('interested');
    await page.getByRole('button', { name: /import 1 record/i }).click();

    const modal = page.getByText('Existing records found');
    await expect(modal).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('1 of 1')).toBeVisible();
    // Both versions must be on screen for the decision to be meaningful.
    // Scoped with .first() because the preview table behind the modal shows
    // the same values, which trips strict mode.
    await expect(page.getByText('ORIGINAL CRM NAME').first()).toBeVisible();
    await expect(page.getByText('SHEET NAME').first()).toBeVisible();

    await page.getByRole('button', { name: /keep sheet record/i }).click();

    await expect(page.getByText('Import Complete!')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Updated (existing)')).toBeVisible();
  });

  test('bulk action resolves every remaining collision at once', async ({ page }) => {
    await loginAsAdmin(page);
    const mcs = [uniqueMc(), uniqueMc(), uniqueMc()];
    const csv = `mc_number,legal_name\n${mcs.map((m) => `${m},BULK ${m}`).join('\n')}\n`;

    await page.goto('/upload');
    await uploadCsv(page, 'seed-bulk.csv', csv);
    await page.getByRole('button', { name: /import 3 records/i }).click();
    await expect(page.getByText('Import Complete!')).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /upload another file/i }).click();
    await uploadCsv(page, 'bulk-sheet.csv', csv);
    await page.locator('select').first().selectOption('sleeping_lead');
    await page.getByRole('button', { name: /import 3 records/i }).click();

    await expect(page.getByText('Existing records found')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('1 of 3')).toBeVisible();

    // Without this, migrating a sheet that overlaps on hundreds of rows would
    // mean hundreds of clicks.
    await page.getByRole('button', { name: /keep crm for all remaining/i }).click();

    await expect(page.getByText('Import Complete!')).toBeVisible({ timeout: 30000 });
  });
});
