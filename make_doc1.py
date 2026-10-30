# -*- coding: utf-8 -*-
"""文档一：169 种起手牌完整分档表。"""
import json

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt, RGBColor

from docx_common import cn, cell_text, make_table, note, para, rich, set_borders, setup, shade

d = json.load(open("data_169.json", encoding="utf-8"))
rows = d["rows"]
H = {r["hand"]: r for r in rows}

TIER_ORDER = ["S 超强", "A 强", "B 中强", "C 可玩", "D 边缘", "E 弃牌"]
TIER_FILL = {
    "S 超强": "1F3864",
    "A 强": "2E75B6",
    "B 中强": "548235",
    "C 可玩": "FFD966",
    "D 边缘": "F4B183",
    "E 弃牌": "D9D9D9",
}
TIER_TEXT = {
    "S 超强": "FFFFFF",
    "A 强": "FFFFFF",
    "B 中强": "FFFFFF",
    "C 可玩": "1A1A1A",
    "D 边缘": "1A1A1A",
    "E 弃牌": "595959",
}
TIER_DESC = {
    "S 超强": "任何位置都该主动造池。翻前几乎无条件 3-bet / 4-bet，翻后目标是打光筹码。",
    "A 强": "所有位置可开池、可跟注对抗开池。需要位置或牌面配合，别在不利位置打大池。",
    "B 中强": "靠后位置开池、靠前位置弃牌或小注。翻后以控池和听牌为主，别恋战。",
    "C 可玩": "只在有位置、有主动权、或赔率极好时入场。多数时候翻前就该弃。",
    "D 边缘": "偶发偷盲、便宜看翻牌才玩。任何加注面前直接弃，不值得。",
    "E 弃牌": "翻前直接弃。这类牌赢的都是小池、输的都是大池，长期期望为负。",
}

doc = Document()
setup(doc)
sec = doc.sections[0]
sec.page_width = Cm(21)
sec.page_height = Cm(29.7)
sec.left_margin = Cm(1.8)
sec.right_margin = Cm(1.8)
sec.top_margin = Cm(2.0)
sec.bottom_margin = Cm(2.0)

# ---------- 标题 ----------
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(2)
r = p.add_run("德州扑克 169 种起手牌分档表")
r.font.size = Pt(22)
r.font.bold = True
r.font.color.rgb = RGBColor.from_string("1F3864")
r.font.name = "Segoe UI"
from docx.oxml.ns import qn
cn(r)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(16)
r = p.add_run("基于 676 万局蒙特卡洛模拟的实测胜率  ·  六档可打性分级")
r.font.size = Pt(10.5)
r.font.color.rgb = RGBColor.from_string("595959")
cn(r)

# ---------- 一、口径 ----------
doc.add_heading("一、这份表怎么来的", level=1)
para(doc, "德州的起手牌一共 169 种：13 个对子、78 个同花、78 个非同花。花色本身不影响牌力（只影响同花能不能成），所以 1326 个具体组合可以压缩成 169 类。")
rich(doc, [
    ("核心指标是「对随机手牌的胜率」：", True, "1F3864"),
    ("假设你的对手拿的是完全随机两张牌，双方打到河牌摊牌，你赢的概率是多少。"
     "每一种起手牌跑 4 万局模拟（169 类共约 676 万局），统计误差约 ±0.3 个百分点。", False, None),
])
rich(doc, [
    ("为什么只用胜率不够：", True, "1F3864"),
    ("胜率只回答「摊牌谁大」，不回答「能不能打」。72o（7 和 2 非同花）胜率 34%，"
     "但它几乎不可能在翻后拿到能收钱的牌；54s（5 和 4 同花）胜率只有 38%，却能做出顺子和同花，"
     "赢的时候对手往往已经套牢。所以档位不是纯按胜率切，而是胜率加可玩性修正后排序。", False, None),
])

