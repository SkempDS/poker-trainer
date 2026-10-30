# -*- coding: utf-8 -*-
"""7 张牌牌力评估器 + 蒙特卡洛胜率计算。

牌编码：0..51, rank = c // 4 (0='2' ... 12='A'), suit = c % 4 (0..3)
"""
import random
import json
import sys

RANK_CHARS = "23456789TJQKA"
SUIT_CHARS = "shdc"  # 0=s 1=h 2=d 3=c

# ---- 预计算顺子表：13 位 rank 掩码 -> 顺子最高 rank (无则 -1) ----
# 注意：轮子 A2345 不能靠"把 A 挪到低位"来做，因为 bit0 本身就是 2。
# 必须单独判定：有 A(bit12) 且 2,3,4,5(bit0..3) 全有 -> 5 高顺子，记作 hi=3。
STRAIGHT_HIGH = [-1] * 8192
for m in range(8192):
    best = -1
    for hi in range(12, 3, -1):  # hi 是最高牌 rank，需要 hi-4..hi 全有
        seg = 0b11111 << (hi - 4)
        if (m & seg) == seg:
            best = hi
            break
    if best < 0 and (m & (1 << 12)) and ((m & 0b1111) == 0b1111):
        best = 3  # A2345：5 高
    STRAIGHT_HIGH[m] = best


def eval7(cards):
    """返回可比较的整数分数，越大越强。cards 为 7 个 0..51 的整数。"""
    cnt = [0] * 13
    suit_cnt = [0] * 4
    suit_mask = [0] * 4
    mask = 0
    for c in cards:
        r = c >> 2
        s = c & 3
        cnt[r] += 1
        suit_cnt[s] += 1
        suit_mask[s] |= (1 << r)
        mask |= (1 << r)

    # 同花 / 同花顺
    flush_suit = -1
    for s in range(4):
        if suit_cnt[s] >= 5:
            flush_suit = s
            break
    if flush_suit >= 0:
        fm = suit_mask[flush_suit]
        sh = STRAIGHT_HIGH[fm]
        if sh >= 0:
            return (8 << 20) | (sh << 16)

    # 按数量分组
    quad = -1
    trips = []
    pairs = []
    for r in range(12, -1, -1):
        c = cnt[r]
        if c == 4:
            quad = r
        elif c == 3:
            trips.append(r)
        elif c == 2:
            pairs.append(r)

    if quad >= 0:
        kick = -1
        for r in range(12, -1, -1):
            if r != quad and cnt[r] > 0:
                kick = r
                break
        return (7 << 20) | (quad << 16) | (kick << 12)

    if trips:
        t = trips[0]
        if len(trips) >= 2:
            p = trips[1]
        elif pairs:
            p = pairs[0]
        else:
            p = -1
        if p >= 0:
            return (6 << 20) | (t << 16) | (p << 12)

    if flush_suit >= 0:
        fm = suit_mask[flush_suit]
        vals = []
        for r in range(12, -1, -1):
            if fm & (1 << r):
                vals.append(r)
                if len(vals) == 5:
                    break
        score = 5 << 20
        for i, v in enumerate(vals):
            score |= v << (16 - 4 * i)
        return score

    sh = STRAIGHT_HIGH[mask]
    if sh >= 0:
        return (4 << 20) | (sh << 16)

    if trips:
        t = trips[0]
        ks = [r for r in range(12, -1, -1) if r != t and cnt[r] > 0][:2]
        score = (3 << 20) | (t << 16)
        if len(ks) > 0:
            score |= ks[0] << 12
        if len(ks) > 1:
            score |= ks[1] << 8
        return score

    if len(pairs) >= 2:
        hi, lo = pairs[0], pairs[1]
        k = -1
        for r in range(12, -1, -1):
            if r != hi and r != lo and cnt[r] > 0:
                k = r
                break
        score = (2 << 20) | (hi << 16) | (lo << 12)
        if k >= 0:
            score |= k << 8
        return score

    if len(pairs) == 1:
        p = pairs[0]
        ks = [r for r in range(12, -1, -1) if r != p and cnt[r] > 0][:3]
        score = (1 << 20) | (p << 16)
        for i, v in enumerate(ks):
            score |= v << (12 - 4 * i)
        return score

    vals = [r for r in range(12, -1, -1) if cnt[r] > 0][:5]
    score = 0
    for i, v in enumerate(vals):
        score |= v << (16 - 4 * i)
    return score


def cards_to_str(cards):
    return " ".join(RANK_CHARS[c >> 2] + SUIT_CHARS[c & 3] for c in cards)


if __name__ == "__main__":
    # 自检：一组已知牌型
    cases = [
        ("皇家同花顺", "AsKsQsJsTs2c3d", 8),
        ("同花顺", "9s8s7s6s5s2c3d", 8),
        ("四条", "AcAdAhAsKc2d3h", 7),
        ("葫芦", "AcAdAhKsKc2d3h", 6),
        ("同花", "AsKs9s5s2s3d4h", 5),
        ("顺子", "9c8d7h6s5cAdKh", 4),
        ("三条", "AcAdAhKsQc2d3h", 3),
        ("两对", "AcAdKhKsQc2d3h", 2),
        ("一对", "AcAdKhQsJc2d3h", 1),
        ("高牌", "AcKdQhJs9c2d3h", 0),
    ]
    for name, s, expect in cases:
        cards = []
        for i in range(0, len(s), 2):
            r = RANK_CHARS.index(s[i])
            su = SUIT_CHARS.index(s[i + 1])
            cards.append(r * 4 + su)
        sc = eval7(cards)
        cat = sc >> 20
        ok = "OK" if cat == expect else "FAIL"
        print(f"{ok} {name}: cat={cat} expect={expect}")
