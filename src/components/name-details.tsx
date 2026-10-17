"use client";

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { loadNameDetails, collectNameDetails, type NameDetails, type DetailEntity } from '@/lib/name-details';
import { nameReadingHint } from '@/lib/name-reading.mjs';
import { getDetailCopy, getDetailReadingCopy, detailUiLanguage } from '@/lib/detail-copy';
import { localizedCountryName } from '@/lib/ui-copy';
import type { CountryConfig, NameType } from '@/lib/types';

function licenseLink(license: string) {
  const match = /^CC (BY(?:-SA)?) (2\.0|2\.5|3\.0|4\.0)$/.exec(license);
  if (match) return `https://creativecommons.org/licenses/${match[1].toLowerCase()}/${match[2]}/`;
  if (license === 'CC0' || license === 'CC0 1.0') return 'https://creativecommons.org/publicdomain/zero/1.0/';
}
function Entity({ entity, sourceCountry }: { entity: DetailEntity; sourceCountry: string }) {
  const copy = getDetailCopy(sourceCountry);
  const language = detailUiLanguage(sourceCountry);
  const localized = entity.localizations?.[language] ?? (entity.localized?.language === language ? entity.localized : undefined);
  entity = localized ? { ...entity, ...localized } : entity;
  return <article className="detail-entity">
    {entity.image && <figure>
      <Image unoptimized src={entity.image.url} alt={entity.name} width={96} height={112} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />
      <figcaption><a href={entity.image.source} target="_blank" rel="noopener noreferrer">{entity.image.credit}</a> · <a href={licenseLink(entity.image.license) ?? entity.image.source} target="_blank" rel="noopener noreferrer">{entity.image.license}</a></figcaption>
    </figure>}
    <div>
      <h4>{entity.name}</h4>
      {!!entity.registeredNames?.length && <p className="detail-meta">{copy.registered}: {entity.registeredNames.join(' / ')}</p>}
      {entity.work && <p className="detail-meta">{copy.work}: {entity.work}</p>}
      {!!entity.nationalities.length && <p className="detail-meta">{copy.nationality}: {entity.nationalities.join(' / ')}</p>}
      {!!entity.occupations.length && <p className="detail-meta">{entity.occupations.join(' / ')}</p>}
      {entity.description && <p>{entity.description}</p>}
      <a href={entity.source} target="_blank" rel="noopener noreferrer">{copy.source} ↗</a>
      {entity.wikidata && entity.wikidata !== entity.source && <> · <a href={entity.wikidata} target="_blank" rel="noopener noreferrer">Wikidata ↗</a></>}
    </div>
  </article>;
}
export function NameDetailsDialog({ country, sourceCountry, name, type, close }: {
  country: CountryConfig; sourceCountry: string; name: string; type: NameType; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const copy = getDetailCopy(sourceCountry);
  const language = detailUiLanguage(sourceCountry);
  const readingCopy = getDetailReadingCopy(sourceCountry);
  const countryName = localizedCountryName(country.code, sourceCountry);
  const [details, setDetails] = useState<NameDetails>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<NameDetails['lookup']>();
  const hint = nameReadingHint(country.code, name);
  useEffect(() => {
    const element = dialog.current!;
    const focused = document.activeElement as HTMLElement | null;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      focused?.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const controller=new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let polls=0;
    async function collect() {
      try {
        const value=await collectNameDetails(country.code,type,name,controller.signal);
        if(!active) return;
        if(!value) {setLookup({state:'unavailable'});return;}
        setDetails(previous=>({...value,reading:value.reading ?? previous?.reading,people:value.people.length?value.people:previous?.people ?? [],characters:value.characters.length?value.characters:previous?.characters ?? []}));
        setError('');
        setLookup(value.lookup);
        if(['queued','running','busy'].includes(value.lookup?.state ?? '')) {
          if(++polls<60) timer=setTimeout(collect,Math.min(10,Math.max(2,value.lookup?.retryAfter ?? 3))*1000);
          else setLookup({state:'background'});
        }
      } catch {if(active) setLookup({state:'error'});}
    }
    async function start() {
      let saved: NameDetails | undefined;
      try {saved=await loadNameDetails(country.code,type,name);if(active) setDetails(saved);}
      catch {if(active) setError(copy.error);}
      if(active && !saved?.people.length) {setLookup({state:'queued'});void collect();}
    }
    void start();
    return () => {active=false;controller.abort();clearTimeout(timer);};
  }, [country.code, name, type, attempt, copy]);
  return <dialog lang={language} ref={dialog} className="name-detail-dialog glass" aria-labelledby="name-detail-title" onCancel={close} onClick={(event) => { if (event.target === event.currentTarget) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  } }}>
    <div className="detail-toolbar"><span className="eyebrow">WORLD NAME STORIES</span><button type="button" className="detail-close" onClick={close} aria-label={copy.close} autoFocus>×</button></div>
    <p className="detail-country"><Image className="country-flag" src={`/flags/${country.code}.svg`} alt={`${countryName} ${copy.flag}`} width={32} height={32} unoptimized /> {countryName} <small>{country.nameEn}</small></p>
    <h2 id="name-detail-title">{name}</h2>
    {language === 'ja' && details?.reading ? <p className="detail-reading">{readingCopy.reading}: {details.reading.text} <a href={details.reading.source} target="_blank" rel="noopener noreferrer" aria-label={copy.source}>↗</a></p>
      : language === 'ja' && hint ? <p className="detail-reading">{readingCopy.hint}: {hint.text}</p>
      : (details || error) && <p className="detail-reading">{readingCopy.missing}</p>}
    {!details && !error && <p role="status">{copy.loading}</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="secondary" onClick={() => { setError(''); setAttempt((n) => n + 1); }}>{copy.retry}</button></div>}
    {lookup && ['queued','running','busy'].includes(lookup.state) && <p role="status" className="detail-empty">{copy.searching}</p>}
    {lookup?.state === 'pending' && <p className="detail-empty">{copy.pending}</p>}
    {lookup?.state === 'background' && <p className="detail-empty">{copy.background}</p>}
    {lookup?.state === 'error' && !error && <p className="detail-empty">{copy.error}</p>}
    {details && <>
      {details.people.length > 0 && <section className="detail-section"><h3>{copy.people}</h3>{details.people.slice(0,3).map((e) => <Entity key={e.id} entity={e} sourceCountry={sourceCountry} />)}</section>}
      {details.characters.length > 0 && <section className="detail-section"><h3>{copy.characters}</h3>{details.characters.slice(0,3).map((e) => <Entity key={e.id} entity={e} sourceCountry={sourceCountry} />)}</section>}
      {!details.people.length && !details.characters.length && !['queued','running','busy','pending','error','background'].includes(lookup?.state ?? '') && <p className="detail-empty">{copy.empty}</p>}
      {!details.people.length && <p><a href={`https://${language === 'nb' ? 'no' : language.split('-')[0]}.wikipedia.org/w/index.php?title=Special:Search&search=${encodeURIComponent('"'+name+'"')}`} target="_blank" rel="noopener noreferrer">{copy.wikipedia} ↗</a></p>}
    </>}
  </dialog>;
}
