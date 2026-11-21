import type { Metadata } from "next";
import provenance from "../../../data-sources/SOURCES.json";

export const metadata: Metadata = { title: "データ出典・ライセンス｜NAMAE" };

export default function SourcesPage() {
  const staticRelease = process.env.NEXT_PUBLIC_NAMAE_RELEASE === "1";
  return (
    <main className="policy-page">
      <span className="eyebrow">DATA &amp; LICENSES</span>
      <h1>データ出典・ライセンス / Data sources</h1>
      <section>
        <h2>順位の見方 / Understanding ranks</h2>
        <p>NAMAEは、国・地域別の出生登録や頻度資料、国籍・出生地・居住地が記録された公開人物の名前を使います。複数の資料を統合したアプリ内順位には、資料ごとの収録範囲や時期が反映されます。</p>
        <p>比較先の同順位に名前がない場合は、両方のリストで上位からの割合が最も近い名前を「#○相当」と表示します。入力した名前や比較先に使用を確認できるデータがなければ「データなし」と表示します。</p>
        <p lang="en">NAMAE ranks names recorded in country-level birth or frequency data and in public records of people with documented citizenship, birthplace or residence. Comparisons use the same rank when available and the closest position as a share of the list otherwise. Coverage and dates vary by source.</p>
        <p lang="en">The sources below list attribution, covered datasets and licensing links. “利用条件を確認済み” means conditions reviewed; “再配布条件を確認中” means redistribution review is pending. Pending sources require review before public release.</p>
      </section>
      <div className="source-list">
        <section className="glass source-item">
          <h2>名前の詳細情報：Wikidata</h2>
          <p>人物・キャラクターと名前の関係、日本語の読み方の一例に利用しています。構造化データはCC0で提供され、各項目に出典リンクを表示します。未確認の関連付けは公開しません。</p>
          {staticRelease ? <p>詳細には、照合済みの人物・作品情報がある場合に掲載します。</p> : <p>自動収集が有効な場合、未収録の名前は詳細画面を開いた時に調べ、保存して再利用します。</p>}
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
      {!staticRelease && <p className="policy-note">
        「再配布条件を確認中」のデータは、一般公開前に提供者への確認または利用条件の法務確認が必要です。
      </p>}
      <section id="corrections">
        <h2>データの訂正 / Data corrections</h2>
        <p>誤りを見つけた場合は、結果に出た国・地域、名か姓か、候補の表記と出典をお知らせください。入力した名前や読み方は不要です。</p>
        <p lang="en">Include the destination, name type, spelling shown and source. Leave out your own name and reading.</p>
        <p><a href="https://github.com/eido0916/NAMAE/issues/new">GitHubで報告 / Report on GitHub ↗</a></p>
      </section>
    </main>
  );
}