doc.add_heading("二、档位的判定规则", level=2)
para(doc, "打分 = 对随机手牌胜率 + 同花加成 + 连张加成 − 断张惩罚，然后按分数切六档：")
make_table(doc, [
    ["修正项", "加减分", "理由"],
    ["同花（suited）", "+2.5", "成同花的概率约 6.4%，一旦成了就是坚果级牌力，隐含赔率极高"],
    ["连张（gap = 1）", "+2.0", "成顺子的路径最多（两头 + 卡顺），且顺子隐蔽、对手难弃"],
    ["隔一张（gap = 2）", "+1.0", "成顺路径减半，仍有价值"],
    ["断张（gap ≥ 5）", "−1.0", "两张牌之间凑不出顺子，只剩对子/两对/三条三条路"],
], widths=[4.2, 2.6, 10.6], col_align=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT])
note(doc, "说明：gap 指两张牌点数之差，A 可当 1 也可当 14。这个打分是启发式的，目的是给出可执行的排序，不是 GTO 求解器的输出。真正的翻前决策还取决于位置、对手、筹码深度和加注尺度。")

doc.add_page_break()

# ---------- 三、13x13 矩阵 ----------
doc.add_heading("三、13 × 13 全图", level=1)
para(doc, "右上三角是同花牌（s），左下三角是非同花牌（o），对角线是对子。格内数字为该手牌对随机手牌的胜率（%），底色为档位。")

RANKS = "AKQJT98765432"
legend = doc.add_paragraph()
legend.paragraph_format.space_after = Pt(8)
for name in TIER_ORDER:
    run = legend.add_run("  ■ " + name + "  ")
    run.font.size = Pt(9.5)
    run.font.bold = True
    run.font.color.rgb = RGBColor.from_string(TIER_FILL[name])
    cn(run)

data = [[""] + list(RANKS)]
for i in range(13):
    line = [RANKS[i]]
    for j in range(13):
        if i == j:
            hand = RANKS[i] * 2
        elif i < j:
            hand = RANKS[i] + RANKS[j] + "s"
        else:
            hand = RANKS[j] + RANKS[i] + "o"
        rec = H[hand]
        line.append(f"{rec['equity']:.1f}")
    data.append(line)

t = make_table(doc, data, widths=[1.25] + [1.2] * 13, header=True, size=7.5,
               header_fill="404040", zebra=None)
# 逐格按档位上色
for i in range(13):
    c = t.cell(i + 1, 0)
    cell_text(c, RANKS[i], size=8, bold=True, color="FFFFFF")
    shade(c, "404040")
    for j in range(13):
        if i == j:
            hand = RANKS[i] * 2
        elif i < j:
            hand = RANKS[i] + RANKS[j] + "s"
        else:
            hand = RANKS[j] + RANKS[i] + "o"
        tier = H[hand]["tier"]
        cell = t.cell(i + 1, j + 1)
        cell_text(cell, f"{H[hand]['equity']:.1f}", size=7.5,
                  bold=(tier in ("S 超强", "A 强")),
                  color=TIER_TEXT[tier])
        shade(cell, TIER_FILL[tier])

note(doc, "读图要点：整张图从左上到右下是一条平滑的衰减带——越靠左上越强，越靠右下越弱。同花格（右上三角）普遍比对应的非同花格子高 2~3 个百分点，这就是同花的价值。特别注意对角线右侧紧邻的那一列：AKs、KQs、QJs 这类「高牌 + 同花 + 连张」三重叠加的格子，是整张图里性价比最高的区域。")

doc.add_page_break()

# ---------- 四、六档明细 ----------
doc.add_heading("四、六个档位的完整清单", level=1)

for tier in TIER_ORDER:
    hands = [r for r in rows if r["tier"] == tier]
    hands.sort(key=lambda x: -x["equity"])
    doc.add_heading(f"{tier}（{len(hands)} 种）", level=2)
    para(doc, TIER_DESC[tier], size=9.5, color="404040")

    # 每行 8 列：手牌 / 胜率 / 组合数  ×4
    body = []
    per_row = 6
    for k in range(0, len(hands), per_row):
        chunk = hands[k:k + per_row]
        line = []
        for h in chunk:
            line += [h["hand"], f"{h['equity']:.1f}%"]
        while len(line) < per_row * 2:
            line += ["", ""]
        body.append(line)

    header = ["手牌", "胜率"] * per_row
    tb = make_table(doc, [header] + body, widths=[1.55, 1.35] * per_row,
                    size=8.2, header_fill=TIER_FILL[tier],
                    header_color=TIER_TEXT[tier], zebra="F7F7F7")
    # 表头文字颜色修正（浅色底用深字）
    if tier in ("C 可玩", "D 边缘", "E 弃牌"):
        for j in range(per_row * 2):
            cell_text(tb.cell(0, j), header[j], size=8.5, bold=True, color="1A1A1A")
            shade(tb.cell(0, j), TIER_FILL[tier])
    doc.add_paragraph().paragraph_format.space_after = Pt(2)

