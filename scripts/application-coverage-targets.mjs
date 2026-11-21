import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadCoverageTargets(root) {
  const census = JSON.parse(readFileSync(join(root, 'data-sources/rankings/coverage-population-2024.json'), 'utf8'));
  return (country, type) => {
    const population = census.population[country];
    if (!population) throw Error(`Missing coverage planning population: ${country}`);
    // Planning targets per list, not estimates of the number of names in use.
    // Korean surnames share Hangul spellings across Hanja and ancestral seats.
    if (country === 'KR' && type === 'surname') return 350;
    if (['CN', 'TW'].includes(country) && type === 'surname') return 2500;
    // The 2025 Swiss resident tables cover roughly 95% or more of published
    // bearer counts within the first 10,000 usable spellings in each cohort.
    if (country === 'CH' && type === 'given_name') return 10000;
    if (population < 100000) return 300;
    if (population < 1000000) return 1000;
    if (population < 10000000) return 3000;
    if (population < 50000000) return 7500;
    if (population < 100000000) return 10000;
    return 20000;
  };
}
