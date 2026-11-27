"""Adapt CC-CEDICT into a separate SQLite database under CC BY-SA 4.0."""
import gzip
import pathlib
import re
import sqlite3
import sys

source, output = map(pathlib.Path, sys.argv[1:])
temp = output.with_suffix(".building")
temp.unlink(missing_ok=True)
db = sqlite3.connect(temp)
db.execute("CREATE TABLE translations(term TEXT,en TEXT,priority INTEGER,PRIMARY KEY(term,en))")
with gzip.open(source, "rt", encoding="utf-8") as stream:
    for line in stream:
        match = re.match(r"^(\S+) (\S+) \[([^]]+)\] /(.+)/", line)
        if not match:
            continue
        trad, simp, pinyin, definitions = match.groups()
        proper = int(pinyin[0].isupper())
        for order, gloss in enumerate(re.split(r"/|; ", definitions)):
            gloss = re.sub(r"\([^)]*\)", "", gloss).strip()
            if re.match(r"^(?:CL:|variant of |see |abbr\.|old variant |used in |classifier for |surname )", gloss, re.I):
                continue
            gloss = re.sub("^to ", "", gloss)
            if not re.fullmatch(r"[a-zA-Z][a-zA-Z '-]{0,55}", gloss) or len(gloss.split()) > 7:
                continue
            for key in {simp, trad}:
                db.execute("INSERT OR IGNORE INTO translations VALUES(?,?,?)", (key, gloss, proper * 100 + order))
db.commit()
print("Chinese source forms:", db.execute("SELECT count(DISTINCT term) FROM translations").fetchone()[0])
db.close()
temp.replace(output)

