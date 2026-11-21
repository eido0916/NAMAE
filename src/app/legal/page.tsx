import type { Metadata } from "next";

export const metadata: Metadata = { title: "利用上の注意・免責｜NAMAE" };

export default function LegalPage() {
  return (
    <main className="policy-page">
      <span className="eyebrow">TERMS &amp; DISCLAIMER</span>
      <h1>利用上の注意・免責 / Terms</h1>
      <section lang="en">
        <h2>Terms in English</h2>
        <p>NAMAE is an entertainment service for exploring names across cultures. Do not use it for identity verification, official records, naming decisions or professional advice.</p>
        <p>NAMAE uses app rankings that include estimates. Published positions are prioritized, and gaps are filled using public name records and dictionaries. Unlisted local-script inputs may receive a deterministic estimated position that is not a measured frequency. If no matching position is available, we show no data. The method and credits are explained on the data sources page. Equal ranks do not guarantee equal popularity or population shares. Accuracy, completeness and continued availability are not guaranteed.</p>
        <p>We may correct, change or suspend the service due to source conditions, maintenance or failures. Updated: 18 October 2026.</p>
      </section>
      <section>
        <h2>サービスの性質</h2>
        <p>
          NAMAEは名前ランキングを使って文化の違いを楽しむ診断サービスです。本人確認、戸籍、命名、法律、医療その他の専門的判断には利用できません。
        </p>
      </section>
      <section>
        <h2>データ</h2>
        <p>
          表示する順位は、国・地域ごとの統計や公開人物の使用記録に基づくアプリ内順位です。同順位が未収録の場合は、比較先の名前リストで上位からの割合が最も近い名前を表示します。詳しい方法とクレジットは出典ページに記載しています。同順位は同じ人口割合・人気度を保証しません。データの正確性、完全性、継続提供を保証しません。
        </p>
      </section>
      <section>
        <h2>変更と停止</h2>
        <p>
          データの訂正、提供元の条件変更、保守または障害に応じて、サービスの内容を変更または停止する場合があります。
        </p>
      </section>
      <p>制定日：2026年9月7日／最終改定：2026年10月18日</p>
    </main>
  );
}
