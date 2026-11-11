// Bundles src/main.js and inlines it into src/template.html -> dist/index.html (one self-contained page).
import { build } from 'esbuild';
import fs from 'node:fs';
const out = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', loader: { '.b64': 'text' }, write: false });
const js = out.outputFiles[0].text.replaceAll('</script', '<\\/script');
const tpl = fs.readFileSync('src/template.html', 'utf8');
const i = tpl.indexOf('__BUNDLE__');
if (i < 0) throw new Error('__BUNDLE__ marker missing in src/template.html');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', tpl.slice(0, i) + js + tpl.slice(i + '__BUNDLE__'.length));
console.log('dist/index.html', (fs.statSync('dist/index.html').size / 1e6).toFixed(1) + ' MB');
