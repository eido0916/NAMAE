import { canonicalizeNativeName } from './native-names';
import { formatName as formatChineseSurname } from './chinese-surnames.mjs';
import type { NameRecord, ReferenceNameRecord } from './types';

// Keep cards, spelling choices, share text and saved images consistent.
export function formatName(record: NameRecord | ReferenceNameRecord) {
  return formatChineseSurname(canonicalizeNativeName(record));
}
