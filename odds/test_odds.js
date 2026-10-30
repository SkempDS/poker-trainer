/* test_odds.js —— 赔率计算器核心逻辑测试（Node，无 DOM） */
'use strict';

const fs = require('fs');
const path = require('path');

const POKER = path.join(__dirname, '..');
const data169 = JSON.parse(fs.readFileSync(path.join(POKER, 'data_169.json'), 'utf8'));
const dataRanges = JSON.parse(fs.readFileSync(path.join(POKER, 'data_ranges.json'), 'utf8'));

// 注入数据（与 build 时同一口径）
const tiers = data169.tiers || [];
globalThis.__TABLE_169__ = data169.rows.map(r => [
  r.hand,
  Math.round(r.equity * 10000) / 1000000,
  tiers.indexOf(r.tier),
  r.combos
]);
const mapping = {
  UTG: 'UTG 开池', HJ: 'HJ 开池', CO: 'CO 开池',
  BTN: 'BTN 开池', SB: 'SB 开池',
  BB: 'BB 防守 vs BTN', BB_UTG: 'BB 防守 vs UTG'
};
const specs = {};
for (const k in mapping) {
  if (dataRanges.ranges[mapping[k]]) specs[k] = dataRanges.ranges[mapping[k]].spec;
}
globalThis.__RANGE_SPECS__ = specs;

const Core = require(path.join(POKER, 'game', 'core.js'));
const EQ = require(path.join(POKER, 'game', 'equity.js'));
const O = require('./odds.js');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? '  ' + JSON.stringify(extra) : '')); }
}
function near(a, b, tol, name) {
  ok(Math.abs(a - b) <= tol, name, { got: a, want: b, tol });
}

// 便捷：用字符串造牌
function C(s) {
  const m = { s: 0, h: 1, d: 2, c: 3 };
  const rk = '23456789TJQKA';
  const t = s.trim();
  const rank = rk.indexOf(t[0].toUpperCase());
  const suit = m[t[1].toLowerCase()];
  return rank * 4 + suit;
}
function CS(str) { return str.trim().split(/\s+/).map(C); }

/* ============ 1. 底池赔率 ============ */
{
  const po = O.potOdds(100, 50);
  near(po.need, 50 / 150, 1e-9, '底池赔率：need = 50/150');
  near(po.ratio, 2, 1e-9, '底池赔率：ratio = 2');
  ok(po.ratioText === '2 : 1', '底池赔率：写成 2 : 1', { got: po.ratioText });

  const po2 = O.potOdds(100, 100);
  near(po2.need, 0.5, 1e-9, '满池下注 need = 50%');
  ok(po2.ratioText === '1 : 1', '满池下注 1 : 1', { got: po2.ratioText });

  const po3 = O.potOdds(100, 20);
  near(po3.need, 20 / 120, 1e-9, '1/5 池下注 need ≈ 16.7%');
  ok(po3.ratioText === '5 : 1', '1/5 池写成 5 : 1', { got: po3.ratioText });

  const po4 = O.potOdds(100, 0);
  ok(po4.free === true && po4.need === 0, '没人下注 → 免费看牌');

  const po5 = O.potOdds(0, 0);
  ok(po5.free === true, '底池 0 跟注 0 → 免费');
}

/* ============ 2. 赔率比格式化 ============ */
{
  ok(O.fmtRatio(2) === '2 : 1', 'fmtRatio(2) = 2 : 1', { got: O.fmtRatio(2) });
  ok(O.fmtRatio(0.5) === '1 : 2', 'fmtRatio(0.5) = 1 : 2', { got: O.fmtRatio(0.5) });
  ok(O.fmtRatio(1) === '1 : 1', 'fmtRatio(1) = 1 : 1', { got: O.fmtRatio(1) });
  ok(O.fmtRatio(null) === '—', 'fmtRatio(null) = —', { got: O.fmtRatio(null) });
}

