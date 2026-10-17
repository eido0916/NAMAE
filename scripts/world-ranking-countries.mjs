import { readFileSync } from "node:fs";

// Keep the first 39 countries' broader country/birthplace/residence cohorts intact.
const previous = new Set(JSON.parse(readFileSync("reports/observed-ranking-expansion-before.json", "utf8")).countries);
const enabled = JSON.parse(readFileSync("src/data/countries.json", "utf8")).filter((c) => c.enabled);
const enabledCodes = new Set(enabled.map((c) => c.code));
const first = "CN,TW,SG,MY,VN,TH,ID,PH,IN,PK,BD,DE,IT,ES,PT,NL,TR,EG,ZA,NG,GH,MA,DZ,TN,MC,FJ,AF,UZ,SM,ME".split(",");
export const worldRankingCountries = [...new Set([...first, ...enabled.map((c) => c.code)])].filter((code) => enabledCodes.has(code) && !previous.has(code));
