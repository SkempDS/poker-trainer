// make_shots2.js — 生成不同人数/状态的调试页（多人数布局 + 本手结束态）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, '德州扑克.html'), 'utf8');
const OUT = path.join(__dirname, '_shot');
fs.mkdirSync(OUT, { recursive: true });

const inject = (js) => html.replace('</body>', '<script>\n' + js + '\n</script>\n</body>');

// 按人数开局，并自动过牌到翻牌圈人类行动
function playToFlop(aiCount, stack, sb, bb) {
  return `
window.addEventListener('load', () => {
  const $ = id => document.getElementById(id);
  $('inStack').value = '${stack}'; $('inSB').value = '${sb}'; $('inBB').value = '${bb}'; $('inAI').value = '${aiCount}';
  $('btnSetupOk').click();
  let n = 0;
  const tick = setInterval(() => {
    const g = window.__poker.game;
    if (!g || n++ > 200) { clearInterval(tick); return; }
    if (g.phase === 'betting' && g.actor === 0 && g.street >= 1) { clearInterval(tick); return; }
    const btns = [...document.querySelectorAll('#controls button')];
    const b = btns.find(x => /过牌/.test(x.textContent)) || btns.find(x => /跟注/.test(x.textContent)) || btns.find(x => /弃牌/.test(x.textContent));
    if (b) b.click();
  }, 100);
});
`;
}

// 打到本手结束（显示 resultBar + 下一手按钮）
const doneJs = `
window.addEventListener('load', () => {
  const $ = id => document.getElementById(id);
  $('inStack').value = '2000'; $('inSB').value = '10'; $('inBB').value = '20'; $('inAI').value = '3';
  $('btnSetupOk').click();
  let n = 0;
  const tick = setInterval(() => {
    const g = window.__poker.game;
    if (!g || n++ > 400) { clearInterval(tick); return; }
    if (g.phase === 'done') { clearInterval(tick); return; }
    if (g.phase === 'betting' && g.actor === 0) {
      const btns = [...document.querySelectorAll('#controls button')];
      const b = btns.find(x => /过牌/.test(x.textContent)) || btns.find(x => /跟注/.test(x.textContent)) || btns.find(x => /弃牌/.test(x.textContent));
      if (b) b.click();
    }
  }, 80);
});
`;

const pages = {
  'p2': playToFlop(1, 2000, 10, 20),
  'p3': playToFlop(2, 2000, 10, 20),
  'p5': playToFlop(4, 3000, 15, 30),
  'done': doneJs
};
for (const k in pages) fs.writeFileSync(path.join(OUT, k + '.html'), inject(pages[k]), 'utf8');
console.log('生成', Object.keys(pages).join(' '));
