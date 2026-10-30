# -*- coding: utf-8 -*-
"""常见对撞与范围对抗胜率（第二版：标签与实际组合数一致）。"""
import json
import random
import time
import mc_engine as m

ALL_COMBOS = [(a, b) for a in range(52) for b in range(a + 1, 52)]
TOTAL = 1326


def R(spec):
    return m.expand_range(spec)


def hero_hand(spec):
    return R(spec)[0]


def clean(spec, hero_cards):
    """spec 可以是范围串，也可以是具体组合串（每项 4 字符，如 AhKh）"""
    dead = set(hero_cards)
    toks = [t.strip() for t in spec.replace(" ", ",").split(",") if t.strip()]
    pool = []
    for t in toks:
        if len(t) == 4 and t[1] in m.SUIT_CHARS and t[3] in m.SUIT_CHARS:
            pool.append(m.combo_of((m.parse_card(t[0:2]), m.parse_card(t[2:4]))))
        else:
            pool.extend(R(t))
    return [c for c in set(pool) if c[0] not in dead and c[1] not in dead]


ITERS = 60000
rng = random.Random(20251025)
out = {}

# ---------- 1. 经典翻前对撞 ----------
matchups = [
    ("AA", "KK"), ("AA", "QQ"), ("AA", "76s"), ("AA", "AKs"),
    ("KK", "QQ"), ("KK", "AKs"), ("QQ", "JJ"), ("QQ", "AKs"),
    ("JJ", "AKs"), ("JJ", "AKo"), ("TT", "AKs"), ("99", "AKo"),
    ("55", "AKs"), ("22", "AKs"), ("22", "KQo"),
    ("AKs", "QQ"), ("AKs", "AKo"), ("AKs", "76s"), ("AKo", "76s"),
    ("AQo", "KQs"), ("AJo", "KQo"), ("KQo", "87s"), ("T9s", "44"), ("A5s", "KQo"),
]
sec1 = []
t0 = time.time()
for h, v in matchups:
    hc = hero_hand(h)
    vr = clean(v, hc)
    r = m.mc_equity(hc, vr, iters=ITERS, rng=rng)
    sec1.append({"hero": h, "villain": v,
                 "equity": round(r["equity"] * 100, 2),
                 "win": round(r["win"] * 100, 2),
                 "tie": round(r["tie"] * 100, 2)})
    print("S1", h, "vs", v, sec1[-1]["equity"], f"{time.time()-t0:.1f}s", flush=True)
out["matchups"] = sec1

# ---------- 2. 常用开池 / 防守范围 ----------
RANGES = {
    "UTG 开池": "55+,AJo+,ATs+,KQo,KJs+,QJs,JTs,T9s,98s",
    "HJ 开池": "33+,ATo+,A8s+,KJo+,K9s+,QTo+,Q9s+,J9s+,T8s+,98s,87s",
    "CO 开池": "22+,A9o+,A2s+,KTo+,K8s+,Q9o+,Q8s+,J8o+,J8s+,T7s+,97s+,86s+,75s+,65s",
    "BTN 开池": "22+,A5o+,A2s+,K9o+,K4s+,Q9o+,Q6s+,J8o+,J6s+,T7o+,T5s+,96o+,95s+,86o+,85s+,75o+,74s+,65o+,64s+,54s,43s",
    "SB 开池": "22+,A5o+,A2s+,K8o+,K4s+,Q9o+,Q6s+,J8o+,J6s+,T8o+,T6s+,96o+,95s+,86o+,85s+,75o+,74s+,64o+,63s+,53o+,52s+,43s",
    "BB 防守 vs BTN": "22+,A2o+,A2s+,K4o+,K2s+,Q7o+,Q3s+,J8o+,J3s+,T8o+,T3s+,97o+,94s+,86o+,84s+,75o+,74s+,64o+,63s+,53o+,52s+,43o+,42s+,32s",
    "BB 防守 vs UTG": "22+,A8o+,A2s+,KTo+,K7s+,QTo+,Q8s+,JTo,J9s,J8s,T9s,T8s,98s,87s,76s,65s,54s",
}
range_stats = {}
for name, spec in RANGES.items():
    cs = R(spec)
    range_stats[name] = {"spec": spec, "combos": len(cs), "pct": round(len(cs) / TOTAL * 100, 1)}
    print("RANGE", name, len(cs), range_stats[name]["pct"], flush=True)
out["ranges"] = range_stats

# ---------- 3. 同手牌对抗不同位置范围 ----------
heroes = ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55",
          "AKs", "AKo", "AQs", "AQo", "AJs", "AJo", "ATs",
          "KQs", "KQo", "KJs", "QJs", "JTs", "T9s", "98s", "76s", "A5s", "22"]
