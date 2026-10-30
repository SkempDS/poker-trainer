# -*- coding: utf-8 -*-
"""蒙特卡洛胜率引擎 + 范围解析。

牌编码：0..51, rank = c // 4 (0='2' ... 12='A'), suit = c % 4
suit: 0=s 1=h 2=d 3=c
"""
import random
import itertools
from evaluator import eval7, RANK_CHARS, SUIT_CHARS

RANK_IDX = {ch: i for i, ch in enumerate(RANK_CHARS)}

ALL_CARDS = list(range(52))


def parse_card(s):
    return RANK_IDX[s[0]] * 4 + SUIT_CHARS.index(s[1])


def card_str(c):
    return RANK_CHARS[c >> 2] + SUIT_CHARS[c & 3]


# ---------------- 手牌组合生成 ----------------

def combo_of(card_pair):
    a, b = card_pair
    return (a, b) if a < b else (b, a)


def all_combos_for_169(rank1, rank2, suited=None):
    """给定两个 rank（0..12），返回所有具体组合。suited: True 同花 / False 非同花 / None 全部"""
    out = []
    if rank1 == rank2:
        for s1 in range(4):
            for s2 in range(s1 + 1, 4):
                out.append(combo_of((rank1 * 4 + s1, rank1 * 4 + s2)))
        return out
    for s1 in range(4):
        for s2 in range(4):
            if suited is True and s1 != s2:
                continue
            if suited is False and s1 == s2:
                continue
            out.append(combo_of((rank1 * 4 + s1, rank2 * 4 + s2)))
    return list(set(out))


def hand169_list():
    """返回 [(name, rank_hi, rank_lo, suited_flag), ...] 共 169 项"""
    out = []
    for a in range(13):
        for b in range(a + 1):
            if a == b:
                out.append((RANK_CHARS[a] + RANK_CHARS[b], a, b, None))
            else:
                out.append((RANK_CHARS[a] + RANK_CHARS[b] + "s", a, b, True))
                out.append((RANK_CHARS[a] + RANK_CHARS[b] + "o", a, b, False))
    return out


def expand_range(spec_str):
    """解析范围字符串，返回去重后的具体组合列表。
    支持: 'AA', 'KK+', 'A2s+', 'KTo+', 'T9s', '54s-98s', 'JTs-76s', 'AK', '22+'
    """
    combos = set()
    tokens = [t.strip() for t in spec_str.replace(" ", ",").split(",") if t.strip()]
    for tok in tokens:
        parts = tok.split("-")
        if len(parts) == 2:
            a, b = parts
            combos |= _expand_one(a)
            combos |= _expand_one(b)
            # 区间内所有
            combos |= _expand_between(a, b)
        else:
            combos |= _expand_one(tok)
    return sorted(combos)


def parse_combos(spec_str):
    """解析具体组合串, 如 'AhKh,AsKs' 或 'AhKh'"""
    out = []
    for tok in spec_str.replace(" ", ",").split(","):
        tok = tok.strip()
        if not tok:
            continue
        out.append(combo_of((parse_card(tok[0:2]), parse_card(tok[2:4]))))
    return out


def _parse_token(tok):
    """返回 (hi_rank, lo_rank, suited, plus, is_pair)"""
    tok = tok.strip()
    plus = tok.endswith("+")
    if plus:
        tok = tok[:-1]
    suited = None
    if tok.endswith("s"):
        suited = True
        tok = tok[:-1]
    elif tok.endswith("o"):
        suited = False
        tok = tok[:-1]
    r1 = RANK_IDX[tok[0]]
    r2 = RANK_IDX[tok[1]]
    hi, lo = max(r1, r2), min(r1, r2)
    return hi, lo, suited, plus, (hi == lo)


def _expand_one(tok):
    hi, lo, suited, plus, is_pair = _parse_token(tok)
    out = set()
    if is_pair:
        if plus:
            for r in range(hi, 13):
                out |= set(all_combos_for_169(r, r, None))
        else:
            out |= set(all_combos_for_169(hi, lo, None))
        return out

    if plus:
        # A2s+ 表示同 rank 高端往上? 约定：保持 hi 不变，lo 从当前升到 hi-1
        for r in range(lo, hi):
            out |= set(all_combos_for_169(hi, r, suited))
    else:
        out |= set(all_combos_for_169(hi, lo, suited))
    return out


def _expand_between(a, b):
    """处理 T9s-54s 这类沿对角线区间"""
    ha, la, sa, _, pa = _parse_token(a)
    hb, lb, sb, _, pb = _parse_token(b)
    out = set()
    if pa and pb:
        for r in range(min(ha, hb), max(ha, hb) + 1):
            out |= set(all_combos_for_169(r, r, None))
        return out
    # 同 gap 的连张区间
    gap_a = ha - la
    gap_b = hb - lb
    suited = sa if sa is not None else sb
    for top in range(min(ha, hb), max(ha, hb) + 1):
        lo = top - gap_a
        if lo < 0:
            continue
        out |= set(all_combos_for_169(top, lo, suited))
    return out


