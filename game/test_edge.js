// test_edge.js — 边池 / 加注权 / 单挑盲注 等专项用例
const path = require('path');
const fs = require('fs');
const d169 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data_169.json'), 'utf8'));
const dR = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data_ranges.json'), 'utf8'));
const TIERS = d169.tiers || ['S 超强', 'A 强', 'B 中强', 'C 可玩', 'D 边缘', 'E 弃牌'];
globalThis.__TABLE_169__ = d169.rows.map(r => [r.hand, r.equity / 100, TIERS.indexOf(r.tier), r.combos]);
const keys = { 'UTG 开池': 'UTG', 'HJ 开池': 'HJ', 'CO 开池': 'CO', 'BTN 开池': 'BTN', 'SB 开池': 'SB', 'BB 防守 vs BTN': 'BB' };
const specs = {};
for (const k of Object.keys(dR.ranges || {})) if (keys[k]) specs[keys[k]] = dR.ranges[k].spec;
globalThis.__RANGE_SPECS__ = specs;

const Core = require('./core.js');
let fail = 0;
function ck(cond, msg, extra) {
  if (!cond) { fail++; console.log('FAIL ' + msg + (extra ? '  ' + JSON.stringify(extra) : '')); }
  else console.log('OK   ' + msg);
}

/* ---------- 1. 边池：三人不同筹码全下 ---------- */
{
  const g = new Core.Game({ startStack: 1000, sb: 5, bb: 10, aiCount: 2, seed: 7 });
  g.startHand();
  // 手工设筹码：A=100, B=300, C=1000（座位 0,1,2）
  g.players[0].stack = 100;
  g.players[1].stack = 300;
  g.players[2].stack = 1000;
  // 重置本手投入
  for (const p of g.players) { p.committedRound = 0; p.committedTotal = 0; p.stack = [100, 300, 1000][p.seat]; p.betThisStreet = 0; }
  g.currentBet = 0;
  g.actor = 0;
  g.players[0].hasActed = false; g.players[1].hasActed = false; g.players[2].hasActed = false;
  g.act(0, 'raise', 100);            // A 全下 100
  g.act(1, 'raise', 300);            // B 全下 300
  g.act(2, 'call');                  // C 跟 300
  // 三人全下 → 应自动补齐公共牌并摊牌
  ck(g.phase === 'done', '三人都全下后自动摊牌');
  const pots = g.result && g.result.pots ? g.result.pots : [];
  const total = pots.reduce((s, x) => s + x.amount, 0);
  ck(total === 700, '底池总额 100+300+300=700', { total, pots });
  ck(pots.length === 2, '应分为主池(300)与边池(400)', { pots });
  const main = pots[0], side = pots[1];
  ck(main.amount === 300, '主池 300（三人各 100）', { main: main.amount });
  ck(side.amount === 400, '边池 400（B 与 C 各 200）', { side: side.amount });
  ck(side.eligible.indexOf(0) < 0, '边池不含全下最少者 A', { side });
  const sum = g.players.reduce((s, p) => s + p.stack, 0);
  ck(sum === 1400, '筹码守恒：总筹码仍为 1400', { sum });
}

/* ---------- 2. 不足额全下不重开加注权 ---------- */
{
  const g = new Core.Game({ startStack: 1000, sb: 5, bb: 10, aiCount: 2, seed: 11 });
  g.startHand();
  for (const p of g.players) { p.committedRound = 0; p.committedTotal = 0; p.hasActed = false; p.allIn = false; p.folded = false; p.betThisStreet = 0; }
  g.players[0].stack = 1000; g.players[1].stack = 1000; g.players[2].stack = 150;
  g.currentBet = 10; g.minRaise = 10; g.actor = 0; g.phase = 'betting';
  g.act(0, 'raise', 100);   // A 加注到 100（完整加注，minRaise=90）
  ck(g.minRaise === 90, '加注后 minRaise 更新为 90', { minRaise: g.minRaise });
  g.act(1, 'call');          // B 跟 100
  // C 只有 150，全下到 150：增额只有 50 < minRaise 90 → 不足额加注
  const r = g.act(2, 'raise', 150);
  ck(r.ok, 'C 不足额加注全下被接受', r);
  ck(g.players[2].allIn, 'C 成为 all-in');
  ck(g.currentBet === 150, 'currentBet 抬到 150', { currentBet: g.currentBet });
  ck(g.players[0].canRaise === false, '不足额全下后，已行动玩家 A 不加注权', { aCan: g.players[0].canRaise });
  ck(g.players[1].canRaise === false, '已行动玩家 B 不加注权', { bCan: g.players[1].canRaise });
  ck(g.players[0].hasActed === false, 'A 需要补跟 50（hasActed 重置）', { hasActed: g.players[0].hasActed });
  const la = g.legalActions(0);
  ck(!la.some(x => x.type === 'raise'), 'A 的合法动作里没有加注', { la: la.map(x => x.type) });
}

