/* odds.js — 赔率 / 胜率计算核心（不碰 DOM，可在 Node 里直接 require 测试）
 *
 * 设计前提：这个工具是实战中用的，你看不到对手的底牌。
 * 所以对手一律按「随机手牌」或「某个范围」处理，不接受逐张指定对手的手牌。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../game/core.js'), require('../game/equity.js'));
  } else {
    root.PokerOdds = factory(root.PokerCore, root.PokerEquity);
  }
})(typeof self !== 'undefined' ? self : this, function (Core, EQ) {
  'use strict';

  // 全部 1326 种两牌组合，用作「随机手牌」的对手范围
  const ALL_COMBOS = (function () {
    const out = [];
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) out.push([a, b]);
    return out;
  })();

  const STAGES = [
    { id: 'preflop', name: '翻前', boardCount: 0 },
    { id: 'flop', name: '翻牌', boardCount: 3 },
    { id: 'turn', name: '转牌', boardCount: 4 },
    { id: 'river', name: '河牌', boardCount: 5 }
  ];

  // 对手范围预设：随机 + 复用游戏里那套位置范围 + 自定义
  const RANGE_PRESETS = [
    { key: 'random', name: '随机手牌（什么都有）', short: '随机手牌' },
    { key: 'UTG', name: '偏紧 · UTG 开池', short: '偏紧 · UTG' },
    { key: 'CO', name: '中等 · CO 开池', short: '中等 · CO' },
    { key: 'BTN', name: '偏松 · BTN 开池', short: '偏松 · BTN' },
    { key: 'BB', name: 'BB 防守范围', short: 'BB 防守' },
    { key: 'custom', name: '自定义范围（手填）', short: '自定义' }
  ];

  /* ---------------- 工具 ---------------- */

  function cardText(c) { return Core.RANK_TEXT[c >> 2] + Core.SUIT_TEXT[c & 3]; }
  function cardsText(cs) { return cs.map(cardText).join(' '); }

  // 同一输入必须得到同一结果，否则用户点两次会看到不同的数
  function seedOf(hole, board, nOpp, rangeKey) {
    let s = 2166136261 >>> 0;
    const push = (v) => { s ^= (v + 0x9e3779b9) >>> 0; s = Math.imul(s, 16777619) >>> 0; };
    hole.forEach(push); board.forEach(push);
    push(nOpp * 131 + hole.length * 17 + board.length);
    for (let i = 0; i < rangeKey.length; i++) push(rangeKey.charCodeAt(i));
    return s >>> 0;
  }

  function rangeListOf(rangeKey, custom) {
    if (rangeKey === 'random') return ALL_COMBOS;
    if (rangeKey === 'custom') {
      const t = String(custom || '').trim();
      if (!t) return ALL_COMBOS;
      try {
        const r = EQ.expandRange(t);
        return r.length ? r : ALL_COMBOS;
      } catch (e) {
        return ALL_COMBOS;
      }
    }
    const spec = (EQ.RANGE_SPECS || {})[rangeKey];
    if (!spec) return ALL_COMBOS;
    const r = EQ.expandRange(spec);
    return r.length ? r : ALL_COMBOS;
  }

  /* ---------------- 底池赔率 ---------------- */

  // 门槛胜率 = 跟注额 / (底池 + 跟注额)
  // 底池指「现在桌上的全部筹码」，包含对手刚下的那一注，不含你要补的钱。
  function potOdds(pot, call) {
    pot = Math.max(0, Number(pot) || 0);
    call = Math.max(0, Number(call) || 0);
    if (call <= 0) {
      // 不需要跟注（可以免费看牌），门槛为 0
      return { need: 0, ratio: null, ratioText: '免费看牌', ev: 0, free: true };
    }
    const need = call / (pot + call);
    const r = pot / call;                 // 底池 : 跟注
    return {
      need,
      ratio: r,
      ratioText: fmtRatio(r),
      ev: 0,                              // 由 compute 填（需要胜率）
      free: false
    };
  }

  // 把 4.0 这种比值写成「4 : 1」；小于 1 时写成「0.5 : 1」不合适，改写成分数形式
  function fmtRatio(r) {
    if (!isFinite(r) || r <= 0) return '—';
    if (r >= 1) {
      const v = r >= 10 ? Math.round(r) : Math.round(r * 10) / 10;
      return v + ' : 1';
    }
    // r < 1 时反过来写成 1 : (1/r)
    const inv = 1 / r;
    const v = inv >= 10 ? Math.round(inv) : Math.round(inv * 10) / 10;
    return '1 : ' + v;
  }

  /* ---------------- 胜率 ---------------- */

  // 依据阶段给不同的迭代次数：翻前变数最大，多跑一些
  function itersFor(boardLen) {
    if (boardLen === 0) return 9000;
    if (boardLen === 5) return 5000;
    return 7000;
  }

  function equityOf(hole, board, nOpp, rangeKey, custom, iters) {
    const rl = rangeListOf(rangeKey, custom);

    // 翻前单挑对随机手牌：直接查 169 表，比蒙特卡洛更准也更快
    if (board.length === 0 && nOpp === 1 && rangeKey === 'random') {
      const eq = EQ.eq169Of(hole[0], hole[1]);
      return { equity: eq, win: eq, tie: 0, iters: 0, source: '169 表' };
    }

    const lists = [];
    for (let i = 0; i < nOpp; i++) lists.push(rl);
    const rng = Core.mulberry32(seedOf(hole, board, nOpp, rangeKey + custom));
    const r = EQ.mcEquityMulti(hole, lists, board, iters || itersFor(board.length), rng);
    return {
      equity: r.equity, win: r.win, tie: r.tie, iters: r.iters,
      source: rangeKey === 'random' ? '蒙特卡洛 · 对手随机手牌' : '蒙特卡洛 · 对手按范围'
    };
  }

  /* ---------------- 补牌 / 危险牌 ---------------- */

  // 逐张试算：把每张还没露面的牌放到牌面上，重新算你的胜率。
  //
  // 「补牌」按实战口径取：能把你的胜率明显抬高（≥ 4 个百分点）的牌。
  // 不用「越过 50% 平分线」——那样在已经领先时只剩零星几张，与牌手
  // 数听花 9 张的习惯对不上（例：A♥9♥ 在 K♥5♥2c 上对随机已经领先，
  // 但任何红心都能把胜率从 ~55% 推到 ~95%，这 9 张显然要算）。
  // 同时标出其中哪些真正跨过了平分线，供界面区分「反超」与「变强」。
  const SWING = 0.04;

  // 对手人数上限。9 人桌 = 8 个对手，再往上不是德州扑克常见牌桌。
  // 蒙特卡洛每多一个对手只多打一手牌，实测 8 人仍不到 50 ms，不需要分段近似。
  const MAX_OPP = 9;

  function swingCards(hole, board, nOpp, rangeKey, custom, baseEq, itersPer) {
    const line = 1 / (nOpp + 1);
    const dead = new Set(hole.concat(board));
    const unseen = [];
    for (let c = 0; c < 52; c++) if (!dead.has(c)) unseen.push(c);

    const rl = rangeListOf(rangeKey, custom);
    const lists = [];
    for (let i = 0; i < nOpp; i++) lists.push(rl);

    const behind = baseEq < line;
    const hits = [];
    const danger = [];
    for (let i = 0; i < unseen.length; i++) {
      const c = unseen[i];
      const nb = board.concat([c]);
      const rng = Core.mulberry32(seedOf(hole, nb, nOpp, rangeKey + custom + '|s' + i));
      const r = EQ.mcEquityMulti(hole, lists, nb, itersPer || 320, rng);
      const eq = r.equity;
      if (eq - baseEq >= SWING) {
        hits.push({ card: c, eq: eq, crossed: eq > line, gain: eq - baseEq });
      }
      // 「危险牌」只算真正会把你从领先打到落后的那些：
      // 领先时从 72% 掉到 60% 依然领先，那种掉几个点的不算危险，否则一次列 30 张全是噪音。
      if (baseEq >= line && eq < line) {
        danger.push({ card: c, eq: eq, drop: baseEq - eq });
      }
    }
    hits.sort((a, b) => b.eq - a.eq);
    danger.sort((a, b) => a.eq - b.eq);
    return {
      behind: behind, line: line, unseen: unseen.length,
      baseEq: baseEq, hits: hits, danger: danger,
      crossed: behind ? hits.filter(function (h) { return h.crossed; }).length : 0
    };
  }

  // 2 / 4 法则：剩两条街 ×4，剩一条街 ×2
  function ruleOfThumb(outs, cardsToCome) {
    return outs * (cardsToCome >= 2 ? 4 : 2) / 100;
  }

  /* ---------------- 主入口 ---------------- */

  /**
   * 一次算完界面需要的所有数字。
   * @param {object} st
   *   hole      两张某手牌（牌整数），必须 2 张
   *   board     公共牌 0/3/4/5 张
   *   nOpp      对手人数 1~5
   *   rangeKey  对手范围预设 key
   *   custom    自定义范围串
   *   pot       底池（含对手这一注）
   *   call      你需要跟注的金额
   *   wantOuts  是否计算补牌（默认自动判断）
   */
  function compute(st) {
    const hole = (st.hole || []).slice();
    const board = (st.board || []).slice();
    const nOpp = Math.max(1, Math.min(MAX_OPP, Number(st.nOpp) || 1));
    const rangeKey = st.rangeKey || 'random';
    const custom = st.custom || '';

    if (hole.length !== 2) {
      return { ok: false, reason: '先选好你的两张手牌' };
    }
    if ([0, 3, 4, 5].indexOf(board.length) < 0) {
      return { ok: false, reason: '公共牌只能是 0、3、4、5 张（翻牌必须一次给 3 张）' };
    }
    // 重牌检查
    const seen = new Set();
    for (const c of hole.concat(board)) {
      if (seen.has(c)) return { ok: false, reason: '有重复的牌，请检查' };
      seen.add(c);
    }

    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const eq = equityOf(hole, board, nOpp, rangeKey, custom);
    const potNum = Math.max(0, Number(st.pot) || 0);
    const callNum = Math.max(0, Number(st.call) || 0);
    const po = potOdds(potNum, callNum);
    // 跟注的期望收益：赢时拿回「底池 + 自己补的钱」，输时损失补的钱
    const ev = po.free ? 0 : eq.equity * (potNum + callNum) - callNum;

    // 牌型描述
    let handDesc = '', handKey = '', tierName = '';
    handKey = EQ.handKey(hole[0], hole[1]);
    tierName = EQ.TIER_NAMES[EQ.tierOf(hole[0], hole[1])] || '';
    if (board.length >= 3) {
      handDesc = Core.describeHand(Core.eval7(hole.concat(board)));
    } else {
      handDesc = EQ.handFull(handKey);
    }

    // 补牌：只在还有后续街时才有意义
    const cardsToCome = board.length === 0 ? 0 : (5 - board.length);
    let outInfo = null;
    const wantOuts = (st.wantOuts === undefined) ? (board.length === 3 || board.length === 4) : !!st.wantOuts;
    if (wantOuts && cardsToCome > 0) {
      outInfo = swingCards(hole, board, nOpp, rangeKey, custom, eq.equity);
      outInfo.cardsToCome = cardsToCome;
      outInfo.rule = ruleOfThumb(outInfo.hits.length, cardsToCome);
    }

    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    const res = {
      ok: true,
      hole: hole, board: board, nOpp: nOpp,
      handKey: handKey, handDesc: handDesc, tierName: tierName,
      equity: eq.equity, win: eq.win, tie: eq.tie, lose: Math.max(0, 1 - eq.win - eq.tie),
      source: eq.source, iters: eq.iters,
      pot: potNum, call: callNum,
      need: po.need, ratioText: po.ratioText, free: po.free,
      ev: ev,
      margin: eq.equity - po.need,
      outs: outInfo,
      ms: Math.round((t1 - t0) * 10) / 10,
      stage: stageOf(board.length)
    };
    res.verdict = verdictOf(res);
    return res;
  }

  function stageOf(n) {
    if (n === 0) return 'preflop';
    if (n === 3) return 'flop';
    if (n === 4) return 'turn';
    return 'river';
  }

  // 结论：赢率比门槛高 2 个点以上才算「值得跟」，避免把噪声当优势
  function verdictOf(res) {
    if (res.free) return { kind: 'free', text: '可以免费看牌', detail: '没人下注，过牌即可' };
    const d = res.margin;
    if (d > 0.02) {
      return { kind: 'call', text: '值得跟注',
               detail: '胜率比门槛高 ' + pct(Math.abs(d)) };
    }
    if (d < -0.02) {
      return { kind: 'fold', text: '应该弃牌',
               detail: '胜率比门槛低 ' + pct(Math.abs(d)) };
    }
    return { kind: 'close', text: '处于临界',
             detail: '胜率与门槛只差 ' + pct(Math.abs(d)) + '，怎么选差别都不大' };
  }

  function pct(x) { return (x * 100).toFixed(1) + '%'; }

  return {
    ALL_COMBOS, STAGES, RANGE_PRESETS, MAX_OPP,
    cardText, cardsText, potOdds, fmtRatio, equityOf, swingCards,
    ruleOfThumb, compute, stageOf, verdictOf, pct, rangeListOf
  };
});
