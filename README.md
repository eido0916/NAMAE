# NAMAE

名前・苗字のランキングから海外名を探すNext.js / TypeScriptアプリです。入力情報はブラウザーのメモリ内のみで処理します。ランキングの管理にはビルド時SQLiteを使い、公開サイトは分割JSONだけを配信します。

## 起動

```sh
npm ci
npm run dev
```

http://localhost:3000 を開きます。PowerShellで実行ポリシーによりnpmが起動できない場合は `npm.cmd` を使用してください。`npm run build` で静的な `out/` を生成し、`npm start` でその成果物を配信できます。

## 今回の修正

- 生まれ年を必須入力から外し、現在の人気度を基準に診断する形へ変更。
- ベビーカレンダーの深い読み順位を追加。「じゅん」「れん」「じゅんや」「れんや」など、従来の上位50件では拾えなかった名前にも実順位を表示。
- 日本の名前辞書8,872読みすべてに総合順位レコードを用意。公開順位がない名前は、公開ランキング掲載歴・一般名辞書への収録・漢字表記数を使った推定順位として区別して表示。
- 日本の順位番号をそのまま優先し、各国の公開ランキングから取得できる範囲で同じ順位の海外名を選択。
- 下の名前モードで「はやし」などの苗字に一致した場合は、自動で苗字診断へ切り替えて案内。
- 漢字名に複数の読みがある場合は読みを確認。かな・カタカナ・ローマ字からも照合可能。

## 収録範囲と出典

| データ | 件数・年度 | 用途 |
|---|---|---|
| 日本の総合人気順位 | 男女合計8,872読み（実順位888読み、推定順位7,984読み） | 現在の診断に使用 |
| 日本の深い読み順位 | 2017〜2025年、延べ6,478レコード | 公開検索結果。各読みの最新順位を総合人気順位で優先 |
| 日本の名前辞書 | 男性5,578読み・女性3,294読み、漢字・ローマ字の別表記付き | 入力照合と未掲載名の推定 |
| 日本の漢字表記ランキング | 1920〜2025年、延べ6,863レコード（1,123表記） | 推定順位の掲載実績に使用 |
| 日本の読み方ランキング | 2004〜2025年、延べ2,290レコード | 推定順位の掲載実績に使用 |
| 日本の苗字 | 1,999姓、調査年度不明 | 辞書内の推定人数を降順で順位付け |
| 米国の下の名前 | 2020年、男女各5,000件 | SSA人数順。人数同数は元ファイル順（アルファベット順） |
| 英・仏・韓・独の下の名前 | 英1,537件・仏4,000件・韓4,000件・独1,815件（2024〜2025年） | ONS / INSEE / 韓国出生届集計 / ドイツTop500・補完データ。海外カードの順位対応に使用 |
| 海外の苗字 | 米1,900・英855・仏932・韓100・独378姓 | Onomaverse姓氏頻度を現地文字体系で絞り込み。韓国は2015年国勢調査Top100。日本の順位番号に対応 |