/* ---------- 3. 单挑：按钮 = 小盲，翻前按钮先动 ---------- */
{
  const g = new Core.Game({ startStack: 1000, sb: 5, bb: 10, aiCount: 1, seed: 3 });
  g.startHand();
  const sbSeat = g._sbSeat(), bbSeat = g._bbSeat();
  ck(sbSeat === g.button, '单挑时按钮位即小盲', { button: g.button, sbSeat });
  ck(bbSeat !== g.button, '单挑时另一人是大盲', { bbSeat });
  ck(g.actor === g.button, '单挑翻前按钮先行动', { actor: g.actor, button: g.button });
  ck(g.players[sbSeat].committedRound === 5, '小盲投 5', { sb: g.players[sbSeat].committedRound });
  ck(g.players[bbSeat].committedRound === 10, '大盲投 10', { bb: g.players[bbSeat].committedRound });
}

/* ---------- 4. 弃牌收池：剩一人立即结束 ---------- */
{
  const g = new Core.Game({ startStack: 1000, sb: 5, bb: 10, aiCount: 2, seed: 5 });
  g.startHand();
  const startTotal = g.players.reduce((s, p) => s + p.stack, 0) + g.totalPot();
  let guard = 0;
  while (g.phase === 'betting' && guard++ < 20) {
    g.act(g.actor, 'fold');   // 所有人依次弃牌，最后只剩一人
  }
  ck(g.phase === 'done', '弃牌后本手结束');
  ck(g.result && g.result.type === 'uncontested', '剩一人 → 不摊牌直接收池', { t: g.result && g.result.type });
  const endTotal = g.players.reduce((s, p) => s + p.stack, 0);
  ck(endTotal === startTotal, '筹码守恒', { startTotal, endTotal });
}

/* ---------- 5. 平分底池余奇筹码 ---------- */
{
  const g = new Core.Game({ startStack: 1000, sb: 5, bb: 10, aiCount: 2, seed: 9 });
  // 构造：三个玩家同样的牌力 → 强制平分
  g.players[0].hole = [Core.parseCard('As'), Core.parseCard('Ks')];
  g.players[1].hole = [Core.parseCard('Ad'), Core.parseCard('Kd')];
  g.players[2].hole = [Core.parseCard('Ac'), Core.parseCard('Kc')];
  g.board = [Core.parseCard('2h'), Core.parseCard('7s'), Core.parseCard('9d'), Core.parseCard('Jc'), Core.parseCard('4h')];
  for (const p of g.players) { p.committedTotal = 101; p.folded = false; }
  g.phase = 'betting';
  const before = g.players.reduce((s, p) => s + p.stack, 0);
  g._showdown();
  const after = g.players.reduce((s, p) => s + p.stack, 0);
  ck(after - before === 303, '三人平分的底池 303 全部发出', { before, after });
  ck(g.phase === 'done', '摊牌后进入 done');
}

/* ---------- 6. 边池：四人四层筹码 ---------- */
{
  const g = new Core.Game({ startStack: 1000, sb: 5, bb: 10, aiCount: 3, seed: 13 });
  const caps = [50, 150, 400, 1000];
  for (const p of g.players) p.committedTotal = caps[p.seat];
  const pots = g.buildPots();
  const total = pots.reduce((s, x) => s + x.amount, 0);
  ck(total === 50 * 4 + 100 * 3 + 250 * 2 + 600 * 1, '四层边池总额正确', { total, want: 200 + 300 + 500 + 600 });
  ck(pots.length === 4, '应分 4 层', { n: pots.length, pots: pots.map(p => p.amount) });
}

/* ---------- 7. 全下跑马自动补齐 ---------- */
{
  const g = new Core.Game({ startStack: 100, sb: 5, bb: 10, aiCount: 1, seed: 17 });
  g.startHand();
  let guard = 0;
  while (g.phase === 'betting' && guard++ < 20) {
    const la = g.legalActions(g.actor);
    const r = la.find(x => x.type === 'raise');
    if (r && g.getSeat(g.actor).stack <= 100) g.act(g.actor, 'raise', r.maxTo);
    else g.act(g.actor, la.some(x => x.type === 'call') ? 'call' : 'check');
  }
  ck(g.phase === 'done', '全下后自动跑完');
  ck(g.board.length === 5, '公共牌补齐到 5 张', { board: g.board.length });
  ck(g.result && g.result.type === 'showdown', '进入摊牌', { t: g.result && g.result.type });
}

console.log('\n失败数:', fail);
if (fail) process.exit(1);
console.log('全部通过');
