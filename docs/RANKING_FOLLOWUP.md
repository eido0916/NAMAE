# 順位対応の拡張と結果画面の整理

米国の下の名前はSSA公開の出生登録件数を1880–2020年の141年分に拡張した。最新単年順位や現在の人口順位として扱わない。男女別に公開件数を合算し、降順・同人数は名前順で連番にする既存仕様を維持する。

SSAのZIPはこの環境では403だったため、SSA原本を保持する `hackerb9/ssa-baby-names` の固定コミット `0b1a1316457d55447d1a1f7bfe57ee15e53cc2f0` の `alldata.txt` を使用した。取得先とgzipのSHA-256は `data-sources/rankings/foreign/us-ssa-all-data.meta.json` に保存。1989–2020年は既存の年別原本を優先し、ミラーの同じ年は加算しない。重複・欠損年・不正件数・既存表記の欠落を検出すると停止する。`npm run data:refresh:us-historical` で再取り込みできる。共通の公式データ再取り込みも、このキャッシュが存在する場合は拡張後の期間を維持する。

スウェーデン・フィンランド・デンマーク・ノルウェー・ポーランド・オーストリアは次で再集計する。

```powershell
node scripts/collect-observed-name-rankings.mjs --direct-geography --countries=SE,FI,DK,NO,PL,AT
node scripts/import-observed-name-rankings.mjs --countries=SE,FI,DK,NO,PL,AT --require-direct-geography --report=reports/ranking-followup-observations.json
node --max-old-space-size=3072 scripts/import-global-reference-names.mjs --countries=SE,FI,DK,NO,PL,AT,US
node scripts/report-ranking-followup.mjs
npm run build
```

デンマークは国と王国双方の国籍記録を照合し、同じ人物IDを重複集計しない。公開人物の資料内参考順位は全国順位と区別し、根拠のない名前に推定順位を追加しない。

結果画面から入力の調査説明、各カードの根拠・出典の展開欄、長い診断方法の説明を削除した。調査期間、順位の種類、推定の表示、順位がない状態は残す。出典メタデータと出典ページは保持する。

Tailwindのクラス探索は `src/app`・`src/components`・`src/lib` に限定する。名前辞書・原本・配信用JSONをCSS候補として走査しない。新しい画面コードを別の場所へ置く場合は `globals.css` の `@source` に追加する。
