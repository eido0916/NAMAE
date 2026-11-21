"""Convert cached public workbooks. Install scripts/requirements-data.txt first.
Suppressed counts are excluded. No network access; outputs use deterministic gzip.
"""
import gzip, json
from pathlib import Path
import openpyxl
import pandas as pd
import xlrd
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data-sources/rankings/foreign"
def workbook(name):
    return openpyxl.load_workbook(CACHE/name, read_only=True, data_only=True)
def save(name, rows):
    raw=json.dumps(rows,ensure_ascii=False,separators=(",",":")).encode("utf-8")
    (CACHE/(name+".json.gz")).write_bytes(gzip.compress(raw,mtime=0))
    print(name,len(rows),flush=True)
def positive(v):
    return isinstance(v,(int,float)) and v>0 and not pd.isna(v)
for country in ["fi","es"]:
    year=2026 if country=="fi" else 2025
    book=workbook(f"{country}-given-{year}.xlsx")
    sheets=["Miehet kaikki","Naiset kaikki"] if country=="fi" else ["Hombres","Mujeres"]
    rows=[]
    for gender,sheet in zip(["male","female"],sheets):
        for row in book[sheet].iter_rows(values_only=True):
            name,count=row[:2] if country=="fi" else row[1:3]
            if isinstance(name,str) and positive(count): rows.append([name,int(count),gender])
    book.close()
    save(f"{country}-given-{year}",rows)
book=workbook("fi-surnames-2026.xlsx")
save("fi-surnames-2026",[[r[0],int(r[1])] for r in book["Nimet"].iter_rows(values_only=True) if isinstance(r[0],str) and positive(r[1])])
book.close()
book=xlrd.open_workbook(CACHE/"es-surnames-2025.xls")
rows=[]
for sheet in book.sheets():
    for row in sheet.get_rows():
        if len(row)>=3 and isinstance(row[1].value,str) and positive(row[2].value): rows.append([row[1].value,int(row[2].value)])
save("es-surnames-2025",rows)
for kind in ["given","surname"]:
    rows=[]
    for gender in ["male","female"]:
        book=workbook(f"pl-{kind}-{gender}-2026.xlsx")
        for row in book.worksheets[0].iter_rows(values_only=True):
            name=row[0]
            count=row[2] if kind=="given" else row[1]
            if isinstance(name,str) and positive(count): rows.append([name,int(count),gender])
        book.close()
    save(f"pl-{kind}-2026",rows)
book=workbook("gb-1996-2025.xlsx")
rows=[]
for gender,sheet in [("male","Table_2"),("female","Table_1")]:
    for row in book[sheet].iter_rows(min_row=6,values_only=True):
        count=sum(int(v) for v in row[2::2] if positive(v))
        if isinstance(row[0],str) and count>0: rows.append([row[0],count,gender])
book.close()
save("gb-given-1996-2025",rows)
ranking=pd.read_parquet(CACHE/"br-name_ranking-2022.parquet")
detail=pd.read_parquet(CACHE/"br-name_detail-2022.parquet")
combined=ranking.merge(detail,on=["name_text","name_type"],how="left",validate="one_to_one")
given,surnames=[],[]
for row in combined.to_dict("records"):
    if row["name_type"]=="surname" and positive(row["frequency"]): surnames.append([row["name_text"],int(row["frequency"])])
    elif row["name_type"]=="given":
        for gender in ["male","female"]:
            count=row[gender+"_count"]
            if positive(count): given.append([row["name_text"],int(count),gender])
save("br-given-2022",given)
save("br-surnames-2022",surnames)
