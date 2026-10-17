# 世界の名前の詳細情報

## 構成と既存機能の維持

Next.js 16.3.4 / React 19.2.8 / TypeScript。`output: 'export'` の静的ビルドを維持します。既存の `data/namae.sqlite` はランキング更新時に再生成されるため、詳細情報は同じSQLite技術の **`data/name-details.sqlite`** に分離しています。未収録人物の初回収集は既存のNode配信サーバーに追加します。追加の有料API・DBサービス・音声再生はありません。

調査時点の `src/data/countries.json` は144か国です。ランキングは `src/data/<国>/<given-name|surname>/*.json`、参考辞書は `src/reference-data/index.json` から参照するJSON。管理用SQLiteの `ranking_entries` / `reference_entries` へ統合されています。名前・姓を `given_name` / `surname`、名前のランキングを性別・年度・順位基準別に管理します。現在のUIは生年入力なし、エンジンには年度指定機能があります。`src/lib/engine.ts` の順位一致・近い順位・参考辞書へのフォールバックは変更していません。

複数国の結果一覧を維持し、各カードのボタンで `<dialog>` を開きます。タップ後にだけ同一オリジンのJSONを取得し、人物・キャラクター各3件まで表示します。Escape、閉じるボタン、背景タップ、フォーカス復帰、モバイルスクロール、失敗時の再読込に対応。詳細情報がない場合も結果の名前・国を表示します。

既存サイトには実行時APIはなく、保存済み情報は公開JSONから読みます。今回 `npm start` のNodeサーバーに、未収録情報だけを収集するAPIを追加しました（以下参照）。国／名前種別／64バケットで分割し、内容ハッシュ付きファイルをマニフェストから参照します。バケットは入力名そのものをURLに含めません。マニフェストと直近64分割をメモリキャッシュし、失敗した要求は再試行できます。旧ハッシュファイルは古いマニフェストを持つクライアントのため維持します。

## 全143か国・全収録名の初回収集

`npm start` は静的ビルドを配信しつつ、`POST /api/name-details` に対応します。人物が未収録の詳細を開いた時だけ、変換後の国・名前・名姓種別を送り、既存ランキング／参考辞書の全件に対して入力を検証します。上位100件／500件という制限はありません。変換処理からは分離し、日本側の入力名・性別は送りません。

保存済み人物は即表示。初回は202で収集状況を返し、画面は状態を確認して完了時に表示します。サーバーは直列キュー（最大24件）、同一名の要求統合、1.2秒以上のジョブ間隔、4分の子プロセス上限、失敗後5分の待機を設けます。閉じても収集は継続します。ブラウザーは最大60回の状態確認後に開き直す案内へ切り替えます。完了・該当なし・確認待ちはDBで30日再利用し、ブラウザー側にも直近128件を保持します。再起動後は保存済み状態を再利用し、中断ジョブは次回再開します。

新しい照合ではP1705（元の表記）とP407（名前の言語）も確認します。英語のOliviaと、英語表示ラベルだけがOliviaで元はギリシャ文字の名前を区別します。元表記と言語の明確な根拠がある項目を優先し、同程度の候補が残れば保留します。ラテン文字への翻字は、当該国の言語に対応した元表記とWikidataの英語主ラベルの一致を確認できる場合だけ候補にできます。名の一致はP735、姓はP734を必ず再確認します。対象国籍を最優先にし、その中でフルネームの先頭にも対象の名がある人物を優先します。ミドルネームだけの一致も登録されている姓名を明記して区別できます。

`NAMAE_LIVE_DETAILS=0` で自動収集を停止できます。`npm start` は `.env` を読みます。User-Agentは `WIKIDATA_USER_AGENT` を優先し、省略時は本プロジェクトURLとリポジトリの連絡先を指定します。バッチCLIは従来どおり環境変数をシェルから渡します。収集用サーバーと別のバッチ収集を同時に実行しないでください。起動中にCLIでDBを更新した後、ブラウザーで反映するにはページを読み直します。

