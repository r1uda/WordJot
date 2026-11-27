"""Build offline CET cards using explicit ECDICT tags and the shipped glosses."""
import csv
import json
import sqlite3
import sys
from pathlib import Path

source, lexicon, output = map(Path, sys.argv[1:])
db = sqlite3.connect(lexicon)
cards = {}
with source.open(encoding="utf-8-sig", newline="") as stream:
    for r in csv.DictReader(stream):
        tags = set(r["tag"].split())
        mask = int("cet4" in tags) + 2 * int("cet6" in tags)
        en = r["word"].strip().lower()
        if not mask or en in cards:
            continue
        row = db.execute("SELECT zh,ipa,pos,rank FROM lex WHERE en=?", (en,)).fetchone()
        if row is None:
            continue
        zh, ipa, pos, rank = row
        band = 0 if "zk" in tags or rank <= 1500 else 1 if "gk" in tags or rank <= 5000 else 2
        cards[en] = [en, mask, band, zh, ipa, pos]
db.close()
output.write_text("const cetWords=" + json.dumps(list(cards.values()), ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
for bit in (1, 2):
    print(bit, [sum(bool(r[1] & bit) and r[2] == b for r in cards.values()) for b in range(3)])