/* ============ 3. 翻前查 169 表 ============ */
{
  const r = O.compute({
    hole: CS('As Ah'), board: [], nOpp: 1, rangeKey: 'random', pot: 100, call: 50
  });
  ok(r.ok === true, '翻前 AA 计算成功', { r: r.reason });
  ok(r.source === '169 表', '翻前单挑查 169 表', { got: r.source });
  ok(r.handKey === 'AA', 'AKs 手牌键识别', { got: r.handKey });
  near(r.equity, 0.8534, 0.004, 'AA 对随机手牌 ≈ 85.34%');
  near(r.need, 0.3333, 0.001, 'AA 底池 100 跟 50 的 need');
  ok(r.verdict.kind === 'call', 'AA 结论：值得跟注', { got: r.verdict.kind });
  ok(r.ev > 0, 'AA 跟注 EV 为正', { got: r.ev });
  ok(r.stage === 'preflop', '阶段 = 翻前');

  // 弱牌应弃
  const r2 = O.compute({
    hole: CS('7d 2c'), board: [], nOpp: 1, rangeKey: 'random', pot: 100, call: 200
  });
  ok(r2.handKey === '72o', '72o 识别', { got: r2.handKey });
  near(r2.equity, 0.345, 0.02, '72o 对随机 ≈ 34.5%');
  near(r2.need, 200 / 300, 1e-6, '72o need = 2/3');
  ok(r2.verdict.kind === 'fold', '72o 面对 2 倍池下注：应该弃牌', { got: r2.verdict.kind });

  // handFull 括号解释
  ok(r2.handDesc.indexOf('72o（7 2 非同花）') === 0, '翻前手牌显示括号中文解释', { got: r2.handDesc });
}

/* ============ 4. 翻牌后蒙特卡洛 ============ */
{
  // 坚果同花听牌：A♥K♥ 板 Q♥7♥2♣
  const r = O.compute({
    hole: CS('Ah Kh'), board: CS('Qh 7h 2c'), nOpp: 1, rangeKey: 'random', pot: 100, call: 0
  });
  ok(r.ok === true, '翻牌计算成功');
  ok(r.source.indexOf('蒙特卡洛') >= 0, '翻后走蒙特卡洛', { got: r.source });
  ok(r.equity > 0.5 && r.equity < 0.75, 'A♥K♥ 听坚果花+两高张 equity 合理', { got: r.equity });
  ok(r.stage === 'flop', '阶段 = 翻牌');
  ok(r.handDesc.length > 0, '翻牌有牌型描述', { got: r.handDesc });

  // 已成的坚果同花：河牌圈，应对随机手牌胜率应极高
  const r2 = O.compute({
    hole: CS('Ah Kh'), board: CS('Qh 7h 2h 3c 4d'), nOpp: 1, rangeKey: 'random', pot: 100, call: 0
  });
  ok(r2.equity > 0.9, '河牌坚果同花对随机胜率 > 90%', { got: r2.equity });
  ok(r2.stage === 'river', '阶段 = 河牌');
}

/* ============ 5. 多人底池：对手越多胜率越低 ============ */
{
  const eq = [];
  for (let n = 1; n <= 5; n++) {
    const r = O.compute({
      hole: CS('As Ah'), board: [], nOpp: n, rangeKey: 'random', pot: 100, call: 0
    });
    eq.push(r.equity);
  }
  ok(eq[0] > eq[1] && eq[1] > eq[2] && eq[2] > eq[3] && eq[3] > eq[4],
    'AA 对手人数增加胜率单调下降', { eq });
  ok(eq[0] > 0.8, 'AA 单挑 > 80%', { got: eq[0] });
  ok(eq[4] > 0.35, 'AA 对 5 人仍 > 35%', { got: eq[4] });
}

