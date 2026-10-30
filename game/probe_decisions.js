// probe_decisions.js — 查每手 handHistory 里 decisions 数量
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const d169 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data_169.json'), 'utf8'));
globalThis.__TABLE_169__ = d169.rows.map(r => [r.hand, r.equity / 100, ['S','A','B','C','D','E'].indexOf((r.tier || '').trim()[0]) < 0 ? 2 : ['S','A','B','C','D','E'].indexOf((r.tier || '').trim()[0]), r.combos]);
const dr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data_ranges.json'), 'utf8'));
const MAP = { 'UTG 开池': 'UTG', 'HJ 开池': 'HJ', 'CO 开池': 'CO', 'BTN 开池': 'BTN', 'SB 开池': 'SB', 'BB 防守 vs BTN': 'BB', 'BB 防守 vs UTG': 'BB_UTG' };
globalThis.__RANGE_SPECS__ = {};
for (const k in dr.ranges) if (MAP[k]) globalThis.__RANGE_SPECS__[MAP[k]] = dr.ranges[k].spec;

const Core = require('./core.js');
const Game = Core.Game;
const AI = require('./ai.js');

const g = new Game({ startStack: 2000, sb: 10, bb: 20, aiCount: 3, seed: 7 });
let hand = 0;
while (hand < 15 && g.startHand()) {
  hand++;
  let guard = 0;
  while (g.phase === 'betting' && guard++ < 300) {
    const seat = g.actor;
    if (seat == null) break;
    const d = AI.decide(g, seat, 1200);
    const r = g.act(seat, d.action.type, d.action.amount);
    if (!r.ok) g.act(seat, 'fold');
  }
  const rec = g.handHistory[g.handHistory.length - 1];
  if (rec) {
    console.log('手', rec.handNo, '结果', rec.result && rec.result.type,
      'decisions', rec.decisions.length,
      '人类是否参与', rec.decisions.map(x => x.actual.type).join('/'));
  }
}
