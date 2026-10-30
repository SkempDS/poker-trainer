# -*- coding: utf-8 -*-
"""生成 169 起手牌对随机手牌的胜率表。"""
import json
import time
import random
from evaluator import RANK_CHARS
import mc_engine as m

# 随机对手范围：全部 1326 组合
ALL_COMBOS = []
for a in range(52):
    for b in range(a + 1, 52):
        ALL_COMBOS.append((a, b))
assert len(ALL_COMBOS) == 1326

ITERS = 40000
SEED = 20251025
rng = random.Random(SEED)

rows = []
t0 = time.time()
for name, hi, lo, suited in m.hand169_list():
    combos = m.all_combos_for_169(hi, lo, suited)
    # 用第一个组合作为 hero 代表（对随机对手，同 169 类内各组合胜率一致）
    hero = combos[0]
    r = m.mc_equity(hero, ALL_COMBOS, iters=ITERS, rng=rng)
    rows.append({
        "hand": name,
        "hi": hi,
        "lo": lo,
        "suited": suited,
        "equity": round(r["equity"] * 100, 2),
        "win": round(r["win"] * 100, 2),
        "tie": round(r["tie"] * 100, 2),
        "combos": len(combos),
    })
    print(name, rows[-1]["equity"], f"{time.time()-t0:.1f}s", flush=True)

with open("data_169.json", "w", encoding="utf-8") as f:
    json.dump({"iters": ITERS, "seed": SEED, "rows": rows}, f, ensure_ascii=False, indent=1)
print("DONE", f"{time.time()-t0:.1f}s")
