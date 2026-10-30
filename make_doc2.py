# -*- coding: utf-8 -*-
"""文档二：胜率数据手册。"""
import json

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from docx_common import cn, cell_text, make_table, note, para, rich, setup, shade

d = json.load(open("data_ranges.json", encoding="utf-8"))
matchups = d["matchups"]
ranges = d["ranges"]
hvr = d["hero_vs_range"]
multi = d["multiway_aa"]
multi_rand = d["multiway_aa_random"]
rvr = d["range_vs_range"]
scenes = d["postflop_scenes"]

DARK = "1F3864"
BLUE = "2E75B6"
RED = "C00000"
GRAY = "595959"

doc = Document()
setup(doc)
sec = doc.sections[0]
sec.page_width = Cm(21)
sec.page_height = Cm(29.7)
sec.left_margin = Cm(1.9)
sec.right_margin = Cm(1.9)
sec.top_margin = Cm(2.0)
sec.bottom_margin = Cm(2.0)


def title_block(t, sub):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(t)
    r.font.size = Pt(22)
    r.font.bold = True
    r.font.color.rgb = RGBColor.from_string(DARK)
    r.font.name = "Segoe UI"
    cn(r)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(16)
    r = p.add_run(sub)
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor.from_string(GRAY)
    cn(r)


title_block("德州扑克胜率数据手册", "全部数字由本地蒙特卡洛引擎实测得出  ·  固定随机种子，可复现")

# ============ 一 ============
doc.add_heading("一、这份手册在回答什么", level=1)
para(doc, "「这手牌该不该进池」是翻前的问题，「这个池该不该跟」是翻后的赔率问题，中间还差一步——你得先知道你大概有多少胜率。这一步靠感觉是算不准的，因为德州的手牌之间的关系是非线性的：AK 对 QQ 是落后的，但 AK 对 22 反而是领先的。")
rich(doc, [
    ("本手册用三组实测数据把这件事拆开：", True, DARK),
    ("① 单挑对撞表——两手具体牌之间的真实胜率；② 范围对抗表——你的牌对一个「开池范围」的胜率；"
     "③ 多人池衰减表——人数上去之后胜率怎么塌。这三组数据配合前面的赔率公式，就能把「该不该跟」从感觉变成算术。", False, None),
])
note(doc, "所有胜率口径：双方各自成牌、发满五张公共牌、摊牌比大小。平局按半胜计算（equity = 胜 + 平/2）。单挑样本量 8 万局，误差约 ±0.2 个百分点。")

# ============ 二 ============
doc.add_heading("二、单挑对撞表：两手已知牌", level=1)
para(doc, "这二十四组是实战中最常被讨论的对撞。左侧是「英雄」的胜率，右侧补足 100% 是「对手」的胜率（平局按均分已并入）。")

rows = [["对撞组合", "英雄胜率", "对手胜率", "一句话解读"]]
INTERP = {
    "AA vs KK": "对子压制，几乎无解",
    "AA vs QQ": "同上，QQ 只在极小牌面翻盘",
    "AA vs 76s": "同花连张有真实活路，能到 22%",
    "AA vs AKs": "AK 只赢同花/顺子，且常被削 A",
    "KK vs QQ": "对子压制",
    "KK vs AKs": "经典的「对子对两高张」，KK 只领先 66%",
    "QQ vs JJ": "对子压制",
    "QQ vs AKs": "几乎五五开，AK 的活路在 A/K 和听牌",
    "JJ vs AKs": "五五开",
    "JJ vs AKo": "JJ 略优，因为非同花少一条路",
    "TT vs AKs": "五五开",
    "99 vs AKo": "99 略优",
    "55 vs AKs": "五五开，小对子被高张压",
    "22 vs AKs": "22 反而落后，小对子对大高张只是抛硬币",
    "22 vs KQo": "22 微弱领先",
    "AKs vs QQ": "AK 落后，但差距不大",
    "AKs vs AKo": "同花对非同花，只差 5 个点",
    "AKs vs 76s": "高张压制，但 76s 有活路",
    "AKo vs 76s": "略低于同花版",
    "AQo vs KQs": "AQ 主导，KQ 只有 K/Q 三条路",
    "AJo vs KQo": "A 踢脚压制",
    "KQo vs 87s": "KQ 领先，但 87s 能做出坚果",
    "T9s vs 44": "同花连张对小对子，几乎五五开",
    "A5s vs KQo": "A 高张 + 轮子顺听牌，领先",
}
for m in matchups:
    key = f"{m['hero']} vs {m['villain']}"
    ic = INTERP.get(key, "")
    rows.append([key, f"{m['equity']:.2f}%", f"{100 - m['equity']:.2f}%", ic])

