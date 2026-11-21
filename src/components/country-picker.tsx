"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getCountryConfig } from "@/lib/engine";
import { countryNativeNames, getCountryPickerCopy, getUiCopy, localizedCountryName } from "@/lib/ui-copy";
import { CountryFlag } from "./country-flag";

const catalog = getCountryConfig();
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const searchKey = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();
const searchAliases: Record<string, string> = { GB: "UK Britain", US: "USA America", TR: "Turkey Turkiye", CZ: "Czech Republic Czechia", KR: "Korea South Korea", RU: "Russia Russian Federation", CI: "Ivory Coast Cote d Ivoire" };

export function CountryPicker({ value, onChange, disabled }: {
  value: string;
  onChange: (code: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<"above" | "below">("below");
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const copy = getCountryPickerCopy(value);
  const lang = getUiCopy(value).lang;
  const selected = catalog.find((country) => country.code === value)!;
  const options = useMemo(() => {
    const key = searchKey(query);
    return catalog.filter((country) => searchKey([
      country.code, country.nameEn, country.nameJa, countryNativeNames[country.code],
      localizedCountryName(country.code, value), searchAliases[country.code] ?? "",
    ].join(" ")).includes(key));
  }, [query, value]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open && options[activeIndex]) {
      document.getElementById(`${listId}-${options[activeIndex].code}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex, options, listId]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(code: string) {
    if (code !== value) onChange(code);
    close();
  }
  return <div className="country-select" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); close(); }
  }}>
    <button className="country-select-trigger" type="button" ref={trigger}
      aria-label={`Country / Region: ${countryNativeNames[value]}`}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
      disabled={disabled || !hydrated}
      onClick={() => {
        if (open) close();
        else {
          const bounds = trigger.current!.getBoundingClientRect();
          const below = window.innerHeight - bounds.bottom;
          const menuHeight = Math.min(290, window.innerHeight * .38) + 104;
          setPlacement(below < menuHeight && bounds.top > below ? "above" : "below");
          setQuery("");
          setActiveIndex(Math.max(0, catalog.findIndex((country) => country.code === value)));
          setOpen(true);
        }
      }}>
      <CountryFlag code={value} label="" />
      <span className="country-select-name"><strong>{countryNativeNames[value]}</strong><small>{selected.nameEn} · {selected.code}</small></span>
      <span className="country-select-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="country-select-menu" data-placement={placement}>
      <div className="country-select-search">
        <span aria-hidden="true">⌕</span>
        <input ref={input} role="combobox" type="text" aria-label={copy.search}
          placeholder={copy.search} value={query} autoComplete="off" spellCheck={false}
          aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={options[activeIndex] ? `${listId}-${options[activeIndex].code}` : undefined}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(event.key)) {
              if ((event.key === "Home" || event.key === "End") && query) return;
              event.preventDefault();
              if (event.key === "Enter") { if (options[activeIndex]) choose(options[activeIndex].code); }
              else if (event.key === "ArrowDown") setActiveIndex((index) => Math.min(index + 1, options.length - 1));
              else if (event.key === "ArrowUp") setActiveIndex((index) => Math.max(0, index - 1));
              else setActiveIndex(event.key === "Home" ? 0 : Math.max(0, options.length - 1));
            }
          }} />
        <button type="button" className="country-select-close" aria-label={copy.close} onClick={close}>×</button>
      </div>
      <div id={listId} role="listbox" aria-label="Country / Region" className="country-select-list">
        {options.map((country, index) => <div key={country.code} id={`${listId}-${country.code}`} role="option"
          aria-selected={country.code === value} data-active={index === activeIndex}
          className="country-select-option" onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(country.code)}>
          <CountryFlag code={country.code} label="" />
          <span className="country-select-name"><strong>{countryNativeNames[country.code]}</strong><small>{localizedCountryName(country.code, value)} · {country.nameEn}</small></span>
          <span className="country-select-check" aria-hidden="true">{country.code === value ? "✓" : ""}</span>
        </div>)}
      </div>
      <p className="country-select-count" role="status" lang={lang}>{options.length ? `${options.length} / ${catalog.length}` : copy.empty}</p>
    </div>}
  </div>;
}
