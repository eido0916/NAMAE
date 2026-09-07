import type { Metadata } from "next";
import provenance from "../../../data-sources/SOURCES.json";

export const metadata: Metadata = { title: "データ出典・ライセンス｜NAMAE" };

export default function SourcesPage() {
  return (
    <main className="policy-page">
      <span className="eyebrow">DATA &amp; LICENSES</span>
      <h1>データ出典・ライセンス</h1>
      <p>
        NAMAEは複数の公開ランキングと名前辞書を整形して利用しています。順位は各提供元の調査対象内の順位です。
      </p>
      <div className="source-list">
        {provenance.sources.map((source) => (
          <section className="glass source-item" key={source.id}>
            <div>
              <h2>{source.name}</h2>
              <span
                className={`license-status ${source.redistributionStatus}`}
              >
                {source.redistributionStatus === "permitted"
                  ? "利用条件を確認済み"
                  : "再配布条件を確認中"}
              </span>
            </div>
            <p>{source.attribution}</p>
            <p className="record-meta">対象：{source.datasets.join(" / ")}</p>
            <p>
              <a href={source.url}>データ提供元 ↗</a> ·{" "}
              <a href={source.licenseUrl}>{source.licenseName} ↗</a>
            </p>
          </section>
        ))}
      </div>
      <p className="policy-note">
        「再配布条件を確認中」のデータは、一般公開前に提供者への確認または利用条件の法務確認が必要です。
      </p>
    </main>
  );
}
