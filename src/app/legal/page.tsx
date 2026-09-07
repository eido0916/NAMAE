import type { Metadata } from "next";

export const metadata: Metadata = { title: "利用上の注意・免責｜NAMAE" };

export default function LegalPage() {
  return (
    <main className="policy-page">
      <span className="eyebrow">TERMS &amp; DISCLAIMER</span>
      <h1>利用上の注意・免責</h1>
      <section>
        <h2>サービスの性質</h2>
        <p>
          NAMAEは名前ランキングを使って文化の違いを楽しむ診断サービスです。本人確認、戸籍、命名、法律、医療その他の専門的判断には利用できません。
        </p>
      </section>
      <section>
        <h2>データ</h2>
        <p>
          国ごとに調査年度、対象人数、集計方法、収録上限が異なります。公開順位のない名前には推定値を表示する場合があります。データの正確性、完全性、継続提供を保証しません。
        </p>
      </section>
      <section>
        <h2>変更と停止</h2>
        <p>
          データの訂正、提供元の条件変更、保守または障害に応じて、サービスの内容を変更または停止する場合があります。
        </p>
      </section>
      <p>制定日：2026年9月7日</p>
    </main>
  );
}
