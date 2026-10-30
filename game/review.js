/* review.js — 复盘用的「理论最优」基准
 * 与 ai.js 的区别：不含性格参数、不含随机诈唬，纯按牌力/底池赔率/位置给建议。
 * 视角限制：只看公开信息（自己的底牌、公共牌、对手的下注动作），不看对手底牌。
 *
 * 两种调用：
 *   Review.analyze(game, seat, iters)       —— 对活着的 Game 现场分析
 *   Review.snapshot(game, seat)             —— 取出决策点快照（存进 decisions）
 *   Review.analyzeSnapshot(snap, iters)     —— 对快照离线分析（复盘用，结果可复现）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./equity.js'));
  else root.PokerReview = factory(root.PokerCore, root.PokerEquity);
})(typeof self !== 'undefined' ? self : this, function (Core, EQ) {
  'use strict';

  const POS_TABLE = {
    2: ['BTN', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['BTN', 'SB', 'BB', 'UTG'],
    5: ['BTN', 'SB', 'BB', 'UTG', 'CO'], 6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']
  };

  function positionFrom(activeSeats, button, seat) {
    const n = activeSeats.length;
    let off = activeSeats.indexOf(seat) - activeSeats.indexOf(button);
    if (off < 0) off += n;
    return (POS_TABLE[n] || POS_TABLE[6])[off] || 'BB';
  }

  /* 固定种子随机源：同一局面重复分析结果一致 */
  function fixedRand(seed) {
    const r = Core.mulberry32(seed >>> 0);
    return function () { return r(); };
  }

  /* 从公开信息推断对手范围：看对手本手动作强度 */
  function rangeSpecOf(evs) {
    let raised = 0, called = 0;
    for (const e of evs) {
      if (e.type === 'raise') raised++;
      else if (e.type === 'call') called++;
    }
    if (raised >= 2) return 'QQ+,AKs,AKo,AQs';
    if (raised === 1) return 'TT+,AQs+,AQo+,KQs,99,88,77';
    if (called >= 1) return '22+,A2s+,K9s+,Q9s+,J9s+,T8s+,98s,87s,ATo+,KJo+,QJo';
    return '22+,A2s+,K5s+,Q7s+,J8s+,T8s+,98s,87s,76s,A7o+,KTo+,QTo+,JTo';
  }

  /* 取决策点快照 */
  function snapshot(game, seat) {
    const p = game.getSeat(seat);
    const legal = game.legalActions(seat);
    const raiseLegal = legal.find(x => x.type === 'raise');
    const toCall = Math.max(0, Math.min(game.currentBet - p.committedRound, p.stack));
    const opps = [];
    for (const o of game.players) {
      if (o.seat === seat || o.folded || o.eliminated) continue;
      const evs = game.log.filter(e => e.seat === o.seat);
      let raises = 0, calls = 0;
      for (const e of evs) { if (e.type === 'raise') raises++; else if (e.type === 'call') calls++; }
      opps.push({ seat: o.seat, spec: rangeSpecOf(evs), raises, calls, committedRound: o.committedRound });
    }
    return {
      handNo: game.handNo,
      street: game.street,
      board: game.board.slice(),
      hole: p.hole.slice(),
      pot: game.totalPot(),
      currentBet: game.currentBet,
      minRaise: game.minRaise,
      committedRound: p.committedRound,
      stack: p.stack,
      toCall,
      canRaise: !!(raiseLegal) && p.canRaise,
      raiseMinTo: raiseLegal ? raiseLegal.minTo : null,
      raiseMaxTo: raiseLegal ? raiseLegal.maxTo : null,
      legalTypes: legal.map(x => x.type),
      pos: positionFrom(game.activeSeats(), game.button, seat),
      bb: game.cfg.bb,
      opps
    };
  }

  const ACTION_LABEL = { fold: '弃牌', check: '过牌', call: '跟注', raise: '加注', bet: '下注' };

  function label(a) {
    if (!a) return '—';
    if (a.type === 'raise') return '加注到 ' + a.amount;
    if (a.type === 'bet') return '下注 ' + a.amount;
    return ACTION_LABEL[a.type] || a.type;
  }

  /* 核心：对快照给出理论建议 */
  function analyzeSnapshot(snap, iters) {
    const street = snap.street;
    const potOdds = snap.toCall > 0 ? snap.toCall / (snap.pot + snap.toCall) : 0;
    const key = EQ.handKey(snap.hole[0], snap.hole[1]);
    const hl = EQ.handFull(key);   // 显示用：10 写成 10，术语带中文解释
    const tier = EQ.tierOf(snap.hole[0], snap.hole[1]);
    const tierName = EQ.TIER_NAMES[tier];
    const canRaise = snap.canRaise && snap.raiseMaxTo != null;
    const bb = snap.bb;

    /* ---------- 翻前 ---------- */
    if (street === 0) {
      const eq169 = EQ.eq169Of(snap.hole[0], snap.hole[1]);
      const raises = snap.opps.reduce((s, o) => s + o.raises, 0);
      const facing = snap.currentBet > bb;
      let best, basis;

      const raiseTo = (mul) => Math.min(Math.round(snap.currentBet * mul), snap.raiseMaxTo);

      if (!facing) {
        if (tier <= 1) {
          best = canRaise ? { type: 'raise', amount: raiseTo(3) } : { type: 'call' };
          basis = hl + ' 属' + tierName + '（对随机手牌 ' + (eq169 * 100).toFixed(1) + '%），无人加注应主动加注建池';
        } else if (tier === 2) {
          const late = ['CO', 'BTN', 'SB'].indexOf(snap.pos) >= 0;
          if (canRaise && late) {
            best = { type: 'raise', amount: raiseTo(2.8) };
            basis = hl + ' 属' + tierName + '（' + (eq169 * 100).toFixed(1) + '%），' + snap.pos + ' 后位可加注偷盲';
          } else if (snap.toCall === 0) {
            best = { type: 'check' };
            basis = hl + ' 属' + tierName + '，' + snap.pos + ' 前位不主动建池，过牌看牌面';
          } else {
            best = { type: 'call' };
            basis = hl + ' 属' + tierName + '（' + (eq169 * 100).toFixed(1) + '%），小成本跟注进池';
          }
        } else {
          if (snap.toCall === 0) {
            best = { type: 'check' };
            basis = hl + ' 属' + tierName + '（对随机手牌 ' + (eq169 * 100).toFixed(1) + '%），无成本过牌';
          } else if (eq169 > potOdds + 0.06) {
            best = { type: 'call' };
            basis = hl + ' 属' + tierName + '（' + (eq169 * 100).toFixed(1) + '%），高于跟注门槛 ' + (potOdds * 100).toFixed(1) + '% 且有富余，可小成本跟注';
          } else {
            best = { type: 'fold' };
            basis = hl + ' 属' + tierName + '（' + (eq169 * 100).toFixed(1) + '%），扣掉对手加注的牌力优势后不够门槛 ' + (potOdds * 100).toFixed(1) + '%，弃牌';
          }
        }
      } else if (raises <= 1) {
        if (tier === 0) {
          best = canRaise ? { type: 'raise', amount: raiseTo(3) } : { type: 'call' };
          basis = hl + ' 是' + tierName + '，面对加注应反加（3-bet，也就是再加注）';
        } else if (tier === 1) {
          if (eq169 > potOdds) {
            best = { type: 'call' };
            basis = hl + ' 属' + tierName + '（' + (eq169 * 100).toFixed(1) + '%），高于跟注门槛 ' + (potOdds * 100).toFixed(1) + '%，跟注打翻后';
          } else {
            best = { type: 'fold' };
            basis = hl + ' 属' + tierName + '，胜率 ' + (eq169 * 100).toFixed(1) + '% 不足门槛 ' + (potOdds * 100).toFixed(1) + '%';
          }
        } else {
          best = { type: 'fold' };
          basis = hl + ' 属' + tierName + '，对手加注代表强牌范围，对随机手牌的 ' + (eq169 * 100).toFixed(1) + '% 不能直接用，弃牌';
        }
      } else {
        if (tier === 0) {
          best = canRaise ? { type: 'raise', amount: raiseTo(2.4) } : { type: 'call' };
          basis = hl + ' 超强牌，面对再加注可继续加注';
        } else if (tier === 1 && eq169 > potOdds) {
          best = { type: 'call' };
          basis = hl + ' 属' + tierName + '，胜率 ' + (eq169 * 100).toFixed(1) + '% 高于门槛 ' + (potOdds * 100).toFixed(1) + '%';
        } else {
          best = { type: 'fold' };
          basis = hl + '（' + tierName + '）面对 3-bet（对手的再加注）及以上，弃牌';
        }
      }

      return {
        best, basis, equity: eq169, eqNeed: potOdds, potOdds,
        street, key, tier, tierName, pos: snap.pos,
        eqLabel: '169 表：对随机手牌胜率'
      };
    }

    /* ---------- 翻后 ---------- */
    const oppRanges = snap.opps.map(o => EQ.expandRange(o.spec));
    const seed = (snap.handNo * 131 + street * 17 + snap.hole[0] * 7 + snap.hole[1] * 13) >>> 0;
    const res = oppRanges.length === 0
      ? { equity: 0.5 }
      : EQ.mcEquityMulti(snap.hole, oppRanges, snap.board, iters || 6000, fixedRand(seed));
    const eq = res.equity;
    const nOpp = oppRanges.length;
    const eqNeed = potOdds + Math.max(0, nOpp - 1) * 0.04;
    const eqPct = (eq * 100).toFixed(1);

    let best, basis, optional = false;
    if (snap.toCall === 0) {
      // 无人下注时 potOdds 为 0、eqNeed 也就是 0，光用 eqNeed 会把 13% 胜率当成价值下注。
      // 价值下注另设 50% 绝对下限。
      if (eq > Math.max(eqNeed + 0.12, 0.50) && canRaise) {
        const amt = Math.min(Math.round(snap.pot * 0.6) + snap.currentBet, snap.raiseMaxTo);
        best = { type: 'bet', amount: amt };
        basis = '胜率 ' + eqPct + '%（门槛 ' + (eqNeed * 100).toFixed(1) + '%），价值下注 ' + Math.round(snap.pot * 0.6);
      } else if (eq < 0.22 && street >= 3 && canRaise) {
        // 河牌纯空气：什么都没中，只能靠对手弃牌，属可选的诈唬线
        const amt = Math.min(Math.round(snap.pot * 0.5) + snap.currentBet, snap.raiseMaxTo);
        best = { type: 'bet', amount: amt };
        optional = true;
        basis = '胜率 ' + eqPct + '%，河牌已无改进可能，下注 ' + Math.round(snap.pot * 0.5) + ' 只能靠对手弃牌，属可选项';
      } else if (eq < 0.30 && !optional && street < 3 && canRaise) {
        // 翻牌/转牌纯空气：还有听牌可能，小注争取主动权
        const amt = Math.min(Math.round(snap.pot * 0.45) + snap.currentBet, snap.raiseMaxTo);
        best = { type: 'bet', amount: amt };
        optional = true;
        basis = '胜率仅 ' + eqPct + '%，下注 ' + Math.round(snap.pot * 0.45) + ' 争取弃牌率；对手不弃则亏，属可选项';
      } else {
        best = { type: 'check' };
        basis = '胜率 ' + eqPct + '%，过牌控制底池';
      }
    } else {
      if (eq > eqNeed + 0.18 && canRaise) {
        const to = Math.min(Math.round(snap.currentBet * 2.6), snap.raiseMaxTo);
        best = { type: 'raise', amount: to };
        basis = '胜率 ' + eqPct + '% 远超门槛 ' + (eqNeed * 100).toFixed(1) + '%，加注拿价值';
      } else if (eq > eqNeed) {
        best = { type: 'call' };
        basis = '胜率 ' + eqPct + '% 高于需要的 ' + (eqNeed * 100).toFixed(1) + '%（底池赔率 ' + (potOdds * 100).toFixed(1) + '%），跟注正期望';
      } else {
        best = { type: 'fold' };
        basis = '胜率 ' + eqPct + '% 低于需要的 ' + (eqNeed * 100).toFixed(1) + '%，弃牌';
      }
    }
    if (optional) best.optional = true;

    return {
      best, basis, equity: eq, eqNeed, potOdds,
      street, key, tier, tierName, pos: snap.pos, nOpp,
      eqLabel: '蒙特卡洛：对 ' + nOpp + ' 名对手推断范围'
    };
  }

  function analyze(game, seat, iters) {
    return analyzeSnapshot(snapshot(game, seat), iters);
  }

  /* 评价实际动作相对建议的好坏 */
  function grade(best, actual) {
    if (!actual) return { level: 'na', text: '—' };
    const b = best ? best.type : null;
    const a = actual.type;
    const cont = ['check', 'call', 'raise', 'bet'];
    if (!b) return { level: 'na', text: '—' };
    if (b === a) return { level: 'good', text: '与理论建议一致' };
    if ((b === 'raise' || b === 'bet') && (a === 'raise' || a === 'bet')) return { level: 'good', text: '与理论建议一致（同为主动下注）' };
    if (best.optional && a !== 'fold') return { level: 'mid', text: '走了可选诈唬线' };
    if (a === 'fold' && cont.indexOf(b) >= 0) return { level: 'bad', text: '偏紧：本可继续却弃牌' };
    if (a !== 'fold' && b === 'fold') return { level: 'bad', text: '偏松：该弃牌却继续投入' };
    if (cont.indexOf(a) >= 0 && cont.indexOf(b) >= 0) return { level: 'mid', text: '方向对，激进度不同' };
    return { level: 'mid', text: '与建议不同' };
  }

  return { analyze, analyzeSnapshot, snapshot, grade, label, positionFrom, rangeSpecOf, ACTION_LABEL, fixedRand };
});