t = make_table(doc, rows, widths=[4.0, 2.6, 2.6, 8.2], size=9,
               col_align=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER,
                          WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT])
for i in range(1, len(rows)):
    eq = matchups[i - 1]["equity"]
    # 强弱着色：60% 以上蓝，40~60 灰，40 以下红
    cell = t.cell(i, 1)
    if eq >= 60:
        cell_text(cell, f"{eq:.2f}%", size=9, bold=True, color="1F6B3B")
        shade(cell, "E2EFDA")
    elif eq >= 45:
        cell_text(cell, f"{eq:.2f}%", size=9, color="404040")
        shade(cell, "F2F2F2")
    else:
        cell_text(cell, f"{eq:.2f}%", size=9, bold=True, color="9C0006")
        shade(cell, "FCE4E4")

doc.add_paragraph().paragraph_format.space_after = Pt(2)
rich(doc, [
    ("最反直觉的三条：", True, RED),
    ("第一，22 对 AKs 只有 49.8%——小对子对大高张远不是「压制」，只是抛硬币：22 想赢必须做成三条，"
     "而 AK 有六张活牌加听牌，两边机会几乎一样。第二，QQ 对 AKs 只有 54%——「大对子对两高张」的经典对决其实接近五五开。"
     "第三，AKs 对 AKo 只差 5 个百分点——同花的价值在单挑全下里远没有想象中大，"
     "它的真正价值在翻后的可玩性，而不在摊牌。", False, None),
])

doc.add_page_break()

# ============ 三 ============
doc.add_heading("三、范围开池表：七个位置的松紧", level=1)
para(doc, "「范围」指一个位置在该开池时可能持有的所有起手牌。下面是本手册采用的范围定义，组合数指 1326 个具体组合里占多少个。")

rows = [["位置", "组合数", "频率", "范围定义"]]
SPEC = {
    "UTG 开池": "55+, AJo+, ATs+, KQo, KJs+, QJs, JTs, T9s, 98s",
    "HJ 开池": "33+, ATo+, A8s+, KJo+, K9s+, QTo+, Q9s+, J9s+, T8s+, 98s, 87s",
    "CO 开池": "22+, A9o+, A2s+, KTo+, K8s+, Q9o+, Q8s+, J8o+, J8s+, T7s+, 97s+, 86s+, 75s+, 65s",
    "BTN 开池": "22+, A5o+, A2s+, K9o+, K4s+, Q9o+, Q6s+, J8o+, J6s+, T7o+, T5s+, 96o+, 95s+, 86o+, 85s+, 75o+, 74s+, 65o+, 64s+, 54s, 43s",
    "SB 开池": "22+, A5o+, A2s+, K8o+, K4s+, Q9o+, Q6s+, J8o+, J6s+, T8o+, T6s+, 96o+, 95s+, 86o+, 85s+, 75o+, 74s+, 64o+, 63s+, 53o+, 52s+, 43s",
    "BB 防守 vs BTN": "22+, A2o+, A2s+, K4o+, K2s+, Q7o+, Q3s+, J8o+, J3s+, T8o+, T3s+, 97o+, 94s+, 86o+, 84s+, 75o+, 74s+, 64o+, 63s+, 53o+, 52s+, 43o+, 42s+, 32s",
    "BB 防守 vs UTG": "22+, ATo+, A9s+, KJo+, KTs+, QJs, JTs, T9s, 98s, 87s, 76s, 65s",
}
for name, v in ranges.items():
    rows.append([name, str(v["combos"]), f"{v['pct']}%", v["spec"].replace(",", ", ")])

