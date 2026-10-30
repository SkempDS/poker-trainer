// test_core.js — 引擎不变量测试（自对弈 + 专项用例）
// 用法: node test_core.js [手数]
const path = require('path');
const fs = require('fs');

// 先注入数据，再 require equity.js（它从 globalThis 读）
const d169 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data_169.json'), 'utf8'));
const dR = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data_ranges.json'), 'utf8'));
const TIERS = ['S 超强', 'A 强', 'B 中强', 'C 可玩', 'D 边缘', 'E 弃牌'];
globalThis.__TABLE_169__ = d169.rows.map(r => [r.hand, r.equity / 100, TIERS.indexOf(r.tier), r.combos]);
const keys = { 'UTG 开池': 'UTG', 'HJ 开池': 'HJ', 'CO 开池': 'CO', 'BTN 开池': 'BTN', 'SB 开池': 'SB', 'BB 防守 vs BTN': 'BB' };
const specs = {};
for (const k of Object.keys(dR.ranges || {})) {
  const short = keys[k];
  if (short) specs[short] = dR.ranges[k].spec;
}
// 若结构不同，兜底：直接用内置默认
if (!specs['UTG']) {
  Object.assign(specs, {
    UTG: '55+,AJo+,ATs+,KQo,KJs+,QJs,JTs,T9s,98s',
    HJ: '33+,ATo+,A8s+,KJo+,K9s+,QTo+,Q9s+,J9s+,T8s+,98s,87s',
    CO: '22+,A9o+,A2s+,KTo+,K8s+,Q9o+,Q8s+,J8o+,J8s+,T7s+,97s+,86s+,75s+,65s',
    BTN: '22+,A5o+,A2s+,K9o+,K4s+,Q9o+,Q6s+,J8o+,J6s+,T7o+,T5s+,96o+,95s+,86o+,85s+,75o+,74s+,65o+,64s+,54s,43s',
    SB: '22+,A5o+,A2s+,K8o+,K4s+,Q9o+,Q6s+,J8o+,J6s+,T8o+,T6s+,96o+,95s+,86o+,85s+,75o+,74s+,64o+,63s+,53o+,52s+,43s',
    BB: '22+,A2s+,K2s+,Q4s+,J6s+,T7s+,96s+,85s+,74s+,63s+,52s+,42s+,32s,A2o+,K8o+,Q9o+,J8o+,T8o+,98o,87o,76o'
  });
}
globalThis.__RANGE_SPECS__ = specs;

const Core = require('./core.js');
const EQ = require('./equity.js');
const AI = require('./ai.js');

let violations = [];
function v(msg, ctx) { violations.push({ msg, ctx }); }

const KEEP = cores => cores;

/* ================= 主自对弈循环 ================= */
const HANDS = parseInt(process.argv[2] || '20000', 10);
let handsPlayed = 0;
let totalActions = 0;
const stat = { fold: 0, check: 0, call: 0, raise: 0, showdown: 0, uncontested: 0, allin: 0 };
const seatCountStat = {};

// 用 AI 代替人类座位（全部 AI 对打）
function playHand(game, iters) {
  // 强制所有玩家走 AI 决策
  const origHuman = game.players.map(p => p.isHuman);
  for (const p of game.players) p.isHuman = false;
  let guard = 0;
  while (game.phase === 'betting' && guard++ < 300) {
    const seat = game.actor;
    if (seat == null) { v('actor is null while betting', { handNo: game.handNo }); break; }
    const legal = game.legalActions(seat);
    if (!legal.length) { v('no legal actions for actor', { seat, handNo: game.handNo }); break; }
    const d = AI.decide(game, seat, iters);
    const a = d.action;
    stat[a.type] = (stat[a.type] || 0) + 1;
    totalActions++;
    const before = game.totalPot();
    const stackBefore = game.players.map(p => p.stack);
    const r = game.act(seat, a.type, a.amount);
    if (!r.ok) {
      v('illegal action accepted/rejected: ' + r.err, { seat, a, legal, handNo: game.handNo });
      break;
    }
    // 筹码守恒：总筹码 = 各 stack 之和 + 底池
    const after = game.totalPot();
    const sumStack = game.players.reduce((s, p) => s + p.stack, 0);
    if (sumStack < 0) v('negative stack', { handNo: game.handNo });
    if (game.players.some(p => p.allIn)) stat.allin++;
  }
  for (let i = 0; i < origHuman.length; i++) game.players[i].isHuman = origHuman[i];

  if (game.phase === 'betting') v('hand did not finish (still betting)', { handNo: game.handNo });

  // 结果校验
  if (!game.result) v('no result after hand', { handNo: game.handNo });
  else {
    if (game.result.type === 'showdown') stat.showdown++;
    else if (game.result.type === 'uncontested') stat.uncontested++;
    if (game.result.type !== 'none' && (!game.result.winners || game.result.winners.length === 0))
      v('no winner', { handNo: game.handNo, result: game.result.type });
  }
}

console.log('开始自对弈 ' + HANDS + ' 手...');
const t0 = Date.now();
for (let i = 0; i < HANDS; i++) {
  const aiCount = 1 + (i % 5); // 1..5 个 AI 轮换
  const stacks = [500, 1000, 2000, 3000, 5000][i % 5];
  const game = new Core.Game({
    startStack: stacks, sb: Math.max(1, Math.floor(stacks / 200)), bb: Math.max(2, Math.floor(stacks / 100)),
    aiCount, seed: 1000 + i
  });
  seatCountStat[game.players.length] = (seatCountStat[game.players.length] || 0) + 1;
  if (!game.startHand()) continue;
  const before = game.players.reduce((s, p) => s + p.stack, 0) + game.totalPot();
  playHand(game, i % 3 === 0 ? 2000 : 800);

  // 一手结束后：总筹码必须等于起始总量（不允许凭空产生或消失）
  const afterTotal = game.players.reduce((s, p) => s + p.stack, 0);
  if (afterTotal !== before) {
    v('chip conservation broken', { handNo: i, before, after: afterTotal, delta: afterTotal - before });
    if (violations.length > 5) break;
  }
  handsPlayed++;
  if (i % 2000 === 0 && i > 0) {
    console.log('  ' + i + ' 手，耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
}

const dt = (Date.now() - t0) / 1000;
console.log('\n===== 自对弈结果 =====');
console.log('完成手数:', handsPlayed, ' 耗时:', dt.toFixed(1) + 's');
console.log('总动作数:', totalActions);
console.log('动作分布:', JSON.stringify(stat));
console.log('桌型分布:', JSON.stringify(seatCountStat));
console.log('违例数:', violations.length);
if (violations.length) {
  console.log('前 5 条违例:');
  for (const x of violations.slice(0, 5)) console.log(' -', x.msg, JSON.stringify(x.ctx));
  process.exit(1);
}
console.log('全部通过');
