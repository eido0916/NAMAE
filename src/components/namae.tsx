"use client";
import Link from "next/link";
import Image from "next/image";
function Flag({ code, label }: { code: string; label: string }) {
  const config = getCountryConfig(code)[0];
  if (!["JP", "US", "GB", "FR", "KR", "DE"].includes(code))
    return (
      <span className="country-flag country-flag-emoji" role="img" aria-label={label}>
        {config?.flag ?? "🌐"}
      </span>
    );
  return (
    <Image
      className="country-flag"
      src={`/flags/${code}.svg`}
      width={36}
      height={36}
      alt={label}
      unoptimized
    />
  );
}
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  diagnose,
  getCountryConfig,
  getNameRecord,
  getReadingOptions,
  getSurnameRecord,
} from "@/lib/engine";
import { loadDiagnosisData, loadInputData } from "@/lib/data-loader";
import { saveResult, shareResult } from "@/lib/share";
import type { Diagnosis, Gender, NameType } from "@/lib/types";
const ResultContext = createContext<{
  result: Diagnosis | null;
  setResult: (value: Diagnosis) => void;
}>({ result: null, setResult: () => {} });
export function DiagnosisProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<Diagnosis | null>(null);
  return (
    <ResultContext.Provider value={{ result, setResult }}>
      {children}
    </ResultContext.Provider>
  );
}
export function Header() {
  return (
    <header>
      <Link className="wordmark" href="/" aria-label="NAMAE ホーム">
        NAMAE<span>®</span>
      </Link>
      <span className="header-note">SAME YOU. ANOTHER WORLD.</span>
      <Link className="header-link" href="/#how">
        NAMAEについて ↗
      </Link>
    </header>
  );
}
export function Footer() {
  return (
    <footer>
      <Link className="wordmark small" href="/">
        NAMAE<span>®</span>
      </Link>
      <span>ひとつの名前から、世界が広がる。</span>
      <span>
        © {new Date().getFullYear()} NAMAE ·{" "}
        <a href="/flags/ATTRIBUTION.txt">Flags: Twemoji / CC BY 4.0</a>
      </span>
      <span className="footer-links">
        <Link href="/sources">データ出典</Link>
        <Link href="/privacy">プライバシー</Link>
        <Link href="/legal">利用上の注意</Link>
      </span>
    </footer>
  );
}
export function Home({
  initialType = "given_name",
}: {
  initialType?: NameType;
}) {
  return (
    <>
      <main className="home">
        <section className="intro">
          <div className="eyebrow">
            <span className="live-dot" /> YOUR PARALLEL NAME
          </div>
          <h1>
            もし海外で
            <br />
            生まれていたら、
            <br />
            あなたは<span className="accent">何という名前？</span>
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
          <p className="privacy">♧ 入力情報は保存・送信されません</p>
        </section>
      </main>
      <section id="how" className="how">
        <div>
          <span className="eyebrow">HOW IT WORKS</span>
          <h2>
            名前で見つける、
            <br />
            もうひとつの世界。
          </h2>
        </div>
        <div>
          <span className="step-number">01</span>
          <h3>あなたの名前を教えて</h3>
          <p className="record-meta">
            下の名前、または苗字を入力。
            <br />
            登録なし、無料で楽しめます。
          </p>
        </div>
        <div>
          <span className="step-number">02</span>
          <h3>同じ人気度でつながる</h3>
          <p>
            各国のランキングから、
            <br />
            日本と同じ順位の名前を探します。
          </p>
        </div>
        <div>
          <span className="step-number">03</span>
          <h3>世界のあなたをシェア</h3>
          <p>
            結果をストーリーサイズで保存。
            <br />
            友達の名前も、見てみよう。
          </p>
        </div>
      </section>
      <p className="data-note">
        日本と海外{getCountryConfig().length - 1}か国の公開ランキングと名前辞書で診断します。
      </p>
    </>
  );
}
function NameForm({ initialType }: { initialType: NameType }) {
  const [type, setType] = useState(initialType);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [reading, setReading] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const destinationCountries = ["US", "GB", "FR", "KR", "DE"];
  const { setResult } = useContext(ResultContext);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    loadInputData(type)
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
  }, [type, loadAttempt]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await loadInputData(type);
      const input = {
        name,
        type,
        destinationCountries,
        ...(type === "given_name"
          ? { gender, ...(reading ? { reading } : {}) }
          : {}),
      };
      const givenNameRecord =
        type === "given_name" ? getNameRecord(input) : undefined;
      let surnameRecord: ReturnType<typeof getSurnameRecord>;
      if (
        type === "given_name" &&
        (!givenNameRecord || givenNameRecord.isEstimated)
      ) {
        await loadInputData("surname");
        surnameRecord = getSurnameRecord(name);
      }
      await loadDiagnosisData(
        surnameRecord ? "surname" : type,
        destinationCountries,
      );
      const result = surnameRecord
        ? {
            ...diagnose({ name, type: "surname", destinationCountries }),
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
  const readings = surname ? [] : getReadingOptions(name, gender);
  const needsReading =
    !surname && (/\p{Script=Han}/u.test(name) || readings.length > 1);
  return (
    <form onSubmit={submit} className="glass form-card">
      <div className="form-heading">
        <span className="mini-star">✳</span>
      </div>
      <h2>世界のあなたに、会いにいこう。</h2>
      <p className="muted">まずは、何を診断しますか？</p>
      <div className="tabs" aria-label="診断の種類">
        {(["given_name", "surname"] as const).map((t) => (
          <button
            type="button"
            key={t}
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
            {t === "given_name" ? "下の名前" : "苗字"}{" "}
            <span>{type === t ? "↗" : ""}</span>
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor="name">
        あなたの{surname ? "苗字" : "名前"}
        <span>漢字・ひらがな・カタカナ・英字</span>
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
        placeholder={surname ? "例：佐藤" : "例：はると"}
        maxLength={30}
        autoComplete="off"
        required
        aria-describedby={error ? "form-error" : undefined}
      />
      <div className="examples">
        試してみる：
        {(surname
          ? ["佐藤", "鈴木", "山田"]
          : ["じゅん", "れん", "さくら"]
        ).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setName(n);
              setReading("");
              if (n === "ゆい" || n === "さくら") setGender("female");
              else if (!surname) setGender("male");
              setError("");
            }}
          >
            {n}
          </button>
        ))}
      </div>
      {needsReading && (
        <div className="reading-field">
          <label className="field-label" htmlFor="reading">
            名前の読み方
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
          <legend className="field-label">ランキングの性別</legend>
          <div className="gender-options">
            {(["male", "female"] as const).map((g) => (
              <label key={g}>
                <input
                  type="radio"
                  name="gender"
                  value={g}
                  checked={gender === g}
                  onChange={() => {
                    setGender(g);
                    setReading("");
                  }}
                />
                <span>{g === "male" ? "男性" : "女性"}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {(error || dataError) && (
        <div className="form-error-row">
          <p id="form-error" role="alert" className="error">
            {error || dataError}
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
              データを再読み込み ↻
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
          ? "診断データを読み込み中…"
          : `世界の${surname ? "苗字" : "名前"}を見る`} {dataReady && !busy && <span>↗</span>}
      </button>
      <p className="form-caption">Same popularity. Different country.</p>
    </form>
  );
}
export function Results() {
  const { result, setResult } = useContext(ResultContext);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [countryUpdateBusy, setCountryUpdateBusy] = useState(false);
  const [countryUpdateError, setCountryUpdateError] = useState("");
  const selectedCountries = result
    ? (result.input.destinationCountries?.filter((code) => code !== "JP") ??
      result.matches.map(({ country }) => country.code))
    : [];

  async function updateDestinationCountries(nextCountries: string[]) {
    if (!result || countryUpdateBusy) return;
    if (nextCountries.length < 1) {
      setCountryUpdateError("表示する国を1か国以上選んでください。");
      return;
    }
    if (nextCountries.length > 8) return;
    setCountryUpdateBusy(true);
    setCountryUpdateError("");
    try {
      await loadDiagnosisData(result.input.type, nextCountries);
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
        error instanceof Error
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
      setStatus(
        await (kind === "save" ? saveResult(result) : shareResult(result)),
      );
    } catch (e) {
      setStatus(
        e instanceof Error && e.name === "AbortError"
          ? "共有をキャンセルしました。"
          : "処理できませんでした。画像保存をもう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="results">
      <div className="result-heading">
        <span className="eyebrow">YOUR PARALLEL NAME</span>
        <h1>世界には、こんなあなたがいる。</h1>
      </div>
      {result.autoDetectedFrom && (
        <p className="mode-notice" role="status">
          「{result.input.name}」は下の名前の対象ランキングになく、苗字データに一致したため、苗字として診断しました。
        </p>
      )}
      <section className="glass original">
        <div>
          <span className="eyebrow">
            YOUR {result.input.type === "surname" ? "SURNAME" : "NAME"} · JAPAN{" "}
            <Flag code="JP" label="日本" />
          </span>
          <h2>{result.input.name}</h2>
          <p>
            {result.input.type === "given_name"
              ? `${result.input.gender === "male" ? "男性" : "女性"} · `
              : ""}
            {result.record?.isEstimated
              ? "公開ランキングの掲載傾向から推定"
              : result.meta.dataYear
                ? `${result.meta.dataYear}年の調査を使用`
              : "調査年度不明のデータを使用"}
            {result.input.reading ? ` · 読み：${result.input.reading}` : ""}
          </p>
        </div>
        <div className="rank">
          <span>
            日本での人気度{" "}
            <small>
              {result.meta.isSample
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
                ? "公開順位なし"
                : "データ未収録"}
          </strong>
          <small>
            {result.record
              ? `${result.record.totalEntries.toLocaleString("ja-JP")}件の中での順位`
              : result.recognition === "dictionary"
                ? "名前辞書には収録されています"
                : "入力表記・読みをご確認ください"}
          </small>
        </div>
        <div className="rarity">
          <span>
            Rarity Score <small>推定</small>
          </span>
          <b>
            {result.record ? result.score : "—"}
            <small>{result.record ? " / 100" : " 算出不可"}</small>
          </b>
          <div className="meter">
            <span style={{ width: `${result.record ? result.score : 0}%` }} />
          </div>
          <small>一般的 ← → 珍しい</small>
        </div>
      </section>
      <div className="result-subtitle">
        <h2>
          もし
          {result.input.type === "surname"
            ? "海外の苗字だったら"
            : "海外で生まれていたら"}
          …
        </h2>
        <span>IF YOU WERE BORN IN…</span>
      </div>
      <details className="result-country-picker">
        <summary>
          <span>
            表示する国 <small>{selectedCountries.length}/8か国</small>
          </span>
          <span className="result-country-summary">
            {selectedCountries
              .map((code) => getCountryConfig(code)[0]?.nameJa)
              .filter(Boolean)
              .join("・")}{" "}
            <b>国を追加・変更 ＋</b>
          </span>
        </summary>
        <div className="result-country-options" aria-busy={countryUpdateBusy}>
          {getCountryConfig()
            .filter((country) => {
              if (country.code === "JP") return false;
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
                    <Flag code={country.code} label={country.nameJa} />
                    {country.nameJa}
                  </span>
                </label>
              );
            })}
        </div>
        <p className="result-country-hint">
          {countryUpdateBusy
            ? "国別データを更新しています…"
            : "最大8か国まで選べます。チェックした国のランキングを表示します。"}
        </p>
        {countryUpdateError && (
          <p className="error" role="alert">
            {countryUpdateError}
          </p>
        )}
      </details>
      <div className="match-grid">
        {result.matches.map(({ country, record }, i) => (
          <article
            className="glass match-card"
            key={country.code}
            style={{ animationDelay: `${i * 65}ms` }}
          >
            <div className="match-top">
              <span className="flag">
                <Flag code={country.code} label={country.nameJa} />
              </span>
              <span>
                {country.nameEn}
                <small>{country.nameJa}</small>
              </span>
              <span className="match-index">0{i + 1}</span>
            </div>
            <h3>{record.name}</h3>
            <div className="match-bottom">
              <span>
                現地ランキング <b>#{record.rank}</b>
              </span>
              <span>
                {result.record
                  ? record.rank === result.record.rank
                    ? "日本と同じ順位"
                    : "収録範囲内の近い順位"
                  : "参考候補"}
              </span>
            </div>
            <p className="match-source">
              {record.year ? `${record.year}年 · ` : ""}
              {getCountryConfig(country.code) &&
              result.matches.find((m) => m.country.code === country.code)?.meta
                .isSample
                ? "サンプル"
                : "公開データ"}
            </p>
          </article>
        ))}
      </div>
      <div className="result-actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => action("save")}
        >
          ↓ 結果を画像保存
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => action("share")}
        >
          ↗ シェア
        </button>
        <Link className="again" href="/">
          もう一度診断 ↻
        </Link>
      </div>
      <p className="status" role="status">
        {status || "ストーリーにぴったりの9:16画像で保存できます。"}
      </p>
      <details className="data-details">
        <summary>
          診断のしくみ・データについて <span>＋</span>
        </summary>
        <p>
          日本の下の名前は、ベビーカレンダーの2017年以降の名前ランキング検索と明治安田の名前調査を使用します。公開順位がある読みは最新の実順位を表示し、未掲載の読みは公開ランキングへの掲載実績、一般名辞書への収録、漢字表記数から総合順位を推定します。日本の苗字は公開辞書の推定人数順です。海外の下の名前と苗字は各国の公開ランキングから取得できる範囲を使用します。
        </p>
        <p>
          海外の下の名前は各国の公開ランキングから取得できる範囲を収録し、日本の順位番号と同じ順位を優先して対応させます。同数順位は掲載順を連番化しています。国ごとの収録上限を超える場合は収録範囲内で最も近い順位を表示します。Rarity
          Scoreは日本側の順位に基づく補助値です。
        </p>
        <p>
          名前辞書は男性5,578読み・女性3,294読み、苗字は1,999件を収録しています。辞書にある下の名前には推定順位を付けるため、一般的な名前から少し珍しい名前まで診断できます。漢字に複数の読みがある場合は入力時に選択できます。
        </p>
        {[result.meta, ...result.matches.map((m) => m.meta)].map((meta) => (
          <p key={meta.country}>
            {getCountryConfig(meta.country)[0]?.nameJa}：
            {meta.sourceUrl ? (
              <a href={meta.sourceUrl} target="_blank" rel="noreferrer">
                {meta.source} ↗
              </a>
            ) : (
              meta.source
            )}{" "}
            / {meta.dataYear || "年度不明"} /{" "}
            {meta.isSample ? "サンプル" : "公開データ"}
          </p>
        ))}
        <p>
          入力情報はメモリ内だけで処理し、サーバー・外部AIへ送信しません。シェア操作をした場合のみ、選択した共有先に結果を渡します。
        </p>
      </details>
    </main>
  );
}
