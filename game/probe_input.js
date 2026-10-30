/* probe_input.js — 专项：加注金额输入框与滑块的双向同步、越界钳制、实际下注额
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
  if (ok) console.log('  OK   ' + msg);
  else { failures++; console.log('  FAIL ' + msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
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

/* 推进到人类本次能加注的一个时机 */
function advanceToMyRaise(maxSteps) {
  for (let i = 0; i < (maxSteps || 400); i++) {
    flush();
    const g = sandbox.__poker.game;
    if (!g || g.phase === 'done' || g.phase === 'over') return null;
    if (g.phase === 'betting' && g.actor === 0) {
      const la = g.legalActions(0);
      if (la.some(x => x.type === 'raise')) return { g, la };
      const types = la.map(x => x.type);
      const pick = types.indexOf('check') >= 0 ? 'check' : (types.indexOf('call') >= 0 ? 'call' : 'fold');
      btnByText({ check: '过牌', call: '跟注', fold: '弃牌' }[pick]).onclick();
      continue;
    }
  }
  return null;
}

let hit = null;
for (let h = 0; h < 6 && !hit; h++) {
  hit = advanceToMyRaise();
  if (!hit) {
    const g = sandbox.__poker.game;
    const nb = btnByText('下一手');
    if (!nb) break;
    nb.onclick();
  }
}
ck(!!hit, '找到可加注且轮到人类的局面');
if (!hit) { console.log('\n=== 失败 ==='); process.exit(1); }

const { g, la } = hit;
const raise = la.find(x => x.type === 'raise');
const slider = doc.getElementById('raiseSlider');
const input = doc.getElementById('raiseInput');

ck(!!slider, '滑块存在');
ck(!!input, '输入框存在');
ck(input && input.type === 'number', '输入框是 number 类型', input && input.type);
ck(String(input.min) === String(raise.minTo) && String(input.max) === String(raise.maxTo),
  '输入框 min/max 与加注区间一致', { imin: input.min, imax: input.max, minTo: raise.minTo, maxTo: raise.maxTo });
ck(+input.value >= raise.minTo && +input.value <= raise.maxTo, '输入框初始值在合法区间内', input.value);

/* ① 拖动滑块 → 输入框同步 */
{
  const target = Math.max(raise.minTo, Math.min(raise.maxTo, raise.minTo + 137));
  slider.value = String(target);
  slider.oninput();
  ck(String(input.value) === String(target), '滑块变化 → 输入框同步', { slider: target, input: input.value });
  ck(!input.classList.contains('bad'), '合法值不标红');
}

/* ② 输入合法值 → 点加注，实际下注额等于输入值 */
{
  const target = Math.max(raise.minTo, Math.min(raise.maxTo, raise.minTo + 260));
  input.value = String(target);
  input.oninput();
  ck(!input.classList.contains('bad'), '合法输入不标红');
  const before = g.getSeat(0).committedRound;
  const bRaise = btnByText('加注') || btnByText('全下');
  ck(!!bRaise, '存在加注按钮');
  bRaise.onclick();
  const after = sandbox.__poker.game.getSeat(0);
  ck(after.committedRound === target || after.stack === 0,
    '点加注后本轮投入额与输入值一致', { want: target, got: after.committedRound, stack: after.stack, before });
}

/* ③ 越界输入：超上限 blur 后钳到 maxTo */
{
  const hit2 = advanceToMyRaise();
  if (hit2 && hit2.la.some(x => x.type === 'raise')) {
    const r2 = hit2.la.find(x => x.type === 'raise');
    const el2 = doc.getElementById('raiseInput');
    el2.value = String(r2.maxTo + 99999);
    el2.oninput();
    ck(el2.classList.contains('bad'), '越上限时标红提示');
    el2.onblur();
    ck(String(el2.value) === String(r2.maxTo), 'blur 后钳到上限', { v: el2.value, maxTo: r2.maxTo });
    ck(!el2.classList.contains('bad'), '钳正后取消标红');

    const el3 = doc.getElementById('raiseInput');
    el3.value = String(Math.max(0, r2.minTo - 500));
    el3.onblur();
    ck(String(el3.value) === String(r2.minTo), 'blur 后钳到下限', { v: el3.value, minTo: r2.minTo });

    el3.value = 'abc';
    el3.onblur();
    ck(/^\d+$/.test(el3.value), '非数字输入 blur 后回退为数字', { v: el3.value });
  } else {
    ck(true, '（本手已无可加注局面，越界用例跳过）');
  }
}

/* ④ 快捷按钮仍可用，且同步到输入框 */
{
  const hit3 = advanceToMyRaise();
  const b = btnByText('全下');
  if (hit3) {
    const inp = doc.getElementById('raiseInput');
    const sl = doc.getElementById('raiseSlider');
    const q = btnByText('全下');
    if (q) {
      q.onclick();
      ck(String(inp.value) === String(sl.value), '「全下」快捷键同步到输入框', { input: inp.value, slider: sl.value });
    } else {
      ck(true, '（当前无「全下」快捷键，跳过）');
    }
  } else {
    ck(true, '（已无加注局面，快捷键用例跳过）');
  }
}

console.log('\n=== ' + (failures ? '失败 ' + failures + ' 项' : '全部通过') + ' ===');
process.exit(failures ? 1 : 0);
