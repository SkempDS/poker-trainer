/* ui.js — 牌桌渲染与交互 */
(function () {
  'use strict';
  const Core = window.PokerCore;
  const EQ = window.PokerEquity;
  const AI = window.PokerAI;
  const RV = window.PokerReview;

  const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const $ = (id) => document.getElementById(id);

  let game = null;
  let busy = false;          // AI 正在思考
  let sessionStart = 0;      // 本次会话起始总筹码（人类）
  let handStartStacks = {};  // 本手开始时各家筹码
  let timer = null;
  let deferredReasons = [];  // 本手未结束时暂存 AI 的决策理由（含底牌），本手打完才公布

  /* ---------- 座位布局（相对牌桌区域的百分比） ---------- */
  const LAYOUT = {
    2: [[50, 84], [50, 16]],
    3: [[50, 85], [16, 34], [84, 34]],
    4: [[50, 85], [13, 56], [50, 15], [87, 56]],
    5: [[50, 85], [12, 63], [28, 18], [72, 18], [88, 63]],
    6: [[50, 86], [10, 66], [26, 20], [50, 13], [74, 20], [90, 66]]
  };
  // 座位相对人类顺时针编号，上半圈（y 较小）的座位牌朝下摆放
  const TOP_Y = 50;

  /* ================= 初始化 ================= */
  function init() {
    buildTable();
    bindControls();
    showSetup();
  }

  function buildTable() {
    // 动态创建 DOM 骨架（避免 HTML 里写死大量结构）
    const wrap = $('tableWrap');
    if (!wrap.querySelector('#felt')) {
      const fa = document.createElement('div');
      fa.id = 'feltArea';
      fa.innerHTML =
        '<div id="felt"></div>' +
        '<div id="center">' +
        '  <div id="potLabel">底池 <b>0</b></div>' +
        '  <div id="board"></div>' +
        '  <div id="streetLabel">翻前</div>' +
        '</div>' +
        '<div id="seats"></div>' +
        '<div id="resultBar"></div>';
      wrap.appendChild(fa);
      const ctl = document.createElement('div');
      ctl.id = 'controls';
      wrap.appendChild(ctl);
    }
  }

  function bindControls() {
    $('btnSetup').onclick = () => showSetup();
    $('btnReview').onclick = () => showReview();
  }

  /* ================= 开局设置 ================= */
  function showSetup() {
    const m = $('setupModal');
    m.classList.add('show');
    $('errSetup').textContent = '';
    $('inStack').value = game ? game.cfg.startStack : 2000;
    $('inSB').value = game ? game.cfg.sb : 10;
    $('inBB').value = game ? game.cfg.bb : 20;
    $('inAI').value = game ? game.cfg.aiCount : 3;
  }

  function confirmSetup() {
    const startStack = Math.floor(+$('inStack').value);
    const sb = Math.floor(+$('inSB').value);
    const bb = Math.floor(+$('inBB').value);
    const aiCount = Math.floor(+$('inAI').value);
    const err = $('errSetup');
    if (!(startStack >= 10)) return err.textContent = '起始筹码至少 10';
    if (!(sb >= 1)) return err.textContent = '小盲至少 1';
    if (!(bb > sb)) return err.textContent = '大盲必须大于小盲';
    if (bb > startStack / 2) return err.textContent = '大盲不能超过起始筹码的一半';
    if (!(aiCount >= 1 && aiCount <= 5)) return err.textContent = 'AI 人数需在 1~5 之间';

    game = new Core.Game({ startStack, sb, bb, aiCount, seed: Date.now() & 0x7fffffff });
    sessionStart += 0; // 会话起始由人类筹码快照决定，见下
    sessionStart = startStack;
    $('setupModal').classList.remove('show');
    $('resultBar').classList.remove('show');
    deferredReasons = [];
    clearLog();
    game.startHand();
    afterStateChange();
  }

  /* ================= 渲染 ================= */
  function afterStateChange() {
    render();
    if (game.phase === 'done') { flushDeferredReasons(); showResult(); }
    else { $('resultBar').classList.remove('show'); }
    scheduleAI();
  }

  function render() {
    if (!game) return;
    renderSeats();
    renderBoard();
    renderPot();
    renderControls();
    renderTop();
  }

  function renderTop() {
    $('topChips').innerHTML = '手数 <b>' + game.handNo + '</b>';
    $('topBlinds').innerHTML = '盲注 <b>' + game.cfg.sb + '/' + game.cfg.bb + '</b>';
    const myStack = game.getSeat(0) ? game.getSeat(0).stack : 0;
    const diff = myStack - sessionStart;
    $('topStack').innerHTML = '我的筹码 <b>' + myStack + '</b>' +
      (diff === 0 ? '' : ' <span style="color:' + (diff > 0 ? '#6ee79a' : '#ff8f8f') + '">(' +
        (diff > 0 ? '+' : '') + diff + ')</span>');
  }

  function renderSeats() {
    const box = $('seats');
    const as = game.activeSeats();
    const lay = LAYOUT[as.length] || LAYOUT[6];
    // 清掉多余的
    while (box.children.length > as.length) box.removeChild(box.lastChild);
    while (box.children.length < as.length) {
      const d = document.createElement('div');
      d.className = 'seat';
      d.innerHTML =
        '<div class="holes"></div>' +
        '<div class="plate">' +
        '  <div class="row1"><span class="nm"></span><span class="stk"></span></div>' +
        '  <div class="row2"><span class="tag"></span><span class="act"></span></div>' +
        '</div>' +
        '<div class="bet"></div>';
      box.appendChild(d);
    }

    const winners = [];
    if (game.result && game.result.winners) for (const w of game.result.winners) winners.push(w.seat);

    as.forEach((seat, i) => {
      const p = game.getSeat(seat);
      const el = box.children[i];
      const pos = lay[i] || lay[lay.length - 1];
      el.style.left = pos[0] + '%';
      el.style.top = pos[1] + '%';

      const isActive = game.phase === 'betting' && game.actor === seat;
      el.className = 'seat' +
        (pos[1] < TOP_Y ? ' top' : '') +
        (isActive ? ' active' : '') +
        (p.folded ? ' folded' : '') +
        (winners.indexOf(seat) >= 0 ? ' winner' : '');
      // 人类座位单独标记
      el.style.zIndex = isActive ? 30 : 5;

      el.querySelector('.nm').textContent = p.name;
      el.querySelector('.stk').textContent = p.stack;
      el.querySelector('.tag').textContent = p.isHuman ? '你' : (p.personality || '');

      const act = el.querySelector('.act');
      act.className = 'act';
      act.textContent = actionText(p);
      if (p.lastAction) act.classList.add(p.lastAction === 'blind-sb' || p.lastAction === 'blind-bb' ? 'call' : p.lastAction);

      // 底牌
      const holes = el.querySelector('.holes');
      holes.innerHTML = '';
      // 本手结束后（phase==='done'）公开所有还没弃牌的对手底牌；弃牌的人不亮（弃了就是弃了）
      const showdownOver = game.phase === 'done' && !!game.result;
      const showFace = p.isHuman || p.revealed ||
        (showdownOver && !p.folded && !p.eliminated && p.hole && p.hole.length > 0);
      if (p.hole && p.hole.length) {
        p.hole.forEach(c => holes.appendChild(cardEl(c, !showFace && !p.isHuman, false)));
      } else {
        for (let k = 0; k < 2; k++) {
          const d = document.createElement('div');
          d.className = 'card small empty';
          holes.appendChild(d);
        }
      }

      // 本轮下注额：做成筹码样式的小牌子，带「下注」字样，避免只看到一个飘着的小数字
      const betEl = el.querySelector('.bet');
      if (p.committedRound > 0) {
        betEl.textContent = '下注 ' + p.committedRound;
        betEl.style.display = '';
      } else {
        betEl.textContent = '';
        betEl.style.display = 'none';
      }

      // 庄家钮
      let db = el.querySelector('.dealerBtn');
      if (seat === game.button) {
        if (!db) {
          db = document.createElement('div');
          db.className = 'dealerBtn';
          db.textContent = 'D';
          el.appendChild(db);
        }
      } else if (db) db.remove();
    });
  }

  function actionText(p) {
    if (p.lastAction === 'fold') return '弃牌';
    if (p.lastAction === 'check') return '过牌';
    if (p.lastAction === 'call') return p.allIn ? '全下' : '跟注';
    if (p.lastAction === 'raise') return p.allIn ? '全下' : '加注';
    if (p.lastAction === 'blind-sb') return '小盲';
    if (p.lastAction === 'blind-bb') return '大盲';
    if (p.allIn) return '全下';
    return '';
  }

  function cardEl(c, faceDown, small) {
    const d = document.createElement('div');
    if (faceDown) { d.className = 'card' + (small ? ' small' : '') + ' back'; return d; }
    // 用 cardText：10 显示成 "10"，不是 "T"
    const rank = Core.RANK_TEXT[c >> 2];
    const suitCh = Core.SUIT_CHARS.charAt(c & 3);
    d.className = 'card' + (small ? ' small' : '') +
      ((suitCh === 'h' || suitCh === 'd') ? ' red' : '') +
      (rank.length > 1 ? ' wide' : '');
    d.innerHTML = '<span class="r">' + rank + '</span><span class="s">' + SUIT_SYM[suitCh] + '</span>';
    return d;
  }

  function renderBoard() {
    const b = $('board');
    b.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      if (i < game.board.length) b.appendChild(cardEl(game.board[i], false, false));
      else {
        const d = document.createElement('div');
        d.className = 'card empty';
        b.appendChild(d);
      }
    }
    $('streetLabel').textContent = game.phase === 'done' ? '本手结束' : Core.STREET_NAMES[game.street];
  }

  function renderPot() {
    // 本手结束后筹码已结算（committedTotal 清零），此时显示结算底池，避免出现「底池 0」
    const amt = (game.phase === 'done' && game.result && game.result.pot)
      ? game.result.pot : game.totalPot();
    $('potLabel').innerHTML = '底池 <b>' + amt + '</b>';
  }

  /* ================= 操作区 ================= */
  function renderControls() {
    const ctl = $('controls');
    const my = game.getSeat(0);
    const myTurn = game.phase === 'betting' && game.actor === 0;
    ctl.innerHTML = '';

    if (game.phase === 'done' || game.phase === 'over') {
      ctl.innerHTML = '<span class="hint">' + (game.phase === 'over' ? '牌局结束' : '本手结束') + '</span>' +
        '<span class="grow"></span><button class="btn primary" id="btnNext2">下一手</button>';
      $('btnNext2').onclick = nextHand;
      return;
    }
    if (!myTurn) {
      ctl.innerHTML = '<span class="hint">' + (busy ? '对手思考中…' : '等待…') + '</span>';
      return;
    }

    const la = game.legalActions(0);
    const types = la.map(x => x.type);
    const toCall = Math.max(0, game.currentBet - my.committedRound);
    const raise = la.find(x => x.type === 'raise');
    const pot = game.totalPot();

    // 弃牌
    const bFold = mkBtn('弃牌', 'btn');
    bFold.onclick = () => humanAct('fold');
    ctl.appendChild(bFold);

    // 过牌 / 跟注
    if (types.indexOf('check') >= 0) {
      const bCheck = mkBtn('过牌', 'btn');
      bCheck.onclick = () => humanAct('check');
      ctl.appendChild(bCheck);
    } else if (types.indexOf('call') >= 0) {
      const callAmt = Math.min(toCall, my.stack);
      const bCall = mkBtn('跟注 ' + callAmt + (callAmt >= my.stack ? '（全下）' : ''), 'btn primary');
      bCall.onclick = () => humanAct('call');
      ctl.appendChild(bCall);
    }

    // 加注
    if (raise) {
      const box = document.createElement('div');
      box.id = 'raiseBox';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.id = 'raiseSlider';
      slider.min = raise.minTo;
      slider.max = raise.maxTo;
      slider.step = 1;
      const defaultTo = Math.min(raise.maxTo, Math.max(raise.minTo, Math.round(game.currentBet * 2.5) || raise.minTo));
      slider.value = defaultTo;

      // 手动输入金额：和滑块双向同步，越界自动钳到 [minTo, maxTo]
      const typed = document.createElement('input');
      typed.type = 'number';
      typed.id = 'raiseInput';
      typed.min = raise.minTo;
      typed.max = raise.maxTo;
      typed.step = 1;
      typed.value = String(defaultTo);

      const bRaise = mkBtn('加注', 'btn primary');

      // 把任意值收进合法区间：空/非数字返回 null
      const clamp = (v) => {
        const n = Math.round(Number(v));
        if (!isFinite(n)) return null;
        return Math.max(raise.minTo, Math.min(raise.maxTo, n));
      };
      const sync = (from) => {
        const v = +slider.value;
        if (from !== 'input') typed.value = String(v);
        typed.classList.remove('bad');
        bRaise.textContent = (v >= raise.maxTo) ? '全下' : '加注';
      };

      slider.oninput = () => sync('slider');
      typed.oninput = () => {
        // 输入过程中不强行改写（避免打字被打断），只标记是否已越界
        const raw = typed.value;
        const n = Number(raw);
        typed.classList.toggle('bad', raw !== '' && (!isFinite(n) || n < raise.minTo || n > raise.maxTo));
      };
      typed.onchange = typed.onblur = () => {
        const c = clamp(typed.value);
        if (c === null) { typed.value = String(slider.value); sync('input'); return; }
        slider.value = c;
        sync('slider');
      };

      // 以输入框里的数为准（用户可能刚手输过），钳到合法区间后再同步滑块
      bRaise.onclick = () => {
        const c = clamp(typed.value);
        const v = (c === null) ? +slider.value : c;
        slider.value = v;
        sync('slider');
        humanAct('raise', v);
      };

      box.appendChild(slider);
      // 「到 [____]」：写作「加注到 400」，比单个裸数字好读
      const wrap = document.createElement('span');
      wrap.className = 'raise-in-wrap';
      wrap.textContent = '到';
      wrap.appendChild(typed);
      box.appendChild(wrap);

      const quicks = [
        ['½ 池', () => Math.round(game.currentBet + pot * 0.5)],
        ['1 池', () => Math.round(game.currentBet + pot)],
        ['全下', () => raise.maxTo]
      ];
      for (const [t, f] of quicks) {
        const q = mkBtn(t, 'btn ghost');
        q.style.padding = '5px 9px';
        q.style.fontSize = '11px';
        q.onclick = () => {
          slider.value = Math.max(raise.minTo, Math.min(raise.maxTo, f()));
          sync('slider');
        };
        box.appendChild(q);
      }
      ctl.appendChild(box);
      ctl.appendChild(bRaise);
      sync('slider');
    }
    ctl.appendChild(Object.assign(document.createElement('span'), { className: 'grow' }));
  }

  function mkBtn(text, cls) {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = text;
    return b;
  }

  /* ================= 人类行动 ================= */
  function humanAct(type, amount) {
    const r = game.act(0, type, amount);
    if (!r.ok) { console.warn('非法动作', r); return; }
    logAction(0, type, amount);
    afterStateChange();
  }

  /* ================= AI 循环 ================= */
  function scheduleAI() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!game || game.phase !== 'betting') return;
    if (game.actor == null) return;
    const p = game.getSeat(game.actor);
    if (!p || p.isHuman) { render(); return; }

    busy = true;
    renderControls();
    const seat = game.actor;
    timer = setTimeout(() => {
      timer = null;
      if (!game || game.phase !== 'betting' || game.actor !== seat) { busy = false; return; }
      let d;
      try {
        d = AI.decide(game, seat, 3000);
      } catch (e) {
        console.error('AI 决策失败', e);
        d = { action: { type: 'fold' }, reason: '出错弃牌' };
      }
      const r = game.act(seat, d.action.type, d.action.amount);
      if (!r.ok) {
        // 兜底
        const la = game.legalActions(seat);
        const t = la.map(x => x.type);
        if (t.indexOf('check') >= 0) game.act(seat, 'check');
        else if (t.indexOf('call') >= 0) game.act(seat, 'call');
        else game.act(seat, 'fold');
      }
      logAction(seat, d.action.type, d.action.amount, d.reason);
      busy = false;
      afterStateChange();
    }, 380 + Math.random() * 260);
  }

  /* ================= 一手结束 ================= */
  function checkHandEnd() {
    if (game.phase === 'done') {
      showResult();
      return true;
    }
    return false;
  }

  function showResult() {
    const r = game.result;
    const bar = $('resultBar');
    if (!r) { bar.classList.remove('show'); return; }
    let txt = '';
    if (r.type === 'uncontested') {
      const w = r.winners[0];
      const nm = game.getSeat(w.seat).name;
      txt = '<span class="win">' + nm + '</span> 赢得底池 ' + w.amount + '（其余弃牌）';
    } else if (r.type === 'showdown') {
      const parts = r.winners.map(w => {
        const s = game.getSeat(w.seat);
        const sd = (r.showdown || []).find(x => x.seat === w.seat);
        return '<span class="win">' + s.name + '</span> 赢 ' + w.amount +
          (sd ? '（' + sd.desc + '）' : '');
      });
      const others = (r.showdown || []).filter(x => !r.winners.some(w => w.seat === x.seat));
      txt = parts.join('，');
      if (others.length) {
        txt += '<br><span style="color:#8fb39d;font-size:12px">其余：' +
          others.map(x => game.getSeat(x.seat).name + ' ' + x.desc).join('；') + '</span>';
      }
    } else {
      txt = '本手无人获胜';
    }
    // 人类盈亏：用最后一手历史记录里的结算前筹码对比
    const rec = game.handHistory[game.handHistory.length - 1];
    if (rec && rec.startStacks && rec.startStacks[0] != null) {
      const d = game.getSeat(0).stack - rec.startStacks[0];
      txt += '<br><span style="font-size:12px;color:' + (d > 0 ? '#6ee79a' : d < 0 ? '#ff8f8f' : '#b9ccbf') + '">' +
        '你本手 ' + (d > 0 ? '+' : '') + d + '</span>';
    }
    bar.innerHTML = txt;
    bar.classList.add('show');
  }

  function nextHand() {
    if (!game) return;
    $('resultBar').classList.remove('show');
    // 玩家自己破产时必须先补码，否则会静默空转（引擎会把破产座位直接标记弃牌）
    const my = game.getSeat(0);
    if (my && my.stack <= 0) {
      if (confirm('你的筹码输光了。补码继续？')) {
        game.rebuy(0, game.cfg.startStack);
        my.eliminated = false;
      } else {
        game.phase = 'over';
        render();
        return;
      }
    }
    const alive = game.players.filter(p => p.stack > 0);
    if (alive.length < 2) {
      game.phase = 'over';
      render();
      return;
    }
    handStartStacks = {};
    game.players.forEach(p => handStartStacks[p.seat] = p.stack);
    const ok = game.startHand();
    if (!ok) { render(); return; }
    logHandHeader();
    afterStateChange();
  }

  /* ================= 侧栏日志 ================= */
  function clearLog() { $('logList').innerHTML = ''; }

  function logHandHeader() {
    if (!game) return;
    deferredReasons = [];   // 新的一手，清掉上一手没来得及公布的思路
    const btn = game.getSeat(game.button);
    pushLog('<div class="ln hdr">第 ' + game.handNo + ' 手 · 庄家 ' + (btn ? btn.name : '-') + '</div>');
  }

  function logAction(seat, type, amount, reason) {
    const p = game.getSeat(seat);
    if (!p) return;
    const nm = '<span class="who">' + p.name + '</span>';
    // 从事件日志里取本条动作的真实金额，避免调用方传参不准
    let ev = null;
    for (let i = game.log.length - 1; i >= 0; i--) {
      const e = game.log[i];
      if (e.seat === seat && (e.type === 'fold' || e.type === 'check' || e.type === 'call' || e.type === 'raise')) { ev = e; break; }
    }
    let s = '';
    if (type === 'fold') s = '弃牌';
    else if (type === 'check') s = '过牌';
    else if (type === 'call') s = (ev && ev.allIn) ? '<span class="amt">全下 ' + (ev.amount || '') + '</span>' : '跟注 ' + (ev ? ev.amount : '');
    else if (type === 'raise') s = '<span class="amt">' + ((ev && ev.allIn) ? '全下到 ' : '加注到 ') + (ev ? ev.to : amount) + '</span>';
    else s = type;
    pushLog('<div class="ln ' + type + '">' + nm + ' ' + s + '</div>');
    // AI 的理由里含它的底牌：本手没结束前不能写进对局记录，先攒着，本手打完统一公布
    if (reason && !p.isHuman) {
      deferredReasons.push({ seat: seat, street: game.street, reason: reason });
    }
  }

  function reasonLine(p, street, reason) {
    return '<div class="ln why">· ' + p.name + '（' + (Core.STREET_NAMES[street] || '') + '）：' + reason + '</div>';
  }

  // 本手结束：把攒下的 AI 思路一次性公开（此时底牌已经亮了，不算提前泄牌）
  function flushDeferredReasons() {
    // 先公布本手各家底牌（含已弃牌的），对局记录里才能回看
    const rows = [];
    for (const p of game.players) {
      if (!p.hole || !p.hole.length) continue;
      rows.push(p.name + ' ' + Core.cardsText(p.hole) + (p.folded ? '（已弃）' : ''));
    }
    if (rows.length) {
      pushLog('<div class="ln hdr">本手结束 · 各家底牌</div>');
      pushLog('<div class="ln why">· ' + rows.join('　·　') + '</div>');
    }
    if (!deferredReasons.length) return;
    const list = deferredReasons.slice();
    deferredReasons = [];
    pushLog('<div class="ln hdr">各家思路</div>');
    for (const it of list) {
      const p = game.getSeat(it.seat);
      if (p) pushLog(reasonLine(p, it.street, it.reason));
    }
  }

  function pushLog(html) {
    const list = $('logList');
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
    list.insertAdjacentHTML('beforeend', html);
    if (atBottom) list.scrollTop = list.scrollHeight;
  }

  /* ================= 复盘 ================= */
  function showReview() {
    const m = $('reviewModal');
    m.classList.add('show');
    const body = $('revBody');
    const hands = game ? game.handHistory : [];
    if (!hands.length) {
      body.innerHTML = '<div class="revEmpty">还没有打完的手牌。先打几手再回来复盘。</div>';
      return;
    }
    body.innerHTML = '';
    hands.slice().reverse().forEach(rec => {
      const div = document.createElement('div');
      div.className = 'revHand';
      const nDec = rec.decisions ? rec.decisions.length : 0;
      // 本手人类盈亏
      let delta = 0, found = false;
      const sb = rec.stacks.find(s => s.seat === 0);
      // 用 result 推断：结算后 stacks 是结算后
      div.innerHTML =
        '<div class="hd"><span>第 ' + rec.handNo + ' 手 · ' + (rec.result ? resultName(rec.result) : '-') + '</span>' +
        '<span style="color:#86a993;font-size:11px">' + nDec + ' 个决策点</span></div>' +
        '<div class="bd"></div>';
      div.querySelector('.hd').onclick = () => {
        div.classList.toggle('open');
        if (div.classList.contains('open') && !div.dataset.done) {
          div.dataset.done = '1';
          renderHandReview(div.querySelector('.bd'), rec);
        }
      };
      body.appendChild(div);
    });
  }

  function resultName(r) {
    if (r.type === 'uncontested') return '弃牌收池';
    if (r.type === 'showdown') return '摊牌';
    return '结束';
  }

  function renderHandReview(bd, rec) {
    bd.innerHTML = '<div class="revEmpty" style="padding:10px 0">分析中…</div>';
    setTimeout(() => {
      let html = '';
      // 牌面
      const boardTxt = rec.board && rec.board.length ? Core.cardsText(rec.board) : '（无公共牌）';
      html += '<div class="revStep" style="border-top:none"><span class="k">公共牌</span>' +
        '<span class="val">' + boardTxt + '</span></div>';

      // 各家底牌：这手已经结束了，全部公开（弃牌的人标注「已弃」）
      if (rec.stacks && rec.stacks.length) {
        const sd = {};
        if (rec.result && rec.result.showdown) {
          rec.result.showdown.forEach(x => { sd[x.seat] = x.desc; });
        }
        const cards = rec.stacks.map(s => {
          const p = game.getSeat(s.seat);
          const nm = p ? p.name : ('座位' + s.seat);
          const txt = (s.hole && s.hole.length) ? Core.cardsText(s.hole) : '—';
          const tail = s.folded ? ' <span style="color:#7f9a8b">已弃</span>' : (sd[s.seat] ? ' <span style="color:#a9e8c0">' + sd[s.seat] + '</span>' : '');
          return '<span class="hc">' + nm + ' ' + txt + tail + '</span>';
        }).join('<span style="color:#3d5147"> · </span>');
        html += '<div class="revStep" style="border-top:none"><span class="k">各家底牌</span>' +
          '<span class="val" style="font-size:11.5px">' + cards + '</span></div>';
      }

      if (!rec.decisions || !rec.decisions.length) {
        html += '<div class="revStep" style="color:#86a993">本手你没有做出决策（未轮到你行动）。</div>';
        bd.innerHTML = html;
        return;
      }

      rec.decisions.forEach((d, idx) => {
        const snap = d.snap;
        const adv = RV.analyzeSnapshot(snap, 4500);
        const g = RV.grade(adv.best, d.actual);
        const cls = g.level === 'good' ? 'good' : g.level === 'bad' ? 'bad' : 'mid';
        const holeTxt = Core.cardsText(snap.hole);
        const boardNow = snap.board && snap.board.length ? Core.cardsText(snap.board) : '—';
        html += '<div class="revStep">' +
          '<div class="line">' +
          '<span class="k">' + Core.STREET_NAMES[snap.street] + '</span>' +
          '<span class="val">手牌 ' + holeTxt + ' · 牌面 ' + boardNow + ' · 底池 ' + snap.pot + ' · ' + snap.pos + '</span>' +
          '<span class="verdict ' + cls + '">' + g.text + '</span>' +
          '</div>' +
          '<div class="line" style="margin-top:5px">' +
          '<span class="k">你的选择</span>' +
          '<span class="val ' + (g.level === 'bad' ? 'bad' : '') + '">' + RV.label(d.actual) + '</span>' +
          '</div>' +
          '<div class="line" style="margin-top:3px">' +
          '<span class="k">理论最优</span>' +
          '<span class="adv">' + RV.label(adv.best) + '</span>' +
          '</div>' +
          '<div class="line" style="margin-top:3px">' +
          '<span class="k">依据</span>' +
          '<span class="val" style="color:#9fb5a6;font-size:11.5px">' + adv.basis + '</span>' +
          '</div>' +
          '<div class="line" style="margin-top:3px">' +
          '<span class="k">胜率</span>' +
          '<span class="val" style="color:#9fb5a6;font-size:11.5px">' +
          (adv.equity * 100).toFixed(1) + '%（门槛 ' + (adv.eqNeed * 100).toFixed(1) + '%）· ' + adv.eqLabel +
          '</span>' +
          '</div>' +
          '</div>';
      });
      bd.innerHTML = html;
    }, 30);
  }

  /* ================= 启动 ================= */
  window.addEventListener('DOMContentLoaded', () => {
    init();
    // 绑定弹层按钮
    $('btnSetupOk').onclick = confirmSetup;
    $('btnSetupCancel').onclick = () => {
      if (!game) return;
      $('setupModal').classList.remove('show');
    };
    $('btnRevClose').onclick = () => $('reviewModal').classList.remove('show');
  });

  // 对外暴露，便于调试
  window.__poker = { get game() { return game; } };
})();
