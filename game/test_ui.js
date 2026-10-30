/* test_ui.js — 用最小 DOM 桩件在 Node 里跑 ui.js，验证渲染、交互、复盘。
 * 覆盖：2~6 人桌各跑若干手、筹码守恒、非法动作零次、复盘含理论最优。
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

function fail(msg, e) {
  console.log('FAIL ' + msg);
  if (e) console.log(String(e.stack || e).split('\n').slice(0, 10).join('\n'));
  process.exit(1);
}

/* ---------- 建环境 ---------- */
const env = createEnv();
const { sandbox, doc, bodyEl, flush, allButtons } = env;
const ctx = vm.createContext(sandbox);

sandbox.__TABLE_169__ = d169.rows.map(r => [r.hand, r.equity / 100, TIERS.indexOf(r.tier), r.combos]);
const specs = {};
for (const k of Object.keys(dR.ranges || {})) if (KEYMAP[k]) specs[KEYMAP[k]] = dR.ranges[k].spec;
sandbox.__RANGE_SPECS__ = specs;

function loadScript(file) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), ctx, { filename: file });
}

try {
  loadScript('core.js'); loadScript('equity.js'); loadScript('ai.js'); loadScript('review.js');
} catch (e) { fail('引擎加载失败', e); }
if (!(sandbox.PokerCore && sandbox.PokerEquity && sandbox.PokerAI && sandbox.PokerReview)) fail('引擎导出缺失');
console.log('OK 引擎加载');

/* ---------- 灌模板 DOM ---------- */
const tpl = fs.readFileSync(path.join(__dirname, 'index.template.html'), 'utf8');
const bodyHtml = tpl.slice(tpl.indexOf('<body>') + 6, tpl.indexOf('<script>'));
bodyEl.innerHTML = bodyHtml;
(function reg(n) { for (const c of n.children) { if (c.id) doc.byId[c.id] = c; reg(c); } })(bodyEl);
console.log('OK 静态 id', Object.keys(doc.byId).length);

/* ---------- 加载 ui.js ---------- */
let errs = [], warns = [];
const origError = console.error, origWarn = console.warn;
console.error = (...a) => { errs.push(a.map(String).join(' ')); };
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };

try { loadScript('ui.js'); } catch (e) { fail('ui.js 加载抛异常', e); }
const cbs = (sandbox.__listeners['DOMContentLoaded'] || []);
if (!cbs.length) fail('未注册 DOMContentLoaded');
try { cbs.forEach(f => f()); } catch (e) { fail('初始化抛异常', e); }
console.log('OK 初始化');

/* ---------- 按钮查找 ---------- */
const LABEL = { check: '过牌', call: '跟注', fold: '弃牌', raise: '加注' };
function btnByText(t) {
  for (const b of allButtons()) if (b._text === t || (b._text || '').indexOf(t) === 0) return b;
  return null;
}

/* ---------- 破产补码计数（补码会真的给玩家加筹码，守恒断言需计入） ---------- */
let rebuyExtra = 0;
let curStack = 0;
sandbox.confirm = function () { rebuyExtra += curStack; return true; };

/* ---------- 开一桌 ---------- */
let totalDeclared = 0;
function startTable(stack, sb, bb, aiCount) {
  curStack = stack;
  rebuyExtra = 0;
  doc.getElementById('inStack').value = String(stack);
  doc.getElementById('inSB').value = String(sb);
  doc.getElementById('inBB').value = String(bb);
  doc.getElementById('inAI').value = String(aiCount);
  totalDeclared = stack * (aiCount + 1);
  try { doc.getElementById('btnSetupOk').onclick(); } catch (e) { fail('开局抛异常', e); }
  const g = sandbox.__poker.game;
  if (!g) fail('开局后无 game');
  if (g.players.length !== aiCount + 1) fail('玩家数不对: ' + g.players.length);
  return g;
}

