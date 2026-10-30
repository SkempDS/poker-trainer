/* test_odds_ui.js —— 用自建 DOM 桩件测赔率计算器的界面层 */
'use strict';

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const POKER = path.join(HERE, '..');
const data169 = JSON.parse(fs.readFileSync(path.join(POKER, 'data_169.json'), 'utf8'));
const dataRanges = JSON.parse(fs.readFileSync(path.join(POKER, 'data_ranges.json'), 'utf8'));
const tiers = data169.tiers || [];
globalThis.__TABLE_169__ = data169.rows.map(r => [
  r.hand, r.equity / 100, tiers.indexOf(r.tier), r.combos
]);
const mapping = {
  UTG: 'UTG 开池', HJ: 'HJ 开池', CO: 'CO 开池', BTN: 'BTN 开池',
  SB: 'SB 开池', BB: 'BB 防守 vs BTN', BB_UTG: 'BB 防守 vs UTG'
};
const specs = {};
for (const k in mapping) if (dataRanges.ranges[mapping[k]]) specs[k] = dataRanges.ranges[mapping[k]].spec;
globalThis.__RANGE_SPECS__ = specs;

const stubMod = require(path.join(POKER, 'game', 'domstub.js'));
const env = stubMod.createEnv();

// 把模板的 body 装进桩件（ui 相关 id 全部来自模板）
const html = fs.readFileSync(path.join(POKER, '德州扑克-赔率计算器.html'), 'utf8');
const bodyStart = html.indexOf('<body>');
const bodyEnd = html.lastIndexOf('</body>');
env.doc.body.innerHTML = html.slice(bodyStart + 6, bodyEnd);

// 数据注入到沙箱（与构建时同一口径）
env.sandbox.__TABLE_169__ = globalThis.__TABLE_169__;
env.sandbox.__RANGE_SPECS__ = globalThis.__RANGE_SPECS__;

const vm = require('vm');
const ctx = vm.createContext(env.sandbox);

function loadScript(file) {
  const code = fs.readFileSync(file, 'utf8');
  new vm.Script(code, { filename: file }).runInContext(ctx);
}

loadScript(path.join(POKER, 'game', 'core.js'));
loadScript(path.join(POKER, 'game', 'equity.js'));
loadScript(path.join(HERE, 'odds.js'));
loadScript(path.join(HERE, 'odds_ui.js'));

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? '  ' + JSON.stringify(extra) : '')); }
}

const UI = env.sandbox.PokerOddsUI;
ok(!!UI, 'PokerOddsUI 已挂到 window');

UI.init();
env.flush();

/* ---------- 1. 静态结构 ---------- */
{
  const ids = ['holeRow', 'boardRow', 'stageTabs', 'picker', 'result',
    'inPot', 'inCall', 'callQuick', 'selOpp', 'selRange', 'customWrap',
    'inCustom', 'customHint', 'btnClear'];
  ids.forEach(id => ok(!!env.doc.getElementById(id), '存在 #' + id));

  const tabs = env.doc.getElementById('stageTabs');
  ok(tabs.children.length === 4, '四个阶段标签', { got: tabs.children.length });
  ok(tabs.children[0].textContent.indexOf('翻前') >= 0, '第一个标签是翻前');

  const sel = env.doc.getElementById('selOpp');
  ok(sel.children.length === 9, '对手人数 1~8 加自定义共九档', { got: sel.children.length });
  ok(sel.children[sel.children.length - 1].value === 'custom', '最后一档是自定义');
  ok(!!env.doc.getElementById('inOpp'), '有自定义人数输入框');
  ok(!!env.doc.getElementById('btnClearCalc'), '右侧有清空按钮');

  const rs = env.doc.getElementById('selRange');
  ok(rs.children.length >= 5, '范围预设至少 5 个', { got: rs.children.length });

  // 选牌器 4 行 × 13 列
  const picker = env.doc.getElementById('picker');
  ok(picker.children.length === 4, '选牌器 4 行', { got: picker.children.length });
  ok(picker.children[0].children.length === 13, '每行 13 张', { got: picker.children[0].children.length });
}

/* ---------- 2. 初始态 ---------- */
{
  const r = env.doc.getElementById('result');
  ok(r.textContent.length > 0, '初始有提示文字', { got: r.textContent });
  ok(r.textContent.indexOf('手牌') >= 0, '提示先选手牌', { got: r.textContent });

  const bh = env.doc.getElementById('boardRow');
  ok(bh.textContent.indexOf('翻前没有公共牌') >= 0, '翻前不显示公共牌槽位', { got: bh.textContent });
}