/* ============ 6. 范围估算 ============ */
{
  const r = O.compute({
    hole: CS('9s 8s'), board: [], nOpp: 1, rangeKey: 'UTG', pot: 100, call: 0
  });
  ok(r.ok === true, '对 UTG 紧范围计算成功');
  const r2 = O.compute({
    hole: CS('9s 8s'), board: [], nOpp: 1, rangeKey: 'BTN', pot: 100, call: 0
  });
  ok(r2.equity > r.equity, '98s 对松范围胜率 > 对紧范围', { tight: r.equity, loose: r2.equity });

  // 自定义范围
  const r3 = O.compute({
    hole: CS('As Ah'), board: [], nOpp: 1, rangeKey: 'custom', custom: 'KK,QQ', pot: 100, call: 0
  });
  ok(r3.ok === true, '自定义范围计算成功');
  ok(r3.equity > 0.6 && r3.equity < 0.85, 'AA vs {KK,QQ} equity 合理', { got: r3.equity });

  // 无效范围应回落而不是崩
  const r4 = O.compute({
    hole: CS('As Ah'), board: [], nOpp: 1, rangeKey: 'custom', custom: '乱写的', pot: 100, call: 0
  });
  ok(r4.ok === true, '自定义范围无效时不崩溃');
  ok(r4.equity > 0.7, '无效范围回落成随机手牌', { got: r4.equity });
}

/* ============ 7. 补牌数 ============ */
{
  // 翻牌：同花听牌，9 张补牌（黑桃 / 红心成花）
  const r = O.compute({
    hole: CS('Ah 9h'), board: CS('Kh 5h 2c'), nOpp: 1, rangeKey: 'random',
    pot: 100, call: 0, wantOuts: true
  });
  ok(r.ok === true, '补牌计算成功');
  ok(r.outs !== null, '翻牌应给出补牌', { got: r.outs });
  if (r.outs) {
    const n = r.outs.hits.length;
    ok(n >= 8 && n <= 16, '同花听牌有效补牌 8~16 张（9 红心 + 高张）', { got: n });
    const hearts = r.outs.hits.filter(h => Core.SUIT_CHARS.charAt(h.card & 3) === 'h').length;
    ok(hearts === 9, '红心补牌正好 9 张', { got: hearts });
    ok(r.outs.cardsToCome === 2, '还剩 2 条街', { got: r.outs.cardsToCome });
    near(r.outs.rule, n * 0.04, 1e-9, '4 倍法则 = 张数 × 4%');
    ok(r.outs.danger.length >= 0, '危险牌列表存在');
  }

  // 河牌圈不该有补牌
  const r2 = O.compute({
    hole: CS('Ah 9h'), board: CS('Kh 5h 2c 3d 4s'), nOpp: 1, rangeKey: 'random',
    pot: 100, call: 0, wantOuts: true
  });
  ok(r2.outs === null, '河牌圈没有补牌', { got: r2.outs });

  // 翻前不该有补牌
  const r3 = O.compute({
    hole: CS('Ah 9h'), board: [], nOpp: 1, rangeKey: 'random',
    pot: 100, call: 0, wantOuts: true
  });
  ok(r3.outs === null, '翻前没有补牌', { got: r3.outs });
}

/* ============ 8. 4 倍 / 2 倍法则 ============ */
{
  near(O.ruleOfThumb(9, 2), 0.36, 1e-9, '9 张补牌剩 2 街 = 36%');
  near(O.ruleOfThumb(9, 1), 0.18, 1e-9, '9 张补牌剩 1 街 = 18%');
  near(O.ruleOfThumb(0, 2), 0, 1e-9, '0 张补牌 = 0%');
}

/* ============ 9. 稳定性：同局面重复计算结果一致 ============ */
{
  const inp = {
    hole: CS('Ah Kh'), board: CS('Qh 7h 2c'), nOpp: 2, rangeKey: 'CO',
    pot: 300, call: 100
  };
  const a = O.compute(inp);
  const b = O.compute(inp);
  ok(a.equity === b.equity, '同一局面两次计算胜率完全相同', { a: a.equity, b: b.equity });

  // 换种子源（不同牌）结果应不同
  const c = O.compute({
    hole: CS('Ah Kh'), board: CS('Qh 7h 2d'), nOpp: 2, rangeKey: 'CO',
    pot: 300, call: 100
  });
  ok(c.equity !== a.equity, '不同局面结果不同');
}

