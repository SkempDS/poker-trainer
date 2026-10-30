# -*- coding: utf-8 -*-
"""翻后典型场景（修正版：牌面不与他人牌冲突）。"""
import json
import random
import mc_engine as m


def C(s):
    return m.parse_card(s)


def clean_combos(spec, dead):
    toks = [t.strip() for t in spec.replace(" ", ",").split(",") if t.strip()]
    pool = []
    for t in toks:
        if len(t) == 4:
            pool.append(m.combo_of((C(t[0:2]), C(t[2:4]))))
        else:
            pool.extend(m.expand_range(t))
    return [c for c in set(pool) if c[0] not in dead and c[1] not in dead]


rng = random.Random(7)
scenes = []

# 1) 坚果同花听牌 + 两高张 vs 顶对
hero = [C("Ah"), C("Kh")]
board = [C("Qh"), C("7h"), C("2c")]
vr = clean_combos("QQ,77,22,AQ,KQ", set(hero) | set(board))
r = m.mc_equity(hero, vr, board=board, iters=80000, rng=rng)
scenes.append({"name": "A♥K♥（坚果同花听牌+两高张）vs 顶对/三条",
               "hero": "A♥K♥", "board": "Q♥7♥2♣", "opp": "QQ,77,22,AQ,KQ",
               "equity": round(r["equity"] * 100, 2), "combos": len(vr)})

# 2) 两头顺听牌 vs 超对
hero = [C("9c"), C("8c")]
board = [C("7d"), C("6h"), C("2s")]
vr = clean_combos("AA,KK,QQ,JJ", set(hero) | set(board))
r = m.mc_equity(hero, vr, board=board, iters=80000, rng=rng)
scenes.append({"name": "9♣8♣（两头顺听牌）vs 超对",
               "hero": "9♣8♣", "board": "7♦6♥2♠", "opp": "AA,KK,QQ,JJ",
               "equity": round(r["equity"] * 100, 2), "combos": len(vr)})

# 3) 暗三条 vs 已成同花
hero = [C("7c"), C("7d")]
board = [C("7h"), C("Ah"), C("Kh")]
vr = clean_combos("QhJh,QhTh,JhTh,Th9h,9h8h", set(hero) | set(board))
r = m.mc_equity(hero, vr, board=board, iters=80000, rng=rng)
scenes.append({"name": "7♣7♦（暗三条）vs 已成同花",
               "hero": "7♣7♦", "board": "7♥A♥K♥", "opp": "Q♥J♥,Q♥T♥,J♥T♥,T♥9♥,9♥8♥",
               "equity": round(r["equity"] * 100, 2), "combos": len(vr)})

# 4) 顶对 vs 同花听牌（牌面只 2 张同花）
hero = [C("Ac"), C("Qd")]
board = [C("Qh"), C("7h"), C("2s")]
vr = clean_combos("AhKh,AhJh,KhJh,AhTh", set(hero) | set(board))
r = m.mc_equity(hero, vr, board=board, iters=80000, rng=rng)
scenes.append({"name": "A♣Q♦（顶对顶踢）vs 同花听牌",
               "hero": "A♣Q♦", "board": "Q♥7♥2♠", "opp": "A♥K♥,A♥J♥,K♥J♥,A♥T♥",
               "equity": round(r["equity"] * 100, 2), "combos": len(vr)})

# 5) 三条 vs 两队（转牌后）
hero = [C("9c"), C("9d")]
board = [C("9h"), C("Ks"), C("Kd"), C("4c")]
vr = clean_combos("AK,KQ,KJ", set(hero) | set(board))
r = m.mc_equity(hero, vr, board=board, iters=80000, rng=rng)
scenes.append({"name": "9♣9♦（三条）vs K 顶对（转牌圈）",
               "hero": "9♣9♦", "board": "9♥K♠K♦4♣", "opp": "AK,KQ,KJ",
               "equity": round(r["equity"] * 100, 2), "combos": len(vr)})

# 6) 小同花 vs 大同花风险（反向隐含赔率）
hero = [C("6h"), C("5h")]
board = [C("Kh"), C("9h"), C("2h")]
vr = clean_combos("AhQh,AhJh,AhTh,QhJh", set(hero) | set(board))
r = m.mc_equity(hero, vr, board=board, iters=80000, rng=rng)
scenes.append({"name": "6♥5♥（小同花）vs 大同花",
               "hero": "6♥5♥", "board": "K♥9♥2♥", "opp": "A♥Q♥,A♥J♥,A♥T♥,Q♥J♥",
               "equity": round(r["equity"] * 100, 2), "combos": len(vr)})

for s in scenes:
    print(s["name"], s["equity"], "combos=", s["combos"])

d = json.load(open("data_ranges.json", encoding="utf-8"))
d["postflop_scenes"] = scenes
with open("data_ranges.json", "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=1)
print("OK")