/* ---------- 打完 n 手 ---------- */
function playHands(nHands, verbose) {
  const g0 = sandbox.__poker.game;
  const hands0 = g0.handNo;
  for (let h = 0; h < nHands; h++) {
    let guard = 0;
    let done = false;
    while (guard++ < 500) {
      flush();
      const g = sandbox.__poker.game;
      if (!g) fail('game 消失');
      if (g.phase === 'over') { done = true; break; }
      if (g.phase === 'done') { done = true; break; }
      if (g.phase !== 'betting') fail('未知阶段 ' + g.phase);
      if (g.actor === 0) {
        const la = g.legalActions(0);
        const types = la.map(x => x.type);
        // 混合策略：有时加注，让后续街有更多决策点
        let pick;
        if (types.indexOf('raise') >= 0 && Math.random() < 0.35) pick = 'raise';
        else if (types.indexOf('check') >= 0) pick = 'check';
        else if (types.indexOf('call') >= 0) pick = 'call';
        else pick = 'fold';
        if (pick === 'raise') {
          const bRaise = btnByText('加注') || btnByText('全下');
          if (!bRaise) fail('找不到加注按钮，可用=' + types.join(','));
          bRaise.onclick();
        } else {
          const b = btnByText(LABEL[pick]);
          if (!b) fail('找不到按钮 ' + pick + '，可用=' + types.join(',') + ' 现有=' + allButtons().map(x => JSON.stringify(x._text)).join(' '));
          b.onclick();
        }
      } else if (!env.pendingLength || true) {
        // AI 在定时器里，flush 会执行
        if (!(sandbox.__poker && true)) break;
      }
    }
    if (!done) fail('第 ' + (h + 1) + ' 手没打完');
    const g = sandbox.__poker.game;
    if (g.phase === 'over') break;
    // 点下一手
    const nb = btnByText('下一手');
    if (!nb) fail('本手结束后没有「下一手」按钮，阶段=' + g.phase);
    nb.onclick();
  }
  const g = sandbox.__poker.game;
  return g.handNo - hands0;
}

/* ---------- 筹码守恒 ---------- */
function checkChips(label, declared) {
  const g = sandbox.__poker.game;
  const sum = g.players.reduce((s, p) => s + p.stack + p.committedTotal, 0);
  const chipsOnTable = g.phase === 'done' || g.phase === 'betting'
    ? g.players.reduce((s, p) => s + p.stack + p.committedTotal, 0) : sum;
  const expect = declared + rebuyExtra;
  if (chipsOnTable !== expect) fail(label + ' 筹码不守恒: 实有 ' + chipsOnTable + ' 声明 ' + expect + (rebuyExtra ? '（含补码 ' + rebuyExtra + '）' : ''));
  // 未分配的底池必须为 0（committedTotal 已计入，故上面守恒即可）
  return chipsOnTable;
}

/* ---------- 各桌型 ---------- */
const CASES = [
  { stack: 1000, sb: 5, bb: 10, ai: 1, hands: 15 },
  { stack: 1000, sb: 5, bb: 10, ai: 2, hands: 15 },
  { stack: 2000, sb: 10, bb: 20, ai: 3, hands: 15 },
  { stack: 500, sb: 2, bb: 4, ai: 4, hands: 12 },
  { stack: 3000, sb: 25, bb: 50, ai: 5, hands: 12 }
];

for (const c of CASES) {
  const g = startTable(c.stack, c.sb, c.bb, c.ai);
  const played = playHands(c.hands, false);
  const gg = sandbox.__poker.game;
  console.log('OK 桌型 ' + (c.ai + 1) + '人 / 筹码 ' + c.stack + ' / 盲注 ' + c.sb + '-' + c.bb +
    ' → 打了 ' + played + ' 手，阶段 ' + gg.phase + '，历史 ' + gg.handHistory.length + ' 手');
}

/* ---------- 专项：筹码守恒（开新桌，逐步校验每一手结束） ---------- */
{
  const stack = 1000, ai = 3;
  startTable(stack, 5, 10, ai);
  const declared = stack * (ai + 1);
  for (let h = 0; h < 10; h++) {
    playHands(1, false);
    const g = sandbox.__poker.game;
    if (g.phase === 'over') break;
    // 一手结束时 committedTotal 应已全部分配回 stack
    const sum = g.players.reduce((s, p) => s + p.stack + p.committedTotal, 0);
    const expect = declared + rebuyExtra;
    if (sum !== expect) fail('第 ' + (h + 1) + ' 手后筹码不守恒: ' + sum + ' != ' + expect + (rebuyExtra ? '（含补码 ' + rebuyExtra + '）' : ''));
    const nb = btnByText('下一手');
    if (nb && h < 9) nb.onclick();   // 最后一手不点，避免留下未完成的一手干扰后续断言
  }
  console.log('OK 逐手筹码守恒（4 人桌 10 手，每手后总额 = ' + declared + '）');
}

