# Taiwan official rankings (2023-06-30)

- Surnames: https://data.gov.tw/dataset/126774
- CSV: https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/5D318346-EDFF-42C7-B914-946665D483F5/resource/E4A6518E-FF4C-4925-8D59-48ECE4401820/download
- Given names: https://www.ris.gov.tw/documents/data/5/2/112namestat.pdf, tables 51 and 56, printed pages 266–267 and 280–281.

Table 51 retains the 200 published facts (gender, name, count, ordinal). Table 56 retains the names and counts in each published birth cohort. NAMAE uses these additional spellings as usage evidence without presenting cohort counts as nationwide counts.

The surname CSV contains three disjoint age bands per surname. The importer sums their populations once and retains the published national ordinal, including gaps after excluding 23 private-use spellings requiring a non-Unicode font. The 2,708 Unicode Han spellings are retained literally: compatibility ideographs are not merged. The denominator remains the source's 2,731 surnames.

Surnames use the Open Government Data License v1.0 listed by the official portal (https://data.gov.tw/license). Given-name data contains statistical facts only. Run node scripts/import-taiwan-official.mjs to reproduce the application datasets.
