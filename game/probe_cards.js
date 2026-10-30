/* 检查：牌不重复 + 摊牌牌型描述正确 */
const fs = require('fs');
const path = require('path');
const dir = __dirname;

const d169 = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data_169.json'), 'utf8'));
const TIERS = d169.tiers;
globalThis.__TABLE_169__ = d169.rows.map(r => [r.hand, r.equity / 100, TIERS.indexOf(r.tier), r.combos]);
const dr = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data_ranges.json'), 'utf8'));
const MAP = { 'UTG 开池': 'UTG', 'HJ 开池': 'HJ', 'CO 开池': 'CO', 'BTN 开池': 'BTN', 'SB 开池': 'SB', 'BB 防守 vs BTN': 'BB', 'BB 防守 vs UTG': 'BB_UTG' };
const sp = {};
for (const k in dr.ranges) if (MAP[k]) sp[MAP[k]] = dr.ranges[k].spec;
globalThis.__RANGE_SPECS__ = sp;

const Core = require('./core.js');
const EQ = require('./equity.js');
const AI = require('./ai.js');

let dup = 0, badDesc = 0, hands = 0;
const g = new Core.Game({ startStack: 3000, sb: 15, bb: 30, aiCount: 5, seed: 777 });
for (let h = 0; h < 300; h++) {
  g.startHand();
  while (g.phase === 'betting') {
    const seat = g.actor;
    const d = AI.decide(g, seat, 800);
    const r = g.act(seat, d.action.type, d.action.amount);
    if (!r.ok) {
      const ts = g.legalActions(seat).map(x => x.type);
      if (ts.indexOf('check') >= 0) g.act(seat, 'check');
      else if (ts.indexOf('call') >= 0) g.act(seat, 'call');
      else g.act(seat, 'fold');
    }
  }
  if (g.phase !== 'done') break;
  hands++;
  const rec = g.handHistory[g.handHistory.length - 1];
  // 1. 全牌唯一性
  const all = [];
  for (const p of g.players) for (const c of (p.hole || [])) all.push(c);
  for (const c of (rec.board || [])) all.push(c);
  const seen = new Set();
  for (const c of all) {
    if (seen.has(c)) { dup++; console.log('重复牌! 第' + (h + 1) + '手 ' + Core.cardsText(all)); break; }
    seen.add(c);
  }
  // 2. 摊牌描述正确性：用最终牌面 + 各家底牌重算
  if (rec.result && rec.result.showdown) {
    for (const sd of rec.result.showdown) {
      const p = g.getSeat(sd.seat);
      if (!p || !p.hole || p.hole.length < 2) continue;
      const full = p.hole.concat(rec.board);
      const want = Core.describeHand(Core.eval7(full));
      if (want !== sd.desc) {
        badDesc++;
        if (badDesc <= 5) console.log('牌型不符 seat' + sd.seat + ' 底牌' + Core.cardsText(p.hole) +
          ' 牌面' + Core.cardsText(rec.board) + '\n  record=' + sd.desc + '\n  recompute=' + want);
      }
    }
  }
  g.nextHand();
}
console.log('手数 ' + hands + ' / 重复牌 ' + dup + ' / 牌型不符 ' + badDesc);
