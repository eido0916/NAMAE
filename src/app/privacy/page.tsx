import type { Metadata } from "next";

export const metadata: Metadata = { title: "プライバシーポリシー｜NAMAE" };

export default function PrivacyPage() {
  return (
    <main className="policy-page">
      <span className="eyebrow">PRIVACY</span>
      <h1>プライバシーポリシー</h1>
      <section>
        <h2>入力した名前</h2>
        <p>
          診断処理はブラウザー内で行います。入力した名前、読み方、選択した性別をサーバー、Cookie、localStorageへ保存しません。結果はページを再読み込みすると消えます。
        </p>
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
        <h2>改定</h2>
        <p>サービス内容の変更に応じて本方針を更新します。制定日：2026年9月7日</p>
      </section>
    </main>
  );
}