日本の実順位は[ベビーカレンダーの名前ランキング検索](https://baby-calendar.jp/nazuke/)が公開する2017年以降の読み順位を使用し、検索対象に含まれた888読みは最新掲載年の順位を表示します。補助情報には[明治安田の生まれ年別の名前調査](https://www.meijiyasuda.co.jp/enjoy/ranking/index.html)の漢字表記・読み方ランキングを使います。各調査の対象者内の順位であり、全国民の人口順位ではありません。

米国は[SSA](https://www.ssa.gov/oact/babynames/limits.html)の公開データを[hackerb9のミラー](https://github.com/hackerb9/ssa-baby-names)から取得しました。現在は2020年までの収録です。

英国の上位100件は[英国国家統計局（ONS）](https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/babynamesenglandandwalesbabynamesstatisticsgirls)、順位補完には[Onomaverse](https://onomaverse.com/datasets/given-name-frequency)（CC BY 4.0）を使用しています。フランスは[INSEE](https://www.insee.fr/fr/statistiques/8894961)、ドイツは[Beliebte Vornamen Top 500](https://www.beliebte-vornamen.de/jahrgang/j2024/top-500-2024)、韓国は[아기이름の2024年出生届順位](https://baby-name.kr/annalRanking/2024/)を使用しています。

海外の苗字は[Onomaverse Global Surname Frequency](https://onomaverse.com/datasets/surname-frequency)を使用し、韓国は[2015年国勢調査に基づく韓国姓氏Top100](https://koreanlastnames.com/most-common-korean-last-names/)を補完しています。

辞書・苗字は[Japanese Personal Name Dataset](https://github.com/shuheilocale/japanese-personal-name-dataset)（MIT）です。原典とライセンスを `data-sources/japanese-names/` に保存しています。公開順位のない読みでは、同データセットの一般名リストへの収録と別表記数を弱い補助信号として使います。苗字の人数は推定値であり、全国公式統計として扱いません。

## アルゴリズム

`src/lib/engine.ts` にUIから分離しています。既定の `exactRank` は日本の順位番号と同じ順位を海外名から選びます。同数順位は掲載順を連番化しています。国ごとの収録上限を超える入力には、収録範囲内で最も近い順位を表示します。`normalizedRank` と `populationShare` も明示指定で利用可能です。

Rarity Scoreは順位/同じ性別の収録件数×100を四捨五入します。人口割合ではありません。辞書にもない入力は順位を断定せず、海外の下位20%から入力条件のハッシュによる一定の参考候補を選びます。

かな・ローマ字は読みへ正規化します。漢字の読みが一意でない場合は利用者に確認し、選ばれた読みの総合人気順位を表示します。公開検索に最新実順位がある場合はそれを優先し、ない場合だけ推定順位を使用します。

## データ構成

`data-sources/`は取得原本、`src/data/<国>/<種別>/*.json`は整形済みデータです。`npm run data:build` が品質検査後にこれらを `data/namae.sqlite` へ統合し、検証済みの公開用データを `public/data/`へ国・種類別に書き出します。公開JSONのファイル名には内容ハッシュを付け、固定URLのマニフェストだけを再検証します。ブラウザーは最初に日本の照合データだけを読み、診断時に下の名前または苗字のうち必要な海外データだけを取得します。

SQLiteは更新・検証用の単一のデータ源です。公開サイトからSQLiteや外部DBへ接続しないため、Vercelなどへの静的公開でDB利用料はかかりません。

## データ更新

データセットを更新した後は、SQLiteと公開JSONを再生成します。

```sh
npm run data:build
```

`npm run data:check`は文字体系、重複、空データ、順位範囲、件数の急減、出典台帳を検査します。意図した更新を確認した後、`npm run data:accept`で比較基準を更新します。結果は`reports/data-quality.md`に出力されます。

通常のデータ生成とビルドはネットワーク取得せず、同梱データからSQLiteと公開JSONを再生成します。海外ランキングを更新するときは `npm run data:refresh:foreign` と `npm run data:refresh:foreign-surnames`、日本の公開検索結果を更新するときは `npm run data:refresh:baby-calendar` を実行し、その後に `npm run data:build` を実行します。従来の `generate-sample-data.mjs` は全データを初期サンプルに戻すため、通常運用では実行しないでください。

## 検証

```sh
npm test
npm run lint
npm run build
# 開発サーバー起動中・Chromeインストール済み環境で:
npm run test:browser
```

テストは対象4名の実順位、生年なしの診断、日本と海外の順位番号一致、辞書推定順位、漢字・ローマ字対応、苗字対応、読み確認、未収録の再現性を確認します。共有先への実投稿は行いません。

## 公開・画像・プライバシー

`NEXT_PUBLIC_SITE_URL` に本番URLを設定してビルドしてください。Vercelまたは静的ホスティングで配信できます。実行時DB・外部AI API・解析サービスは不要です。

結果は1080×1920 PNGで保存できます。共有はWeb Share APIを使い、非対応時はコピーまたは画像保存にフォールバックします。国旗はTwemoji（CC BY 4.0）。`public/flags/` にライセンスと出典を保存しています。

入力情報をURL・Cookie・localStorage・サーバーに保存しません。再読み込みすると結果は消えます。利用者が共有操作をした場合のみ共有先に結果を渡します。

データ出典は`data-sources/SOURCES.json`で管理し、サイトの`/sources`に表示します。再配布条件が確認中の出典は`npm run licenses:check`と本番ブランチのCIで公開を停止します。運用、更新、監視、ロールバックの手順は[docs/OPERATIONS.md](docs/OPERATIONS.md)にまとめています。