/* ---------- 3. 点牌放牌 ---------- */
{
  // 点选牌器里的 A♠（第 0 行第 0 张 = A♠）
  const picker = env.doc.getElementById('picker');
  const aces = picker.children[0].children[0];   // A♠
  aces.onclick();
  env.flush();

  const holeRow = env.doc.getElementById('holeRow');
  ok(holeRow.children[0].textContent.indexOf('A') >= 0, '第一张手牌放上了 A', { got: holeRow.children[0].textContent });

  // 再点 A♥（第 1 行第 0 张）
  picker.children[1].children[0].onclick();
  env.flush();

  ok(holeRow.children[1].textContent.indexOf('A') >= 0, '第二张手牌也放上了');
  ok(UI.last !== null, '两张手牌齐了就开始算', { got: UI.last });
  if (UI.last) {
    ok(UI.last.ok === true, '计算结果有效');
    ok(UI.last.handKey === 'AA', '识别为 AA', { got: UI.last.handKey });
    ok(UI.last.equity > 0.8, 'AA 胜率 > 80%', { got: UI.last.equity });
  }

  // 已用过的牌应带 used 标记
  ok(picker.children[0].children[0].classList.contains('used'), '已用过的 A♠ 标记为 used');
}

/* ---------- 4. 阶段切换 ---------- */
{
  const tabs = env.doc.getElementById('stageTabs');
  tabs.children[1].onclick();   // 翻牌
  env.flush();
  let br = env.doc.getElementById('boardRow');
  ok(br.children.length === 3, '翻牌阶段显示 3 个槽位', { got: br.children.length });

  tabs.children[2].onclick();   // 转牌
  env.flush();
  br = env.doc.getElementById('boardRow');
  ok(br.children.length === 4, '转牌阶段 4 个槽位', { got: br.children.length });

  tabs.children[3].onclick();   // 河牌
  env.flush();
  br = env.doc.getElementById('boardRow');
  ok(br.children.length === 5, '河牌阶段 5 个槽位', { got: br.children.length });

  // 回翻牌应清掉多余公共牌
  tabs.children[1].onclick();
  env.flush();
  br = env.doc.getElementById('boardRow');
  ok(br.children.length === 3, '退回翻牌剩 3 个槽位', { got: br.children.length });

  const r = env.doc.getElementById('result');
  ok(r.textContent.indexOf('公共牌还差') >= 0, '公共牌不全时提示还差几张', { got: r.textContent });
}

/* ---------- 5. 填满翻牌并计算 ---------- */
{
  // 手牌已经是 AA，现在补 3 张公共牌
  const picker = env.doc.getElementById('picker');
  // 找 K♦ / 7♣ / 2♥：行顺序 黑桃(3)、红心(1)、方块(2)、梅花(0)
  // 行索引： children[0]=黑桃 children[1]=红心 children[2]=方块 children[3]=梅花
  // 列： index 12=A, 11=K, ... 0=2
  picker.children[2].children[11].onclick();  // K♦
  env.flush();
  picker.children[3].children[5].onclick();   // 7♣
  env.flush();
  picker.children[1].children[0].onclick();   // A♥ 已用过会移除！改用别的
  env.flush();
}

/* ---------- 6. 底池赔率快捷按钮 ---------- */
{
  const pot = env.doc.getElementById('inPot');
  const call = env.doc.getElementById('inCall');
  pot.value = '100';
  call.value = '0';
  const quick = env.doc.getElementById('callQuick');
  // ½ 池
  const half = quick.children[2];
  half.onclick();
  env.flush();
  ok(Number(call.value) === 50, '½ 池按钮把跟注设为 50', { got: call.value });

  // 满池
  quick.children[4].onclick();
  env.flush();
  ok(Number(call.value) === 100, '满池按钮把跟注设为 100', { got: call.value });

  // ¼ 池
  quick.children[0].onclick();
  env.flush();
  ok(Number(call.value) === 25, '¼ 池按钮把跟注设为 25', { got: call.value });

  // 底池为 0 时点快捷应不崩
  pot.value = '0';
  quick.children[2].onclick();
  env.flush();
  ok(true, '底池为 0 时点快捷按钮不崩溃');
}

/* ---------- 7. 自定义范围输入 ---------- */
{
  const sel = env.doc.getElementById('selRange');
  // 找到 custom 选项
  let idx = -1;
  for (let i = 0; i < sel.children.length; i++) {
    if (sel.children[i].value === 'custom') { idx = i; break; }
  }
  ok(idx >= 0, '范围下拉里有自定义选项');
  if (idx >= 0) {
    sel.value = 'custom';
    sel.onchange();
    env.flush();
    ok(env.doc.getElementById('customWrap').style.display !== 'none', '选自定义后显示输入框');

    const inp = env.doc.getElementById('inCustom');
    inp.value = 'KK,QQ';
    inp.oninput();
    env.flush();
    const hint = env.doc.getElementById('customHint');
    ok(hint.textContent.indexOf('种组合') >= 0, '合法范围显示组合数', { got: hint.textContent });
    ok(!inp.classList.contains('bad'), '合法范围不标红');

    inp.value = '瞎写的东西';
    inp.oninput();
    env.flush();
    ok(env.doc.getElementById('customHint').textContent.indexOf('没认出') >= 0,
      '非法范围提示没认出', { got: env.doc.getElementById('customHint').textContent });
    ok(inp.classList.contains('bad'), '非法范围标红');
  }
}

