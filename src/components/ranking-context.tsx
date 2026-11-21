import type { DatasetMeta, NameRecord, ReferenceNameRecord } from '@/lib/types';

export function RankingContext({ meta, record, japanese }: {
  meta: DatasetMeta;
  record?: NameRecord | ReferenceNameRecord;
  japanese: boolean;
}) {
  const evidence = record?.rank === undefined ? record?.evidenceRank : undefined;
  const ranked = record?.rank !== undefined;
  const observation = record?.observation;
  const scope = observation
    ? japanese ? "公開人物データ内の出現人数順。全国人口・出生の順位ではありません。同人数は同順位です。" : "Rank by people recorded in this public dataset, not population or births. Equal counts share a rank."
    : evidence
    ? japanese ? '公開人物データ内の出現人数順。全国人口の順位ではありません。' : 'Frequency among people in the public dataset; not a national population rank.'
    : !ranked
      ? japanese ? '順位データがありません。' : 'No ranking data is available.'
      : !meta.isOfficial
        ? japanese ? 'この資料内の順位。全国人口の順位とは区別してください。' : 'Rank within this source; distinguish it from a national population rank.'
        : japanese ? '提供元が公表した対象内の順位。全年齢人口を対象とするとは限りません。' : 'Published rank for the source’s population; not necessarily all ages.';
  const sourceUrl = evidence ? meta.evidenceRanking?.sourceUrl ?? meta.sourceUrl : meta.sourceUrl;
  const year = observation?.asOf ?? evidence?.asOf ?? record?.dataYear ?? record?.year ?? (meta.dataYear || (japanese ? '年度不明' : 'Year unavailable'));
  return (
    <details className="ranking-context">
      <summary>{japanese ? '対象・年度・出典' : 'Scope, year & source'}</summary>
      <p>{scope}</p>
      <dl>
        <dt>{japanese ? '対象' : 'Coverage'}</dt>
        <dd>{meta.coverageLabel || (japanese ? '詳細は提供元の調査条件を参照' : 'See the source for population and collection criteria.')}{meta.isSample ? (japanese ? ' · サンプル' : ' · Sample') : ''}</dd>
        <dt>{japanese ? '年度・集計時点' : 'Year / as of'}</dt><dd>{year}</dd>
        <dt>{japanese ? '出典' : 'Source'}</dt>
        <dd>{evidence ? evidence.sourceId : meta.source}</dd>
      </dl>
      {observation && <p className="observed-counts">{record?.count?.toLocaleString()} / {observation.totalPeople.toLocaleString()} {japanese ? "人（この集計対象内）" : "people in this cohort"} · {observation.tiedNames.toLocaleString()} {japanese ? "件が同順位" : "names tied at this rank"}</p>}
      {evidence && <p>{evidence.observedPeople.toLocaleString()} / {evidence.totalPeople.toLocaleString()} {japanese ? '人（この公開人物資料内）' : 'people in this public dataset'}</p>}
      {meta.notes && <p lang="ja">{meta.notes}</p>}
      {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">{japanese ? '出典を確認' : 'View source'} ↗</a>}
      <p>{japanese ? '国・資料ごとに対象や年度が異なり、同じ順位でも同じ人口割合を意味しません。Rarity Scoreは資料内の順位をもとにした指標です。' : 'Sources differ in population and year. Equal ranks do not mean equal population shares. Rarity Score is based on rank within the dataset.'}</p>
    </details>
  );
}