vs_ranges = ["UTG 开池", "CO 开池", "BTN 开池"]
matrix = []
for h in heroes:
    hc = hero_hand(h)
    row = {"hand": h}
    for rn in vs_ranges:
        vr = clean(RANGES[rn], hc)
        r = m.mc_equity(hc, vr, iters=30000, rng=rng)
        row[rn] = round(r["equity"] * 100, 2)
    matrix.append(row)
    print("S3", h, row, f"{time.time()-t0:.1f}s", flush=True)
out["hero_vs_range"] = {"ranges": vs_ranges, "rows": matrix}

# ---------- 4. 范围 vs 范围 ----------
range_matchups = []
specs = ["UTG 开池", "HJ 开池", "CO 开池", "BTN 开池", "SB 开池"]
for a in specs:
    for b in specs:
        if a >= b:
            continue
        # 取 a 范围里的代表手牌，对抗 b 范围
        hc = R(RANGES[a])[0]
        vr = clean(RANGES[b], hc)
        r = m.mc_equity(hc, vr, iters=40000, rng=rng)
        range_matchups.append({"a": a, "b": b, "hero_card": m.card_str(hc[0]) + m.card_str(hc[1]),
                               "equity": round(r["equity"] * 100, 2)})
        print("S4", a, "vs", b, range_matchups[-1]["equity"], flush=True)
out["range_vs_range"] = range_matchups

# ---------- 5. 多人底池 AA ----------
multi = []
op_seq = ["KK", "QQ", "JJ", "TT", "99", "88", "AKs", "77"]
hero = hero_hand("AA")
for n in range(1, 9):
    opp_ranges = [R(op_seq[i]) for i in range(n)]
    r = m.mc_equity_multi(hero, opp_ranges, iters=30000, rng=rng)
    multi.append({"opponents": n, "equity": round(r["equity"] * 100, 2)})
    print("MULTI", n, multi[-1]["equity"], f"{time.time()-t0:.1f}s", flush=True)
out["multiway_aa"] = multi

base = []
for n in range(1, 9):
    hero = hero_hand("AA")
    opp_ranges = [ALL_COMBOS] * n
    r = m.mc_equity_multi(hero, opp_ranges, iters=30000, rng=rng)
    base.append({"opponents": n, "equity": round(r["equity"] * 100, 2)})
    print("RANDOM", n, base[-1]["equity"], f"{time.time()-t0:.1f}s", flush=True)
out["multiway_aa_random"] = base

# ---------- 6. 翻后典型场景 ----------
scenes = []
# 同花听牌 + 卡顺 vs 顶对
hero = [m.parse_card("Ah"), m.parse_card("Kh")]
board = [m.parse_card("Qh"), m.parse_card("7h"), m.parse_card("2c")]
vr = clean("QQ,77,22,AQ,KQ", hero + board)
r = m.mc_equity(hero, vr, board=board, iters=60000, rng=rng)
scenes.append({"name": "A♥K♥ 双高张 + 坚果同花听牌 vs 顶对/三条", "board": "Q♥7♥2♣",
               "equity": round(r["equity"] * 100, 2), "combos": len(vr)})
# 两头顺听牌 vs 超对
hero = [m.parse_card("9c"), m.parse_card("8c")]
board = [m.parse_card("7d"), m.parse_card("6h"), m.parse_card("2s")]
vr = clean("AA,KK,QQ,JJ", hero + board)
r = m.mc_equity(hero, vr, board=board, iters=60000, rng=rng)
scenes.append({"name": "9♣8♣ 两头顺听牌 + 卡顺 vs 超对", "board": "7♦6♥2♠",
               "equity": round(r["equity"] * 100, 2), "combos": len(vr)})
# 暗三 vs 同花听牌
hero = [m.parse_card("7c"), m.parse_card("7d")]
board = [m.parse_card("7h"), m.parse_card("Ah"), m.parse_card("Kh")]
vr = clean("AhQh,AhJh,KhQh,AhTh,AK", hero + board)
r = m.mc_equity(hero, vr, board=board, iters=60000, rng=rng)
scenes.append({"name": "7♣7♦ 暗三条 vs 坚果同花听牌", "board": "7♥A♥K♥",
               "equity": round(r["equity"] * 100, 2), "combos": len(vr)})
# 顶对 vs 同花听牌（反向）
hero = [m.parse_card("Ac"), m.parse_card("Qd")]
board = [m.parse_card("Qh"), m.parse_card("7h"), m.parse_card("2h")]
vr = clean("AhKh,AhJh,KhJh", hero + board)
r = m.mc_equity(hero, vr, board=board, iters=60000, rng=rng)
scenes.append({"name": "A♣Q♦ 顶对 vs 同花听牌", "board": "Q♥7♥2♥",
               "equity": round(r["equity"] * 100, 2), "combos": len(vr)})
out["postflop_scenes"] = scenes
for s in scenes:
    print("SCENE", s["name"], s["equity"], flush=True)

with open("data_ranges.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("DONE", f"{time.time()-t0:.1f}s")
