// make_shots3.js — 截图用调试页：①手牌进行中（有注、日志不泄露底牌）②本手结束（思路已公布）③连打多手看日志历史
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, '德州扑克.html'), 'utf8');
const OUT = path.join(__dirname, '_shot');
fs.mkdirSync(OUT, { recursive: true });
const inject = (js) => html.replace('</body>', '<script>\n' + js + '\n</script>\n</body>');

// ① 打到「桌上明显有注」的时刻停住：至少两人有注且最大注 >= 60
const midJs = `
window.addEventListener('load', () => {
  const $ = id => document.getElementById(id);
  $('inStack').value = '2000'; $('inSB').value = '10'; $('inBB').value = '20'; $('inAI').value = '3';
  $('btnSetupOk').click();
  let n = 0;
  const tick = setInterval(() => {
    const g = window.__poker.game;
    if (!g || n++ > 800) { clearInterval(tick); return; }
    if (g.phase === 'done' || g.phase === 'over') { clearInterval(tick); return; }
    const bets = g.players.filter(p => p.committedRound > 0).map(p => p.committedRound);
    const maxBet = Math.max.apply(null, bets.concat([0]));
    if (bets.length >= 2 && maxBet >= 60 && g.actor !== 0) { clearInterval(tick); return; }
    if (g.phase === 'betting' && g.actor === 0) {
      const btns = [...document.querySelectorAll('#controls button')];
      const r = btns.find(x => /加注/.test(x.textContent));
      const b = (bets.length < 2 || maxBet < 60) && r ? r
        : (btns.find(x => /过牌/.test(x.textContent)) || btns.find(x => /跟注/.test(x.textContent)) || btns.find(x => /弃牌/.test(x.textContent)));
      if (b) b.click();
    }
  }, 60);
});
`;

// ② 打到本手结束，思路公布后停住
const endJs = `
window.addEventListener('load', () => {
  const $ = id => document.getElementById(id);
  $('inStack').value = '2000'; $('inSB').value = '10'; $('inBB').value = '20'; $('inAI').value = '3';
  $('btnSetupOk').click();
  let n = 0;
  const tick = setInterval(() => {
    const g = window.__poker.game;
    if (!g || n++ > 1200) { clearInterval(tick); return; }
    if (g.phase === 'done') {
      clearInterval(tick);
      const L = $('logList'); L.scrollTop = L.scrollHeight;
      return;
    }
    if (g.phase === 'betting' && g.actor === 0) {
      const btns = [...document.querySelectorAll('#controls button')];
      const b = btns.find(x => /过牌/.test(x.textContent)) || btns.find(x => /跟注/.test(x.textContent)) || btns.find(x => /弃牌/.test(x.textContent));
      if (b) b.click();
    }
  }, 60);
});
`;

// ③ 连打多手后停下，看日志里历史各手的「思路」段
const histJs = `
window.addEventListener('load', () => {
  const $ = id => document.getElementById(id);
  $('inStack').value = '2000'; $('inSB').value = '10'; $('inBB').value = '20'; $('inAI').value = '3';
  $('btnSetupOk').click();
  let n = 0, handsDone = 0;
  const tick = setInterval(() => {
    const g = window.__poker.game;
    if (!g || n++ > 3000) { clearInterval(tick); return; }
    if (g.phase === 'over') { clearInterval(tick); return; }
    if (g.phase === 'done') {
      handsDone++;
      if (handsDone >= 3) {
        clearInterval(tick);
        const L = $('logList'); L.scrollTop = L.scrollHeight;
        return;
      }
      const nb = document.getElementById('btnNext2');
      if (nb) nb.click();
      return;
    }
    if (g.phase === 'betting' && g.actor === 0) {
      const btns = [...document.querySelectorAll('#controls button')];
      const b = btns.find(x => /过牌/.test(x.textContent)) || btns.find(x => /跟注/.test(x.textContent)) || btns.find(x => /弃牌/.test(x.textContent));
      if (b) b.click();
    }
  }, 55);
});
`;

const pages = { mid: midJs, end: endJs, hist: histJs };
for (const k in pages) fs.writeFileSync(path.join(OUT, k + '.html'), inject(pages[k]), 'utf8');
console.log('生成', Object.keys(pages).join(' '));
