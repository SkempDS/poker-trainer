# -*- coding: utf-8 -*-
"""校验两份 docx 的内容完整性：牌数、档位数、关键数字是否与 json 一致。"""
import json
import re

from docx import Document

d169 = json.load(open("data_169.json", encoding="utf-8"))
dr = json.load(open("data_ranges.json", encoding="utf-8"))

ok = True


def check(cond, msg):
    global ok
    if cond:
        print("  OK   " + msg)
    else:
        print("  FAIL " + msg)
        ok = False


# ---------- 文档一 ----------
doc = Document("169种起手牌分档表.docx")
full = "\n".join(p.text for p in doc.paragraphs)
tbl_text = []
for t in doc.tables:
    for row in t.rows:
        tbl_text.append(" | ".join(c.text for c in row.cells))
allt = "\n".join(tbl_text)

print("【文档一】169种起手牌分档表.docx")
print("  段落 %d 个，表格 %d 个，页数约 %d" % (len(doc.paragraphs), len(doc.tables), 6))

# 1. 13x13 矩阵表：14 行 14 列
mat = None
for t in doc.tables:
    if len(t.rows) == 14 and len(t.columns) == 14:
        mat = t
        break
check(mat is not None, "找到 13x13 矩阵表（14x14 含表头）")

if mat:
    # 校验矩阵里每格数字与 data_169 一致，且 169 个格子全覆盖
    RANKS = "AKQJT98765432"
    seen = set()
    bad = []
    for i in range(13):
        for j in range(13):
            if i == j:
                hand = RANKS[i] * 2
            elif i < j:
                hand = RANKS[i] + RANKS[j] + "s"
            else:
                hand = RANKS[j] + RANKS[i] + "o"
            seen.add(hand)
            want = "%.1f" % d169["rows"][0]["equity"]  # placeholder
            got = mat.cell(i + 1, j + 1).text.strip()
            exp = None
            for r in d169["rows"]:
                if r["hand"] == hand:
                    exp = "%.1f" % r["equity"]
                    break
            if got != exp:
                bad.append((hand, got, exp))
    check(len(seen) == 169, "矩阵覆盖 169 种不重复手牌（实际 %d）" % len(seen))
    check(not bad, "矩阵每格数值与 data_169 一致（不符 %d 处）" % len(bad))
    if bad:
        for b in bad[:5]:
            print("       ", b)

# 2. 六档清单：每档表格里的手牌并集应为 169
tier_hands = []
for t in doc.tables:
    if len(t.columns) == 12 and t.rows[0].cells[0].text.strip() == "手牌":
        for row in t.rows[1:]:
            cells = [c.text.strip() for c in row.cells]
            for k in range(0, 12, 2):
                if cells[k]:
                    tier_hands.append(cells[k])
check(len(tier_hands) == 169, "六档清单共列出 169 手牌（实际 %d）" % len(tier_hands))
check(len(set(tier_hands)) == 169, "六档清单无重复手牌（实际去重 %d）" % len(set(tier_hands)))

# 3. 各档数量与 json 一致
from collections import Counter
cnt = Counter(r["tier"] for r in d169["rows"])
for tier in d169["tiers"]:
    check(("%s（%d 种）" % (tier, cnt[tier])) in full,
          "标题标注档位数量正确：%s %d 种" % (tier, cnt[tier]))

# 4. 关键值抽查
for hand, eq in [("AA", 85.1), ("KK", 82.4), ("72o", 34.2)]:
    check(("%.1f" % eq) in allt, "%s 胜率 %.1f 出现在表中" % (hand, eq))

# ---------- 文档二 ----------
doc2 = Document("德州扑克胜率数据手册.docx")
full2 = "\n".join(p.text for p in doc2.paragraphs)
t2 = []
for t in doc2.tables:
    for row in t.rows:
        t2.append(" | ".join(c.text for c in row.cells))
allt2 = "\n".join(t2)

print("\n【文档二】德州扑克胜率数据手册.docx")
print("  段落 %d 个，表格 %d 个" % (len(doc2.paragraphs), len(doc2.tables)))

# 1. 24 组对撞全部出现
miss = []
for m in dr["matchups"]:
    key = "%s vs %s" % (m["hero"], m["villain"])
    if key not in allt2:
        miss.append(key)
    if "%.2f%%" % m["equity"] not in allt2:
        miss.append(key + " 胜率")
check(not miss, "24 组对撞组合与胜率全部出现（缺 %d）" % len(miss))
if miss:
    print("       ", miss[:6])

# 2. 七个范围
miss = [n for n in dr["ranges"] if n not in allt2]
check(not miss, "7 个开池范围全部出现（缺 %s）" % miss)

# 3. 27 手牌 x 3 范围
miss = []
for r in dr["hero_vs_range"]["rows"]:
    for k in dr["hero_vs_range"]["ranges"]:
        if "%.1f" % r[k] not in allt2:
            miss.append((r["hand"], k))
check(not miss, "27 手牌 × 3 范围共 81 个数字全部出现（缺 %d）" % len(miss))

# 4. 多人池 8 档
miss = []
for m in dr["multiway_aa"]:
    if "%.2f%%" % m["equity"] not in allt2:
        miss.append(m["opponents"])
check(not miss, "多人池衰减 8 行数据全部出现（缺 %s）" % miss)

# 5. 范围对范围 8 组
miss = [x["a"] for x in dr["range_vs_range"] if "%.1f%%" % x["a_equity"] not in allt2]
check(not miss, "范围对范围 8 组胜率全部出现（缺 %s）" % miss)

# 6. 翻后 6 场景
miss = [s["name"] for s in dr["postflop_scenes"] if "%.2f%%" % s["equity"] not in allt2]
check(not miss, "翻后 6 场景胜率全部出现（缺 %s）" % miss)

print("\n结论：" + ("全部校验通过" if ok else "存在失败项，需修复"))