make_table(doc, rows, widths=[3.0, 1.8, 1.5, 11.2], size=7.8,
           col_align=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER,
                      WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT])
note(doc, "读法：UTG 只开 11.2%，按钮位开到 48.4%——同一个「开池」动作，位置越靠后范围可以宽四倍多。大盲防守对按钮位能到 64.4%，因为已经投了一个大盲、赔率天然好；但对 UTG 只有 26.1%，因为 UTG 的范围最紧、牌力最强。")

# ============ 四 ============
doc.add_heading("四、你的牌 vs 开池范围", level=1)
para(doc, "这是最实用的一张表：你拿着一手具体的牌，面对某个位置的开池，你的胜率是多少。三列分别是面对 UTG、CO、BTN 三个开池范围。")

hdr = ["手牌"] + list(hvr["ranges"])
rows = [hdr]
for r in hvr["rows"]:
    rows.append([r["hand"]] + [f"{r[k]:.1f}" for k in hvr["ranges"]])

t = make_table(doc, rows, widths=[3.2, 4.4, 4.4, 4.4], size=9)
# 三档着色
for i in range(1, len(rows)):
    for j, k in enumerate(hvr["ranges"], start=1):
        v = hvr["rows"][i - 1][k]
        cell = t.cell(i, j)
        if v >= 65:
            shade(cell, "C6E0B4")
        elif v >= 55:
            shade(cell, "E2EFDA")
        elif v >= 45:
            shade(cell, "FFF2CC")
        else:
            shade(cell, "FCE4E4")

note(doc, "配色：深绿 ≥65%（明确领先）、浅绿 55~65%（有优势）、黄 45~55%（五五开）、红 <45%（落后）。")

doc.add_paragraph().paragraph_format.space_after = Pt(2)
rich(doc, [
    ("这张表最该看的是「横向差值」：", True, DARK),
    ("同一个手牌，面对 UTG 和面对 BTN 的胜率能差 8~10 个百分点。比如 JJ 面对 UTG 只有 60.8%，"
     "面对 BTN 是 74.1%——差了 13 个点。这不是你的牌变强了，是对手的范围变弱了。"
     "实战含义：同样一手边缘牌，前面位置加注你要弃，按钮位加注你可以跟甚至反加。", False, None),
])

# ============ 五 ============
doc.add_heading("五、范围对范围", level=1)
para(doc, "上面是「一手牌 vs 一个范围」，这里是「一个范围 vs 一个范围」——双方都从各自范围里随机抽牌打。这更接近真实对抗：你不知道对手具体是什么牌，只知道他可能是什么牌。")

rows = [["对抗", "前者频率", "后者频率", "前者胜率", "解读"]]
RV_INTERP = {
    ("UTG 开池", "BB 防守 vs BTN"): "紧范围对宽范围，前者大幅领先但后者赔率好",
    ("CO 开池", "BB 防守 vs BTN"): "差距收窄",
    ("BTN 开池", "BB 防守 vs BTN"): "几乎均势，按钮位靠位置而非牌力赚钱",
    ("UTG 开池", "CO 开池"): "更紧的范围永远领先",
    ("UTG 开池", "BTN 开池"): "同上，UTG 领先 12 个点",
    ("HJ 开池", "BTN 开池"): "中间位置对按钮位",
    ("CO 开池", "BTN 开池"): "相邻位置差距最小",
    ("SB 开池", "BB 防守 vs BTN"): "小盲范围宽但位置差，翻前持平",
}
for r in rvr:
    rows.append([f"{r['a']} vs {r['b']}", f"{r['a_pct']}%", f"{r['b_pct']}%",
                 f"{r['a_equity']:.1f}%", RV_INTERP.get((r["a"], r["b"]), "")])

