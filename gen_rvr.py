# -*- coding: utf-8 -*-
"""范围 vs 范围（加权采样版本）。"""
import json
import random
import mc_engine as m

RANGES = {
    "UTG 开池": "55+,AJo+,ATs+,KQo,KJs+,QJs,JTs,T9s,98s",
    "HJ 开池": "33+,ATo+,A8s+,KJo+,K9s+,QTo+,Q9s+,J9s+,T8s+,98s,87s",
    "CO 开池": "22+,A9o+,A2s+,KTo+,K8s+,Q9o+,Q8s+,J8o+,J8s+,T7s+,97s+,86s+,75s+,65s",
    "BTN 开池": "22+,A5o+,A2s+,K9o+,K4s+,Q9o+,Q6s+,J8o+,J6s+,T7o+,T5s+,96o+,95s+,86o+,85s+,75o+,74s+,65o+,64s+,54s,43s",
    "SB 开池": "22+,A5o+,A2s+,K8o+,K4s+,Q9o+,Q6s+,J8o+,J6s+,T8o+,T6s+,96o+,95s+,86o+,85s+,75o+,74s+,64o+,63s+,53o+,52s+,43s",
    "BB 防守 vs BTN": "22+,A2o+,A2s+,K4o+,K2s+,Q7o+,Q3s+,J8o+,J3s+,T8o+,T3s+,97o+,94s+,86o+,84s+,75o+,74s+,64o+,63s+,53o+,52s+,43o+,42s+,32s",
}
rng = random.Random(11)

pairs = [
    ("UTG 开池", "BB 防守 vs BTN"),
    ("CO 开池", "BB 防守 vs BTN"),
    ("BTN 开池", "BB 防守 vs BTN"),
    ("UTG 开池", "CO 开池"),
    ("UTG 开池", "BTN 开池"),
    ("HJ 开池", "BTN 开池"),
    ("CO 开池", "BTN 开池"),
    ("SB 开池", "BB 防守 vs BTN"),
]
out = []
for a, b in pairs:
    r = m.mc_range_vs_range(m.expand_range(RANGES[a]), m.expand_range(RANGES[b]), iters=50000, rng=rng)
    out.append({"a": a, "b": b, "a_pct": round(len(m.expand_range(RANGES[a])) / 1326 * 100, 1),
                "b_pct": round(len(m.expand_range(RANGES[b])) / 1326 * 100, 1),
                "a_equity": round(r["equity"] * 100, 2)})
    print(out[-1])

d = json.load(open("data_ranges.json", encoding="utf-8"))
d["range_vs_range"] = out
with open("data_ranges.json", "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=1)
print("OK")
