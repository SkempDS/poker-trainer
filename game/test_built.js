/* test_built.js — 直接测最终交付物 `德州扑克.html`（而不是源码文件）。
 * 从 HTML 里按顺序抽出内联 <script> 跑进 DOM 桩件，验证内联后的单文件真能开局、能打、能复盘。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createEnv } = require('./domstub.js');

const HTML = path.join(__dirname, '..', '德州扑克.html');
const html = fs.readFileSync(HTML, 'utf8');
console.log('产物大小', (html.length / 1024).toFixed(1), 'KB');

function fail(msg, e) {
  console.log('FAIL ' + msg);
  if (e) console.log(String(e.stack || e).split('\n').slice(0, 10).join('\n'));
  process.exit(1);
}

/* 抽 script 块 */
const scripts = [];
const re = /<script>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) scripts.push(m[1]);
console.log('script 块数', scripts.length, '各块长度', scripts.map(s => s.length).join('/'));
if (scripts.length < 7) fail('script 块少于 7 个');

/* 占位符都替换掉的检查 */
for (const ph of ['/*__CSS__*/', '/*__TABLE_169__*/', '/*__RANGE_SPECS__*/', '/*__CORE__*/',
  '/*__EQUITY__*/', '/*__AI__*/', '/*__REVIEW__*/', '/*__UI__*/']) {
  if (html.indexOf(ph) >= 0) fail('占位符未替换: ' + ph);
}
console.log('OK 8 个占位符全部替换');

const env = createEnv();
const { sandbox, doc, bodyEl, flush, allButtons } = env;
const ctx = vm.createContext(sandbox);

/* 灌 body DOM（产物里 body 到第一个 <script> 之间） */
const bStart = html.indexOf('<body>') + 6;
const bEnd = html.indexOf('<script>');
bodyEl.innerHTML = html.slice(bStart, bEnd);
(function reg(n) { for (const c of n.children) { if (c.id) doc.byId[c.id] = c; reg(c); } })(bodyEl);

/* 顺序执行 */
let i = 0;
for (const s of scripts) {
  i++;
  try { vm.runInContext(s, ctx, { filename: 'inline-' + i + '.js' }); }
  catch (e) { fail('内联脚本第 ' + i + ' 块执行失败', e); }
}
console.log('OK 7 块内联脚本全部执行');

if (!sandbox.PokerCore || !sandbox.PokerEquity || !sandbox.PokerAI || !sandbox.PokerReview) fail('引擎导出缺失');
console.log('OK 引擎导出齐全');

/* 数据是否真的内联进去了 */
const nT = (sandbox.__TABLE_169__ || []).length;
const nR = Object.keys(sandbox.__RANGE_SPECS__ || {}).length;
if (nT !== 169) fail('内联 169 表条数 ' + nT + ' != 169');
if (nR !== 7) fail('内联范围数 ' + nR + ' != 7');
console.log('OK 内联数据：169 表 ' + nT + ' 条，范围 ' + nR + ' 个（' + Object.keys(sandbox.__RANGE_SPECS__).join(',') + '）');

/* 起局 */
const cbs = sandbox.__listeners['DOMContentLoaded'] || [];
if (!cbs.length) fail('未注册 DOMContentLoaded');
try { cbs.forEach(f => f()); } catch (e) { fail('初始化抛异常', e); }
console.log('OK 初始化');

function btn(t) { for (const b of allButtons()) if ((b._text || '').indexOf(t) === 0) return b; return null; }

let errs = [];
console.error = (...a) => { errs.push(a.map(String).join(' ')); };

doc.getElementById('inStack').value = '2000';
doc.getElementById('inSB').value = '10';
doc.getElementById('inBB').value = '20';
doc.getElementById('inAI').value = '3';
doc.getElementById('btnSetupOk').onclick();
let g = sandbox.__poker.game;
if (!g || g.players.length !== 4) fail('开局失败');
console.log('OK 开局 4 人 / 2000 / 10-20');

/* 打 20 手 */
const declared = 2000 * 4;
/* 破产补码会真的加筹码，守恒断言需把补码量计入（与 test_ui.js 同口径） */
let rebuyExtra = 0;
sandbox.confirm = function () { rebuyExtra += 2000; return true; };
for (let h = 0; h < 20; h++) {
  let guard = 0;
  while (guard++ < 600) {
    flush();
    g = sandbox.__poker.game;
    if (g.phase !== 'betting') break;
    if (g.actor === 0) {
      const types = g.legalActions(0).map(x => x.type);
      let pick;
      if (types.indexOf('raise') >= 0 && Math.random() < 0.3) pick = 'raise';
      else if (types.indexOf('check') >= 0) pick = 'check';
      else if (types.indexOf('call') >= 0) pick = 'call';
      else pick = 'fold';
      const b = pick === 'raise' ? (btn('加注') || btn('全下')) : btn({ check: '过牌', call: '跟注', fold: '弃牌' }[pick]);
      if (!b || !b.onclick) fail('找不到按钮 ' + pick + ' 可用=' + types);
      b.onclick();
    }
  }
  g = sandbox.__poker.game;
  if (g.phase === 'over') break;
  if (g.phase !== 'done') fail('第 ' + (h + 1) + ' 手没打完，阶段 ' + g.phase);
  const sum = g.players.reduce((s, p) => s + p.stack + p.committedTotal, 0);
  if (sum !== declared + rebuyExtra) fail('第 ' + (h + 1) + ' 手后筹码 ' + sum + ' != ' + (declared + rebuyExtra) + '（含补码 ' + rebuyExtra + '）');
  const nb = btn('下一手');
  if (!nb) fail('缺「下一手」按钮');
  if (h < 19) nb.onclick();
}
g = sandbox.__poker.game;
console.log('OK 打 ' + g.handHistory.length + ' 手，全程筹码守恒 ' + declared);

/* 复盘 */
flush();
doc.getElementById('btnReview').onclick();
flush();
const revBody = doc.getElementById('revBody');
if (revBody.children.length !== g.handHistory.length) fail('复盘条目数不符');
let okAdv = 0, total = 0;
for (let k = 0; k < revBody.children.length; k++) {
  const rec = g.handHistory[revBody.children.length - 1 - k];
  if (!rec.decisions || !rec.decisions.length) continue;
  total++;
  const div = revBody.children[k];
  div.querySelector('.hd').onclick();
  flush();
  const txt = div.querySelector('.bd')._html || '';
  if (txt.indexOf('理论最优') >= 0 && txt.indexOf('依据') >= 0 && txt.indexOf('胜率') >= 0) okAdv++;
  else fail('复盘详情缺要素: ' + txt.replace(/<[^>]+>/g, ' ').slice(0, 200));
  if (total >= 3) break;
}
console.log('OK 复盘：抽查 ' + total + ' 手含决策点的手，' + okAdv + ' 手三要素齐全');

if (errs.length) fail('运行期 console.error ' + errs.length + ' 次: ' + errs.slice(0, 3).join(' | '));
console.log('\n产物整体通过');
