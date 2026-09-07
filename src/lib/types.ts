export type NameType = "given_name" | "surname";
export type Gender = "male" | "female" | "unknown";
export type MatchingMode = "exactRank" | "normalizedRank" | "populationShare";
export type RankingBasis = "reading" | "spelling" | "overall";
export type NameRecord = {
  country: string;
  type: NameType;
  name: string;
  aliases?: string[];
  rank: number;
  totalEntries: number;
  year?: number;
  gender?: Gender;
  count?: number;
  share?: number;
  dataYear?: number;
  rankingBasis?: RankingBasis;
  isEstimated?: boolean;
};
export type DatasetMeta = {
  country: string;
  type: NameType;
  source: string;
  sourceUrl?: string;
  dataYear: number;
  isOfficial: boolean;
  isSample: boolean;
  notes?: string;
};
export type Dataset = { meta: DatasetMeta; records: NameRecord[] };
export type CountryConfig = {
  code: string;
  nameJa: string;
  nameEn: string;
  flag: string;
  enabled: boolean;
  supportsGivenName: boolean;
  supportsSurname: boolean;
};
export type DiagnosisInput = {
  name: string;
  type: NameType;
  gender?: Gender;
  year?: number;
  reading?: string;
};
export type Diagnosis = {
  input: DiagnosisInput;
  record?: NameRecord;
  score: number;
  recognition: "ranked" | "historical" | "dictionary" | "unrecognized";
  autoDetectedFrom?: NameType;
  matches: { country: CountryConfig; record: NameRecord; meta: DatasetMeta }[];
  meta: DatasetMeta;
};