# ---------------- 蒙特卡洛 ----------------

def mc_equity(hero_cards, opp_range, board=None, iters=20000, rng=None):
    """hero_cards: 2 张牌; opp_range: 具体组合列表;
    返回 dict(win, tie, equity, iters)"""
    rng = rng or random
    board = list(board or [])
    hero = list(hero_cards)

    dead = set(hero) | set(board)

    # 先过滤对手范围内与已知牌冲突的组合
    legal_opp = [c for c in opp_range if c[0] not in dead and c[1] not in dead]
    if not legal_opp:
        return {"win": 0.0, "tie": 0.0, "equity": 0.0, "iters": 0, "opp_combos": 0}

    win = 0.0
    tie = 0.0
    n_ok = 0
    need = 5 - len(board)
    full_deck = ALL_CARDS

    for _ in range(iters):
        opp = legal_opp[rng.randrange(len(legal_opp))]
        used = dead | set(opp)
        if len(used) != len(dead) + 2:
            continue  # 与牌面冲突（理论上不会，因为 dead 已排除）
        avail = [c for c in full_deck if c not in used]
        run = board + rng.sample(avail, need)
        hs = eval7(hero + run)
        os_ = eval7(list(opp) + run)
        n_ok += 1
        if hs > os_:
            win += 1
        elif hs == os_:
            tie += 1
    if n_ok == 0:
        return {"win": 0.0, "tie": 0.0, "equity": 0.0, "iters": 0, "opp_combos": len(legal_opp)}
    return {
        "win": win / n_ok,
        "tie": tie / n_ok,
        "equity": (win + tie / 2) / n_ok,
        "iters": n_ok,
        "opp_combos": len(legal_opp),
    }


def mc_equity_multi(hero_cards, opp_ranges, board=None, iters=20000, rng=None):
    """多个对手，每个给一个范围列表"""
    rng = rng or random
    board = list(board or [])
    hero = list(hero_cards)
    dead = set(hero) | set(board)
    win = 0.0
    tie = 0.0
    n_ok = 0
    need = 5 - len(board)
    for _ in range(iters):
        used = set(dead)
        opps = []
        ok = True
        for rng_list in opp_ranges:
            legal = [c for c in rng_list if c[0] not in used and c[1] not in used]
            if not legal:
                ok = False
                break
            pick = legal[rng.randrange(len(legal))]
            opps.append(pick)
            used |= set(pick)
        if not ok:
            continue
        avail = [c for c in ALL_CARDS if c not in used]
        run = board + rng.sample(avail, need)
        hs = eval7(hero + run)
        best = max(eval7(list(o) + run) for o in opps)
        n_ok += 1
        if hs > best:
            win += 1
        elif hs == best:
            tie += 1
    if n_ok == 0:
        return {"win": 0, "tie": 0, "equity": 0, "iters": 0}
    return {
        "win": win / n_ok,
        "tie": tie / n_ok,
        "equity": (win + tie / 2) / n_ok,
        "iters": n_ok,
    }


def mc_range_vs_range(hero_range, villain_range, board=None, iters=50000, rng=None):
    """范围对范围：每轮从两侧范围各随机抽一个组合（排除冲突），标准加权采样。"""
    rng = rng or random
    board = list(board or [])
    dead0 = set(board)
    hr = [c for c in hero_range if not (set(c) & dead0)]
    vr = [c for c in villain_range if not (set(c) & dead0)]
    if not hr or not vr:
        return {"equity": 0.0, "iters": 0, "hero_combos": len(hr), "villain_combos": len(vr)}
    need = 5 - len(board)
    win = 0.0
    tie = 0.0
    n = 0
    for _ in range(iters):
        h = hr[rng.randrange(len(hr))]
        # 对手组合不能与 hero 冲突
        v = vr[rng.randrange(len(vr))]
        if set(h) & set(v):
            continue
        used = dead0 | set(h) | set(v)
        avail = [c for c in ALL_CARDS if c not in used]
        run = board + rng.sample(avail, need)
        hs = eval7(list(h) + run)
        vs = eval7(list(v) + run)
        n += 1
        if hs > vs:
            win += 1
        elif hs == vs:
            tie += 1
    if n == 0:
        return {"equity": 0.0, "iters": 0, "hero_combos": len(hr), "villain_combos": len(vr)}
    return {
        "equity": (win + tie / 2) / n,
        "win": win / n,
        "tie": tie / n,
        "iters": n,
        "hero_combos": len(hr),
        "villain_combos": len(vr),
    }


if __name__ == "__main__":
    import time
    t0 = time.time()
    aa = all_combos_for_169(12, 12, None)
    kk = all_combos_for_169(11, 11, None)
    r = mc_equity(aa[0], kk, iters=20000)
    print("AA vs KK:", r, f"{time.time()-t0:.2f}s")
    t0 = time.time()
    r = mc_equity(aa[0], kk, iters=20000)
    print("第二次:", r, f"{time.time()-t0:.2f}s")