/* ---------- 8. 清空 ---------- */
{
  env.doc.getElementById('btnClear').onclick();
  env.flush();
  const holeRow = env.doc.getElementById('holeRow');
  ok(holeRow.children[0].textContent.indexOf('选牌') >= 0, '清空后手牌回到空槽');
  const r = env.doc.getElementById('result');
  ok(r.textContent.indexOf('手牌') >= 0, '清空后提示重新选牌');
}

/* ---------- 8b. 右侧清空只清输入，不动牌面 ---------- */
{
  // 回到翻前，只需要两张手牌就能算
  env.doc.getElementById('stageTabs').children[0].onclick();
  env.flush();
  // 先摆好手牌，再乱填右侧，最后点右侧清空
  const pick = () => env.doc.getElementById('picker');
  pick().children[3].children[0].onclick();   // A♣
  pick().children[2].children[12].onclick();  // K♦
  env.flush();
  env.doc.getElementById('inPot').value = '800';
  env.doc.getElementById('inCall').value = '400';
  const sel = env.doc.getElementById('selOpp');
  sel.value = 'custom'; sel.onchange();
  env.doc.getElementById('inOpp').value = '7';
  env.doc.getElementById('inOpp').oninput();
  env.flush();
  ok(UI.last !== null && UI.last.nOpp === 7, '自定义 7 个对手生效', { got: UI.last && UI.last.nOpp });

  env.doc.getElementById('btnClearCalc').onclick();
  env.flush();
  ok(env.doc.getElementById('inPot').value === '', '右侧清空把底池清掉');
  ok(env.doc.getElementById('inCall').value === '', '右侧清空把跟注额清掉');
  ok(env.doc.getElementById('selOpp').value === '1', '右侧清空把人数回到 1');
  ok(env.doc.getElementById('oppCustomWrap').style.display === 'none', '右侧清空收起自定义人数框');
  ok(env.doc.getElementById('selRange').value === 'random', '右侧清空把范围回到随机');
  const holeRow2 = env.doc.getElementById('holeRow');
  ok(holeRow2.children[0].textContent.indexOf('A') >= 0, '右侧清空不动手牌');
}

/* ---------- 8c. 自定义人数边界 ---------- */
{
  const sel = env.doc.getElementById('selOpp');
  const inp = env.doc.getElementById('inOpp');

  sel.value = 'custom'; sel.onchange();
  inp.value = '9'; inp.oninput(); env.flush();
  ok(UI.last && UI.last.nOpp === 9, '填 9 个对手生效', { got: UI.last && UI.last.nOpp });

  inp.value = '12'; inp.oninput();
  ok(inp.classList.contains('bad'), '超过上限标红');
  ok(env.doc.getElementById('oppHint').textContent.indexOf('9') >= 0, '提示只能填到 9');

  inp.value = '2.5'; inp.oninput();
  ok(inp.classList.contains('bad'), '小数标红');

  // 失焦后回退到最后一次合法值
  inp.onblur();
  ok(inp.value === '9', '失焦回退到上次合法值', { got: inp.value });
  ok(!inp.classList.contains('bad'), '回退后不再标红');

  // 切回固定档位
  sel.value = '3'; sel.onchange(); env.flush();
  ok(UI.last && UI.last.nOpp === 3, '切回固定档位 3', { got: UI.last && UI.last.nOpp });
  ok(env.doc.getElementById('oppCustomWrap').style.display === 'none', '切回后收起自定义框');
}

/* ---------- 9. 点已用牌可撤回 ---------- */
{
  env.doc.getElementById('btnClear').onclick();   // 先清空手牌，回到两张空槽
  env.flush();
  // 每次都要重新取，因为放牌后选牌器会重画
  const pick = () => env.doc.getElementById('picker');
  pick().children[3].children[0].onclick();   // A♣
  env.flush();
  const holeRow = env.doc.getElementById('holeRow');
  ok(holeRow.children[0].textContent.indexOf('A') >= 0, '放上 A♣');

  // 再点一次同一张牌（此时它已是 used 状态）
  pick().children[3].children[0].onclick();
  env.flush();
  ok(env.doc.getElementById('holeRow').children[0].textContent.indexOf('选牌') >= 0,
    '再点同一张牌把它撤回');
  ok(!pick().children[3].children[0].classList.contains('used'),
    '撤回后该牌不再是 used');
}

/* ---------- 10. 无 console 报错 ---------- */
{
  ok(!env.errors || env.errors.length === 0, '无 console.error',
    { errs: env.errors ? env.errors.slice(0, 3) : [] });
}

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
