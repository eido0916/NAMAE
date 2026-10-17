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
        <section className="glass source-item">
          <h2>名前の詳細情報：Wikidata</h2>
          <p>人物・キャラクターと名前の関係、日本語の読み方の一例に利用しています。構造化データはCC0で提供され、各項目に出典リンクを表示します。未確認の関連付けは公開しません。</p>
          <p>自動収集が有効な場合、未収録の名前は詳細画面を開いた時に調べ、保存して再利用します。名前の順位による収集上限はありません。同名人物を確認できない場合や照合が曖昧な場合もあり、すべての名前に人物が登録されているわけではありません。</p>
          <p><a href="https://www.wikidata.org/wiki/Wikidata:Licensing">Wikidataの利用条件 ↗</a></p>
          <p>画像は個別のライセンス・クレジット・出典を確認したものだけを掲載します。Wikidataのデータの利用条件と画像の利用条件は別に管理しています。</p>
          <p>「読み方の目安」は、アプリ内の一般的なカナ表記候補、言語別の綴り変換、ハングル音節変換で作成した未確認の参考表記です。出典を確認した読み方とは区別して表示し、実際の発音を保証するものではありません。</p>
        </section>
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
