import { firefox } from 'playwright';
import fs from 'fs';

const BASE = 'https://stonprem.learnplay.co.za';
const EMAIL = 'support@learnplay.co.za';
const PASSWORD = 'LiamAndrew@2018#!';
const outDir = '/antigravity/artifacts/theme-runtime-audit-2';
fs.mkdirSync(outDir, { recursive: true });

const browser = await firefox.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(2000);

const textInputs = page.locator('input');
const count = await textInputs.count();
if (count >= 1) await textInputs.nth(0).fill(EMAIL);
if (count >= 2) await textInputs.nth(1).fill(PASSWORD);

const btn = page.locator('button:has-text("Sign In"), button[type="submit"]').first();
if (await btn.count()) await btn.click();
await page.waitForTimeout(5000);
console.log('afterLoginUrl', page.url());
await page.screenshot({ path: `${outDir}/after-login.png`, fullPage: true });

for (const route of ['/theme-editor', '/management-hub', '/superadmin/impersonate']) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2200);
  console.log(route, '->', page.url());
  await page.screenshot({ path: `${outDir}${route.replaceAll('/', '_') || '_root'}.png`, fullPage: true });
}

await browser.close();
