# -*- coding: utf-8 -*-
"""分档打分：对随机手牌胜率 + 同花/连张可玩性加成。"""
import json

d = json.load(open("data_169.json", encoding="utf-8"))
rows = d["rows"]


def score(r):
    s = r["equity"]
    hi, lo = r["hi"], r["lo"]
    if r["suited"] is True:
        s += 2.5
    gap = hi - lo
    if hi != lo:
        if gap == 1:
            s += 2.0
        elif gap == 2:
            s += 1.0
        elif gap >= 5:
            s -= 1.0
    return s


for r in rows:
    r["score"] = round(score(r), 2)

rows.sort(key=lambda x: -x["score"])

TIERS = [
    ("S 超强", 67.0),
    ("A 强", 61.0),
    ("B 中强", 55.0),
    ("C 可玩", 49.0),
    ("D 边缘", 43.0),
    ("E 弃牌", -999),
]

tier_of = {}
for r in rows:
    for name, cut in TIERS:
        if r["score"] >= cut:
            tier_of[r["hand"]] = name
            break

from collections import Counter
c = Counter(tier_of.values())
print("档位分布:", dict(c), "总计", sum(c.values()))
assert sum(c.values()) == 169

# 写回
for r in rows:
    r["tier"] = tier_of[r["hand"]]
d["rows"] = rows
d["tiers"] = [t[0] for t in TIERS]
json.dump(d, open("data_169.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

for name, _ in TIERS:
    hands = [r["hand"] for r in rows if r["tier"] == name]
    print(f"\n{name} ({len(hands)}):")
    print(" ".join(hands))
