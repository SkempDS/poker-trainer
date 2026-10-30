// make_shots4.js — 截图用：停在人类可加注的局面，看滑块 + 输入框
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, '德州扑克.html'), 'utf8');
const OUT = path.join(__dirname, '_shot');
fs.mkdirSync(OUT, { recursive: true });
const inject = (js) => html.replace('</body>', '<script>\n' + js + '\n</script>\n</body>');

// 停在人类可加注的局面；随后在输入框里手打一个数，展示输入态
const js = `
window.addEventListener('load', () => {
  const $ = id => document.getElementById(id);
  $('inStack').value = '2000'; $('inSB').value = '10'; $('inBB').value = '20'; $('inAI').value = '3';
  $('btnSetupOk').click();
  let n = 0;
  const tick = setInterval(() => {
    const g = window.__poker.game;
    if (!g || n++ > 900) { clearInterval(tick); return; }
    if (g.phase === 'done' || g.phase === 'over') {
      const nb = document.getElementById('btnNext2');
      if (nb) nb.click();
      return;
    }
    if (g.phase === 'betting' && g.actor === 0) {
      const la = g.legalActions(0);
      if (la.some(x => x.type === 'raise')) {
        clearInterval(tick);
        // 手动在输入框里打一个数，展示「手输金额」的使用态
        const inp = document.getElementById('raiseInput');
        if (inp) { inp.value = '450'; inp.oninput(); inp.focus && inp.focus(); }
        return;
      }
      const btns = [...document.querySelectorAll('#controls button')];
      const b = btns.find(x => /过牌/.test(x.textContent)) || btns.find(x => /跟注/.test(x.textContent)) || btns.find(x => /弃牌/.test(x.textContent));
      if (b) b.click();
    }
  }, 55);
});
`;
fs.writeFileSync(path.join(OUT, 'raise.html'), inject(js), 'utf8');
console.log('生成 raise');
