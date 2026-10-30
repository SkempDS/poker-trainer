// test_parity.js — JS 版 eval7 与 Python 黄金向量逐组严格比对
const fs = require('fs');
const path = require('path');
const Core = require('./core.js');

const p = path.join(__dirname, 'golden_eval.json');
const g = JSON.parse(fs.readFileSync(p, 'utf8'));
let bad = 0;
const firstBad = [];
for (let i = 0; i < g.count; i++) {
  const got = Core.eval7(g.cards[i]);
  if (got !== g.scores[i]) {
    bad++;
    if (firstBad.length < 10) firstBad.push({ i, cards: g.cards[i], got, want: g.scores[i] });
  }
}
console.log('比对组数:', g.count, '不一致:', bad);
if (bad) { console.log(JSON.stringify(firstBad, null, 2)); process.exit(1); }

// 已知牌型自检（与 evaluator.py __main__ 相同用例）
const cases = [
  ['皇家同花顺', 'AsKsQsJsTs2c3d', 8],
  ['同花顺', '9s8s7s6s5s2c3d', 8],
  ['四条', 'AcAdAhAsKc2d3h', 7],
  ['葫芦', 'AcAdAhKsKc2d3h', 6],
  ['同花', 'AsKs9s5s2s3d4h', 5],
  ['顺子', '9c8d7h6s5cAdKh', 4],
  ['三条', 'AcAdAhKsQc2d3h', 3],
  ['两对', 'AcAdKhKsQc2d3h', 2],
  ['一对', 'AcAdKhQsJc2d3h', 1],
  ['高牌', 'AcKdQhJs9c2d3h', 0],
  ['轮子', 'Ac2d3h4s5cKd9h', 4],
];
let cbad = 0;
for (const [name, s, expect] of cases) {
  const cs = [];
  for (let i = 0; i < s.length; i += 2) cs.push(Core.parseCard(s.substr(i, 2)));
  const cat = Core.eval7(cs) >> 20;
  const ok = cat === expect;
  if (!ok) cbad++;
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + name + ' cat=' + cat + ' expect=' + expect +
    '  →  ' + Core.describeHand(Core.eval7(cs)));
}
if (cbad) process.exit(1);
console.log('全部通过');
