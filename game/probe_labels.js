/* 验证四项修改的显示效果 */
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
const RV = require('./review.js');

let fail = 0;
function chk(name, got, want) {
  const ok = got === want;
  if (!ok) { fail++; console.log('FAIL ' + name + '\n  got  ' + got + '\n  want ' + want); }
  else console.log('OK   ' + name + ' → ' + got);
}

console.log('=== 1. 10 显示为 10，不是 T ===');
const t10 = Core.parseCard('Th');
chk('RANK_TEXT[8]', Core.RANK_TEXT[8], '10');
chk('cardText(Th)', Core.cardText(t10), '10♥');
chk('cardsText', Core.cardsText([Core.parseCard('Th'), Core.parseCard('2c'), Core.parseCard('Kd')]), '10♥ 2♣ K♦');
// 牌型名里的 10
chk('describeHand 一对10', Core.describeHand(Core.eval7([t10, Core.parseCard('Td'),
  Core.parseCard('2c'), Core.parseCard('7h'), Core.parseCard('9s'), Core.parseCard('4d'), Core.parseCard('Jc')])),
  '一对 10');
chk('顺子T高', Core.describeHand(Core.eval7([t10, Core.parseCard('9d'),
  Core.parseCard('8c'), Core.parseCard('7h'), Core.parseCard('6s'), Core.parseCard('4d'), Core.parseCard('2c')])), '顺子（10 高）');
// parseCard 仍能解析 'T'
chk('parseCard("Th") 可用', Core.cardText(Core.parseCard('Th')), '10♥');

console.log('\n=== 2. 起手牌括号中文解释 ===');
chk('AA', EQ.handFull('AA'), 'AA（一对 A）');
chk('AKs', EQ.handFull('AKs'), 'AKs（A K 同花）');
chk('K8o', EQ.handFull('K8o'), 'K8o（K 8 非同花）');
chk('TT', EQ.handFull('TT'), '10 10（一对 10）');
chk('T9s', EQ.handFull('T9s'), '10 9 同花');
chk('72o', EQ.handFull('72o'), '72o（7 2 非同花）');

console.log('\n=== 3. 复盘：各家底牌行 + 花色数字 ===');
const seed = 20251025;
const g = new Core.Game({ startStack: 2000, sb: 10, bb: 20, aiCount: 3, seed });
let hands = 0;
while (hands < 6) {
  g.startHand();
  let guard = 0;
  while (g.phase === 'betting' && guard++ < 300) {
    const la = g.legalActions(g.actor);
    const ts = la.map(x => x.type);
    let pick;
    if (ts.indexOf('check') >= 0) pick = { type: 'check' };
    else if (ts.indexOf('call') >= 0 && Math.random() < 0.55) pick = { type: 'call' };
    else pick = { type: 'fold' };
    const r = g.act(g.actor, pick.type, pick.amount);
    if (!r.ok) { console.log('非法动作', r, pick, ts); break; }
  }
  if (g.phase === 'done') hands++;
  else break;
  g.nextHand();
}
const recs = g.handHistory;
console.log('  手数 ' + recs.length);
for (const rec of recs.slice(0, 3)) {
  const board = rec.board && rec.board.length ? Core.cardsText(rec.board) : '（无公共牌）';
  const stacks = (rec.stacks || []).map(s => (s.hole && s.hole.length ? Core.cardsText(s.hole) : '—') + (s.folded ? '(弃)' : '')).join(' | ');
  console.log('  第' + rec.handNo + '手 公共牌: ' + board);
  console.log('         底牌: ' + stacks);
  if (/[2-9TJQKA][shdc]/.test(board)) { fail++; console.log('  FAIL 牌面仍是英文字母'); }
  if (/T/.test(board.replace(/10/g, ''))) { fail++; console.log('  FAIL 牌面含 T'); }
}
if (recs.length === 0) { fail++; console.log('FAIL 没有完成的手'); }

console.log('\n=== 4. 复盘 basis 里出现括号解释 ===');
let found = false;
for (const rec of recs) {
  for (const d of rec.decisions) {
    const out = RV.analyzeSnapshot(d.snap, 400);
    if (/（.+?）/.test(out.basis) && /(一对|同花|非同花|A K|K 8)/.test(out.basis)) {
      console.log('  例: ' + out.basis);
      found = true; break;
    }
  }
  if (found) break;
}
if (!found) { fail++; console.log('FAIL 没找到带中文解释的 basis'); }

console.log('\n失败数: ' + fail);
