# Ranking source cache

- `jp-baby-calendar.json`: [ベビーカレンダー 名前ランキング検索](https://baby-calendar.jp/nazuke/)で公開されている2017年以降の読み順位。`scripts/import-baby-calendar.mjs` が一般名リスト、既存の明治安田読み順位、回帰確認名の和集合を小さなバッチで取得します。
- `jp-YYYY.json`: 明治安田の年度別読み方ランキング。
- `jp-spelling-YYYY.json`: 明治安田の年度別漢字表記ランキング。
- `us-YYYY.txt`: 米国SSA Baby Names公開データのミラー。

サイトで表示する順位は各提供元の調査対象内の順位です。全国民の人口順位を示すものではありません。取得元URLと取得日は生成JSONおよびアプリ内のデータ説明に保持します。
