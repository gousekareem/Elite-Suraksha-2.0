// Optional UI end-to-end walkthrough of the Judge Demo (drives the real UI, API,
// PostgreSQL and Hindsight) and regenerates docs/screenshots.
// Usage: npm i -D playwright && npx playwright install chromium && node e2e/judge-demo.e2e.js
// UI-driven end-to-end walkthrough of the judge demo; saves screenshots.
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.env.SCREENSHOT_DIR || path.join(__dirname, '..', 'docs', 'screenshots');
const BASE = process.env.WEB_URL || 'http://localhost:5173';
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (n, full = false) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });
  const clickBtn = async (name) => { await page.getByRole('button', { name }).first().click(); };
  const waitIdle = async () => { await page.waitForFunction(() => !document.querySelector('.spinner'), null, { timeout: 120000 }); await page.waitForTimeout(400); };
  const step = (s) => console.log('✓', s);

  await page.goto(`${BASE}/login`); await page.waitForTimeout(500); await shot('01-login'); step('login page');
  await clickBtn(/Enter Judge Demo as Rahul/); await page.waitForURL(/\/demo/); await page.waitForTimeout(1200);
  await clickBtn('Reset demo'); await waitIdle(); step('reset');
  await clickBtn('Load history & learn patterns'); await waitIdle(); step('history loaded');
  await shot('02-judge-demo');
  await clickBtn(/What do I normally earn on Friday evenings/); await page.waitForURL(/\/ask/); await page.getByRole('heading', { name: 'Agent Memory Trace' }).first().waitFor({ timeout: 60000 }); await page.waitForTimeout(600);
  await shot('03-ask-normal-earnings'); step('asked normal earnings');
  await page.goto(`${BASE}/demo`); await page.waitForTimeout(1200);
  await clickBtn('Introduce first anomaly'); await waitIdle(); step('first anomaly');
  await clickBtn(/Why did my earnings drop\?/); await page.waitForURL(/\/ask/); await page.getByRole('heading', { name: 'Agent Memory Trace' }).first().waitFor({ timeout: 60000 }); await page.waitForTimeout(600);
  await shot('04-ask-first-drop'); step('asked first drop');
  await clickBtn(/Create investigation/); await page.waitForURL(/investigations\//, { timeout: 60000 }); await page.waitForTimeout(1500);
  await shot('05-investigation-workspace-first', true); step('investigation created from agent offer');
  await clickBtn('Generate report'); await page.getByText('Report generated.').waitFor({ timeout: 60000 }); step('report generated');
  await page.goto(`${BASE}/demo`); await page.waitForTimeout(1200);
  await clickBtn('Resolve with platform clarification'); await waitIdle(); step('outcome retained');
  await clickBtn(/Jump to/); await waitIdle(); step('time jump');
  await shot('06-judge-demo-after-jump');
  await clickBtn(/Why did my earnings drop again/); await page.waitForURL(/\/ask/); await page.getByRole('heading', { name: 'Agent Memory Trace' }).first().waitFor({ timeout: 60000 }); await page.waitForTimeout(800);
  await shot('07-wow-recall'); await shot('07b-wow-recall-full', true); step('WOW: recall of previous outcome');
  const wowText = await page.textContent('main');
  if (!/I found a similar situation in your previous history/.test(wowText)) throw new Error('WOW banner missing');
  await page.goto(`${BASE}/compare`); await clickBtn('Run comparison'); await page.getByText('With Hindsight memory').first().waitFor(); await waitIdle();
  await shot('08-without-vs-with-memory'); step('comparison');
  await page.goto(`${BASE}/demo`); await page.waitForTimeout(1000);
  await clickBtn('Open investigation for 14 Aug'); await page.waitForURL(/investigations\//, { timeout: 60000 }); await page.waitForTimeout(1500);
  await shot('09-investigation-workspace-second', true); step('second investigation');
  await clickBtn('Generate report'); await page.getByText('Report generated.').waitFor({ timeout: 60000 });
  await page.getByRole('link', { name: 'Open' }).last().click(); await page.waitForURL(/reports\//); await page.waitForTimeout(1200);
  await shot('10-report', true); step('report view');
  await page.goto(`${BASE}/memory`); await page.waitForTimeout(1500); await shot('11-memory-journey', true); step('journey');
  await page.goto(`${BASE}/memory/inspector`); await page.waitForTimeout(2000); await shot('12-memory-inspector'); step('inspector');
  await page.goto(`${BASE}/dashboard`); await page.waitForTimeout(2000); await shot('13-dashboard'); step('dashboard');
  await page.goto(`${BASE}/earnings`); await page.waitForTimeout(2000); await shot('14-earnings'); step('earnings');
  await page.goto(`${BASE}/architecture`); await page.waitForTimeout(800); await shot('15-architecture', true); step('architecture');
  await page.getByRole('button', { name: /Sign out/ }).click(); await page.waitForURL(/login/);
  await clickBtn(/Investigator Console/); await page.waitForURL(/admin/); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Memory activity' }).click(); await page.waitForTimeout(500);
  await shot('16-admin-console'); step('admin console');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/admin`); await page.waitForTimeout(1000); await shot('17-mobile-width-admin');
  console.log(errors.length ? `PAGE ERRORS:\n${errors.join('\n')}` : 'no page errors');
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
