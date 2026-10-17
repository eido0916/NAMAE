"use client";
import Link from "next/link";
import { CountryFlag as Flag } from "./country-flag";
import { CountryPicker } from "./country-picker";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  diagnose,
  getCountryConfig,
  getDefaultDestinations,
  getInputExamples,
  getNameRecord,
  getReadingOptions,
  getSurnameRecord,
  hasReferenceName,
} from "@/lib/engine";
import { loadDiagnosisData, loadInputData, loadInputReferenceName } from "@/lib/data-loader";
import { saveResult, shareResult } from "@/lib/share";
import type { Diagnosis, Gender, NameType } from "@/lib/types";
import { NameDetailsDialog } from "./name-details";
import { countryNativeNames, getUiCopy, localizedCountryName, localizeInputError } from "@/lib/ui-copy";
const ResultContext = createContext<{
  result: Diagnosis | null;
  setResult: (value: Diagnosis) => void;
  sourceCountry: string;
  setSourceCountry: (country: string) => void;
}>({ result: null, setResult: () => {}, sourceCountry: "JP", setSourceCountry: () => {} });
export function DiagnosisProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [sourceCountry, setSourceCountry] = useState("JP");
  useEffect(() => {
    document.documentElement.lang = getUiCopy(sourceCountry).lang;
  }, [sourceCountry]);
  return (
    <ResultContext.Provider value={{ result, setResult, sourceCountry, setSourceCountry }}>
      {children}
    </ResultContext.Provider>
  );
}
export function Header() {
  const { sourceCountry } = useContext(ResultContext);
  const copy = getUiCopy(sourceCountry);
  return (
    <header>
      <Link className="wordmark" href="/" aria-label="NAMAE ホーム">
        NAMAE<span>®</span>
      </Link>
      <span className="header-note">SAME YOU. ANOTHER WORLD.</span>
      <Link className="header-link" href="/#how">
        {copy.about} ↗
      </Link>
    </header>
  );
}
export function Footer() {
  const { sourceCountry } = useContext(ResultContext);
  const copy = getUiCopy(sourceCountry);
  return (
    <footer>
      <Link className="wordmark small" href="/">
        NAMAE<span>®</span>
      </Link>
      <span>{copy.tagline}</span>
      <span>
        © {new Date().getFullYear()} NAMAE ·{" "}
        <a href="/flags/ATTRIBUTION.txt">Flags: Twemoji / CC BY 4.0</a>
      </span>
      <span className="footer-links">
        <Link href="/sources">{copy.sources}</Link>
        <Link href="/privacy">{copy.privacy}</Link>
        <Link href="/legal">{copy.legal}</Link>
      </span>
    </footer>
  );
}
export function Home({
  initialType = "given_name",
}: {
  initialType?: NameType;
}) {
  const { sourceCountry } = useContext(ResultContext);
  const copy = getUiCopy(sourceCountry);
  return (
    <>
      <main className="home">
        <section className="intro">
          <div className="eyebrow">
            <span className="live-dot" /> YOUR PARALLEL NAME
          </div>
          <h1>
            {copy.hero}<br /><span className="accent">{copy.heroAccent}</span>
          </h1>
          <div className="countries">
            {getCountryConfig().slice(0, 6).map((c) => (
              <span key={c.code} title={c.nameJa}>
                <Flag code={c.code} label={c.nameJa} />
              </span>
            ))}
            <span className="country-count">{getCountryConfig().length} COUNTRIES</span>
          </div>
        </section>
        <section className="form-column">
          <div className="form-topline">
            <span>YOUR JOURNEY STARTS HERE</span>
            <span>01 — 02</span>
          </div>
          <NameForm initialType={initialType} />
          <p className="privacy">♧ {copy.privacyNote}</p>
        </section>
      </main>
      <section id="how" className="how">
        <div>
          <span className="eyebrow">HOW IT WORKS</span>
          <h2>
            {copy.howTitle}
          </h2>
        </div>
        <div>
          <span className="step-number">01</span>
          <h3>{copy.step1}</h3>
          <p className="record-meta">
            {copy.step1Body}
          </p>
        </div>
        <div>
          <span className="step-number">02</span>
          <h3>{copy.step2}</h3>
          <p>
            {copy.step2Body}
          </p>
        </div>
        <div>
          <span className="step-number">03</span>
          <h3>{copy.step3}</h3>
          <p>
            {copy.step3Body}
          </p>
        </div>
      </section>
      <p className="data-note">
        {copy.dataNote}
      </p>
    </>
  );
}
function NameForm({ initialType }: { initialType: NameType }) {
  const { sourceCountry, setSourceCountry, setResult } = useContext(ResultContext);
  const copy = getUiCopy(sourceCountry);
  const [type, setType] = useState(initialType);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [reading, setReading] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const destinationCountries = getDefaultDestinations(sourceCountry);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    loadInputData(type, sourceCountry)
      .then(() => active && setDataReady(true))
      .catch((error: unknown) => {
        if (active)
          setDataError(
            error instanceof Error
              ? error.message
              : "診断データを読み込めませんでした。",
          );
      });
    return () => {
      active = false;
    };
  }, [type, sourceCountry, loadAttempt]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      setError("");
      await loadInputData(type, sourceCountry);
      const input = {
        sourceCountry,
        name,
        type,
        destinationCountries,
        ...(type === "given_name"
          ? { gender, ...(reading ? { reading } : {}) }
          : {}),
      };
      await loadInputReferenceName(type, name, type === "given_name" ? gender : undefined, sourceCountry);
      if (type === "given_name" && reading) await loadInputReferenceName(type, reading, gender, sourceCountry);
      const givenNameRecord =
        type === "given_name" ? getNameRecord(input) : undefined;
      let surnameRecord: ReturnType<typeof getSurnameRecord>;
      if (
        type === "given_name" &&
        !givenNameRecord && !hasReferenceName(input)
      ) {
        await loadInputData("surname", sourceCountry);
        surnameRecord = getSurnameRecord(name, sourceCountry);
      }
      const sourceRecord =
        surnameRecord ??
        (type === "surname" ? getSurnameRecord(name, sourceCountry) : givenNameRecord);
      await loadDiagnosisData(
        surnameRecord ? "surname" : type,
        destinationCountries,
        sourceRecord?.rank,
        sourceRecord?.gender ?? gender,
        reading || name,
        sourceCountry,
      );
      const result = surnameRecord
        ? {
            ...diagnose({ name, type: "surname", sourceCountry, destinationCountries }),
            autoDetectedFrom: "given_name" as const,
          }
        : diagnose(input);
      setResult(result);
      router.push("/result");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "診断できませんでした。もう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }
  const surname = type === "surname";
  const readings = surname || sourceCountry !== "JP" ? [] : getReadingOptions(name, gender);
  const needsReading = !surname && sourceCountry === "JP";
  const nameExamples = useMemo(() => {
    if (sourceCountry === "JP") return type === "surname" ? ["佐藤", "鈴木", "山田"] : ["じゅん", "れん", "さくら"];
    return dataReady ? getInputExamples(sourceCountry, type, gender === "female" ? "female" : "male") : [];
  }, [sourceCountry, type, gender, dataReady]);
  return (
    <form onSubmit={submit} className="glass form-card" lang={copy.lang}>
      <div className="form-heading">
        <span className="mini-star">✳</span>
      </div>
      <h2>{copy.title}</h2>
      <p className="muted">{copy.intro}</p>
      <fieldset className="source-country-field" id="source-country" aria-describedby="source-country-help">
        <legend className="field-label source-country-legend">
          <span className="globe-symbol" aria-hidden="true">🌐</span>
          <span lang="en">Country / Region</span>
        </legend>
        <CountryPicker value={sourceCountry} disabled={busy} onChange={(code) => {
          setSourceCountry(code);
          setReading("");
          setError("");
          setDataError("");
          setDataReady(false);
        }} />
        <p id="source-country-help">{copy.countryHelp}</p>
      </fieldset>
      <div className="tabs" aria-label={`${copy.given} / ${copy.surname}`}>
        {(["given_name", "surname"] as const).map((t) => (
          <button
            type="button"
            key={t}
            disabled={busy}
            aria-pressed={type === t}
            className={type === t ? "selected" : ""}
            onClick={() => {
              if (t !== type) {
                setType(t);
                setDataReady(false);
                setDataError("");
              }
              setError("");
            }}
          >
            {t === "given_name" ? copy.given : copy.surname}{" "}
            <span>{type === t ? "↗" : ""}</span>
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor="name">
        {surname ? copy.surnameLabel : copy.nameLabel}
        <span>{sourceCountry === "JP" ? "漢字・ひらがな・カタカナ・英字" : copy.scriptHint}</span>
      </label>
      <input
        id="name"
        name="name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setReading("");
          setError("");
        }}
        placeholder={sourceCountry === "JP" ? (surname ? "例：佐藤" : "例：はると") : nameExamples.length ? `${copy.example}${nameExamples[0]}` : surname ? copy.surnameLabel : copy.nameLabel}
        disabled={busy}
        maxLength={30}
        autoComplete="off"
        required
        aria-describedby={error ? "form-error" : undefined}
      />
      {nameExamples.length > 0 && <div className="examples">
        {copy.try}
        {nameExamples.map((n) => (
          <button
            key={n}
            type="button"
            disabled={busy}
            onClick={() => {
              setName(n);
              setReading("");
              if (n === "ゆい" || n === "さくら") setGender("female");
              else if (!surname && sourceCountry === "JP") setGender("male");
              setError("");
            }}
          >
            {n}
          </button>
        ))}
      </div>}
      {needsReading && (
        <div className="reading-field">
          <label className="field-label" htmlFor="reading">
            名前の読み方
            <span>任意・見つからない場合は読みを入力</span>
          </label>
          <input
            id="reading"
            list="reading-options"
            placeholder="例：はると（候補からも選べます）"
            value={reading}
            maxLength={30}
            onChange={(e) => setReading(e.target.value)}
          />
          <datalist id="reading-options">
            {readings.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
      )}
      {!surname && (
        <fieldset>
          <legend className="field-label">{copy.gender}</legend>
          <div className="gender-options">
            {(["male", "female"] as const).map((g) => (
              <label key={g}>
                <input
                  type="radio"
                  name="gender"
                  value={g}
                  disabled={busy}
                  checked={gender === g}
                  onChange={() => {
                    setGender(g);
                    setReading("");
                  }}
                />
                <span>{g === "male" ? copy.male : copy.female}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {(error || dataError) && (
        <div className="form-error-row">
          <p id="form-error" role="alert" className="error">
            {error ? localizeInputError(error, sourceCountry) : copy.dataError}
          </p>
          {dataError && (
            <button
              className="retry-data"
              type="button"
              onClick={() => {
                setDataError("");
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              {copy.retry} ↻
            </button>
          )}
        </div>
      )}
      <button
        className="primary"
        type="submit"
        disabled={!dataReady || busy || destinationCountries.length === 0}
      >
        {busy || !dataReady
          ? copy.loading
          : surname ? copy.submitSurname : copy.submitName} {dataReady && !busy && <span>↗</span>}
      </button>
      <p className="form-caption">Same popularity. Different country.</p>
    </form>
  );
}
export function Results() {
  const countryPickerRef = useRef<HTMLDetailsElement>(null);
  const [detailMatch, setDetailMatch] = useState<Diagnosis["matches"][number] | null>(null);
  const { result, setResult } = useContext(ResultContext);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [countryUpdateBusy, setCountryUpdateBusy] = useState(false);
  const [countryUpdateError, setCountryUpdateError] = useState("");
  const sourceCountry = result?.input.sourceCountry ?? "JP";
  const sourceConfig = getCountryConfig(sourceCountry)[0];
  const copy = getUiCopy(sourceCountry);
  const countryName = (code: string) => localizedCountryName(code, sourceCountry);
  const selectedCountries = result
    ? (result.input.destinationCountries?.filter((code) => code !== sourceCountry) ??
      result.matches.map(({ country }) => country.code))
    : [];

  async function updateDestinationCountries(nextCountries: string[]) {
    if (!result || countryUpdateBusy) return;
    if (nextCountries.length < 1) {
      setCountryUpdateError(copy.countryHint);
      return;
    }
    if (nextCountries.length > 8) return;
    setCountryUpdateBusy(true);
    setCountryUpdateError("");
    try {
      await loadDiagnosisData(
        result.input.type,
        nextCountries,
        result.record?.rank,
        result.input.gender,
        result.input.reading ?? result.input.name,
        sourceCountry,
      );
      const nextResult = diagnose({
        ...result.input,
        destinationCountries: nextCountries,
      });
      setResult(
        result.autoDetectedFrom
          ? { ...nextResult, autoDetectedFrom: result.autoDetectedFrom }
          : nextResult,
      );
    } catch (error) {
      setCountryUpdateError(
        sourceCountry !== "JP" ? copy.dataError : error instanceof Error
          ? error.message
          : "国別データを読み込めませんでした。",
      );
    } finally {
      setCountryUpdateBusy(false);
    }
  }

  if (!result)
    return (
      <main className="empty glass">
        <span className="eyebrow">YOUR NEXT JOURNEY</span>
        <h1>
          世界の名前を
          <br />
          見つけよう。
        </h1>
        <p>結果は再読み込みすると消えます。もう一度診断してください。</p>
        <Link className="primary" href="/">
          診断をはじめる ↗
        </Link>
      </main>
    );
  async function action(kind: "save" | "share") {
    if (!result) return;
    setBusy(true);
    try {
      const message = await (kind === "save" ? saveResult(result) : shareResult(result));
      setStatus(sourceCountry === "JP" ? message : kind === "save" ? copy.saved : copy.shared);
    } catch (e) {
      setStatus(
        e instanceof Error && e.name === "AbortError"
          ? copy.shareCancelled
          : copy.actionError,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="results">
      <div className="result-heading">
        <span className="eyebrow">YOUR PARALLEL NAME</span>
        <h1>{copy.resultTitle}</h1>
      </div>
      {!result.record && (
        <p className="mode-notice" role="status">
          {copy.noRankNotice}
        </p>
      )}
      {result.autoDetectedFrom && (
        <p className="mode-notice" role="status">
          {result.input.name} — {copy.surnameNotice}
        </p>
      )}
      <section className="glass original">
        <div>
          <span className="eyebrow">
            YOUR {result.input.type === "surname" ? "SURNAME" : "NAME"} · {sourceConfig.nameEn.toUpperCase()}{" "}
            <Flag code={sourceCountry} label={sourceConfig.nameJa} />
          </span>
          <h2>{result.input.name}</h2>
          <p>
            {[
              result.input.type === "given_name" ? result.input.gender === "male" ? copy.male : copy.female : "",
              result.input.reading ? `読み：${result.input.reading}` : "",
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="rank">
          <span>
            {sourceCountry === "JP" ? `${sourceConfig.nameJa}での人気度` : `${countryName(sourceCountry)} · ${copy.rank}`}{" "}
            <small>
              {sourceCountry !== "JP" ? (result.meta.isSample ? copy.sample : "") : result.meta.isSample
                ? "サンプル"
                : result.record?.rankingBasis === "overall"
                  ? result.record.isEstimated
                    ? "総合推定順位"
                    : "読み方順位"
                : result.record?.rankingBasis === "spelling"
                  ? "漢字表記順位"
                  : result.record?.rankingBasis === "reading"
                    ? "読み方順位"
                    : "調査内順位"}
            </small>
          </span>
          <strong>
            {result.record
              ? `#${result.record.rank}`
              : result.recognition === "dictionary"
                ? copy.unknown
                : sourceCountry === "JP" ? "データ未収録" : copy.noData}
          </strong>
          <small>
            {result.record
              ? `${result.record.totalEntries.toLocaleString(copy.lang)} ${copy.rankCount}`
              : result.recognition === "dictionary"
                ? copy.dictionary
                : copy.noRankNotice}
          </small>
        </div>
        <div className="rarity">
          <span>
            Rarity Score <small>{copy.estimated}</small>
          </span>
          <b>
            {result.record ? result.score : "—"}
            <small>{result.record ? " / 100" : sourceCountry === "JP" ? " 算出不可" : " —"}</small>
          </b>
          <div className="meter">
            <span style={{ width: `${result.record ? result.score : 0}%` }} />
          </div>
          <small>{copy.rarityScale}</small>
        </div>
      </section>
      <div className="result-subtitle">
        <h2>
          {sourceCountry === "JP" ? (result.input.type === "surname" ? "もし海外の苗字だったら…" : "もし海外で生まれていたら…") : copy.step2}
        </h2>
        <span>IF YOU WERE BORN IN…</span>
      </div>
      <details className="result-country-picker" ref={countryPickerRef} id="result-country-picker">
        <summary>
          <span>
            {copy.countries} <small>{selectedCountries.length}/8</small>
          </span>
          <span className="result-country-summary">
            {selectedCountries
              .map((code) => countryName(code))
              .filter(Boolean)
              .join("・")}{" "}
            <b>{copy.changeCountries} ＋</b>
          </span>
        </summary>
        <div className="result-country-options" aria-busy={countryUpdateBusy}>
          {getCountryConfig()
            .filter((country) => {
              if (country.code === sourceCountry) return false;
              return result.input.type === "surname"
                ? country.supportsSurname
                : country.supportsGivenName;
            })
            .map((country) => {
              const checked = selectedCountries.includes(country.code);
              const disabled =
                !checked && (selectedCountries.length >= 8 || countryUpdateBusy);
              return (
                <label key={country.code}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => {
                      const nextCountries = checked
                        ? selectedCountries.filter((code) => code !== country.code)
                        : [...selectedCountries, country.code];
                      void updateDestinationCountries(nextCountries);
                    }}
                  />
                  <span>
                    <Flag code={country.code} label={countryName(country.code)} />
                    {countryName(country.code)}
                  </span>
                </label>
              );
            })}
        </div>
        <p className="result-country-hint">
          {countryUpdateBusy
            ? copy.loading
            : copy.countryHint}
        </p>
        {countryUpdateError && (
          <p className="error" role="alert">
            {countryUpdateError}
          </p>
        )}
      </details>
      <div className="match-grid">
        {result.matches.map(({ country, record, meta }, i) => {
          const evidence = record.rank === undefined ? record.evidenceRank : undefined;
          return (
          <article
            className="glass match-card match-card-interactive"
            key={country.code}
            style={{ animationDelay: `${i * 65}ms` }}
          >
            <div className="match-top">
              <span className="flag">
                <Flag code={country.code} label={country.nameJa} />
              </span>
              <span>
                {country.nameEn}
                <small>{copy.lang === "en" ? countryNativeNames[country.code] ?? country.code : countryName(country.code)}</small>
              </span>
              <span className="match-index">0{i + 1}</span>
            </div>
            <h3>{record.name}</h3>
            <div className="match-bottom">
              <span>
                {record.rank === undefined ? evidence ? <>{copy.referenceRank} <b>{evidence.tiedNames > 1 ? "= " : ""}#{evidence.rank}</b></> : copy.dictionary : <>{copy.localRank} <b>#{record.rank}</b></>}
              </span>
              {!evidence && <span>
                {record.rank === undefined
                  ? copy.reference
                  : result.record
                  ? record.rank === result.record.rank
                    ? sourceCountry === "JP" ? `${sourceConfig.nameJa}と同じ順位` : copy.sameRank
                    : copy.nearRank
                  : copy.reference}
              </span>}
            </div>
            {!evidence && <p className="match-source">
              {copy.lang === "ja" && meta.coverageLabel
                ? `${meta.coverageLabel} · `
                : meta.coverageLabel?.match(/\d{4}\s*[–—-]\s*\d{4}/)?.[0]
                  ? `${meta.coverageLabel.match(/\d{4}\s*[–—-]\s*\d{4}/)![0]} · `
                  : record.year ? `${record.year}${copy.lang === "ja" ? "年" : ""} · ` : ""}
              {getCountryConfig(country.code) &&
              result.matches.find((m) => m.country.code === country.code)?.meta
                .isSample
                ? copy.sample
                : record.rank === undefined ? copy.dictionary : copy.publicData}
            </p>}
            <span className="match-detail-hint">{copy.details} ↗</span>
            <button type="button" className="match-detail-trigger" aria-haspopup="dialog" aria-label={`${countryName(country.code)} · ${record.name} · ${copy.details}`} onClick={() => setDetailMatch({ country, record, meta })} />
          </article>
          );
        })}
        {detailMatch && <NameDetailsDialog key={`${sourceCountry}/${detailMatch.country.code}/${detailMatch.record.type}/${detailMatch.record.name}`} country={detailMatch.country} sourceCountry={sourceCountry} name={detailMatch.record.name} type={detailMatch.record.type} close={() => setDetailMatch(null)} />}
        {result.unavailableCountries?.map(({ country, reason }) => (
          <article className="glass match-card" key={country.code}>
            <div className="match-top">
              <Flag code={country.code} label={country.nameJa} />
              <span>{country.nameEn}<small>{country.nameJa}</small></span>
            </div>
            <h3>{copy.noData}</h3>
            <p className="match-source">{sourceCountry === "JP" ? reason : copy.dataError}</p>
          </article>
        ))}
        {selectedCountries.length < 8 && (
          <button
            type="button"
            className="glass match-card add-country-card"
            aria-controls="result-country-picker"
            disabled={countryUpdateBusy}
            onClick={() => {
              const picker = countryPickerRef.current;
              if (!picker) return;
              picker.open = true;
              picker.querySelector("summary")?.focus({ preventScroll: true });
              picker.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span className="add-country-icon" aria-hidden="true">＋</span>
            <strong>{copy.addCountry}</strong>
            <span className="add-country-count">{selectedCountries.length} / 8</span>
          </button>
        )}
      </div>
      <div className="result-actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => action("save")}
        >
          ↓ {copy.save}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => action("share")}
        >
          ↗ {copy.share}
        </button>
        <Link className="again" href="/">
          {copy.again} ↻
        </Link>
      </div>
      <p className="status" role="status">
        {status || copy.saveHint}
      </p>
    </main>
  );
}
