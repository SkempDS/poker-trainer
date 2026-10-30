/* ai.js — 数据驱动的 AI 决策
 * 翻前用 169 胜率表 + 位置开池范围；翻后用蒙特卡洛胜率对底池赔率做 EV 判断。
 * 纯函数式：decide(game, seat) 返回 {type, amount, meta}，不修改 game。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./equity.js'));
  else root.PokerAI = factory(root.PokerCore, root.PokerEquity);
})(typeof self !== 'undefined' ? self : this, function (Core, EQ) {
  'use strict';

  /* ---------------- 位置映射 ---------------- */
  // 从按钮起顺时针的偏移 -> 位置名
  const POS_TABLE = {
    2: ['BTN', 'BB'],
    3: ['BTN', 'SB', 'BB'],
    4: ['BTN', 'SB', 'BB', 'UTG'],
    5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
    6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']
  };

  function positionOf(game, seat) {
    const as = game.activeSeats();
    const n = as.length;
    const i = as.indexOf(game.button);
    let off = as.indexOf(seat) - i;
    if (off < 0) off += n;
    const row = POS_TABLE[n] || POS_TABLE[6];
    return row[off] || 'BB';
  }

  /* ---------------- 性格参数 ---------------- */
  const PERSONA_PARAMS = {
    '紧凶': { openLoose: 0.85, callLoose: 0.85, bluff: 0.18, aggr: 1.15, potOddsSlack: 0.00 },
    '松凶': { openLoose: 1.25, callLoose: 1.20, bluff: 0.32, aggr: 1.30, potOddsSlack: 0.03 },
    '紧弱': { openLoose: 0.75, callLoose: 0.70, bluff: 0.06, aggr: 0.70, potOddsSlack: -0.02 },
    '松弱': { openLoose: 1.10, callLoose: 1.05, bluff: 0.10, aggr: 0.80, potOddsSlack: -0.04 }
  };

  /* ---------------- 翻前 ---------------- */
  // 返回建议：fold / call / raise(to)
  function preflopAdvice(game, seat) {
    const p = game.getSeat(seat);
    const pos = positionOf(game, seat);
    const eq169 = EQ.eq169Of(p.hole[0], p.hole[1]);
    const tier = EQ.tierOf(p.hole[0], p.hole[1]);
    const key = EQ.handKey(p.hole[0], p.hole[1]);
    const hl = EQ.handFull(key);   // 显示用：10 写成 10，术语带中文解释
    const persona = PERSONA_PARAMS[p.personality] || PERSONA_PARAMS['紧凶'];

    const range = EQ.rangeFor(pos);
    const inRange = range.some(c => c[0] === p.hole[0] && c[1] === p.hole[1] ||
      c[0] === p.hole[1] && c[1] === p.hole[0]);

    const toCall = Math.max(0, game.currentBet - p.committedRound);
    const pot = game.totalPot();
    const bb = game.cfg.bb;
    const raises = countRaises(game);

    let action, reason;

    if (game.currentBet <= bb) {
      // 无人加注
      if (inRange) {
        const openTo = Math.round(bb * (2.5 + (game.rand() * 0.8)) );
        action = { type: 'raise', amount: Math.min(openTo, p.committedRound + p.stack) };
        reason = '手牌 ' + hl + '（' + EQ.TIER_NAMES[tier] + '，胜率 ' + (eq169 * 100).toFixed(1) + '%）在 ' + pos + ' 开池范围内，主动加注';
      } else if (tier <= 2 && game.rand() < 0.35 * persona.openLoose) {
        action = { type: 'call', amount: toCall };
        reason = '手牌 ' + hl + ' 不在 ' + pos + ' 标准开池范围，但牌力尚可，平跟进池';
      } else {
        action = { type: 'fold' };
        reason = '手牌 ' + hl + '（' + EQ.TIER_NAMES[tier] + '）不在 ' + pos + ' 开池范围内，弃牌';
      }
    } else if (raises <= 1) {
      // 面对一次加注（2bet）
      if (tier === 0) {
        const to = Math.min(Math.round(game.currentBet * 2.8), p.committedRound + p.stack);
        action = { type: 'raise', amount: to };
        reason = '拿到 ' + hl + '（超强），面对加注做 3-bet（再加注）反击';
      } else if (tier === 1 && game.rand() < 0.55) {
        const to = Math.min(Math.round(game.currentBet * 2.8), p.committedRound + p.stack);
        action = { type: 'raise', amount: to };
        reason = hl + '（' + EQ.TIER_NAMES[tier] + '）选择 3-bet（再加注）施压';
      } else if (tier <= 2 || (inRange && game.rand() < 0.6)) {
        // 看底池赔率
        const po = toCall / (pot + toCall);
        if (eq169 > po - 0.02) {
          action = { type: 'call', amount: toCall };
          reason = hl + ' 胜率 ' + (eq169 * 100).toFixed(1) + '% 高于底池赔率门槛 ' + (po * 100).toFixed(1) + '%，跟注';
        } else {
          action = { type: 'fold' };
          reason = hl + ' 胜率 ' + (eq169 * 100).toFixed(1) + '% 低于底池赔率门槛 ' + (po * 100).toFixed(1) + '%，弃牌';
        }
      } else {
        action = { type: 'fold' };
        reason = hl + '（' + EQ.TIER_NAMES[tier] + '）面对加注不够，弃牌';
      }
    } else {
      // 面对 3-bet 及以上
      if (tier === 0) {
        const to = Math.min(Math.round(game.currentBet * 2.2), p.committedRound + p.stack);
        action = { type: 'raise', amount: to };
        reason = hl + ' 是超强牌，面对再加注继续 4-bet（再加注）';
      } else if (tier === 1) {
        const po = toCall / (pot + toCall);
        if (eq169 > po) {
          action = { type: 'call', amount: toCall };
          reason = hl + '（' + EQ.TIER_NAMES[tier] + '）胜率足够，跟注打翻后';
        } else {
          action = { type: 'fold' };
          reason = hl + ' 面对大额再加注，胜率不足，弃牌';
        }
      } else {
        action = { type: 'fold' };
        reason = hl + '（' + EQ.TIER_NAMES[tier] + '）面对 3-bet（再加注）太弱，弃牌';
      }
    }

    return {
      action, reason, pos, key, eq169, tier,
      potOdds: toCall > 0 ? toCall / (pot + toCall) : 0,
      inRange, street: 0
    };
  }

  function countRaises(game) {
    let n = 0;
    for (const ev of game.log) {
      if (ev.type === 'raise' && ev.street === 0) n++;
    }
    return n;
  }

  /* ---------------- 对手范围推断 ---------------- */
  // 简化：根据对手本手的动作强度给一个范围。翻前加注过 → 收窄；只是跟注 → 宽。
  function villainRanges(game, seat) {
    const pos = positionOf(game, seat);
    const out = [];
    for (const o of game.players) {
      if (o.seat === seat) continue;
      if (o.folded || o.eliminated) continue;
      let spec = '22+,A2s+,K5s+,Q7s+,J8s+,T8s+,98s,87s,76s,A7o+,KTo+,QTo+,JTo';
      // 看这个对手本手有没有加注
      let raised = 0, called = 0;
      for (const ev of game.log) {
        if (ev.seat !== o.seat) continue;
        if (ev.type === 'raise') raised++;
        if (ev.type === 'call') called++;
      }
      if (raised >= 2) spec = 'QQ+,AKs,AKo,AQs';
      else if (raised === 1) spec = 'TT+,AQs+,AQo+,KQs,99,88,77';
      else if (called >= 1) spec = '22+,A2s+,K9s+,Q9s+,J9s+,T8s+,98s,87s,ATo+,KJo+,QJo';
      out.push(EQ.expandRange(spec));
    }
    return out;
  }

  /* ---------------- 翻后 ---------------- */
  function postflopAdvice(game, seat, iters) {
    const p = game.getSeat(seat);
    const persona = PERSONA_PARAMS[p.personality] || PERSONA_PARAMS['紧凶'];
    const toCall = Math.max(0, game.currentBet - p.committedRound);
    const pot = game.totalPot();
    const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;

    const opps = villainRanges(game, seat);
    const res = opps.length === 0
      ? { equity: 0.5 }
      : EQ.mcEquityMulti(p.hole, opps, game.board, iters || 4000, game.rand);
    const eq = res.equity;

    const nOpp = opps.length;
    // 多人底池需要更高胜率才值得继续
    const eqNeeded = potOdds + (nOpp > 1 ? 0.05 * (nOpp - 1) : 0) + persona.potOddsSlack;
    const canRaise = game.getSeat(seat).canRaise && p.stack > toCall;
    const potNow = game.totalPot();

    let action, reason;
    const eqPct = (eq * 100).toFixed(1);
    const poPct = (potOdds * 100).toFixed(1);

    if (toCall === 0) {
      // 可以过牌或下注
      if (eq > 0.68 && canRaise) {
        const amt = Math.round(potNow * 0.65 * persona.aggr);
        action = { type: 'raise', amount: Math.min(amt + game.currentBet, p.committedRound + p.stack) };
        reason = '胜率 ' + eqPct + '% 明显领先，主动下注 ' + amt + ' 拿价值';
      } else if (eq > 0.42 && canRaise && game.rand() < persona.bluff * 0.5) {
        const amt = Math.round(potNow * 0.5);
        action = { type: 'raise', amount: Math.min(amt + game.currentBet, p.committedRound + p.stack) };
        reason = '胜率 ' + eqPct + '% 一般，选择半诈唬下注 ' + amt;
      } else {
        action = { type: 'check' };
        reason = '胜率 ' + eqPct + '%，过牌控制底池';
      }
    } else {
      const callable = eq > eqNeeded;
      if (callable && eq > 0.72 && canRaise && game.rand() < 0.55 * persona.aggr) {
        const to = Math.min(Math.round(game.currentBet * 2.5), p.committedRound + p.stack);
        action = { type: 'raise', amount: to };
        reason = '胜率 ' + eqPct + '% 远超门槛 ' + poPct + '%，加注到 ' + to + ' 拿价值';
      } else if (callable) {
        action = { type: 'call', amount: toCall };
        reason = '胜率 ' + eqPct + '% > 需要的 ' + ((eqNeeded) * 100).toFixed(1) + '%（底池赔率 ' + poPct + '%），跟注有利可图';
      } else if (eq > eqNeeded - 0.06 && game.rand() < persona.bluff * 0.35 && canRaise) {
        const to = Math.min(Math.round(game.currentBet * 2.5), p.committedRound + p.stack);
        action = { type: 'raise', amount: to };
        reason = '胜率 ' + eqPct + '% 略低于门槛，选择诈唬加注施压';
      } else {
        action = { type: 'fold' };
        reason = '胜率 ' + eqPct + '% 低于需要的 ' + ((eqNeeded) * 100).toFixed(1) + '%，弃牌';
      }
    }

    return {
      action, reason, pos: positionOf(game, seat),
      key: EQ.handKey(p.hole[0], p.hole[1]),
      equity: eq, potOdds, eqNeeded, street: game.street,
      nOpp, iters: res.iters
    };
  }

  /* ---------------- 统一入口 ---------------- */
  function decide(game, seat, iters) {
    const adv = game.street === 0
      ? preflopAdvice(game, seat)
      : postflopAdvice(game, seat, iters);
    // 校正非法动作
    const legal = game.legalActions(seat);
    const types = legal.map(a => a.type);
    let a = adv.action;
    if (!types.includes(a.type)) {
      if (a.type === 'check' && !types.includes('check')) {
        a = types.includes('call') ? { type: 'call', amount: Math.min(game.currentBet - game.getSeat(seat).committedRound, game.getSeat(seat).stack) } : { type: 'fold' };
      } else if (a.type === 'call' && !types.includes('call')) {
        a = types.includes('check') ? { type: 'check' } : { type: 'fold' };
      } else if (a.type === 'raise' && !types.includes('raise')) {
        a = types.includes('call') ? { type: 'call', amount: Math.min(game.currentBet - game.getSeat(seat).committedRound, game.getSeat(seat).stack) } : { type: 'check' };
        if (!types.includes(a.type)) a = { type: 'fold' };
      } else if (!types.includes(a.type)) {
        a = { type: 'fold' };
      }
      adv.action = a;
      adv.adjusted = true;
    }
    // 校正加注金额
    if (a.type === 'raise') {
      const r = legal.find(x => x.type === 'raise');
      if (r) {
        let to = a.amount;
        if (!isFinite(to)) to = r.minTo;
        to = Math.max(r.minTo, Math.min(r.maxTo, Math.round(to)));
        // 允许全下
        if (to === r.maxTo) { /* ok */ }
        a.amount = to;
      }
    }
    adv.action = a;
    return adv;
  }

  return { decide, preflopAdvice, postflopAdvice, positionOf, PERSONA_PARAMS, POS_TABLE };
});
