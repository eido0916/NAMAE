// Multiple names and country relations on one person must never inflate counts.
export function buildObservedRanks(rows, labels, country, type) {
  const groups = new Map();
  const peopleByGender = new Map();
  for (const row of rows) {
    const person = row.person?.value?.split("/").at(-1);
    const entity = row.name?.value?.split("/").at(-1);
    if (!/^Q\d+$/.test(person ?? "") || !/^Q\d+$/.test(entity ?? "")) continue;
    const gender = type === "surname" ? undefined : row.sex?.value?.endsWith("/Q6581097") ? "male" : row.sex?.value?.endsWith("/Q6581072") ? "female" : undefined;
    if (type === "given_name" && !gender) continue;
    const names = labels[entity] ?? {};
    const raw = country === "KR" ? names.ko ?? names.en : country === "CN" ? names.zh ?? names.en : country === "JP" ? names.ja ?? names.en : names.en;
    if (!raw) continue;
    let name = raw.normalize("NFKC").trim().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
    // Chinese entity labels sometimes append a descriptive surname/clan suffix.
    if (country === "CN" && type === "surname") name = name.replace(/^([\p{Script=Han}]{1,12})[姓氏]$/u, "$1");
    const native = country === "KR" && /^[\p{Script=Hangul}]+$/u.test(name) || country === "CN" && /^[\p{Script=Han}·]+$/u.test(name) && /\p{Script=Han}/u.test(name) || country === "JP" && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+$/u.test(name);
    if (name.length < (native ? 1 : 2) || name.length > 80 || (!native && !/^[\p{Script=Latin}\p{M} .'-]+$/u.test(name))) continue;
    const key = `${gender ?? "all"}|${name.toLowerCase()}`;
    const group = groups.get(key) ?? { name, ...(gender ? { gender } : {}), people: new Set(), entities: new Set() };
    group.people.add(person);
    group.entities.add(entity);
    groups.set(key, group);
    const people = peopleByGender.get(gender ?? "all") ?? new Set();
    people.add(person);
    peopleByGender.set(gender ?? "all", people);
  }
  const records = [];
  for (const [gender, people] of peopleByGender) {
    const cohort = [...groups.values()].filter((g) => (g.gender ?? "all") === gender).sort((a, b) => b.people.size - a.people.size || a.name.localeCompare(b.name));
    const ties = new Map();
    for (const group of cohort) ties.set(group.people.size, (ties.get(group.people.size) ?? 0) + 1);
    let rank = 0;
    let previous = -1;
    cohort.forEach((g, i) => {
      if (g.people.size !== previous) rank = i + 1;
      previous = g.people.size;
      records.push({ name: g.name, ...(g.gender ? { gender: g.gender } : {}), entities: [...g.entities].sort(), evidenceRank: { rank, totalNames: cohort.length, observedPeople: g.people.size, totalPeople: people.size, tiedNames: ties.get(g.people.size), method: "competition", scope: "public_people" } });
    });
  }
  return records;
}