単一名の先行収集は次のとおりです。`--refresh-job` はジョブを再評価しますが、応答キャッシュは再利用します。

```powershell
node scripts/collect-name-details.mjs --countries GB --type given_name --name Olivia --refresh-job
npm.cmd run details:build
npm.cmd run details:backup
```

純粋な静的ホスティングにはNode APIがないため、自動収集は動きません。その場合も保存済み情報・読み方・Wikipedia検索への導線は表示します。全収録名を検索対象にできることと、すべての名前に実在の著名人が存在することは異なります。未確認の人物を創作したり、別名の人物で埋めたりはしません。状態は未収録・収集中・照合待ち・取得エラーを区別します。

実装: `scripts/name-details/service.mjs`、`scripts/serve.mjs`、`src/lib/name-details.ts`、`src/components/name-details.tsx`。検証: `tests/name-detail-service.test.mjs` は全143か国×名姓2種の未収録名を模擬データで処理し、永続的な該当なしキャッシュ・直列化・要求統合・キュー上限・失敗時の待機を確認します。143か国すべてを実際にWikidataで取得済みという意味ではありません。

追加後の検証は詳細関連単体11件・既存画面を含むブラウザー8件が通過。実サーバーで英国Olivia、フランスMarie、スペインAntonio、米国Albertを確認し、Albertは未収録から初回収集→DB再利用まで検証しました。`reports/name-details-live-smoke.json` に保存しています。「瑛真」（女性）の標準5か国も実データの人物表示を確認し、`reports/name-details-eima-smoke.json` に保存しています。静的ビルド・Lint・TypeScript・キャッシュなしのDB復元も検証しています。

## DB

定義: `scripts/name-details/schema.sql`。初回オープンで作成し、通常のランキングビルドで削除しません。WAL、外部キー、一意制約、トランザクションを使用します。

| テーブル | 内容・キー |
|---|---|
| `names` | 国、表示名、NFKC＋空白整理＋小文字の正規化名、名／姓、言語、日本語読みと出典・確認状態。国＋正規化名＋種類＋言語が一意 |
| `entities` | Wikidata QIDを共通主キーにした人物／キャラクター。姓名の項目IDと表記、国籍、職業、説明、作品、参照先、更新日時、Wikipedia言語版数、画像と利用条件。手動項目は `manual:<識別子>` |
| `name_entities` | 名前ID＋人物／キャラクターIDが一意。関連国、信頼度、確認状態、優先順位、照合根拠JSON、確認者・確認日時 |
| `collection_jobs` | 名前ID単位の `queued / running / complete / missing / pending / error`、試行数、更新日時、エラー、検索根拠 |
| `response_cache` | 応答とエンティティのキャッシュ、取得日時。既定30日再利用 |
| `collection_logs` | 名前ごとの収集過程、時刻、エラー |

人物とキャラクターの共通情報は1行に保存し、国別の名前との関連を別行にします。同じ人物を国ごとに複製しません。`confidence` は照合ルールのスコアで、統計的な正解確率ではありません。

## 収集

Node.js 22.5以上が必要です。まず現在のランキングDBを準備します。

```powershell
npm.cmd run data:build
$env:WIKIDATA_USER_AGENT = 'NAMAE/1.0 (実際のプロジェクトURL; contact: 実際の連絡先)'
npm.cmd run details:pilot
```

`--pilot` は米国・フランス・韓国・ドイツの名を各100件、合計400件対象にします。男女・年度で重複する表記をまとめ、各表記の最小順位の順に選びます。同順位は表記順です。したがって「各性別100件」ではなく「各国の異なる100表記」です。

```powershell
# 国設定を参照して、すべての海外対象国の名・姓をそれぞれ上位500表記
npm.cmd run details:collect -- --type all
# 一部の国だけ
npm.cmd run details:collect -- --countries US,GB,FR,KR --type all --limit 500
# 全件（非常に長い処理。最初はdry-runで件数を確認）
npm.cmd run details:collect -- --type all --limit all --dry-run
npm.cmd run details:collect -- --type all --limit all
# 1回の実行量を制限
npm.cmd run details:collect -- --max-jobs 50
# 90日以上古い完了済み・未確認・未取得も再収集
npm.cmd run details:collect -- --type all --refresh-days 90
```