doc.add_page_break()

# ---------- 五、实战用法 ----------
doc.add_heading("五、拿到牌之后的三步", level=1)

doc.add_heading("第 1 步：查档位，定基调", level=2)
para(doc, "先看自己这手牌落在哪一档，这决定的是「这手牌配不配进池」，而不是「这手牌该怎么打」。同一种牌在不同位置、不同筹码深度下的打法可以完全不同，但档位定的是上限：E 档再怎么打也打不成盈利牌，S 档再怎么打也不该弃。")

doc.add_heading("第 2 步：按位置调整松紧", level=2)
make_table(doc, [
    ["位置", "可开池档位", "面对加注时的处理"],
    ["UTG / HJ（前面位置）", "S、A、B 的前半", "只玩 S 档和 A 档的强牌；B 档多数弃"],
    ["CO（关煞位）", "S、A、B", "C 档可跟注；A/B 档可 3-bet"],
    ["BTN（按钮位，最后行动）", "S、A、B、C", "最松的位置，C 档甚至部分 D 档都可以开池偷盲"],
    ["SB（小盲）", "S、A、B、C", "位置最差（翻后永远先行动），宁可 3-bet 或弃，别平跟"],
    ["BB（大盲）", "S、A、B、C、部分 D", "已经投了钱，赔率好，可以宽防，但别用 E 档硬扛"],
], widths=[5.0, 4.6, 8.0], col_align=[WD_ALIGN_PARAGRAPH.LEFT] * 3)
note(doc, "位置为什么值钱：同一个牌力，在按钮位能多打 10~15 个百分点的范围，因为你在翻后每一轮都最后行动，能看到对手的动作再做决定。")

doc.add_heading("第 3 步：翻后看的是牌面，不是档位", level=2)
rich(doc, [
    ("档位只管翻前。", True, "C00000"),
    ("翻牌一发下来，起手牌的档位就作废了——起手牌只决定「你现在有什么」，牌面决定「你能变成什么」。"
     "A♠K♠ 是好牌，但牌面 8♥7♦6♣ 全是对手的范围，这时候它连一对都没有，该弃就弃。"
     "反过来 5♠4♠ 是 C 档，牌面 3♥6♦7♠ 就是坚果顺子，该打光就打光。", False, None),
])

doc.add_page_break()

# ---------- 六、局限 ----------
doc.add_heading("六、这份表的局限", level=1)
for text in [
    ("只对单挑有效。", "胜率口径是「你 vs 一个随机对手」。三人以上入池时，每个对手都会分走你的胜率，且分走的速度不是线性的——AA 单挑赢 85%，三人池只剩 74%，六人池只剩 44%。多人池里，可玩性（能做成坚果）比绝对牌力更重要。"),
    ("没考虑位置和筹码深度。", "真正的翻前决策是一棵决策树，位置、有效筹码、对手风格、加注历史都是输入。这张表只给了叶子节点的一个静态估值。"),
    ("胜率不等于 EV。", "72o 胜率 34%，但它赢的时候赢不到钱、输的时候输很多；54s 胜率 38%，赢的时候能把对手的三条打光。期望值 = 胜率 × 赢的金额 − 败率 × 输的金额，后两项这张表没有。"),
    ("不是 GTO 解。", "这是用蒙特卡洛模拟算出来的启发式分档，不是求解器的均衡策略。它的价值在于给你一个可执行、可记忆、不会犯大错的基准线。"),
]:
    rich(doc, [("· " + text[0] + " ", True, "1F3864"), (text[1], False, None)], size=10)

doc.add_paragraph()
para(doc, "数据来源：本地蒙特卡洛引擎（7 张牌评估器 + 4 万次/手牌采样），种子固定 20251025，结果可复现。", size=9, color="7F7F7F")

doc.save("169种起手牌分档表.docx")
print("SAVED 169")




