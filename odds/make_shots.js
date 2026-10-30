/* 生成调试页：在每个页面注入脚本自动填牌并打开到指定状态，供 Chrome headless 截图 */
'use strict';
const fs = require('fs');
const path = require('path');

const POKER = path.join(__dirname, '..');
const SRC = path.join(POKER, '德州扑克-赔率计算器.html');
const OUTDIR = path.join(__dirname, '_shot');
if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

const html = fs.readFileSync(SRC, 'utf8');

function C(s) {
  const m = { s: 0, h: 1, d: 2, c: 3 };
  const rk = '23456789TJQKA';
  return rk.indexOf(s[0].toUpperCase()) * 4 + m[s[1].toLowerCase()];
}
function CS(str) { return str.trim().split(/\s+/).map(C); }

function make(name, script) {
  const out = html.replace('</body>', '<script>\n' + script + '\n</script>\n</body>');
  const p = path.join(OUTDIR, name + '.html');
  fs.writeFileSync(p, out, 'utf8');
  console.log(p);
}

// 通用的「按牌面点选牌器」脚本：直接用桩件之外的路径——调用内部状态不方便，
// 所以用最稳的方式：模拟点击选牌器里对应的牌。
// 牌整数 = rank*4 + suit；选牌器行顺序为 梅花(3) 方块(2) 红心(1) 黑桃(0) 从上到下，
// 即 children[0]=梅花, [1]=方块, [2]=红心, [3]=黑桃；列从 A 到 2（index 0..12）。
const CLICK = `
function clickCard(c) {
  var suit = c & 3, rank = c >> 2;
  var row = 3 - suit;
  var col = 12 - rank;
  var picker = document.getElementById('picker');
  picker.children[row].children[col].onclick();
}
function setStage(n) {
  document.getElementById('stageTabs').children[n].onclick();
}
`;

// 1) 初始态
make('a_init', `window.addEventListener('load', function(){ setTimeout(function(){}, 200); });`);

// 2) 翻前 AA
make('b_preflop', CLICK + `
window.addEventListener('load', function(){
  setTimeout(function(){
    clickCard(${C('As')}); clickCard(${C('Ah')});
  }, 30);
});`);

// 3) 翻牌圈：坚果同花听牌 A♥K♥ / Q♥7♥2♣
make('c_flop', CLICK + `
window.addEventListener('load', function(){
  setTimeout(function(){
    setStage(1);                            // 翻牌
    clickCard(${C('Ah')}); clickCard(${C('Kh')});
    clickCard(${C('Qh')}); clickCard(${C('7h')}); clickCard(${C('2c')});
    document.getElementById('inPot').value = '600';
    document.getElementById('inCall').value = '200';
    document.getElementById('inPot').oninput();
    document.getElementById('inCall').oninput();
  }, 30);
});`);

// 4) 转牌圈：已成顺子，看危险牌
make('d_turn', CLICK + `
window.addEventListener('load', function(){
  setTimeout(function(){
    setStage(2);                            // 转牌
    clickCard(${C('Ah')}); clickCard(${C('Kh')});
    clickCard(${C('Qh')}); clickCard(${C('Jh')}); clickCard(${C('2c')}); clickCard(${C('3d')});
    document.getElementById('inPot').value = '1200';
    document.getElementById('inCall').value = '0';
    document.getElementById('inPot').oninput();
    document.getElementById('inCall').oninput();
  }, 30);
});`);

// 5) 河牌圈：AA 被压，看该不该跟
make('e_river', CLICK + `
window.addEventListener('load', function(){
  setTimeout(function(){
    setStage(3);                            // 河牌
    clickCard(${C('Ad')}); clickCard(${C('Ac')});
    clickCard(${C('Kh')}); clickCard(${C('Qh')}); clickCard(${C('9h')}); clickCard(${C('3h')}); clickCard(${C('2c')});
    document.getElementById('inPot').value = '800';
    document.getElementById('inCall').value = '400';
    document.getElementById('inPot').oninput();
    document.getElementById('inCall').oninput();
  }, 30);
});`);

// 7) 自定义人数（9 个对手）+ 右侧清空按钮
make('g_opp', CLICK + `
window.addEventListener('load', function(){
  setTimeout(function(){
    setStage(1);                            // 翻牌
    clickCard(${C('Ah')}); clickCard(${C('Kh')});
    clickCard(${C('Qh')}); clickCard(${C('7h')}); clickCard(${C('2c')});
    document.getElementById('inPot').value = '600';
    document.getElementById('inCall').value = '200';
    document.getElementById('inPot').oninput();
    document.getElementById('inCall').oninput();
    var sel = document.getElementById('selOpp');
    sel.value = 'custom'; sel.onchange();
    var inp = document.getElementById('inOpp');
    inp.value = '9'; inp.oninput();
  }, 30);
});`);
// 6) 自定义范围
make('f_custom', CLICK + `
window.addEventListener('load', function(){
  setTimeout(function(){
    clickCard(${C('9s')}); clickCard(${C('8s')});
    var sel = document.getElementById('selRange');
    for (var i = 0; i < sel.children.length; i++) {
      if (sel.children[i].value === 'custom') { sel.value = 'custom'; sel.onchange(); break; }
    }
    var inp = document.getElementById('inCustom');
    inp.value = 'QQ+,AKs,AKo';
    inp.oninput();
    document.getElementById('inPot').value = '300';
    document.getElementById('inCall').value = '100';
    document.getElementById('inPot').oninput();
    document.getElementById('inCall').oninput();
  }, 30);
});`);