/* ============ 10. 输入校验 ============ */
{
  const bad1 = O.compute({ hole: [], board: [], nOpp: 1, pot: 100, call: 50 });
  ok(bad1.ok === false && bad1.reason.indexOf('两张手牌') >= 0, '手牌不足 → 报错', { got: bad1.reason });

  const bad2 = O.compute({ hole: CS('As Ah'), board: CS('Kd Qd'), nOpp: 1, pot: 100, call: 50 });
  ok(bad2.ok === false && bad2.reason.indexOf('0、3、4、5') >= 0, '公共牌 2 张 → 报错', { got: bad2.reason });

  const bad3 = O.compute({ hole: CS('As Ah'), board: CS('As Kd Qd'), nOpp: 1, pot: 100, call: 50 });
  ok(bad3.ok === false && bad3.reason.indexOf('重复') >= 0, '重复牌 → 报错', { got: bad3.reason });
}

/* ============ 11. EV 与临界判定 ============ */
{
  // 胜率 40%，底池 100，跟 50 → EV = .4*150 - 50 = +10，need 33.3% → 该跟
  const r = O.compute({
    hole: CS('Ah Kh'), board: CS('Qh 7h 2c 3d 4s'), nOpp: 1, rangeKey: 'random',
    pot: 100, call: 50
  });
  near(r.ev, r.equity * 150 - 50, 1e-9, 'EV = 胜率×(底池+跟注) − 跟注');

  // 免费看牌
  const rf = O.compute({
    hole: CS('Ah Kh'), board: CS('Qh 7h 2c'), nOpp: 1, rangeKey: 'random',
    pot: 100, call: 0
  });
  ok(rf.free === true, '跟注 0 → free');
  ok(rf.verdict.kind === 'free', '跟注 0 → 结论是免费看牌', { got: rf.verdict.kind });
  ok(rf.margin === rf.equity, 'free 时 margin 就是胜率本身');
}

/* ============ 12. 每次计算都合法（随机 300 局面） ============ */
{
  const rnd = Core.mulberry32(20260301);
  let bad = 0, slowest = 0;
  for (let i = 0; i < 120; i++) {
    const deck = Core.ALL_CARDS.slice();
    for (let k = deck.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      const t = deck[k]; deck[k] = deck[j]; deck[j] = t;
    }
    const boardLen = [0, 3, 4, 5][i % 4];
    const hole = [deck[0], deck[1]];
    const board = deck.slice(2, 2 + boardLen);
    const nOpp = 1 + (i % 5);
    const t0 = Date.now();
    const r = O.compute({
      hole, board, nOpp, rangeKey: 'random',
      pot: 100, call: 50, wantOuts: i % 3 === 0
    });
    slowest = Math.max(slowest, Date.now() - t0);
    if (!r.ok) { bad++; fails.push('随机局面失败 ' + r.reason); continue; }
    if (!(r.equity >= 0 && r.equity <= 1)) { bad++; fails.push('equity 越界 ' + r.equity); }
    if (!(r.win >= 0 && r.win <= 1)) { bad++; fails.push('win 越界 ' + r.win); }
    if (!(r.tie >= 0 && r.tie <= 1)) { bad++; fails.push('tie 越界 ' + r.tie); }
    if (!r.handDesc) { bad++; fails.push('牌型描述为空'); }
    if (!r.verdict || !r.verdict.kind) { bad++; fails.push('结论缺失'); }
  }
  ok(bad === 0, '120 个随机局面全部合法', { bad });
  console.log('    最慢一次 ' + slowest + ' ms');
}

/* ============ 汇总 ============ */
console.log('');
console.log('='.repeat(50));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) {
  console.log('--- 失败明细 ---');
  fails.forEach(f => console.log('  × ' + f));
  process.exit(1);
} else {
  console.log('全部通过');
}
