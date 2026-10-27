/*
 * End-to-end check of the five-minute demo script in Chromium.
 * Run: node tests/demo-flow.test.js   (requires the `playwright` package)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

(async () => {
  const server = await serve();
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());

  await page.goto(base);
  await page.waitForSelector('text=Get started');

  // Synthetic dataset: 1,000 labeled owners.
  const counts = await page.evaluate(() => {
    const d = PL.store.data;
    return {
      synthetic: d.users.filter((u) => u.synthetic && /^Synthetic Owner \d{4}$/.test(u.name) && u.email.endsWith('@example.test')).length,
      orphanPets: d.pets.filter((p) => !d.users.some((u) => u.id === p.ownerId)).length,
      pets: d.pets.length,
      bytes: JSON.stringify(d).length,
    };
  });
  assert.strictEqual(counts.synthetic, 1000, 'expected 1,000 labeled synthetic owners');
  assert.strictEqual(counts.orphanPets, 0, 'every pet must link to an owner');
  console.log(`seed ok: 1000 owners, ${counts.pets} pets, ${(counts.bytes / 1e6).toFixed(2)}MB of state`);

  // Minutes 0–2: create an account and a pet profile, add a record with a file, refresh.
  await page.fill('input[name=name]', 'Test Owner');
  await page.fill('input[name=email]', 'test.owner@example.com');
  await page.click('text=Create account or sign in');
  await page.waitForSelector('text=No pets yet');
  await page.click('text=Create a pet profile');
  await page.fill('form[data-form=pet] input[name=name]', 'Pepper');
  await page.fill('form[data-form=pet] input[name=breed]', 'Labrador Retriever');
  const birth = new Date(Date.now() - 77 * 86400000).toISOString().slice(0, 10);
  await page.fill('form[data-form=pet] input[name=birthDate]', birth);
  await page.fill('form[data-form=pet] input[name=weightLb]', '18');
  assert.strictEqual(await page.inputValue('select[name=size]'), 'large', 'breed should auto-fill size');
  await page.click('text=Create profile');
  await page.waitForSelector('h1:has-text("Pepper")');

  await page.click('.tabs >> text=Records');
  await page.fill('form[data-form=record] input[name=title]', '8-week DHPP vaccine');
  await page.setInputFiles('form[data-form=record] input[name=file]', { name: 'vaccine.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.click('text=Save record');
  await page.waitForSelector('text=vaccine.pdf');

  await page.reload();
  await page.waitForSelector('text=8-week DHPP vaccine');
  assert.ok(await page.isVisible('text=vaccine.pdf'), 'record and attachment persist after refresh');
  const fileOk = await page.evaluate(async () => {
    const r = PL.store.data.records.find((x) => x.attachment && x.attachment.name === 'vaccine.pdf');
    const f = await PL.files.get(r.id);
    return !!f && f.size > 0;
  });
  assert.ok(fileOk, 'uploaded file is stored in IndexedDB');

  // Edit profile -> profile_updated
  await page.click('text=Edit profile');
  await page.fill('form[data-form=pet] input[name=medications]', 'Monthly heartworm preventive');
  await page.click('text=Save changes');
  await page.waitForSelector('text=Monthly heartworm preventive');

  // Minutes 2–3: dated symptom entry, then timeline.
  await page.click('.tabs >> text=Symptoms');
  await page.fill('form[data-form=symptom] textarea[name=description]', 'Soft stool after new food');
  await page.selectOption('form[data-form=symptom] select[name=category]', 'Digestive');
  await page.click('text=Save entry');
  await page.waitForSelector('.list-item >> text=Soft stool after new food');
  await page.click('.tabs >> text=Timeline');
  await page.waitForSelector('.timeline >> text=Soft stool after new food');
  assert.ok(await page.isVisible('.timeline >> text=8-week DHPP vaccine'), 'timeline shows records alongside symptoms');

  // Minutes 3–5: guidance with profile details and sources, then activity history.
  await page.click('.tabs >> text=Guidance');
  await page.waitForSelector('text=Profile details this guidance uses');
  const guidance = await page.evaluate(() => ({
    cards: document.querySelectorAll('.g-card').length,
    sources: document.querySelectorAll('.g-sources a').length,
    hasPuppyVax: !!Array.from(document.querySelectorAll('.g-card h3')).find((e) => /Puppy vaccine series/.test(e.textContent)),
    hasYoungDigestive: !!Array.from(document.querySelectorAll('.g-card h3')).find((e) => /young puppy/.test(e.textContent)),
  }));
  assert.ok(guidance.cards >= 5 && guidance.sources >= 5, 'guidance cards with linked sources');
  assert.ok(guidance.hasPuppyVax && guidance.hasYoungDigestive, 'guidance reflects profile and symptom log');

  await page.click('.tabs >> text=Vet summary');
  await page.waitForSelector('text=Visit summary: Pepper');

  await page.click('.nav >> text=Activity');
  await page.waitForSelector('h1:has-text("Activity history")');
  const actions = await page.$$eval('table.data tbody tr td:nth-child(4)', (tds) => tds.map((t) => t.textContent.trim()));
  for (const a of ['Account created', 'Profile created', 'Record uploaded', 'Profile updated', 'Symptom logged', 'Guidance requested', 'Vet summary prepared']) {
    assert.ok(actions.includes(a), `activity history includes "${a}"`);
  }
  const row = await page.$eval('table.data tbody tr', (tr) => Array.from(tr.children).map((c) => c.textContent.trim()));
  assert.ok(row[0] && row[1] === 'Test Owner' && row[2] === 'Pepper', 'activity row stores time, user, pet');

  // Red-flag entry produces an urgent banner and guidance item.
  await page.goto(base + '#/pets');
  await page.click('.pet-card');
  await page.click('.tabs >> text=Symptoms');
  await page.fill('form[data-form=symptom] textarea[name=description]', 'Ate a chocolate bar');
  await page.click('details.flags summary');
  await page.check('input[value="Suspected poisoning or toxin ingestion"]');
  await page.click('text=Save entry');
  await page.waitForSelector('.alert-urgent');
  await page.click('.tabs >> text=Guidance');
  await page.waitForSelector('.g-card.pri-urgent');

  // Synthetic data explorer + viewing a synthetic account shows the label.
  await page.click('.nav >> text=Synthetic data');
  await page.waitForSelector('text=SYNTHETIC TEST DATA');
  await page.fill('#data-search', 'Synthetic Owner 0042');
  await page.waitForFunction(() => document.querySelectorAll('#owners-table tbody tr').length === 1);
  await page.click('#owners-table >> text=Open account');
  await page.waitForSelector('.syn-banner');
  await page.click('.pet-card');
  await page.click('.tabs >> text=Guidance');
  await page.waitForSelector('.g-card');

  // Demo owner path.
  await page.click('text=Sign out');
  await page.click('text=Continue as Demo Owner');
  await page.click('text=Maple');
  await page.click('.tabs >> text=Timeline');
  await page.waitForSelector('text=Scratching behind left ear after bath');

  // Mobile layout has no horizontal scroll.
  await page.setViewportSize({ width: 375, height: 800 });
  for (const tab of ['overview', 'symptoms', 'timeline', 'guidance', 'summary']) {
    await page.goto(base + '#/pet/p_demo_maple/' + tab);
    await page.waitForSelector('.tab-body');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `no horizontal scroll on ${tab} at 375px (overflow ${overflow}px)`);
  }
  await page.screenshot({ path: path.join(process.env.SHOT_DIR || __dirname, 'mobile-guidance.png'), fullPage: false });

  assert.deepStrictEqual(errors, [], 'no page errors');
  await browser.close();
  server.close();
  console.log('demo flow ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
