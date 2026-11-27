"""Build the bundled bilingual lookup database from an ECDICT CSV (MIT)."""
import csv
import pathlib
import re
import sqlite3
import sys

source, output = map(pathlib.Path, sys.argv[1:])
temporary = output.with_suffix(".building")
temporary.unlink(missing_ok=True)
db = sqlite3.connect(temporary)
db.executescript("""
CREATE TABLE lex(en TEXT PRIMARY KEY, zh TEXT NOT NULL, ipa TEXT, pos TEXT, rank INTEGER) WITHOUT ROWID;
CREATE TABLE reverse(term TEXT, en TEXT, rank INTEGER, PRIMARY KEY(term,en)) WITHOUT ROWID;
""")
with source.open(encoding="utf-8-sig", newline="") as stream:
    for row in csv.DictReader(stream):
        en = row["word"].strip().lower()
        zh = row["translation"].replace("\\n", "\n").strip()
        ranks = [int(row[k]) for k in ("frq", "bnc") if row[k].isdigit() and int(row[k]) > 0]
        rank = min(ranks, default=100000)
        if not zh or not re.search(r"[\u3400-\u9fff]", zh) or not en or len(en) > 160:
            continue
        if en == "wedgie":
            zh = "n.（口语）内裤被向上扯起、夹在臀间的状态；也指故意猛提他人内裤的恶作剧。\nn. 坡跟鞋。"
        elif en == "necrophilia":
            zh = "n. 恋尸癖，指对尸体产生性吸引。"
        pos = ", ".join(dict.fromkeys(re.findall(r"(?:^|\n)\s*([a-z]{1,6})\.", zh)))
        if not pos:
            pos = ", ".join(re.findall(r"([a-z]+):\d+", row["pos"]))
        db.execute("INSERT OR IGNORE INTO lex VALUES(?,?,?,?,?)", (en, zh, row["phonetic"], pos, rank))
        # Keep common translations first in Chinese-to-English suggestions.
        if not (row["tag"] or rank <= 35000 or row["oxford"] == "1"
                or (" " in en and len(en) <= 35 and not zh.startswith("["))):
            continue
        for piece in re.split(r"[,，;；、\n]", zh):
            term = re.sub(r"^[a-z.]+\s*", "", piece.strip()).strip()
            if re.fullmatch(r"[\u3400-\u9fff]{1,15}", term):
                db.execute("INSERT OR IGNORE INTO reverse VALUES(?,?,?)", (term, en, rank))
db.execute("CREATE INDEX reverse_rank ON reverse(term,rank,en)")
db.commit()
print("English entries, Chinese keys:", db.execute("SELECT count(*) FROM lex").fetchone()[0],
      db.execute("SELECT count(DISTINCT term) FROM reverse").fetchone()[0])
db.close()
temporary.replace(output)

