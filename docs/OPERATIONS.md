# NAMAE 運用手順

## ブランチと公開

- `develop`: 日常の開発と検証。変更はこのブランチへpushする。
- `main`: 本番公開候補。`develop`からPull Requestを作り、CI成功とデータ品質レポートの確認後にマージする。
- ホスティング側では`main`だけを本番へ公開する。プレビュー公開はPull Request単位で行う。

本番ビルドにはNode.js 24を使用する。`NEXT_PUBLIC_SITE_URL`には本番URLを設定する。障害収集先を使う場合だけ`NEXT_PUBLIC_MONITORING_ENDPOINT`を設定する。

## データ更新

1. 取得スクリプトを実行し、`data-sources/`の原本と`src/data/`の整形結果を更新する。
2. `npm run data:sanitize`を実行する。
3. `npm run data:check`を実行し、`reports/data-quality.md`の件数差分、文字体系、警告を確認する。
4. 意図した変更なら`npm run data:accept`で品質基準を更新する。
5. `npm run data:build`でSQLiteとハッシュ付き公開JSONを生成する。
6. `npm test && npm run lint && npm run build && npm run test:browser`を実行する。
7. 原本、整形データ、品質基準、公開JSONを同じコミットに含める。SQLiteはOS差によるバイナリ差分を避けるためGit管理せず、各ビルドで再生成する。

10%以上の件数減少、文字体系の混入、空データ、国・種別の不一致は品質検査で停止する。公開JSONは一時ディレクトリで生成してから入れ替えるため、生成途中のファイルは公開対象にならない。

## 出典とライセンス

`data-sources/SOURCES.json`を出典台帳とする。新しい出典にはURL、対象データ、ライセンスURL、帰属表示、再配布確認状態を登録する。

`npm run licenses:check`は確認中の出典がある間は失敗する。`main`へのpushでも同じ検査を実行する。提供元の明示的な許可または専門家による確認を得た後だけ、`redistributionStatus`を`permitted`へ変更する。

## 監視

GitHubリポジトリのActions variablesに`PRODUCTION_URL`を登録すると、`.github/workflows/monitor.yml`が毎時トップページ、データマニフェスト、全データファイルの到達性を確認する。失敗通知はGitHub Actionsの通知設定で受け取る。

クライアント障害収集を使う場合、同じオリジンまたは信頼できる収集先を`NEXT_PUBLIC_MONITORING_ENDPOINT`へ設定する。送信するのは障害コード、ページパス、発生時刻、データ種別だけで、入力名・読み・結果・例外本文・スタックは含めない。

## 障害対応とロールバック

1. GitHub Actionsのhealth checkとホスティングの状態を確認する。
2. データ障害なら`public/data/manifest.json`の`dataVersion`を記録する。
3. 直前の正常な本番デプロイへホスティング側でロールバックする。
4. Gitでは原因コミットを`git revert`し、Pull Request経由で`main`へ反映する。
5. データ障害は品質検査へ再現ケースを追加してから再公開する。

入力内容はログへ記録しない。障害の記録にはデータバージョン、発生時刻、影響ページ、HTTP状態、復旧コミットだけを残す。

## バックアップ

Gitのタグと本番デプロイを復旧点とする。本番公開ごとに`release-YYYY-MM-DD-N`形式のタグを作成する。SQLiteと公開JSONはソースから再生成できるため、原本と出典台帳を必ず同じリポジトリで保持する。