/* ---------- 复盘 ---------- */
{
  flush();                            // 清掉所有挂起的定时器，确保没有半手在跑
  const g = sandbox.__poker.game;
  const histAtClick = g.handHistory.length;
  try { doc.getElementById('btnReview').onclick(); } catch (e) { fail('复盘弹层抛异常', e); }
  flush();
  const body = doc.getElementById('revBody');
  const n = body.children.length;
  console.log('OK 复盘弹层条目', n);
  if (n !== histAtClick) fail('复盘条目数 ' + n + ' != 历史手数 ' + histAtClick);
  // 找含人类决策点的展开
  let checked = 0, withAdv = 0;
  for (let i = 0; i < n && checked < 4; i++) {
    const rec = g.handHistory[n - 1 - i];
    const div = body.children[i];
    const hd = div.querySelector('.hd');
    if (!hd) fail('复盘条目缺 .hd');
    hd.onclick();
    flush();
    const bd = div.querySelector('.bd');
    const txt = bd._html || '';
    if (!rec.decisions || !rec.decisions.length) {
      if (txt.indexOf('没有做出决策') < 0) fail('无决策手未提示');
      continue;
    }
    checked++;
    if (txt.indexOf('理论最优') >= 0 && txt.indexOf('依据') >= 0 && txt.indexOf('胜率') >= 0) withAdv++;
    else { console.log('  详情:', txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300)); fail('复盘详情缺三要素'); }
  }
  console.log('OK 复盘详情：抽查 ' + checked + ' 手，含「理论最优/依据/胜率」' + withAdv + ' 手');
  if (checked === 0) fail('没有可抽查的含决策手');
  doc.getElementById('btnRevClose').onclick();
}

/* ---------- 重新开局（换参数） ---------- */
{
  doc.getElementById('btnSetup').onclick();
  const m = doc.getElementById('setupModal');
  if (!m.classList.contains('show')) fail('重新开局未弹出设置');
  doc.getElementById('inStack').value = '20000';
  doc.getElementById('inSB').value = '50';
  doc.getElementById('inBB').value = '100';
  doc.getElementById('inAI').value = '5';
  doc.getElementById('btnSetupOk').onclick();
  const g = sandbox.__poker.game;
  if (g.players.length !== 6) fail('改设置后玩家数 ' + g.players.length);
  if (g.cfg.sb !== 50 || g.cfg.bb !== 100) fail('盲注未生效 ' + g.cfg.sb + '/' + g.cfg.bb);
  if (g.getSeat(0).stack + g.getSeat(0).committedTotal !== 20000) fail('起始筹码未生效');
  console.log('OK 重新开局：6 人 / 20000 筹码 / 盲注 50-100');

  // 非法输入校验
  const bad = (st, sb, bb, ai) => {
    doc.getElementById('btnSetup').onclick();          // 先打开，showSetup 会填默认值
    doc.getElementById('inStack').value = String(st);
    doc.getElementById('inSB').value = String(sb);
    doc.getElementById('inBB').value = String(bb);
    doc.getElementById('inAI').value = String(ai);
    doc.getElementById('btnSetupOk').onclick();
    const msg = doc.getElementById('errSetup')._text || '';
    if (!msg) fail('非法输入未报错: ' + [st, sb, bb, ai].join('/'));
    if (!doc.getElementById('setupModal').classList.contains('show')) fail('非法输入却关闭了设置窗');
    return msg;
  };
  const msgs = [
    bad(5, 1, 2, 3), bad(1000, 0, 10, 3), bad(1000, 10, 10, 3), bad(1000, 10, 900, 3), bad(1000, 5, 10, 9)
  ];
  console.log('OK 非法输入 5 种全部被拦下：' + msgs.join(' / '));
  doc.getElementById('btnSetupCancel').onclick();
}

console.error = origError; console.warn = origWarn;
console.log('\n--- console.error 次数:', errs.length);
if (errs.length) console.log(errs.slice(0, 8).join('\n'));
console.log('--- console.warn 次数:', warns.length);
if (warns.length) console.log(warns.slice(0, 8).join('\n'));
if (errs.length || warns.length) process.exit(1);
console.log('\n全部通过');
