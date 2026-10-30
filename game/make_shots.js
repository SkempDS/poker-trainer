// make_shots.js — 生成几个临时调试页（产物 + 自动开局脚本），给 Chrome 截图用
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, '德州扑克.html'), 'utf8');
const OUT = path.join(__dirname, '_shot');
fs.mkdirSync(OUT, { recursive: true });

function inject(js) {
  return html.replace('</body>', '<script>\n' + js + '\n</script>\n</body>');
}

/* 1) 牌桌进行中：4 人桌，打到翻牌圈人类行动 */
const s1 = `
window.addEventListener('load', () => {
  const $ = id => document.getElementById(id);
  $('inStack').value = '2000'; $('inSB').value = '10'; $('inBB').value = '20'; $('inAI').value = '3';
  $('btnSetupOk').click();
  let n = 0;
  const tick = setInterval(() => {
    const g = window.__poker.game;
    if (!g || n++ > 60) { clearInterval(tick); return; }
    if (g.phase === 'betting' && g.actor === 0 && g.street >= 1) { clearInterval(tick); return; }
    const btns = [...document.querySelectorAll('#controls button')];
    const b = btns.find(x => /过牌|跟注/.test(x.textContent));
    if (b) b.click();
  }, 120);
});
`;

/* 2) 六人桌进行中 */
const s2 = `
window.addEventListener('load', () => {
  const $ = id => document.getElementById(id);
  $('inStack').value = '5000'; $('inSB').value = '25'; $('inBB').value = '50'; $('inAI').value = '5';
  $('btnSetupOk').click();
});
`;

/* 3) 复盘弹层：打 12 手后打开复盘并展开第一手；顺便把统计写进 title 供 dump 校验 */
const s3 = `
window.addEventListener('load', () => {
  const $ = id => document.getElementById(id);
  $('inStack').value = '2000'; $('inSB').value = '10'; $('inBB').value = '20'; $('inAI').value = '3';
  $('btnSetupOk').click();
  let hands = 0, guard = 0, stuck = 0;
  const tick = setInterval(() => {
    const g = window.__poker.game;
    if (!g || guard++ > 4000) { clearInterval(tick); return; }
    if (g.phase === 'done') {
      hands++;
      if (hands >= 12) {
        clearInterval(tick);
        window.__stat = g.handHistory.map(r => r.handNo + ':' + r.decisions.length + ':' + (r.stacks.find(s => s.seat === 0) || {}).stack).join(' ');
        document.title = 'STAT ' + window.__stat;
        $('btnReview').click();
        setTimeout(() => {
          // 展开第一个真有决策点的手
          const hs = [...document.querySelectorAll('#revBody .revHand')];
          for (const h of hs) {
            const t = h.querySelector('.hd').textContent || '';
            if (!/0 个决策点/.test(t)) { h.querySelector('.hd').click(); return; }
          }
          if (hs[0]) hs[0].querySelector('.hd').click();
        }, 300);
        return;
      }
      const nb = [...document.querySelectorAll('#controls button')].find(x => /下一手/.test(x.textContent));
      if (nb) nb.click();
      return;
    }
    if (g.phase === 'betting' && g.actor === 0) {
      const btns = [...document.querySelectorAll('#controls button')];
      const b = btns.find(x => /过牌/.test(x.textContent)) || btns.find(x => /跟注/.test(x.textContent)) || btns.find(x => /弃牌/.test(x.textContent));
      if (b) b.click(); else stuck++;
    }
  }, 60);
});
`;

fs.writeFileSync(path.join(OUT, 'auto1.html'), inject(s1), 'utf8');
fs.writeFileSync(path.join(OUT, 'auto2.html'), inject(s2), 'utf8');
fs.writeFileSync(path.join(OUT, 'auto3.html'), inject(s3), 'utf8');
console.log('生成 3 个调试页');
