# -*- coding: utf-8 -*-
"""把 game/ 下的分文件拼成单文件 HTML。"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
G = os.path.join(HERE, "game")
OUT = os.path.join(HERE, "德州扑克.html")


def read(name, base=G):
    with open(os.path.join(base, name), encoding="utf-8") as f:
        return f.read()


def load_table():
    d = json.load(open(os.path.join(HERE, "data_169.json"), encoding="utf-8"))
    tiers = d.get("tiers") or ["S 超强", "A 强", "B 中强", "C 可玩", "D 边缘", "E 弃牌"]
    rows = []
    for r in d["rows"]:
        rows.append([r["hand"], round(r["equity"] / 100, 5), tiers.index(r["tier"]), r["combos"]])
    return rows


def load_ranges():
    d = json.load(open(os.path.join(HERE, "data_ranges.json"), encoding="utf-8"))
    mp = {
        "UTG 开池": "UTG", "HJ 开池": "HJ", "CO 开池": "CO",
        "BTN 开池": "BTN", "SB 开池": "SB",
        "BB 防守 vs BTN": "BB", "BB 防守 vs UTG": "BB_UTG",
    }
    out = {}
    for k, v in (d.get("ranges") or {}).items():
        short = mp.get(k)
        if short:
            out[short] = v["spec"]
    return out


def main():
    tpl = read("index.template.html")
    table_js = "globalThis.__TABLE_169__=" + json.dumps(load_table(), ensure_ascii=False) + ";"
    ranges_js = "globalThis.__RANGE_SPECS__=" + json.dumps(load_ranges(), ensure_ascii=False) + ";"

    html = (tpl
            .replace("/*__CSS__*/", read("styles.css"))
            .replace("/*__TABLE_169__*/", table_js)
            .replace("/*__RANGE_SPECS__*/", ranges_js)
            .replace("/*__CORE__*/", read("core.js"))
            .replace("/*__EQUITY__*/", read("equity.js"))
            .replace("/*__AI__*/", read("ai.js"))
            .replace("/*__REVIEW__*/", read("review.js"))
            .replace("/*__UI__*/", read("ui.js")))

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)

    n = len(rows := load_table())
    print("写出", OUT)
    print("大小 %.1f KB" % (os.path.getsize(OUT) / 1024.0))
    print("169 表行数", n, "范围数", len(load_ranges()))
    assert n == 169


if __name__ == "__main__":
    main()
