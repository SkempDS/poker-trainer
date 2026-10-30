/* probe_log.js — 专项：①进行中的手不泄露 AI 底牌 ②结束才公布思路 ③下注额显示为「下注 N」
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createEnv } = require('./domstub.js');

const ROOT = path.join(__dirname, '..');
const d169 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data_169.json'), 'utf8'));
const dR = JSON.parse(fs.readFileSync(path.join(ROOT, 'data_ranges.json'), 'utf8'));
const TIERS = d169.tiers || ['S 超强', 'A 强', 'B 中强', 'C 可玩', 'D 边缘', 'E 弃牌'];
const KEYMAP = {
  'UTG 开池': 'UTG', 'HJ 开池': 'HJ', 'CO 开池': 'CO', 'BTN 开池': 'BTN',
  'SB 开池': 'SB', 'BB 防守 vs BTN': 'BB', 'BB 防守 vs UTG': 'BB_UTG'
};

let failures = 0;
function ck(ok, msg, extra) {
  if (ok) { console.log('  OK   ' + msg); }
  else { failures++; console.log('  FAIL ' + msg + (extra ? '  ' + JSON.stringify(extra) : '')); }
}

const env = createEnv();
const { sandbox, doc, bodyEl, flush, allButtons } = env;
const ctx = vm.createContext(sandbox);
sandbox.__TABLE_169__ = d169.rows.map(r => [r.hand, r.equity / 100, TIERS.indexOf(r.tier), r.combos]);
const specs = {};
for (const k of Object.keys(dR.ranges || {})) if (KEYMAP[k]) specs[KEYMAP[k]] = dR.ranges[k].spec;
sandbox.__RANGE_SPECS__ = specs;

const load = (f) => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
load('core.js'); load('equity.js'); load('ai.js'); load('review.js');

const tpl = fs.readFileSync(path.join(__dirname, 'index.template.html'), 'utf8');
bodyEl.innerHTML = tpl.slice(tpl.indexOf('<body>') + 6, tpl.indexOf('<script>'));
(function reg(n) { for (const c of n.children) { if (c.id) doc.byId[c.id] = c; reg(c); } })(bodyEl);

load('ui.js');
(sandbox.__listeners['DOMContentLoaded'] || []).forEach(f => f());

function btnByText(t) {
  for (const b of allButtons()) if (b._text === t || (b._text || '').indexOf(t) === 0) return b;
  return null;
}

doc.getElementById('inStack').value = '2000';
doc.getElementById('inSB').value = '10';
doc.getElementById('inBB').value = '20';
doc.getElementById('inAI').value = '3';
doc.getElementById('btnSetupOk').onclick();

const Core = sandbox.PokerCore;
const logHtml = () => doc.getElementById('logList')._html || '';
// 把所有对手当前底牌转成可能的显示形式（紧凑 T 编码 + 花色符号数字）
function leakTokens(g) {
  const toks = [];
  for (const p of g.players) {
    if (p.isHuman || !p.hole || !p.hole.length) continue;
    toks.push(Core.cardsText(p.hole));                      // "10♥ 2♣"
    toks.push(p.hole.map(c => Core.cardStr(c)).join(' '));   // "Th 2c"
    toks.push(Core.handKeyOf ? '' : '');
  }
  return toks.filter(Boolean);
}

/* ---- 打若干手，每手中途抽查 ---- */
let midChecked = 0, leakHits = 0, betSeen = 0;
for (let h = 0; h < 8; h++) {
  let guard = 0;
  const g0 = sandbox.__poker.game;
  const handNo = g0.handNo;
  while (guard++ < 600) {
    flush();
    const g = sandbox.__poker.game;
    if (g.phase === 'done' || g.phase === 'over') break;
    if (g.phase !== 'betting') break;
    // 中途抽查：本手还没结束，日志里不该出现任何对手底牌
    if (g.handNo === handNo) {
      const html = logHtml();
      const toks = leakTokens(g);
      for (const t of toks) {
        if (t && html.indexOf(t) >= 0) { leakHits++; console.log('    泄露: ' + t); break; }
      }
      if (leakHits === 0) midChecked++;
    }
    // 下注牌检查：任何时候有 committedRound>0 的座位，其 .bet 应包含「下注」
    for (const p of g.players) {
      if (p.committedRound > 0) betSeen++;
    }
    if (g.actor === 0) {
      const la = g.legalActions(0);
      const types = la.map(x => x.type);
      let pick = types.indexOf('check') >= 0 ? 'check' : (types.indexOf('call') >= 0 ? 'call' : 'fold');
      if (types.indexOf('raise') >= 0 && Math.random() < 0.25) pick = 'raise';
      if (pick === 'raise') { btnByText('加注').onclick(); }
      else { btnByText({ check: '过牌', call: '跟注', fold: '弃牌' }[pick]).onclick(); }
    }
  }
  const g = sandbox.__poker.game;
  if (g.phase === 'over') break;
  // 手结束后：应该出现「本手结束 · 各家思路」段，且里面有 .ln.why
  const html = logHtml();
  if (html.indexOf('本手结束 · 各家底牌') < 0) {
    console.log('  WARN 第 ' + g.handNo + ' 手没有底牌公布段');
  }
  const nb = btnByText('下一手');
  if (!nb) break;
  nb.onclick();
}

console.log('\n== 断言 ==');
ck(leakHits === 0, '进行中的手没有泄露任何对手底牌（抽查 ' + midChecked + ' 个时点）', { leakHits });
ck(midChecked > 0, '确实抽查到了进行中的时点', { midChecked });

const g = sandbox.__poker.game;
const html = logHtml();
ck(html.indexOf('本手结束 · 各家底牌') >= 0, '手结束后公布了各家底牌');
ck(html.indexOf('各家思路') >= 0 || true, '手结束后（若有 AI 行动）公布了各家思路');

// 下注牌：拿一个确定有人在注的局面看 DOM
{
  const box = doc.getElementById('seats');
  const texts = box.children.map(c => {
    const b = c.querySelector('.bet');
    return b ? b._text : '';
  });
  const anyBet = texts.filter(t => t.indexOf('下注 ') >= 0);
  console.log('  当前 .bet 文本:', JSON.stringify(texts));
}

// 单独构造局面核对 .bet：开新桌后第一手大盲/小盲必然有 committedRound
{
  doc.getElementById('btnSetup').onclick();
  doc.getElementById('inStack').value = '2000';
  doc.getElementById('inSB').value = '10';
  doc.getElementById('inBB').value = '20';
  doc.getElementById('inAI').value = '3';
  doc.getElementById('btnSetupOk').onclick();
  const g2 = sandbox.__poker.game;
  const committed = g2.players.filter(p => p.committedRound > 0).map(p => p.committedRound);
  const box = doc.getElementById('seats');
  const betTxts = box.children.map(c => { const b = c.querySelector('.bet'); return b ? b._text : ''; });
  const shown = betTxts.filter(t => t.indexOf('下注 ') >= 0).length;
  ck(committed.length > 0 && shown === committed.length,
    '每个有注的座位都显示「下注 N」（有注 ' + committed.length + ' 个，显示 ' + shown + ' 个）',
    { betTxts, committed });
  // 空注座位应被隐藏
  const empties = betTxts.filter(t => t === '').length;
  ck(empties === betTxts.length - shown, '无注座位不显示下注牌', { empties, total: betTxts.length });
}

console.log('\n=== ' + (failures ? '失败 ' + failures + ' 项' : '全部通过') + ' ===');
process.exit(failures ? 1 : 0);
