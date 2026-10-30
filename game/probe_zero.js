// probe_zero.js — 复现 auto3 的点击流程，查后几手人类为何 0 决策点
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const d169 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data_169.json'), 'utf8'));
const TIERS = ['S', 'A', 'B', 'C', 'D', 'E'];
globalThis.__TABLE_169__ = d169.rows.map(r => {
  const t = (r.tier || '').trim();
  let ti = TIERS.indexOf(t[0]);
  if (ti < 0) ti = 2;
  return [r.hand, r.equity / 100, ti, r.combos];
});
const dr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data_ranges.json'), 'utf8'));
const MAP = { 'UTG 开池': 'UTG', 'HJ 开池': 'HJ', 'CO 开池': 'CO', 'BTN 开池': 'BTN', 'SB 开池': 'SB', 'BB 防守 vs BTN': 'BB', 'BB 防守 vs UTG': 'BB_UTG' };
globalThis.__RANGE_SPECS__ = {};
for (const k in dr.ranges) if (MAP[k]) globalThis.__RANGE_SPECS__[MAP[k]] = dr.ranges[k].spec;

const Core = require('./core.js');
const AI = require('./ai.js');

const g = new Core.Game({ startStack: 2000, sb: 10, bb: 20, aiCount: 3, seed: 12345 });
for (let h = 1; h <= 20; h++) {
  const ok = g.startHand();
  if (!ok) { console.log('startHand 返回 false，第', h, '手'); break; }
  const me = g.getSeat(0);
  let guard = 0;
  while (g.phase === 'betting' && guard++ < 300) {
    const seat = g.actor;
    if (seat == null) break;
    let d;
    if (seat === 0) {
      // 模拟 UI：优先过牌，其次跟注，最后弃牌
      const la = g.legalActions(0).map(x => x.type);
      if (la.indexOf('check') >= 0) d = { action: { type: 'check' } };
      else if (la.indexOf('call') >= 0) d = { action: { type: 'call' } };
      else d = { action: { type: 'fold' } };
    } else {
      d = AI.decide(g, seat, 800);
    }
    const r = g.act(seat, d.action.type, d.action.amount);
    if (!r.ok) { console.log('非法', seat, d.action, r.err); g.act(seat, 'fold'); }
  }
  const rec = g.handHistory[g.handHistory.length - 1];
  console.log('手', h, '我的筹码', me.stack, '我的牌', JSON.stringify(me.hole),
    '弃牌?', me.folded, '淘汰?', me.eliminated, '记录手数', rec ? rec.handNo : '无',
    '决策', rec ? rec.decisions.length : '-');
}