make_table(doc, rows, widths=[6.2, 2.0, 2.0, 2.2, 5.0], size=8.5,
           col_align=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER,
                      WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER,
                      WD_ALIGN_PARAGRAPH.LEFT])
note(doc, "关键结论：范围越紧，单挑胜率越高。UTG 的 11.2% 范围对任何范围都能赢，但赢的是「摊牌胜率」，不是「钱」——它弃掉的牌太多，长期看反而是宽范围在位置上赚更多。这就是为什么不能只看胜率，还要看位置和弃牌率。")

# ============ 六 ============
doc.add_heading("六、多人底池：胜率怎么塌", level=1)
para(doc, "这是业余玩家最容易低估的一段。每多一个对手，你的胜率不是线性下降，而是快速塌陷。下面两组数据都是 AA。")

rows = [["对手人数", "AA vs 范围（强对手）", "AA vs 随机牌", "相对单挑的保留率"]]
for i, m in enumerate(multi):
    base = multi[0]["equity"]
    keep = m["equity"] / base * 100
    rows.append([str(m["opponents"]), f"{m['equity']:.2f}%",
                 f"{multi_rand[i]['equity']:.2f}%", f"{keep:.0f}%"])

t = make_table(doc, rows, widths=[3.2, 5.2, 4.6, 4.6], size=9)
for i in range(1, len(rows)):
    cell = t.cell(i, 3)
    keep = float(rows[i][3].rstrip("%"))
    if keep < 40:
        shade(cell, "FCE4E4")
    elif keep < 60:
        shade(cell, "FFF2CC")

note(doc, "AA 对强范围：1 人 82.03% → 3 人 54.20% → 6 人 31.34%。也就是说六人池里，AA 已经是落后牌（因为要同时赢五家）。AA 对随机牌衰减稍慢（1 人 85.36% → 6 人 44.21%），因为随机牌里垃圾多。")

doc.add_paragraph().paragraph_format.space_after = Pt(2)
rich(doc, [
    ("实战含义：", True, RED),
    ("多人池里，绝对牌力要让位于「能不能做成坚果」。AA 在六人池只有 31% 的摊牌胜率，"
     "但如果你在翻牌击中了三条，胜率会跳到 90% 以上——真正该关心的是「翻后能不能做成别人无法超越的牌」，"
     "而不是「翻前我是不是最大」。这也是小对子、同花连张在多人池里价值上升、大高张价值下降的原因。", False, None),
])

# ============ 七 ============
doc.add_heading("七、翻后场景实测", level=1)
para(doc, "下面是六个典型翻后局面，每个都标明了英雄手牌、公共牌面、对手范围，以及实测胜率。这些数字可以直接拿去和底池赔率对照。")

rows = [["场景", "英雄", "公共牌", "对手范围", "胜率"]]
for s in scenes:
    rows.append([s["name"], s["hero"], s["board"], s["opp"], f"{s['equity']:.2f}%"])

t = make_table(doc, rows, widths=[4.6, 2.4, 3.0, 4.6, 2.2], size=8,
               col_align=[WD_ALIGN_PARAGRAPH.LEFT] * 4 + [WD_ALIGN_PARAGRAPH.CENTER])

doc.add_paragraph().paragraph_format.space_after = Pt(2)
doc.add_heading("逐场景解读", level=2)

