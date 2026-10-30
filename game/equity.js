/* equity.js — 169 起手牌胜率表 + 范围展开 + 蒙特卡洛胜率
 * 数据来源：data_169.json（对随机手牌胜率），由 gen_169.py 用 Python 精确模拟生成。
 * 依赖 core.js 的 eval7。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.PokerEquity = factory(root.PokerCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  const RANK_CHARS = Core.RANK_CHARS;
  const SUIT_CHARS = Core.SUIT_CHARS;
  const RANK_TEXT = Core.RANK_TEXT;

  /* ---------------- 169 表（紧凑数组，运行时展开为 Map） ----------------
   * 每项 [hand, equity, tier, combos]；tier: 0=S 1=A 2=B 3=C 4=D 5=E
   * 数据由 build.py 从 data_169.json 注入到 globalThis.__TABLE_169__。
   * Node 测试时由 test 脚本先加载 json 再 require 本文件。
   */
  const G = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this);
  const TABLE_169_RAW = G.__TABLE_169__ || [];

  const EQ169 = new Map();     // 'AA' -> equity(0..1)
  const TIER169 = new Map();   // 'AA' -> tier index
  const COMBOS169 = new Map(); // 'AA' -> 组合数
  for (const row of TABLE_169_RAW) {
    EQ169.set(row[0], row[1]);
    TIER169.set(row[0], row[2]);
    COMBOS169.set(row[0], row[3]);
  }
  const TIER_NAMES = ['S 超强', 'A 强', 'B 中强', 'C 可玩', 'D 边缘', 'E 弃牌'];

  /* ---------------- 手牌归一化 ---------------- */
  function handKey(c1, c2) {
    let r1 = c1 >> 2, r2 = c2 >> 2;
    const s1 = c1 & 3, s2 = c2 & 3;
    if (r1 < r2) { const t = r1; r1 = r2; r2 = t; }
    if (r1 === r2) return RANK_CHARS[r1] + RANK_CHARS[r2];
    return RANK_CHARS[r1] + RANK_CHARS[r2] + (s1 === s2 ? 's' : 'o');
  }

  function eq169Of(c1, c2) { return EQ169.get(handKey(c1, c2)) || 0.35; }
  function tierOf(c1, c2) {
    const t = TIER169.get(handKey(c1, c2));
    return t == null ? 5 : t;
  }

  /* ---------------- 手牌的显示文本 ----------------
   * 紧凑键（AA / AKs / AKo）里 T 代表 10；界面显示一律换成数字 10。
   *   'AA'  -> 'AA（一对 A）'
   *   'TT'  -> '10 10（一对 10）'
   *   'AKs' -> 'AKs（A K 同花）'
   *   'T9s' -> '10 9 同花'   （本身已展开，不再重复加括号）
   *   'K8o' -> 'K8o（K 8 非同花）'
   */
  function _rankTextOf(key, i) { return RANK_TEXT[RANK_CHARS.indexOf(key.charAt(i))]; }

  function handLabel(key) {
    if (!key) return '';
    const r1 = _rankTextOf(key, 0), r2 = _rankTextOf(key, 1);
    const wide = (r1.length > 1 || r2.length > 1);
    if (key.length === 2) return wide ? r1 + ' ' + r2 : r1 + r2;
    return (wide ? r1 + ' ' + r2 + ' ' : r1 + r2) + (key.charAt(2) === 's' ? '同花' : '非同花');
  }

  function handExplain(key) {
    if (!key) return '';
    const r1 = _rankTextOf(key, 0), r2 = _rankTextOf(key, 1);
    if (key.length === 2) return '一对 ' + r1;
    return r1 + ' ' + r2 + (key.charAt(2) === 's' ? ' 同花' : ' 非同花');
  }

  function handFull(key) {
    if (!key) return '';
    const r1 = _rankTextOf(key, 0), r2 = _rankTextOf(key, 1);
    if (key.length === 2) {
      return (r1.length > 1 ? r1 + ' ' + r2 : r1 + r2) + '（一对 ' + r1 + '）';
    }
    const cn = (key.charAt(2) === 's' ? ' 同花' : ' 非同花');
    // 含 10 时紧凑键本身就看不懂，直接给中文展开式
    if (r1.length > 1 || r2.length > 1) return r1 + ' ' + r2 + cn;
    return r1 + r2 + key.charAt(2) + '（' + r1 + ' ' + r2 + cn + '）';
  }

  /* ---------------- 169 全组合 ---------------- */
  function combosFor169(hi, lo, suited) {
    const out = [];
    if (hi === lo) {
      for (let s1 = 0; s1 < 4; s1++)
        for (let s2 = s1 + 1; s2 < 4; s2++)
          out.push([hi * 4 + s1, lo * 4 + s2]);
    } else if (suited) {
      for (let s = 0; s < 4; s++) out.push([hi * 4 + s, lo * 4 + s]);
    } else {
      for (let s1 = 0; s1 < 4; s1++)
        for (let s2 = 0; s2 < 4; s2++)
          if (s1 !== s2) out.push([hi * 4 + s1, lo * 4 + s2]);
    }
    return out;
  }

  function allCombosForHandString(h) {
    const r1 = RANK_CHARS.indexOf(h.charAt(0));
    const r2 = RANK_CHARS.indexOf(h.charAt(1));
    if (r1 < 0 || r2 < 0) return [];
    if (h.length === 2) return combosFor169(r1, r2, null);
    return combosFor169(r1, r2, h.charAt(2) === 's');
  }

  /* ---------------- 范围展开 ----------------
   * 支持: AA, 22+, A2s+, KTo+, T9s, 54s-98s, 以及逗号分隔
   */
  function expandOne(tok) {
    tok = tok.trim();
    if (!tok) return [];
    // 区间 a-b 形式，两端都是具体手牌
    const dash = tok.indexOf('-');
    if (dash > 0) {
      const a = tok.slice(0, dash), b = tok.slice(dash + 1);
      const pa = parseHandTok(a), pb = parseHandTok(b);
      if (pa && pb && pa.suited === pb.suited) {
        const out = [];
        const hiA = Math.max(pa.r1, pa.r2), loA = Math.min(pa.r1, pa.r2);
        const hiB = Math.max(pb.r1, pb.r2), loB = Math.min(pb.r1, pb.r2);
        // 只支持同 gap 的连张区间（如 54s-98s）
        const gapA = hiA - loA, gapB = hiB - loB;
        if (gapA === gapB) {
          const step = hiA >= hiB ? -1 : 1;
          let hi = hiA, lo = loA;
          for (let g = 0; g < 20; g++) {
            if (hi < 0 || hi > 12 || lo < 0 || lo > 12) break;
            out.push(...combosFor169(hi, lo, pa.suited));
            if (hi === hiB && lo === loB) break;
            hi += step; lo += step;
          }
          return out;
        }
      }
      return [];
    }
    const plus = tok.endsWith('+');
    const base = plus ? tok.slice(0, -1) : tok;
    const p = parseHandTok(base);
    if (!p) return [];
    if (!plus) {
      if (p.rank1 === p.rank2) return combosFor169(p.r1, p.r2, null);
      return combosFor169(p.r1, p.r2, p.suited);
    }
    const out = [];
    if (p.rank1 === p.rank2) {
      for (let r = p.r1; r <= 12; r++) out.push(...combosFor169(r, r, null));
    } else {
      // A2s+ 表示 A 与 2..A-1 的同花；KTo+ 表示 K 与 T..K-1 的非同花
      const hi = p.r1, loStart = p.r2;
      for (let lo = loStart; lo < hi; lo++) out.push(...combosFor169(hi, lo, p.suited));
    }
    return out;
  }

  function parseHandTok(t) {
    t = t.trim();
    if (t.length < 2) return null;
    const r1 = RANK_CHARS.indexOf(t.charAt(0).toUpperCase());
    const r2 = RANK_CHARS.indexOf(t.charAt(1).toUpperCase());
    if (r1 < 0 || r2 < 0) return null;
    let suited = null;
    if (t.length >= 3) {
      const c = t.charAt(2).toLowerCase();
      if (c === 's') suited = true;
      else if (c === 'o') suited = false;
      else return null;
    }
    return { r1: Math.max(r1, r2), r2: Math.min(r1, r2), rank1: r1, rank2: r2, suited };
  }

  function expandRange(spec) {
    const toks = String(spec).split(/[,\s]+/).filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const t of toks) {
      for (const c of expandOne(t)) {
        const k = c[0] * 52 + c[1];
        if (seen.has(k)) continue;
        seen.add(k); out.push(c);
      }
    }
    return out;
  }

  /* ---------------- 蒙特卡洛胜率 ---------------- */
  function mcEquity(heroCards, oppCombos, board, iters, rand) {
    rand = rand || Math.random;
    iters = iters || 3000;
    const dead = new Set(heroCards);
    for (const c of board) dead.add(c);
    const pool = [];
    for (const c of Core.ALL_CARDS) if (!dead.has(c)) pool.push(c);

    // 过滤掉与死牌冲突的对手组合
    const valid = [];
    for (const cb of oppCombos) {
      if (dead.has(cb[0]) || dead.has(cb[1])) continue;
      valid.push(cb);
    }
    if (valid.length === 0) return { equity: 0.5, win: 0.5, tie: 0, iters: 0 };
    return _mcRun(heroCards, [valid], board, iters, rand, pool);
  }

  function mcEquityMulti(heroCards, oppRangeList, board, iters, rand) {
    rand = rand || Math.random;
    iters = iters || 3000;
    const dead = new Set(heroCards);
    for (const c of board) dead.add(c);
    const pool = [];
    for (const c of Core.ALL_CARDS) if (!dead.has(c)) pool.push(c);
    const lists = [];
    for (const rl of oppRangeList) {
      const v = rl.filter(cb => !dead.has(cb[0]) && !dead.has(cb[1]));
      if (v.length) lists.push(v);
    }
    if (!lists.length) return { equity: 0.5, win: 0.5, tie: 0, iters: 0 };
    return _mcRun(heroCards, lists, board, iters, rand, pool);
  }

  function _mcRun(heroCards, lists, board, iters, rand, pool) {
    const needBoard = 5 - board.length;
    let win = 0, tie = 0;
    const heroHand = heroCards.slice();
    const used = [];
    for (let it = 0; it < iters; it++) {
      // 为每个对手抽一手（互不冲突）
      const taken = new Set();
      const oppHands = [];
      let ok = true;
      for (const lst of lists) {
        let picked = null;
        for (let tries = 0; tries < 40; tries++) {
          const cb = lst[(rand() * lst.length) | 0];
          if (taken.has(cb[0]) || taken.has(cb[1])) continue;
          if (heroCards.indexOf(cb[0]) >= 0 || heroCards.indexOf(cb[1]) >= 0) continue;
          picked = cb; break;
        }
        if (!picked) { ok = false; break; }
        taken.add(picked[0]); taken.add(picked[1]);
        oppHands.push(picked);
      }
      if (!ok) continue;
      // 补齐公共牌
      const extra = [];
      let guard = 0;
      while (extra.length < needBoard && guard++ < 500) {
        const c = pool[(rand() * pool.length) | 0];
        if (taken.has(c)) continue;
        taken.add(c); extra.push(c);
      }
      if (extra.length < needBoard) continue;
      const fullBoard = board.concat(extra);
      const heroScore = Core.eval7(heroHand.concat(fullBoard));
      let bestOpp = -1;
      for (const oh of oppHands) {
        const s = Core.eval7(oh.concat(fullBoard));
        if (s > bestOpp) bestOpp = s;
      }
      if (heroScore > bestOpp) win++;
      else if (heroScore === bestOpp) tie++;
    }
    const n = Math.max(1, iters);
    return { equity: (win + tie / 2) / n, win: win / n, tie: tie / n, iters };
  }

  /* ---------------- 范围 vs 范围 ---------------- */
  function mcRangeVsRange(heroRange, villainRange, board, iters, rand) {
    rand = rand || Math.random;
    iters = iters || 3000;
    let win = 0, tie = 0, done = 0;
    let guard = 0;
    while (done < iters && guard++ < iters * 20) {
      const h = heroRange[(rand() * heroRange.length) | 0];
      const v = villainRange[(rand() * villainRange.length) | 0];
      if (h[0] === v[0] || h[0] === v[1] || h[1] === v[0] || h[1] === v[1]) continue;
      const dead = new Set([h[0], h[1], v[0], v[1]]);
      for (const c of board) dead.add(c);
      const need = 5 - board.length;
      const extra = [];
      let g2 = 0;
      while (extra.length < need && g2++ < 500) {
        const c = (rand() * 52) | 0;
        if (dead.has(c)) continue;
        dead.add(c); extra.push(c);
      }
      if (extra.length < need) continue;
      const fb = board.concat(extra);
      const a = Core.eval7(h.concat(fb));
      const b = Core.eval7(v.concat(fb));
      if (a > b) win++;
      else if (a === b) tie++;
      done++;
    }
    const n = Math.max(1, done);
    return { equity: (win + tie / 2) / n, win: win / n, tie: tie / n, iters: done };
  }

  /* ---------------- 位置开池范围（内联自 data_ranges.json） ---------------- */
  const RANGE_SPECS = G.__RANGE_SPECS__ || {};
  const POS_NAMES = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const RANGE_CACHE = {};
  function rangeFor(pos) {
    if (!RANGE_CACHE[pos]) RANGE_CACHE[pos] = expandRange(RANGE_SPECS[pos] || '');
    return RANGE_CACHE[pos];
  }

  return {
    EQ169, TIER169, COMBOS169, TABLE_169_RAW, TIER_NAMES,
    handKey, eq169Of, tierOf, combosFor169, allCombosForHandString,
    handLabel, handExplain, handFull,
    expandRange, parseHandTok, mcEquity, mcEquityMulti, mcRangeVsRange,
    RANGE_SPECS, POS_NAMES, rangeFor
  };
});
