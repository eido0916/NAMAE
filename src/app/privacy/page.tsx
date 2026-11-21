import type { Metadata } from "next";

export const metadata: Metadata = { title: "プライバシーポリシー｜NAMAE" };

export default function PrivacyPage() {
  const staticRelease = process.env.NEXT_PUBLIC_NAMAE_RELEASE === "1";
  return (
    <main className="policy-page">
      <span className="eyebrow">PRIVACY</span>
      <h1>プライバシーポリシー / Privacy</h1>
      <section lang="en">
        <h2>Privacy in English</h2>
        <p>Name matching runs in your browser. We do not save your input name, reading or selected gender to our server, cookies or localStorage. Results disappear on reload.</p>
        {staticRelease && <p>Search downloads static index files shared by many names. Those file requests can appear in hosting access logs. They contain a group identifier and the selected country and name type.</p>}
        <p>Saving or sharing generates an image only when you press the corresponding button and passes it to your device or chosen sharing destination.</p>
        <p>If optional monitoring is enabled, it sends failure categories, time and page path, excluding names, readings, results, error messages and stack traces.</p>
        {staticRelease ? <p>Opening name details loads reviewed public data. Following a source link opens an external website. Reading suggestions are generated in your browser.</p> : <p>Opening name details loads stored public data. If live collection is enabled and details are missing, the destination country, name type and converted name are sent to our collector and looked up on Wikidata. Collected public information and matching status are stored for reuse. Images connect to their providers. Reading suggestions are generated locally.</p>}
        <p>Updated: 17 October 2026. This policy may change as the service changes.</p>
      </section>
      <section>
        <h2>入力した名前</h2>
        <p>
          診断処理はブラウザー内で行います。入力した名前、読み方、選択した性別をサーバー、Cookie、localStorageへ保存しません。結果はページを再読み込みすると消えます。
        </p>
        {staticRelease && <p>検索時は、複数の名前で共用する静的索引ファイルを取得します。ファイルの識別子と選択した国・地域、名・姓の種別は、配信事業者のアクセスログに残ることがあります。</p>}
      </section>
      <section>
        <h2>画像保存と共有</h2>
        <p>
          利用者が保存または共有ボタンを押した場合だけ、ブラウザーが結果画像を生成し、端末または選択した共有先へ渡します。
        </p>
      </section>
      <section>
        <h2>障害情報</h2>
        <p>
          運営者が監視機能を有効にした場合、データ読込失敗や画面表示失敗の種類、発生時刻、ページのパスを収集します。入力した名前、読み方、診断結果、エラーメッセージ、スタックトレースは送信しません。
        </p>
      </section>
      <section>
        <h2>名前の詳細情報</h2>
        {staticRelease ? <p>結果カードを開くと、確認済みの公開データを読み込みます。出典リンクを開くと外部サイトに移動します。</p> : <>
          <p>人物情報が未収録で自動収集が有効な場合は、変換先の国・名前の種類・変換後の名前を収集機能へ送り、Wikidataで調べます。収集した公開情報と照合状態を保存して再利用します。</p>
          <p>画像がある場合は画像提供元へ接続します。</p>
        </>}
        <p>読み方の目安はブラウザー内で生成します。変換のために名前を外部APIへ送信しません。</p>
      </section>
      <section>
        <h2>改定</h2>
        <p>サービス内容の変更に応じて本方針を更新します。制定日：2026年9月7日／最終改定：2026年10月17日</p>
      </section>
    </main>
  );
}
