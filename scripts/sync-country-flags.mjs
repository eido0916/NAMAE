import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './name-details/db.mjs';

const output = resolve(root,'public/flags');
if (!existsSync(resolve(output,'ATTRIBUTION.txt')) || !existsSync(resolve(output,'LICENSE-GRAPHICS'))) throw Error('Keep the Twemoji CC BY attribution and license before syncing flags.');
const countries = JSON.parse(readFileSync(resolve(root,'src/data/countries.json'),'utf8'));
let added = 0;
for (const { code } of countries) {
  if (!/^[A-Z]{2}$/.test(code)) throw Error('Invalid country code');
  const target = resolve(output,`${code}.svg`);
  if (existsSync(target)) continue;
  const points = [...code].map((c) => (c.codePointAt(0) + 127397).toString(16)).join('-');
  const response = await fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@16.0.1/assets/svg/${points}.svg`,{signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error(`Flag ${code}: HTTP ${response.status}`);
  const svg = await response.text();
  if (!svg.includes('<svg')) throw Error(`Invalid flag SVG: ${code}`);
  writeFileSync(target,svg);
  added++;
}
console.log(`Added ${added} country flags. Attribution and existing flags retained.`);
