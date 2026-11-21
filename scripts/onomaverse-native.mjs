import { isNativeName } from '../src/lib/native-name-policy.mjs';

const latinName = /^[\p{Script=Latin}\p{M} .'-]+$/u;

// Keep the spelling attached to the frequency row. Other-language renderings
// must not replace it or acquire a count of their own.
export function sourceDisplayName(country, value, transliterations = []) {
  const aliases = [...transliterations];
  const original = isNativeName(country, value.name) || latinName.test(value.name)
    ? value.name : aliases.shift();
  if (!original) return undefined;
  const name = original.normalize('NFKC');
  if (name !== value.name) aliases.unshift(value.name);
  return {
    ...value,
    name,
    aliases: [...new Set(aliases)].filter(alias => alias.toLocaleLowerCase() !== name.toLocaleLowerCase()),
  };
}
