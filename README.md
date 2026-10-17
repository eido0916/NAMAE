# NAMAE

**SAME YOU. ANOTHER WORLD.** 名前・苗字の順位を手がかりに、世界の名前を探すWebアプリです。

144か国・地域の名前を入力元に選択できます。公開統計の順位、推定順位、公開人物の資料内参考順位、順位のない辞書を区別して表示します。国・性別・名姓によって収録範囲は異なります。

## 主な機能

- 国旗付きの国検索：日本語・英語・現地語の国名や国コードで検索。
- 名前・苗字の診断：生年入力なしで標準5か国を比較し、結果画面から比較先を変更。
- 日本語の入力補助：漢字・かな・カタカナ・ローマ字に対応。複数の読みを確認し、苗字に一致する入力を苗字診断へ案内。
- 17言語・19種類の表示：入力元の国に合わせて画面、詳細、共有画像、エラーを切り替え。未対応言語は英語を使用。
- 名前の詳細：読み方の目安、同名の著名人・キャラクター、画像・出典を表示。
- 保存・共有：1080×1920 PNG、Web Share API、コピー・画像保存の代替動作。
- 分割JSON・内容ハッシュ・検索索引による必要なデータだけの取得。

今回の変更は [CHANGELOG.md](CHANGELOG.md) にまとめています。

## 起動

Node.js **24推奨**（最低22.5以上）、npm、Git LFSを使用します。大きなインドの名前辞書はGit LFSで管理します。

```sh
git lfs install
git clone https://github.com/eido0916/NAMED.git
cd NAMED
git switch develop
git lfs pull
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開きます。PowerShellの実行ポリシーでnpmを起動できない場合は `npm.cmd` を使用してください。

本番用の生成・ローカル配信：

```sh
npm run build
npm start
```

`build` は順位・辞書の品質検査、SQLite生成、公開JSON生成、詳細情報の復元・検証・出力、Next.jsの静的ビルドを実行し、`out/` を生成します。通常のビルドは同梱データを使い、ネットワーク収集コマンドとは分かれています。

## 設定・公開

設定例は [.env.example](.env.example) を参照してください。

| 設定 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | ビルド時に設定する本番URL |
| `NEXT_PUBLIC_MONITORING_ENDPOINT` | 任意の障害情報送信先 |
| `NAMAE_LIVE_DETAILS` | Nodeサーバーの初回人物収集。`0` で停止 |
| `WIKIDATA_USER_AGENT` | 収集用のプロジェクトURL・連絡先 |
| `WIKIDATA_INTERVAL_MS` | 収集間隔。既定1200ms |
| `NAMAE_DETAILS_DB` | 詳細情報SQLiteの保存先 |

静的ホスティングには `out/` を配信します。診断と保存済み詳細は静的配信で動作します。未収録人物の初回収集API `POST /api/name-details` は `npm start` のNodeサーバーで提供するため、純粋な静的ホスティングでは利用できません。収集結果を保持するNode環境ではSQLite用の永続ストレージを用意します。

`develop` は開発・検証用、`main` は本番公開候補です。CI・更新・監視・ロールバックは [運用手順](docs/OPERATIONS.md) を参照してください。

## 順位と収録データ

既定の `exactRank` は入力名と同じ順位の海外名を探します。同順位を確認できない場合は近い順位や参考候補であることを表示します。日本の出力候補では保存済みの年度別公開順位も参照し、採用した調査年を表示します。エンジンでは `normalizedRank` と `populationShare` も明示指定できます。

Rarity Scoreは順位と収録件数の比率であり、人口割合ではありません。未収録入力には入力条件のハッシュから再現性のある参考候補を選び、順位を断定しません。

| 種類 | 解釈 |
| --- | --- |
| 公開統計・ランキング | 出典の対象・調査期間内の順位 |
| 推定順位 | 辞書や掲載実績などに基づく推定 |
| 資料内参考順位 | 公開人物の確認記録の集計。一般人口の人気順位とは区別 |
| 順位なし辞書 | 名前の使用例。根拠のない人数・順位は付与しない |

米国の下の名前はSSAの **1880–2020年・141年分**の公開出生登録件数を合算しています。男性42,567件・女性68,905件で、現在の人口順位や最新単年順位ではありません。各国の件数・不足範囲は [収録状況](reports/name-coverage.md)、出典は [出典台帳](data-sources/SOURCES.json) とサイトの `/sources` を参照してください。

## 構成

Next.js 16.3.4 / React 19.2.8 / TypeScript / Tailwind CSS 4 / Node.js SQLite / Playwright。

| パス | 内容 |
| --- | --- |
| `src/app/`・`src/components/` | 画面、国検索、名前詳細 |
| `src/lib/` | 診断エンジン、データ取得、多言語、共有 |
| `src/data/` | 整形済み順位、日本語辞書、国設定 |
| `src/reference-data/` | 参考辞書・資料内参考順位 |
| `data-sources/` | 取得原本、出典、詳細復元用スナップショット |
| `data/` | 管理用SQLite・品質比較基準 |
| `public/data/` | 配信用JSON・索引・マニフェスト |
| `scripts/`・`tests/`・`reports/` | 収集・生成・検証・レポート |

SQLite本体、環境設定、ビルド成果物、作業用キャッシュはGit管理対象外です。

## 更新・検証

```sh
npm run data:build
npm run details:build
npm test
npm run lint
npm run build
# ビルド済みサーバー起動中に実行。ローカルはChrome使用
npm run test:browser
```

CIはNode.js 24とPlaywright Chromiumを使用し、生成データの再現性も確認します。`data:accept` は意図したデータ差分を確認してから実行してください。`generate-sample-data.mjs` は全データを初期サンプルへ戻すため通常運用では使用しません。

| 仕様・手順 | 文書 |
| --- | --- |
| 更新・CI・公開・監視 | [OPERATIONS.md](docs/OPERATIONS.md) |
| 詳細情報・収集API・DB・バックアップ | [NAME_DETAILS.md](docs/NAME_DETAILS.md) |
| 対応言語 | [LANGUAGES.md](docs/LANGUAGES.md) |
| 大量辞書・検索索引 | [MASS_NAME_EXPANSION.md](docs/MASS_NAME_EXPANSION.md) |
| 米国歴史データ・日本の順位対応 | [RANKING_FOLLOWUP.md](docs/RANKING_FOLLOWUP.md) |

## プライバシー・利用条件

診断はブラウザー内で処理し、入力した名前・読み・性別をURL、Cookie、localStorage、サーバーに保存しません。再読み込みすると結果は消えます。詳細の初回収集が有効な場合は、変換後の名前・国・名姓種別を同じサイトの収集APIへ送信します。画像提供元や外部出典を開く場合は外部接続が発生します。詳しくは `/privacy` を参照してください。

データはSSA、U.S. Census、ONS、INSEE、各国統計、ベビーカレンダー、明治安田、Onomaverse、ENAMDICT/JMnedict、WGND 2.0、Wikidataなどに基づきます。利用条件は資料ごとに異なります。国旗はTwemoji（CC BY 4.0）で、謝辞は [ATTRIBUTION.txt](public/flags/ATTRIBUTION.txt) にあります。

再配布条件が確認中の出典が含まれています。`npm run licenses:check` は未解決の出典があると失敗し、`main` push時のCIも同じ確認を行います。公開前に [出典台帳](data-sources/SOURCES.json) の確認状態を解決してください。
