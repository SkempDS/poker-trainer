# -*- coding: utf-8 -*-
"""把 odds/ 下的模板与脚本拼成单文件 HTML：德州扑克-赔率计算器.html"""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
POKER = os.path.dirname(HERE)
GAME = os.path.join(POKER, "game")
OUT = os.path.join(POKER, "德州扑克-赔率计算器.html")


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def load_table():
    data = json.loads(read(os.path.join(POKER, "data_169.json")))
    tiers = data.get("tiers") or []
    rows = []
    for r in data["rows"]:
        ti = tiers.index(r["tier"]) if r.get("tier") in tiers else 0
        rows.append([r["hand"], round(r["equity"] / 100.0, 6), ti, r["combos"]])
    return rows


def load_ranges():
    data = json.loads(read(os.path.join(POKER, "data_ranges.json")))
    src = data["ranges"]
    mapping = {
        "UTG": "UTG 开池",
        "HJ": "HJ 开池",
        "CO": "CO 开池",
        "BTN": "BTN 开池",
        "SB": "SB 开池",
        "BB": "BB 防守 vs BTN",
        "BB_UTG": "BB 防守 vs UTG",
    }
    out = {}
    for k, name in mapping.items():
        if name in src:
            out[k] = src[name]["spec"]
    return out


def main():
    tpl = read(os.path.join(HERE, "index.template.html"))
    css = read(os.path.join(HERE, "styles.css"))
    core = read(os.path.join(GAME, "core.js"))
    equity = read(os.path.join(GAME, "equity.js"))
    odds = read(os.path.join(HERE, "odds.js"))
    odds_ui = read(os.path.join(HERE, "odds_ui.js"))

    table = load_table()
    ranges = load_ranges()

    repl = {
        "/*__CSS__*/": css,
        "/*__TABLE_169__*/": "window.__TABLE_169__ = " + json.dumps(table, ensure_ascii=False) + ";",
        "/*__RANGE_SPECS__*/": "window.__RANGE_SPECS__ = " + json.dumps(ranges, ensure_ascii=False) + ";",
        "/*__CORE__*/": core,
        "/*__EQUITY__*/": equity,
        "/*__ODDS__*/": odds,
        "/*__ODDS_UI__*/": odds_ui,
    }
    html = tpl
    for k, v in repl.items():
        if k not in html:
            print("!! 缺少占位符 " + k)
            return 1
        html = html.replace(k, v)

    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)

    size = os.path.getsize(OUT)
    print("产物 " + OUT)
    print("字节 " + str(size) + "  (" + ("%.1f" % (size / 1024.0)) + " KB)")
    print("169 表 " + str(len(table)) + " 行，范围 " + str(len(ranges)) + " 个")
    return 0


if __name__ == "__main__":
    sys.exit(main())
