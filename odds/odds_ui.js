/* 赔率 / 胜率计算器 —— 界面层
 * 实战辅助工具：看不到对手底牌，所以对手只能按随机手牌或范围来估。
 */
(function () {
  'use strict';

  var O = null;          // PokerOdds
  var C = null;          // PokerCore
  var E = null;          // PokerEquity

  // 当前选择：手牌 2 个槽、公共牌 5 个槽，空槽为 null
  var hole = [null, null];
  var board = [null, null, null, null, null];
  var boardCount = 0;    // 当前阶段用到几张公共牌：0 / 3 / 4 / 5
  var nOpp = 1;
  var rangeKey = 'random';
  var customRange = '';
  var lastResult = null;
  var computing = false;

  var RANK_TEXT = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  var SUIT_TEXT = ['♠', '♥', '♦', '♣'];
  var SUIT_RED = [false, true, true, false];

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt !== undefined) d.textContent = txt;
    return d;
  }

  // 牌整数：rank*4 + suit（与 core.js 一致）
  function cardOf(rank, suit) { return rank * 4 + suit; }
  function rankOf(c) { return c >> 2; }
  function suitOf(c) { return c & 3; }

  /* ---------------- 牌面渲染 ---------------- */

  function cardFace(c, extraCls) {
    var d = el('div', 'pk-card' + (SUIT_RED[suitOf(c)] ? ' red' : '') + (extraCls ? ' ' + extraCls : ''));
    var r = RANK_TEXT[rankOf(c)];
    d.appendChild(el('span', 'pk-rank' + (r.length > 1 ? ' wide' : ''), r));
    d.appendChild(el('span', 'pk-suit', SUIT_TEXT[suitOf(c)]));
    return d;
  }

  function cardBack(extraCls) {
    var d = el('div', 'pk-card back' + (extraCls ? ' ' + extraCls : ''));
    return d;
  }

  function emptySlot(label) {
    var d = el('div', 'pk-card empty', label);
    return d;
  }

  /* ---------------- 选择区 ---------------- */

  function renderSlots() {
    // 手牌
    var hw = $('holeRow');
    hw.innerHTML = '';
    for (var i = 0; i < 2; i++) {
      (function (idx) {
        var node;
        if (hole[idx] === null) {
          node = emptySlot('选牌');
          node.classList.add('pickable');
          node.onclick = function () { focusSlot('hole', idx); };
        } else {
          node = cardFace(hole[idx], 'pickable');
          node.onclick = function () { clearSlot('hole', idx); };
          node.title = '点一下移除';
        }
        hw.appendChild(node);
      })(i);
    }

    // 公共牌：只渲染当前阶段要用的张数
    var bw = $('boardRow');
    bw.innerHTML = '';
    if (boardCount === 0) {
      var ph = el('div', 'board-hint', '翻前没有公共牌');
      bw.appendChild(ph);
    } else {
      for (var j = 0; j < boardCount; j++) {
        (function (idx) {
          var node;
          if (board[idx] === null) {
            node = emptySlot(idx < 3 ? '翻牌' : (idx === 3 ? '转牌' : '河牌'));
            node.classList.add('pickable');
            node.onclick = function () { focusSlot('board', idx); };
          } else {
            node = cardFace(board[idx], 'pickable');
            node.onclick = function () { clearSlot('board', idx); };
            node.title = '点一下移除';
          }
          bw.appendChild(node);
        })(j);
      }
    }
  }

  var target = null;   // { zone:'hole'|'board', idx:number }

  function focusSlot(zone, idx) {
    target = { zone: zone, idx: idx };
    renderSlots();
    highlightTarget();
    $('picker').classList.add('hint');
    setTimeout(function () { $('picker').classList.remove('hint'); }, 700);
  }

  function highlightTarget() {
    var slots = $('holeRow').children;
    for (var i = 0; i < slots.length; i++) slots[i].classList.remove('target');
    var bs = $('boardRow').children;
    for (var k = 0; k < bs.length; k++) bs[k].classList.remove('target');
    if (!target) return;
    var arr = target.zone === 'hole' ? slots : bs;
    if (arr[target.idx]) arr[target.idx].classList.add('target');
  }

  function clearSlot(zone, idx) {
    if (zone === 'hole') hole[idx] = null;
    else board[idx] = null;
    target = { zone: zone, idx: idx };
    renderSlots();
    highlightTarget();
    scheduleCompute();
  }

  function usedCards() {
    var s = {};
    hole.forEach(function (c) { if (c !== null) s[c] = 1; });
    board.slice(0, boardCount).forEach(function (c) { if (c !== null) s[c] = 1; });
    return s;
  }

  function nextEmptySlot() {
    for (var i = 0; i < 2; i++) if (hole[i] === null) return { zone: 'hole', idx: i };
    for (var j = 0; j < boardCount; j++) if (board[j] === null) return { zone: 'board', idx: j };
    return null;
  }

  function placeCard(c) {
    var slot = target;
    if (!slot) slot = nextEmptySlot();
    if (!slot) return false;
    // 若目标槽已有牌，先清空（相当于替换）
    if (slot.zone === 'hole') hole[slot.idx] = c;
    else board[slot.idx] = c;
    // 放好后自动跳到下一个空槽，连续点牌更顺手
    target = nextEmptySlot();
    renderSlots();
    renderPicker();          // 必须重画：已用掉的牌要变灰，否则同一张能被重复点
    highlightTarget();
    scheduleCompute();
    return true;
  }

  function renderPicker() {
    var wrap = $('picker');
    wrap.innerHTML = '';
    var used = usedCards();
    for (var s = 3; s >= 0; s--) {           // 黑桃、红心、方块、梅花
      var row = el('div', 'pk-row');
      for (var r = 12; r >= 0; r--) {         // A 在下？不，从左到右 A K Q ... 2
        (function (rank, suit) {
          var c = cardOf(rank, suit);
          var d = cardFace(c, 'mini');
          if (used[c]) d.classList.add('used');
          d.onclick = function () {
            if (used[c]) {
              // 已用过：点它就移除对应的槽
              removeCard(c);
            } else {
              placeCard(c);
            }
          };
          row.appendChild(d);
        })(r, s);
      }
      wrap.appendChild(row);
    }
  }

  function removeCard(c) {
    for (var i = 0; i < 2; i++) if (hole[i] === c) { hole[i] = null; }
    for (var j = 0; j < boardCount; j++) if (board[j] === c) { board[j] = null; }
    renderSlots(); renderPicker(); scheduleCompute();
  }

  /* ---------------- 阶段 ---------------- */

  function setStage(count) {
    boardCount = count;
    // 缩短阶段时，把多出来的牌退回
    for (var i = count; i < 5; i++) board[i] = null;
    var tabs = $('stageTabs').children;
    for (var k = 0; k < tabs.length; k++) {
      tabs[k].classList.toggle('on', Number(tabs[k].dataset.count) === count);
    }
    target = null;
    renderSlots();
    renderPicker();
    scheduleCompute();
  }

  /* ---------------- 计算 ---------------- */

  var timer = null;
  function scheduleCompute() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(computeNow, 90);
  }

  function collectInput() {
    var h = hole.filter(function (c) { return c !== null; });
    var b = [];
    for (var i = 0; i < boardCount; i++) if (board[i] !== null) b.push(board[i]);
    return { hole: h, board: b };
  }

  function computeNow() {
    if (computing) return;
    var inp = collectInput();

    // 牌没选全：给提示，不算
    if (inp.hole.length !== 2) {
      showIdle('先选好你的两张手牌');
      return;
    }
    if (inp.board.length !== boardCount) {
      showIdle('公共牌还差 ' + (boardCount - inp.board.length) + ' 张');
      return;
    }

    var pot = numOf('inPot');
    var call = numOf('inCall');

    computing = true;
    $('result').classList.add('busy');

    // 让「计算中」先渲染出来，再算
    setTimeout(function () {
      var st = {
        hole: inp.hole, board: inp.board, nOpp: nOpp,
        rangeKey: rangeKey, custom: customRange,
        pot: pot, call: call
      };
      var r;
      try {
        r = O.compute(st);
      } catch (err) {
        computing = false;
        $('result').classList.remove('busy');
        showIdle('计算出错：' + err.message);
        return;
      }
      computing = false;
      $('result').classList.remove('busy');
      if (!r.ok) { showIdle(r.reason); return; }
      lastResult = r;
      renderResult(r);
    }, 0);
  }

  function numOf(id) {
    var v = $(id).value.trim();
    if (v === '') return 0;
    var n = Number(v);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  function pct(x) { return (x * 100).toFixed(1) + '%'; }

  /* ---------------- 结果渲染 ---------------- */

  function showIdle(msg) {
    lastResult = null;
    var r = $('result');
    r.innerHTML = '';
    var d = el('div', 'idle', msg);
    r.appendChild(d);
  }

  function renderResult(r) {
    var box = $('result');
    box.innerHTML = '';

    // 顶部：阶段 + 牌型
    var head = el('div', 'res-head');
    var stName = { preflop: '翻前', flop: '翻牌', turn: '转牌', river: '河牌' }[r.stage];
    head.appendChild(el('span', 'res-stage', stName));
    var hd = el('span', 'res-hand');
    hd.appendChild(el('b', '', r.handDesc));
    if (r.stage === 'preflop') {
      hd.appendChild(el('i', '', r.tierName));
    }
    head.appendChild(hd);
    box.appendChild(head);

    // 两个大数：你的胜率 / 需要的胜率
    var duo = el('div', 'duo');

    var c1 = el('div', 'cell eq');
    c1.appendChild(el('div', 'k', '你的胜率'));
    c1.appendChild(el('div', 'v', pct(r.equity)));
    var sub1 = el('div', 'sub');
    sub1.textContent = '赢 ' + pct(r.win) + ' · 平 ' + pct(r.tie);
    c1.appendChild(sub1);
    duo.appendChild(c1);

    var c2 = el('div', 'cell need');
    c2.appendChild(el('div', 'k', r.free ? '不需要跟注' : '需要胜率'));
    c2.appendChild(el('div', 'v', r.free ? '—' : pct(r.need)));
    var sub2 = el('div', 'sub');
    sub2.textContent = r.free ? '没人下注，过牌即可' : ('底池赔率 ' + r.ratioText);
    c2.appendChild(sub2);
    duo.appendChild(c2);
    box.appendChild(duo);

    // 结论条
    var v = r.verdict;
    var bar = el('div', 'verdict ' + v.kind);
    bar.appendChild(el('b', '', v.text));
    bar.appendChild(el('span', '', v.detail));
    box.appendChild(bar);

    // 明细表：上面两个大数已经给了胜率和门槛，这里只补大数没说的
    var tbl = el('div', 'kv');
    if (!r.free) {
      addRow(tbl, '高出门槛', (r.margin >= 0 ? '+' : '') + pct(r.margin), r.margin >= 0 ? 'good' : 'bad');
      addRow(tbl, '底池赔率', r.ratioText + '（你要投 ' + pct(r.need) + ' 的池子）');
      addRow(tbl, '跟注额', String(r.call));
      addRow(tbl, '跟注的期望值', evText(r.ev), r.ev >= 0 ? 'good' : 'bad');
    } else {
      addRow(tbl, '跟注额', '0');
      addRow(tbl, '说明', '没人下注，没有门槛可算');
    }
    addRow(tbl, '底池', String(r.pot));
    addRow(tbl, '对手人数', r.nOpp + ' 人');
    addRow(tbl, '估算方式', r.source);
    box.appendChild(tbl);

    // 补牌
    if (r.outs) box.appendChild(outsBlock(r));

    // 脚注
    var foot = el('div', 'res-foot');
    foot.textContent = '用时 ' + r.ms + ' ms';
    box.appendChild(foot);
  }

  function evText(ev) {
    if (Math.abs(ev) < 0.01) return '0';
    return (ev > 0 ? '+' : '') + (Math.round(ev * 10) / 10);
  }

  function addRow(tbl, k, v, cls) {
    var row = el('div', 'kv-row');
    row.appendChild(el('span', 'kv-k', k));
    var val = el('span', 'kv-v' + (cls ? ' ' + cls : ''), v);
    row.appendChild(val);
    tbl.appendChild(row);
  }

  function outsBlock(r) {
    var o = r.outs;
    var box = el('div', 'outs');

    // ---- 能提高胜率的牌 ----
    var head = el('div', 'outs-head');
    var n = o.hits.length;
    head.appendChild(el('b', '', '能提高胜率的牌'));
    head.appendChild(el('span', 'cnt', n + ' 张'));
    if (o.behind && o.crossed > 0) {
      head.appendChild(el('span', 'crossed', '其中 ' + o.crossed + ' 张能直接反超'));
    }
    box.appendChild(head);

    var note = el('div', 'outs-note');
    if (n === 0) {
      note.textContent = '没有能把胜率抬高 4 个点以上的牌了。';
    } else if (o.behind) {
      note.textContent = '你目前落后（平分线 ' + pct(o.line) + '）。这 ' + n
        + ' 张里任意一张都能把胜率从 ' + pct(o.baseEq) + ' 抬起来。';
    } else {
      note.textContent = '你目前领先（平分线 ' + pct(o.line) + '）。这 ' + n
        + ' 张能进一步把胜率从 ' + pct(o.baseEq) + ' 往上抬，但你已经赢了，不算「需要补」。';
    }
    box.appendChild(note);

    if (n > 0) {
      var list = el('div', 'outs-cards');
      o.hits.slice(0, 28).forEach(function (h) {
        var d = cardFace(h.card, 'mini');
        if (h.crossed) d.classList.add('boost');
        d.title = '出这张后胜率 ' + pct(h.eq) + (h.crossed ? '（反超）' : '');
        list.appendChild(d);
      });
      box.appendChild(list);
      if (n > 28) box.appendChild(el('div', 'outs-more', '还有 ' + (n - 28) + ' 张未列出'));
    }

    // ---- 会把你从领先打成落后的牌 ----
    var dn = o.danger ? o.danger.length : 0;
    if (dn > 0) {
      var dh = el('div', 'outs-head danger');
      dh.appendChild(el('b', '', '能把你的领先打掉的牌'));
      dh.appendChild(el('span', 'cnt red', dn + ' 张'));
      box.appendChild(dh);
      var dl = el('div', 'outs-cards');
      o.danger.slice(0, 20).forEach(function (h) {
        var d = cardFace(h.card, 'mini');
        d.classList.add('drop');
        d.title = '出这张后胜率降到 ' + pct(h.eq);
        dl.appendChild(d);
      });
      box.appendChild(dl);
      if (dn > 20) box.appendChild(el('div', 'outs-more', '还有 ' + (dn - 20) + ' 张未列出'));
    }

    // 2/4 法则对照：只在落后时才有意义（它估的是「翻盘概率」，
    // 已经领先时 15×4% = 60% 这种数字会让人以为自己在博 60%，纯属误导）
    if (o.cardsToCome > 0 && o.behind) {
      var rule = el('div', 'outs-rule');
      var mul = o.cardsToCome >= 2 ? 4 : 2;
      rule.textContent = '经验法则对照：' + n + ' × ' + mul + '% ≈ '
        + (o.rule * 100).toFixed(0) + '%（还剩 ' + o.cardsToCome + ' 条街）。'
        + '这是粗算，实战里还要扣掉对手反超的可能。';
      box.appendChild(rule);
    }

    return box;
  }

  /* ---------------- 快键 ---------------- */

  function bindCallQuick() {
    var btns = $('callQuick').children;
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.onclick = function () {
          var pot = numOf('inPot');
          var frac = Number(b.dataset.frac);
          // 注意：这里按「底池已包含对手这一注」的常见口径，
          // 所以跟注额 = 底池 × 比例。
          if (pot <= 0) { flash($('inPot')); return; }
          $('inCall').value = String(Math.round(pot * frac));
          scheduleCompute();
        };
      })(btns[i]);
    }
  }

  function flash(node) {
    node.classList.add('bad');
    setTimeout(function () { node.classList.remove('bad'); }, 800);
  }

  function bindOpp() {
    var sel = $('selOpp');
    // 1~8 个对手直接选（9 人桌满座 = 8 个对手），再多就用下面的手填
    for (var i = 1; i <= O.MAX_OPP - 1; i++) {
      var o = el('option', '', i + ' 人');
      o.value = String(i);
      sel.appendChild(o);
    }
    var oc = el('option', '', '自定义');
    oc.value = 'custom';
    sel.appendChild(oc);

    // 当前人数超出下拉能表示的范围时，下拉停在「自定义」并展开输入框
    if (nOpp > O.MAX_OPP - 1) {
      sel.value = 'custom';
      $('oppCustomWrap').style.display = '';
      $('inOpp').value = String(nOpp);
    } else {
      sel.value = String(nOpp);
    }
    $('oppHint').textContent = nOpp + ' 个对手 → ' + (nOpp + 1) + ' 人桌';

    sel.onchange = function () {
      if (sel.value === 'custom') {
        $('oppCustomWrap').style.display = '';
        $('inOpp').focus();
        // 下拉切到自定义时，先把当前人数填进输入框，避免空着
        if (!$('inOpp').value) $('inOpp').value = String(nOpp);
        return;
      }
      $('oppCustomWrap').style.display = 'none';
      nOpp = Number(sel.value) || 1;
      scheduleCompute();
    };

    var inp = $('inOpp');
    inp.oninput = function () {
      var raw = inp.value.trim();
      var n = Number(raw);
      var bad = raw !== '' && (!isFinite(n) || n < 1 || n > O.MAX_OPP || Math.round(n) !== n);
      inp.classList.toggle('bad', bad);
      if (bad) {
        $('oppHint').textContent = '只能填 1 ~ ' + O.MAX_OPP + ' 的整数';
        return;
      }
      $('oppHint').textContent = raw === ''
        ? '留空按 1 人算'
        : (n + ' 个对手 → ' + (n + 1) + ' 人桌');
      if (raw !== '') { nOpp = n; scheduleCompute(); }
    };
    inp.onblur = function () {
      var raw = inp.value.trim();
      var n = Number(raw);
      if (raw === '' || !isFinite(n) || n < 1 || n > O.MAX_OPP || Math.round(n) !== n) {
        inp.value = String(nOpp);
        inp.classList.remove('bad');
        $('oppHint').textContent = nOpp + ' 个对手 → ' + (nOpp + 1) + ' 人桌';
      }
    };
  }

  function bindRange() {
    var sel = $('selRange');
    O.RANGE_PRESETS.forEach(function (p) {
      // 下拉框只有半栏宽，用短名字，长名字留给悬浮提示
      var o = el('option', '', p.short || p.name);
      o.value = p.key;
      o.title = p.name;
      sel.appendChild(o);
    });
    sel.value = rangeKey;
    sel.onchange = function () {
      rangeKey = sel.value;
      $('customWrap').style.display = (rangeKey === 'custom') ? '' : 'none';
      scheduleCompute();
    };
    var inp = $('inCustom');
    inp.oninput = function () {
      customRange = inp.value;
      var bad = false;
      if (customRange.trim()) {
        try {
          var r = E.expandRange(customRange);
          bad = r.length === 0;
          $('customHint').textContent = bad ? '没认出这个范围' : (r.length + ' 种组合');
        } catch (e) {
          bad = true;
          $('customHint').textContent = '格式不对';
        }
      } else {
        $('customHint').textContent = '留空 = 按随机手牌算';
      }
      inp.classList.toggle('bad', bad);
      scheduleCompute();
    };
  }

  function bindNumbers() {
    ['inPot', 'inCall'].forEach(function (id) {
      $(id).oninput = scheduleCompute;
    });
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    O = window.PokerOdds; C = window.PokerCore; E = window.PokerEquity;

    // 阶段标签
    var tabs = $('stageTabs');
    [['翻前', 0], ['翻牌', 3], ['转牌', 4], ['河牌', 5]].forEach(function (t) {
      var d = el('button', 'stage-tab', t[0]);
      d.dataset.count = String(t[1]);
      d.onclick = function () { setStage(Number(d.dataset.count)); };
      tabs.appendChild(d);
    });

    bindOpp();
    bindRange();
    bindNumbers();
    bindCallQuick();

    $('btnClear').onclick = function () {
      hole = [null, null];
      board = [null, null, null, null, null];
      target = null;
      setStage(boardCount);
      renderSlots(); renderPicker();
      scheduleCompute();
    };

    // 右侧「清空」：只清这一栏的输入（底池、跟注、对手人数与范围），不动牌面
    $('btnClearCalc').onclick = function () {
      $('inPot').value = '';
      $('inCall').value = '';
      nOpp = 1;
      $('selOpp').value = '1';
      $('oppCustomWrap').style.display = 'none';
      $('inOpp').value = '';
      $('inOpp').classList.remove('bad');
      $('oppHint').textContent = '';
      rangeKey = 'random';
      $('selRange').value = 'random';
      $('customWrap').style.display = 'none';
      $('inCustom').value = '';
      $('inCustom').classList.remove('bad');
      $('customHint').textContent = '留空 = 按随机手牌算';
      scheduleCompute();
    };

    setStage(0);
  }

  window.PokerOddsUI = { init: init, get last() { return lastResult; } };
})();
