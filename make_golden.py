# -*- coding: utf-8 -*-
"""生成黄金向量：20 万组随机 7 张牌 + Python 版 eval7 分数。
JS 版必须逐组严格相等，否则移植有问题。
"""
import json
import random
import sys

sys.path.insert(0, r"D:\QLDownload\dsh\plugin_check\poker")
from evaluator import eval7

N = 200000
rng = random.Random(987654321)
cards_out = []
scores_out = []
for _ in range(N):
    cs = rng.sample(range(52), 7)
    cards_out.append(cs)
    scores_out.append(eval7(cs))

# 额外补一批边界用例：所有顶对、四条、同花顺附近的结构
extra = [
    "AsKsQsJsTs2c3d", "As2s3s4s5s9h9d", "AcAdAhAsKc2d3h",
    "AcAdAhKsKc2d3h", "AsKs9s5s2s3d4h", "9c8d7h6s5cAdKh",
    "AcAdAhKsQc2d3h", "AcAdKhKsQc2d3h", "AcAdKhQsJc2d3h", "AcKdQhJs9c2d3h",
    "2c2d3h3s4c4d5h", "AcKcQcJcTc9s8s", "7c7d7h7s2c3d4h",
    "AsAd2c2d3h3s5c", "KsKdQcQdJhJs9c", "Ac2c3c4c5c8d9h",
]
RC = "23456789TJQKA"
SC = "shdc"


def pc(s):
    return RC.index(s[0]) * 4 + SC.index(s[1])


for s in extra:
    cs = [pc(s[i:i + 2]) for i in range(0, len(s), 2)]
    cards_out.append(cs)
    scores_out.append(eval7(cs))

out = {"count": len(cards_out), "cards": cards_out, "scores": scores_out}
p = r"D:\QLDownload\dsh\plugin_check\poker\game\golden_eval.json"
with open(p, "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"))
print("wrote", p, out["count"], "cases")
print("score range:", min(scores_out), max(scores_out))
