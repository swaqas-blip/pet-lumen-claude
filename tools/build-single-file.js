/*
 * Bundles the app into one self-contained HTML file (CSS, JS, and logo inlined).
 *   node tools/build-single-file.js            -> PetLumen.html (open by double-clicking)
 *   node tools/build-single-file.js --fragment out.html
 *       -> page content without <html>/<head>/<body>, for hosts that add their own wrapper
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const logo = `data:image/svg+xml;base64,${Buffer.from(read('assets/logo.svg')).toString('base64')}`;
const inlineLogo = (s) => s.split('assets/logo.svg').join(logo);
const scripts = ['js/store.js', 'js/seed.js', 'js/guidance.js', 'js/app.js']
  .map((f) => `<script>\n${inlineLogo(read(f)).replace(/<\/script/gi, '<\\/script')}\n</script>`)
  .join('\n');

const head = `<title>PetLumen</title>
<meta name="description" content="PetLumen prototype: pet health profile, symptom tracking, and sourced wellness guidance in one place.">
<link rel="icon" href="${logo}" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&display=swap">
<style>
${read('css/styles.css')}
</style>`;
const body = `<div id="app"><p class="loading">Loading PetLumen…</p></div>
<div id="toasts" class="toasts" aria-live="polite"></div>
${scripts}`;

const args = process.argv.slice(2);
if (args[0] === '--fragment') {
  const out = args[1];
  fs.writeFileSync(out, `${head.replace('<title>PetLumen</title>', '<title>PetLumen</title>\n<meta name="claude:viewport-fit-sides" content="cover">')}\n${body}\n`);
  console.log(`wrote ${out}`);
} else {
  const out = path.join(ROOT, 'PetLumen.html');
  fs.writeFileSync(out, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body>
${body}
</body>
</html>
`);
  console.log(`wrote ${out}`);
}