SCENE_NOTES = [
    ("A♥K♥ 对 Q♥7♥2♣，对手 QQ/77/22/AQ/KQ —— 39.53%",
     "这是「坚果同花听牌 + 两高张」对抗「已经成牌」的经典局面。表面看 AK 什么都没中，"
     "但它有 9 张同花出路 + 3 张 A + 3 张 K，共 15 张，实际胜率 39.5%。"
     "对照赔率：如果底池赔率要求 33%（对手下 1/2 池），这是个正期望的跟注；要求 40% 就接近临界。"),
    ("9♣8♣ 对 7♦6♥2♠，对手 AA/KK/QQ/JJ —— 34.08%",
     "两头顺听牌（任何 5 或 T 都成顺，8 张）+ 后门同花。34% 看着低，但这手牌的隐含赔率极高："
     "成了顺子对手的超对很难弃。这类牌在有位置、筹码深的时候值得跟，没位置就该弃。"),
    ("7♣7♦ 对 7♥A♥K♥，对手同花 —— 33.81%",
     "暗三条对抗已成同花。葫芦的出路是 7 张（1 张）+ 配对牌面（约 6 张），约 34%。"
     "这个数字说明：三条在成同花的牌面上并不安全，别以为中了三条就该打光。"),
    ("A♣Q♦ 对 Q♥7♥2♠，对手同花听牌 —— 57.91%",
     "顶对顶踢对抗同花听牌。对手有 9 张出路，但只有两张街（转牌 + 河牌），"
     "所以顶对仍然领先 58%。这个局面该做的是下大注让对方听牌赔率不足，而不是慢打。"),
    ("9♣9♦ 对 9♥K♠K♦4♣，对手 AK/KQ/KJ —— 84.02%",
     "三条对抗顶对（转牌圈，只剩一张牌）。对手要赢必须再中一张 K（2 张出路），"
     "所以只有约 4.5% 的机会，反过来英雄 84%。这是教科书级的「该打光」局面。"),
    ("6♥5♥ 对 K♥9♥2♥，对手大同花 —— 0.17%",
     "小同花撞大同花，几乎必死。这组数据的意义在于提醒反向隐含赔率："
     "你成了同花，但对手的同花更大，你输的是全部筹码。所以小同花在多人池里要格外小心。"),
]
for head, body in SCENE_NOTES:
    rich(doc, [(head, True, DARK)], size=9.5, space_after=1)
    para(doc, body, size=9.5, indent=0.4, space_after=8)

# ============ 八 ============
doc.add_heading("八、怎么用这些数字", level=1)

doc.add_heading("把胜率和底池赔率放在一起看", level=2)
para(doc, "翻后跟注的判据只有一条：你的实际胜率 > 底池赔率要求的盈亏平衡胜率，就跟。")
make_table(doc, [
    ["对手下注", "你需要赢的概率", "对应上面的表怎么查"],
    ["1/4 池", "20.0%", "几乎任何听牌都够，甚至后门听牌"],
    ["1/3 池", "25.0%", "两头顺（34%）、同花听牌（约 35%）都够"],
    ["1/2 池", "33.3%", "同花听牌刚好够，卡顺（约 17%）不够"],
    ["2/3 池", "40.0%", "只有 15 张以上出路才够"],
    ["满池", "50.0%", "除非已成牌，否则听牌都不够"],
], widths=[3.4, 4.2, 9.4], col_align=[WD_ALIGN_PARAGRAPH.LEFT] * 3)
note(doc, "公式：盈亏平衡胜率 = 跟注额 ÷（底池 + 跟注额）。例：底池 100，对手下 50，你跟 50，需要 50 ÷ 150 = 33.3%。")

doc.add_heading("三个常见误用", level=2)
for h, b in [
    ("拿单挑胜率去判断多人池。", "AA 单挑 85%，六人池 31%。表里的所有单挑数字，在三人以上池里都要大幅打折。"),
    ("拿「现在胜率」去判断「该不该跟」。", "胜率要和赔率配对才有意义。34% 的胜率面对 1/3 池下注是好牌，面对满池下注是坏牌——同一个 34%。"),
    ("忽略隐含赔率。", "34% 的两头顺，如果能确定成牌后对手会付钱，实际期望远高于账面。反过来小同花的 0.17%，就是隐含赔率为负的极端例子。"),
]:
    rich(doc, [("· " + h + " ", True, RED), (b, False, None)], size=10)

doc.add_paragraph()
para(doc, "数据来源：本地蒙特卡洛引擎（自研 7 张牌评估器 + 加权范围采样），种子固定，结果可复现。单挑 8 万局/组，范围对抗 5 万局/组，统计误差约 ±0.2~0.3 个百分点。", size=9, color="7F7F7F")

doc.save("德州扑克胜率数据手册.docx")
print("SAVED 2")
