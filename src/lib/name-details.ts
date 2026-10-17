import { detailBucket, detailKey } from './name-detail-key.mjs';
import type { NameType } from './types';

export type DetailEntity = {
  id: string; name: string; registeredNames?: string[]; nationalities: string[]; occupations: string[];
  description?: string; work?: string; source: string; wikidata?: string;
  updatedAt: string; confidence: number;
  image?: { url: string; license: string; credit: string; source: string };
  localized?: { language: string; name: string; registeredNames: string[]; nationalities: string[]; occupations: string[]; description?: string; work?: string; source: string };
  localizations?: Record<string, NonNullable<DetailEntity['localized']>>;
};
export type NameDetails = {
  reading?: { text: string; source: string };
  people: DetailEntity[]; characters: DetailEntity[];
  lookup?: { state: 'queued' | 'running' | 'complete' | 'missing' | 'pending' | 'error' | 'busy' | 'unavailable' | 'background'; retryAfter?: number };
};
type Manifest = { version: number; shards: Record<string, string> };
const empty: NameDetails = { people: [], characters: [] };
let manifest: Promise<Manifest> | undefined;
const cache = new Map<string, Promise<Record<string, NameDetails>>>();
const liveCache = new Map<string, NameDetails>();
let liveAvailable = true;

export async function collectNameDetails(country: string, type: NameType, name: string, signal: AbortSignal): Promise<NameDetails | undefined> {
  const key=JSON.stringify([country,type,detailKey(name)]);
  if(liveCache.has(key)) return liveCache.get(key);
  if(!liveAvailable) return;
  const response=await fetch('/api/name-details',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({country,type,name}),signal});
  if([404,405,501].includes(response.status)) {liveAvailable=false;return;}
  if(!response.ok && response.status!==503) throw Error('人物情報の収集に失敗しました。');
  const data=await response.json() as NameDetails;
  if(data.lookup?.state==='unavailable') {liveAvailable=false;return;}
  if(!Array.isArray(data.people) || !Array.isArray(data.characters)) {
    return;
  }
  if(['complete','missing','pending'].includes(data.lookup?.state ?? '')) {
    liveCache.set(key,data);
    if(liveCache.size>128) liveCache.delete(liveCache.keys().next().value!);
  }
  return data;
}
async function json<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw Error('詳細情報を取得できませんでした。');
    return await response.json();
  } finally { clearTimeout(timeout); }
}
export async function loadNameDetails(country: string, type: NameType, name: string): Promise<NameDetails> {
  manifest ??= json<Manifest>('/data/name-details/manifest.json').catch((error) => { manifest = undefined; throw error; });
  const index = await manifest;
  if (index.version !== 1) { manifest = undefined; throw Error('詳細データの形式を確認できませんでした。'); }
  const url = index.shards[`${country}/${type}/${detailBucket(name)}`];
  if (!url) return empty;
  if (!/^\/data\/name-details\/[A-Z]{2}-(given_name|surname)-\d{2}\.[a-f0-9]+\.json$/.test(url)) throw Error('詳細データの参照先を確認できませんでした。');
  let request = cache.get(url);
  if (!request) {
    request = json<Record<string, NameDetails>>(url).catch((error) => { cache.delete(url); manifest = undefined; throw error; });
    cache.set(url, request);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  const payload = await request;
  const key = detailKey(name);
  return Object.hasOwn(payload, key) ? payload[key] : empty;
}