ランキングがない国はその国の参考辞書から表記順に取得します。データのない国は新しい名前を創作しません。ランキングDBを更新すると、新しい名前も次回実行時に追加されます。

国設定を増やした場合は `npm.cmd run details:flags` で不足する国旗SVGを取得できます。通常ビルドではネットワーク取得せず、既存のTwemojiの帰属表示とCC BY 4.0のライセンスを維持します。

名の項目はWikidataのgiven name分類、姓はfamily name分類を確認し、対象国の言語ラベル・別名との完全一致を調べます。大文字小文字の候補を加えますが、アクセント除去、部分一致、ローマ字への自動変換、複合名の分割はしません。既存ランキングに別名があっても、翻字の等価性が未検証のため自動採用しません。

自動確認済みにするには、対象言語の主ラベルとの一致も必要です。その言語のラベルが省略されている場合は、Wikidata公式の[共通ラベル（mul）](https://www.wikidata.org/wiki/Help:Default_values_for_labels_and_aliases/en)を使います。言語固有のラベルがある場合はそちらを優先し、異なる共通ラベルで一致を上書きしません。別名だけの一致は一意でも未確認に留めます。`details:validate` が保存済みの照合根拠を再確認し、不十分な自動承認を取り下げます。名前項目ごとの候補取得上限は人物12件、キャラクター6件で、画面はそれぞれ3件までです。

人物はP735／P734による結び付きを再確認し、人物または架空のキャラクターの分類、百科事典記事、職業などの文脈も確認します。同じ綴りの名前項目が複数ある場合や情報不足の場合は `pending`。名前項目が曖昧な場合は候補の名前項目IDをジョブに記録し、人物の大量取得は名前の同一性を確認するまで保留します。一意な国別言語の名前項目＋構造化された姓名関係＋記事と文脈を満たす関連を自動確認済みにします。これは各伝記事項を人手で校閲した意味ではありません。国籍一致を候補取得と表示順位の両方で優先し、Wikipedia言語版数は候補の並び順の補助に使います。検索は名前項目あたり上位12件までで、網羅的な人物一覧ではありません。ミドルネームを含む場合があるため、カードに登録されている名・姓も表示します。

既定で1.2秒以上の間隔を空けた直列取得です。HTTPエラー、APIのmaxlag、タイムアウトを最大3回追加試行し、指数バックオフとRetry-Afterを尊重します。Action APIには `maxlag=5` と識別用User-Agentを付けます。SPARQLは20秒、Action APIは45秒でタイムアウトします。キャラクター検索は8秒・追加1回の試行で切り上げ、人物の取得成功を失わず、警告をジョブの根拠とログへ残します。名前ごとにトランザクションで保存するため中断後も再実行可能です。`queued / error / running` を再開し、エラーになった名前は次回1件ずつ再試行して他の名前への影響を抑えます。完了・未確認・未取得は更新期限までは再利用します。ジョブのエラーはDBとレポートを確認してください。収集プロセスは同時に複数起動しないでください。

大規模な全件取得には [Wikidata公式ダンプ](https://www.wikidata.org/wiki/Wikidata:Database_download)を検討してください。本実装は小分けのAPI収集で、公式ダンプを解析する実装は含みません。無制限の全件取得を公共SPARQLサービスに一度に流さない運用が必要です。[データアクセスの案内](https://www.wikidata.org/wiki/Wikidata:Data_access)と[Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API)を参照してください。

## 精度確認・公開

```powershell
npm.cmd run details:review
```

`reports/name-details-pilot.json` は4か国検証の件数・状態、`reports/name-details-collection.json` は通常収集、`reports/name-details-review.json` は各候補の実名・照合根拠・出典、`reports/name-details-unresolved.json` は未完了・未確認・未取得です。`complete` は処理完了を示し、人物の知名度や全候補の人手確認を保証しません。品質は確認済み・未確認・未取得の件数を分けて評価します。

誤りを見つけた場合は手動データで `rejected` にします。手動の承認・却下と、その照合根拠・信頼度・表示優先順位は自動更新で上書きしません。画像の利用条件も個別に確認してください。

```powershell
npm.cmd run details:import
npm.cmd run details:validate
npm.cmd run details:export
npm.cmd run build
```

DBから公開JSONへ出す対象は `name_entities.status='verified'` と確認済みの読みだけです。未確認候補・内部ログ・信頼度の照合根拠は公開JSONに含めません。通常ビルドはネットワーク収集しません。以下のブラウザー内の読み方の目安は、DBの確認済みデータとは別です。

## 手動の読み・キャラクター・校閲

`data-sources/name-details/editorial.json` を編集して `details:import` を実行します。別ファイルは `node scripts/import-name-details.mjs パス` で取り込めます。例の値は説明用です。実在の出典を確認して置き換えてください。

```json
{
  "readings": [{
    "country": "US", "name": "Emma", "type": "given_name", "language": "en",
    "reading": "エマ", "source": "https://www.wikidata.org/wiki/Q541194", "reviewedBy": "確認者"
  }],
  "entities": [{
    "id": "manual:your-character", "kind": "character", "name": "出典にある名前",
    "work": "出典にある登場作品", "description": "出典で確認した短い紹介",
    "source": "https://example.org/replace-with-real-source",
    "updatedAt": "2026-10-17T00:00:00.000Z"
  }],
  "relations": [{
    "country": "US", "name": "Emma", "type": "given_name", "language": "en",
    "entityId": "manual:your-character", "status": "verified", "confidence": 1,
    "reviewedBy": "確認者", "priority": 100,
    "evidence": { "reason": "名であることと正確な表記を出典で確認", "source": "実際の出典" }
  }]
}
```

`image` を追加する場合は `url / license / credit / source` の4項目すべてが必須です。収集した画像URLだけでは表示しません。画像の許諾が不明なら `image` 自体を省略します。人物の `nationalities` は `[{"id":"Q30","name":"アメリカ合衆国"}]`、`occupations` は文字列配列です。

自動取得した名前項目の日本語ラベルは国別の発音を保証しないため `reading_status='pending'` で保存します。国・言語を含めて確認した読みだけを手動承認し、推測値をDBの確認済み読みにしません。音声合成は使用しません。

### 読み方の目安（2026年10月15日追加）

確認済みの読みがない場合、`src/lib/name-reading.mjs` がブラウザー内で参考のカナ表記を生成します。従来の29件だけに限定されず、人物情報のない名前でも表示できます。出典付きの読みが届いた時点でそちらに切り替えます。詳細JSONの読込失敗時も目安は残ります。

英・仏・独・西・葡・伊・蘭語の一般的な名前・姓の候補表を優先し、未収録のラテン文字は言語別の綴りルール、ハングルは音節の分解と一部の連音で変換します。言語を絞れない国のラテン文字は、言語を断定しない一般的な綴り変換です。候補表も含めて手動校閲済みとはみなさず「読み方の目安」として表示し、出典や確認済みの状態を創作しません。この目安を人物照合の根拠やDBの確認済み読みへ流用しません。

漢字・アラビア文字など未対応の文字、数字や混在表記は一部を切り捨てて変換せず「読み方は未確認」と表示します。英語の不規則な綴り、外国由来の名前、多言語の国、ハングルの同化・慣用表記などは誤差があり、ネイティブ発音の保証はありません。音声・有料サービス・追加API通信はありません。

`node scripts/report-name-readings.mjs` で海外143か国の名・姓各上位500表記（ランキングのない場合は辞書）について生成可能数を集計できます。結果は `reports/name-reading-coverage.json`。生成できる割合と、発音の正解率は異なります。

今回の検証では57,030表記中、候補表1,625件・綴り／音節推定55,136件・未対応269件でした。追加後の詳細関連単体テスト8件、詳細画面ブラウザーテスト3件、Lint・TypeScript・静的ビルドが通過。「瑛真」（女性）の標準5か国すべてで、詳細APIの失敗時も読み方の目安が残る回帰テストを含みます。DB構造・収集時の人物照合には変更ありません。

初期データでは29件の読みを確認しています。人物画像は、Commonsの画像ページとライセンス情報を照合したEmma Robertsの写真1件を承認しています（「Nerve」、dominick D、CC BY-SA 2.0）。作者・出典・ライセンスの直接リンクを画面に表示します。それ以外の未確認画像とキャラクター画像はテキスト表示のままです。

## バックアップと更新スケジュール

```powershell
# キャッシュを除いた名前・人物・関係・ジョブの可搬スナップショット
npm.cmd run details:backup
# 新規のDBへ復元してから編集内容を取り込み、公開JSONを生成
npm.cmd run details:restore
npm.cmd run details:build
```

スナップショットは `data-sources/name-details/collected.json`。空のDBにだけ復元し、既存データがある場合は全体をスキップします。名前IDの衝突による誤関連を防ぐため、既存DBへの部分マージはしません。`details:build` も最初にこの復元を実行し、新しいチェックアウトで収集済みデータを再現します。SQLiteファイル自体をバックアップする場合は収集プロセス停止後にWALも考慮してください。ランキングのビルドは詳細DBを消しません。GitではSQLiteを除外し、可搬スナップショットと公開JSONを保存します。

定期更新は既存CI／Windowsタスクスケジューラから、`details:collect -- --type all --max-jobs 100 --refresh-days 30` → `details:review` → 内容確認 → `details:backup` → `details:build` → サイトビルドを順に実行できます。スケジュール登録・外部公開は今回自動実行しません。大量ジョブは複数回に分けます。

環境変数は収集用 `WIKIDATA_USER_AGENT`（必須）、`WIKIDATA_INTERVAL_MS`（省略時1200）、`NAMAE_DETAILS_DB`（省略時 `data/name-details.sqlite`）。これらは `NEXT_PUBLIC_` を付けず、ブラウザーに渡しません。シェルから渡してください。スクリプトは `.env` を自動ロードしません。

## 検証コマンド

```powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
# 開発サーバーまたは静的サーバーがlocalhost:3000で稼働している状態
npx.cmd playwright test tests/browser.spec.ts tests/name-details.browser.spec.ts
```

単体テストは完全一致／異なる文字体系／曖昧候補、名姓・国別分離、人物の重複防止、未確認の非公開、上限3件、国籍優先、画像の許諾ゲート、内容ハッシュ、トランザクションのロールバック、429・maxlag・キャッシュを確認します。ブラウザーテストは複数国表示の既存動作に加え、遅延取得・障害回復・ダイアログ・フォーカス・モバイル幅・読みと人物／作品表示・閲覧時の外部API通信なしを検証します。テストの仮データは公開データに保存しません。

## 主な変更ファイル

| 場所 | 変更内容 |
|---|---|
| `src/components/namae.tsx`, `src/components/name-details.tsx`, `src/app/globals.css` | 結果カードから開く詳細画面とスマートフォン向けの操作・スタイル |
| `src/lib/name-details.ts`, `src/lib/name-detail-key.mjs` | 遅延取得、タイムアウト、キャッシュ、正規化・分割キー |
| `scripts/name-details/schema.sql`, `db.mjs`, `wikidata.mjs` | 専用SQLite、照合ルール、無料APIクライアント |
| `scripts/collect-name-details.mjs` | 既存ランキングと参考辞書からの収集・再開・定期更新 |
| `scripts/import-name-details.mjs`, `validate-name-details.mjs`, `export-name-details.mjs`, `review-name-details.mjs`, `backup-name-details.mjs` | 手動校閲・照合根拠の再確認・公開用生成・監査・バックアップ復元 |
| `data-sources/name-details/` | 出典確認済みの読み・キャラクターと収集済みの可搬スナップショット |
| `public/data/name-details/`, `public/flags/` | 確認済みデータの分割配信と144か国の国旗SVG（Twemoji CC BY 4.0） |
| `reports/name-details-*.json` | 4か国の検証、未確認・未取得、143か国への拡張計画の結果 |
| `tests/name-details.test.mjs`, `tests/name-details.browser.spec.ts`, `tests/browser.spec.ts` | 照合・公開・耐障害性・DB復元・画面テスト。既存テストは未収録名の処理完了を待つ調整 |
| `src/app/sources/page.tsx`, `src/app/privacy/page.tsx` | 出典・画像の利用条件と通信内容の説明 |
| `package.json`, `.env.example`, `.gitignore`, `README.md`, この文書 | 実行コマンド、設定例、運用手順 |

この機能の実装では既存の `src/lib/engine.ts` の変換ロジックとランキングの取り込み処理を変更していません。

## 2026年10月15日の実取得検証

| 国 | 取得処理完了 | 名前の同一性などの確認待ち | 該当なし | 通信エラー |
|---|---:|---:|---:|---:|
| 米国 | 56 | 44 | 0 | 0 |
| フランス | 88 | 12 | 0 | 0 |
| 韓国 | 86 | 12 | 2 | 0 |
| ドイツ | 71 | 29 | 0 | 0 |
| 合計 | 301 | 97 | 2 | 0 |

各国100表記、合計400表記を処理しました。「取得処理完了」は収集ジョブの状態で、すべての伝記の人手校閲や全候補の公開を意味しません。人物・キャラクターの共通テーブルには人物4,407件、キャラクター52件を保存しました。確認済み関連は4か国の自動検証範囲で3,302件です。追加の個別校閲5件を含む全体では確認済み3,307件、未確認1,336件で、未確認関連は公開から除外しています。Emma Robertsの名との関連は、複数の同綴り項目からP735のEmma（Q541194）を個別に確認して承認しました。

海外143か国の名・姓を上位500表記まで選ぶ計画は、57,030表記をネットワークなしで列挙して検証済みです。143か国すべての実取得はまだ実行していません。可搬スナップショットはネットワーク・応答キャッシュなしで復元でき、同一の公開マニフェストを再生成できることを確認しました。SQLite整合性検査は `ok`、外部キー違反は0件です。

単体テストは既存29件＋追加5件、ブラウザーテストは既存4件＋追加2件が通過しています。Lint、TypeScript、静的ビルド、既存のランキング品質検査・公開JSON整合性検査も通過しています。390px幅の実データ画面でEmmaの読み、人物写真の読み込み（655×879）、作者・ライセンスリンク、閲覧時のWikidata通信0件を確認しました。詳細は `reports/name-details-pilot.json`、`reports/name-details-expansion.json`、`reports/name-details-restore.json`、`reports/name-details-image-smoke.json` と照合用レポートを参照してください。

## 詳細画面の言語

画面の説明・読み方の案内・エラー・ボタンは最初に選択した入力元の国・地域の言語を引き継ぐ。比較先の国を開いても画面の言語を変更しない。人物の表示情報も閲覧言語の翻訳があれば利用する。人物名・国籍・職業・作品・説明は保存済みWikidataラベルの現地語、英語、共通表記の順で選ぶ。確認できない説明を機械的に翻訳・推測しない。画面文言が未翻訳の言語も英語を代替表示する。日本語のカナ読みは閲覧言語が日本語の場合に表示する。それ以外の閲覧言語の読みが未収録の場合は、その閲覧言語で未確認と案内し、日本語の説明を混在させない。

翻訳表示用の投影は `entity_localizations` に保存し、APIキャッシュの期限や消去とは独立して保持する。既存DBには追加テーブルを自動作成し、バックアップにも含める。過去のバックアップはこのテーブルを含まなくても復元できる。人物ID・名前との照合根拠・画像の権利情報は変更しない。
