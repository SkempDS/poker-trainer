/* core.js — 牌编码 / 7 张牌评估器 / 无限注德州扑克状态机
 * 与 evaluator.py 保持完全一致的牌编码：c = rank*4 + suit, rank 0='2'..12='A', suit 0=s 1=h 2=d 3=c
 * 该文件不依赖 DOM，可在 Node 中直接 require 测试。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PokerCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RANK_CHARS = '23456789TJQKA';   // 紧凑编码用（与 evaluator.py 一致），不要拿它做显示
  const SUIT_CHARS = 'shdc';
  // 显示用：10 一律写成 "10"，不用 "T"
  const RANK_TEXT = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUIT_TEXT = ['♠', '♥', '♦', '♣'];

  /* ---------------- 顺子表（与 Python 同算法） ---------------- */
  const STRAIGHT_HIGH = new Int8Array(8192);
  for (let m = 0; m < 8192; m++) {
    let best = -1;
    for (let hi = 12; hi >= 4; hi--) {
      const seg = 0b11111 << (hi - 4);
      if ((m & seg) === seg) { best = hi; break; }
    }
    // 轮子 A2345：A(bit12) + 2,3,4,5(bit0..3) 全有 → 5 高顺子，记作 hi=3
    if (best < 0 && (m & (1 << 12)) && ((m & 0b1111) === 0b1111)) best = 3;
    STRAIGHT_HIGH[m] = best;
  }

  /* ---------------- 7 张牌评估器 ---------------- */
  function eval7(cards) {
    const cnt = new Int8Array(13);
    const suitCnt = new Int8Array(4);
    const suitMask = new Int16Array(4);
    let mask = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i], r = c >> 2, s = c & 3;
      cnt[r]++; suitCnt[s]++; suitMask[s] |= (1 << r); mask |= (1 << r);
    }

    let flushSuit = -1;
    for (let s = 0; s < 4; s++) if (suitCnt[s] >= 5) { flushSuit = s; break; }

    if (flushSuit >= 0) {
      const sh = STRAIGHT_HIGH[suitMask[flushSuit]];
      if (sh >= 0) return (8 << 20) | (sh << 16);
    }

    let quad = -1;
    const trips = [], pairs = [];
    for (let r = 12; r >= 0; r--) {
      const c = cnt[r];
      if (c === 4) quad = r;
      else if (c === 3) trips.push(r);
      else if (c === 2) pairs.push(r);
    }

    if (quad >= 0) {
      let kick = -1;
      for (let r = 12; r >= 0; r--) if (r !== quad && cnt[r] > 0) { kick = r; break; }
      return (7 << 20) | (quad << 16) | (kick << 12);
    }

    if (trips.length) {
      const t = trips[0];
      let p = -1;
      if (trips.length >= 2) p = trips[1];
      else if (pairs.length) p = pairs[0];
      if (p >= 0) return (6 << 20) | (t << 16) | (p << 12);
    }

    if (flushSuit >= 0) {
      const fm = suitMask[flushSuit];
      const vals = [];
      for (let r = 12; r >= 0; r--) { if (fm & (1 << r)) { vals.push(r); if (vals.length === 5) break; } }
      let score = 5 << 20;
      for (let i = 0; i < vals.length; i++) score |= vals[i] << (16 - 4 * i);
      return score;
    }

    const sh2 = STRAIGHT_HIGH[mask];
    if (sh2 >= 0) return (4 << 20) | (sh2 << 16);

    if (trips.length) {
      const t = trips[0];
      const ks = [];
      for (let r = 12; r >= 0 && ks.length < 2; r--) if (r !== t && cnt[r] > 0) ks.push(r);
      let score = (3 << 20) | (t << 16);
      if (ks.length > 0) score |= ks[0] << 12;
      if (ks.length > 1) score |= ks[1] << 8;
      return score;
    }

    if (pairs.length >= 2) {
      const hi = pairs[0], lo = pairs[1];
      let k = -1;
      for (let r = 12; r >= 0; r--) if (r !== hi && r !== lo && cnt[r] > 0) { k = r; break; }
      let score = (2 << 20) | (hi << 16) | (lo << 12);
      if (k >= 0) score |= k << 8;
      return score;
    }

    if (pairs.length === 1) {
      const p = pairs[0];
      const ks = [];
      for (let r = 12; r >= 0 && ks.length < 3; r--) if (r !== p && cnt[r] > 0) ks.push(r);
      let score = (1 << 20) | (p << 16);
      for (let i = 0; i < ks.length; i++) score |= ks[i] << (12 - 4 * i);
      return score;
    }

    const vals = [];
    for (let r = 12; r >= 0 && vals.length < 5; r--) if (cnt[r] > 0) vals.push(r);
    let score = 0;
    for (let i = 0; i < vals.length; i++) score |= vals[i] << (16 - 4 * i);
    return score;
  }

  /* ---------------- 牌型名称 ---------------- */
  const CAT_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];
  function R_(r) { return RANK_TEXT[r]; }   // 牌型名用：10 显示为 "10"

  function describeHand(score) {
    const cat = score >> 20;
    if (cat === 8) {
      const hi = (score >> 16) & 0xF;
      return hi === 12 ? '皇家同花顺' : '同花顺（' + R_(hi) + ' 高）';
    }
    if (cat === 7) {
      const q = (score >> 16) & 0xF, k = (score >> 12) & 0xF;
      return '四条 ' + R_(q) + '（带 ' + R_(k) + '）';
    }
    if (cat === 6) {
      const t = (score >> 16) & 0xF, p = (score >> 12) & 0xF;
      return '葫芦 ' + R_(t) + ' 带 ' + R_(p);
    }
    if (cat === 5) {
      const v = [(score >> 16) & 0xF, (score >> 12) & 0xF, (score >> 8) & 0xF, (score >> 4) & 0xF, score & 0xF];
      return '同花（' + v.map(R_).join(' ') + '）';
    }
    if (cat === 4) {
      const hi = (score >> 16) & 0xF;
      const top = R_(hi) === 'A' ? 'A 高（轮子）' : R_(hi) + ' 高';
      return '顺子（' + top + '）';
    }
    if (cat === 3) {
      const t = (score >> 16) & 0xF;
      return '三条 ' + R_(t);
    }
    if (cat === 2) {
      const a = (score >> 16) & 0xF, b = (score >> 12) & 0xF;
      return '两对 ' + R_(a) + ' 和 ' + R_(b);
    }
    if (cat === 1) {
      const p = (score >> 16) & 0xF;
      return '一对 ' + R_(p);
    }
    const v = [(score >> 16) & 0xF, (score >> 12) & 0xF, (score >> 8) & 0xF, (score >> 4) & 0xF, score & 0xF];
    return '高牌 ' + R_(v[0]);
  }

  /* ---------------- 牌工具 ---------------- */
  // cardStr：紧凑字符串，用于日志/解析/测试（T 代表 10），不要用于界面显示
  function cardStr(c) { return RANK_CHARS.charAt(c >> 2) + SUIT_CHARS.charAt(c & 3); }
  function cardsStr(cs) { return cs.map(cardStr).join(' '); }
  // cardText / cardsText：界面显示用，花色符号 + 数字（10 写成 10）
  function cardText(c) { return RANK_TEXT[c >> 2] + SUIT_TEXT[c & 3]; }
  function cardsText(cs) { return cs.map(cardText).join(' '); }
  function parseCard(s) {
    const r = RANK_CHARS.indexOf(s.charAt(0).toUpperCase());
    const su = SUIT_CHARS.indexOf(s.charAt(1).toLowerCase());
    if (r < 0 || su < 0) throw new Error('bad card ' + s);
    return r * 4 + su;
  }

  /* ---------------- 随机数 ---------------- */
  function mulberry32(a) {
    let x = a >>> 0;
    return function () {
      x = (x + 0x6D2B79F5) >>> 0;
      let t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const ALL_CARDS = [];
  for (let i = 0; i < 52; i++) ALL_CARDS.push(i);

  /* ---------------- 牌局状态机 ---------------- */
  const STREET_NAMES = ['翻前', '翻牌', '转牌', '河牌'];

  class Game {
    constructor(cfg) {
      cfg = cfg || {};
      this.cfg = {
        startStack: cfg.startStack || 2000,
        sb: cfg.sb || 10,
        bb: cfg.bb || 20,
        aiCount: cfg.aiCount == null ? 3 : cfg.aiCount,
        seed: cfg.seed == null ? (Date.now() & 0x7fffffff) : cfg.seed
      };
      if (this.cfg.bb <= 0) this.cfg.bb = 20;
      if (this.cfg.sb <= 0 || this.cfg.sb >= this.cfg.bb) this.cfg.sb = Math.max(1, Math.floor(this.cfg.bb / 2));
      this.rand = mulberry32(this.cfg.seed);
      this.players = [];
      this.players.push({
        seat: 0, name: '你', isHuman: true,
        stack: this.cfg.startStack, hole: [], folded: false, allIn: false,
        committedRound: 0, committedTotal: 0, hasActed: false, canRaise: true,
        eliminated: false, revealed: false, lastAction: null, personality: null, betThisStreet: 0
      });
      const PNAMES = ['阿凯', '小柔', '老陈', '阿泰', '丽丽'];
      const PERSONA = ['紧凶', '松凶', '紧弱', '松弱'];
      for (let i = 1; i <= this.cfg.aiCount; i++) {
        this.players.push({
          seat: i, name: PNAMES[i - 1] || ('AI' + i), isHuman: false,
          stack: this.cfg.startStack, hole: [], folded: false, allIn: false,
          committedRound: 0, committedTotal: 0, hasActed: false, canRaise: true,
          eliminated: false, revealed: false, lastAction: null,
          personality: PERSONA[Math.floor(this.rand() * PERSONA.length) % PERSONA.length],
          betThisStreet: 0
        });
      }
      this.handNo = 0;
      this.button = Math.floor(this.rand() * this.players.length) % this.players.length;
      this.phase = 'idle';
      this.board = [];
      this.street = 0;
      this.currentBet = 0;
      this.minRaise = this.cfg.bb;
      this.actor = null;
      this.deck = [];
      this.log = [];
      this.result = null;
      this.decisions = [];   // 供复盘：人类每个决策点
      this.actionSeq = 0;
      this.handHistory = [];  // 每手完整记录
      this.maxActions = 200;
      this.actionsThisHand = 0;
    }

    /* ---- 查询 ---- */
    get seatCount() { return this.players.length; }
    getSeat(seat) { return this.players.find(p => p.seat === seat) || null; }
    activeSeats() {
      const s = [];
      for (const p of this.players) if (!p.eliminated) s.push(p.seat);
      s.sort((a, b) => a - b);
      return s;
    }
    totalPot() { let t = 0; for (const p of this.players) t += p.committedTotal; return t; }
    livePlayers() { return this.players.filter(p => !p.folded && !p.eliminated); }
    aliveAndStacked() { return this.players.filter(p => !p.eliminated && p.stack > 0); }

    /* 位置名：以按钮为 0（按钮左手第一位为 1）映射到 UTG/HJ/CO/BTN/SB/BB */
    positionOf(seat) {
      const as = this.activeSeats();
      const n = as.length;
      if (!n) return 'BTN';
      const POS = {
        2: ['BTN', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['BTN', 'SB', 'BB', 'UTG'],
        5: ['BTN', 'SB', 'BB', 'UTG', 'CO'], 6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']
      };
      let off = as.indexOf(seat) - as.indexOf(this.button);
      if (off < 0) off += n;
      return (POS[n] || POS[6])[off] || 'BB';
    }

    /* ---- 手牌开始 ---- */
    startHand() {
      const alive = this.aliveAndStacked();
      if (alive.length < 2) { this.phase = 'over'; return false; }
      for (const p of this.players) {
        if (p.stack <= 0) p.eliminated = true;
      }
      const as = this.activeSeats();
      if (as.length < 2) { this.phase = 'over'; return false; }

      this.handNo++;
      this.phase = 'betting';
      this.board = [];
      this.street = 0;
      this.streetNames = STREET_NAMES;
      this.currentBet = 0;
      this.minRaise = this.cfg.bb;
      this.log = [];
      this.result = null;
      this.actor = null;
      this.actionsThisHand = 0;
      this.actionSeq = 0;
      this.decisions = [];

      // 洗牌
      const d = ALL_CARDS.slice();
      for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        const t = d[i]; d[i] = d[j]; d[j] = t;
      }
      this.deck = d;

      for (const p of this.players) {
        p.hole = [];
        p.folded = p.eliminated || p.stack <= 0;
        p.allIn = false;
        p.committedRound = 0;
        p.committedTotal = 0;
        p.hasActed = false;
        p.canRaise = true;
        p.revealed = false;
        p.lastAction = null;
        p.betThisStreet = 0;
      }

      // 按钮位移动
      if (this.handNo > 1) this.button = this._nextLiveSeat(this.button);

      this._dealHoleCards();
      this._startStacks = {};
      for (const p of this.players) this._startStacks[p.seat] = p.stack;
      this._postBlinds();

      // 确定首个行动者
      const n = as.length;
      let firstSeat;
      if (n === 2) firstSeat = this.button;
      else {
        const bbSeat = this._bbSeat();
        firstSeat = this._nextOccupiedSeat(bbSeat);
      }
      this._pendingFirst = firstSeat;
      this.actor = null;
      this._pushLog({ type: 'hand-start', handNo: this.handNo, button: this.button, sb: this.cfg.sb, bb: this.cfg.bb });
      this._logBlinds();
      // 先直接指定首个行动者（无人下注时 _progress 会误判为无需行动）
      const fp = this.getSeat(firstSeat);
      if (fp && !fp.folded && !fp.allIn) {
        this.actor = firstSeat;
      } else {
        this._progress(firstSeat, true);
      }
      return true;
    }

    _nextLiveSeat(from) {
      const as = this.activeSeats();
      const n = as.length;
      const i = as.indexOf(from);
      for (let k = 1; k <= n; k++) {
        const s = as[(i + k) % n];
        if (s !== from) return s;
      }
      return from;
    }
    _nextOccupiedSeat(from) {
      const n = this.players.length;
      for (let k = 1; k <= n; k++) {
        const s = (from + k) % n;
        const p = this.getSeat(s);
        if (p && !p.eliminated) return s;
      }
      return from;
    }
    _sbSeat() {
      const as = this.activeSeats();
      const n = as.length;
      if (n === 2) return this.button;
      const i = as.indexOf(this.button);
      return as[(i + 1) % n];
    }
    _bbSeat() {
      const as = this.activeSeats();
      const n = as.length;
      const i = as.indexOf(this.button);
      if (n === 2) return as[(i + 1) % n];
      return as[(i + 2) % n];
    }

    _dealHoleCards() {
      const order = [];
      const n = this.players.length;
      const sb = this._sbSeat();
      let s = sb;
      for (let k = 0; k < n; k++) {
        const p = this.getSeat(s);
        if (p && !p.eliminated) order.push(p);
        s = (s + 1) % n;
      }
      for (let round = 0; round < 2; round++) {
        for (const p of order) p.hole.push(this.deck.pop());
      }
    }

    _postBlinds() {
      const sbSeat = this._sbSeat(), bbSeat = this._bbSeat();
      this._putIn(this.getSeat(sbSeat), this.cfg.sb, 'blind-sb');
      this._putIn(this.getSeat(bbSeat), this.cfg.bb, 'blind-bb');
      this.currentBet = Math.max(this.getSeat(sbSeat).committedRound, this.getSeat(bbSeat).committedRound);
      this.minRaise = this.cfg.bb;
    }

    _putIn(p, amount, kind) {
      const pay = Math.min(amount, p.stack);
      p.stack -= pay;
      p.committedRound += pay;
      p.committedTotal += pay;
      p.betThisStreet += pay;
      if (p.stack === 0) p.allIn = true;
      return pay;
    }

    /* ---- 行动 ---- */
    legalActions(seat) {
      const p = this.getSeat(seat);
      if (!p || p.folded || p.allIn || this.phase !== 'betting' || this.actor !== seat) return [];
      const toCall = Math.max(0, Math.min(this.currentBet - p.committedRound, p.stack));
      const acts = [{ type: 'fold' }];
      if (toCall === 0) acts.push({ type: 'check' });
      else acts.push({ type: 'call', amount: toCall });
      if (p.canRaise && p.stack > toCall) {
        const minTo = this.currentBet + this.minRaise;
        const maxTo = p.committedRound + p.stack;
        acts.push({ type: 'raise', minTo: Math.min(minTo, maxTo), maxTo: maxTo });
      }
      return acts;
    }

    /* ---- 决策点快照（复盘用，只依赖公开信息） ---- */
    _rangeSpecOf(evs) {
      let raised = 0, called = 0;
      for (const e of evs) {
        if (e.type === 'raise') raised++;
        else if (e.type === 'call') called++;
      }
      if (raised >= 2) return 'QQ+,AKs,AKo,AQs';
      if (raised === 1) return 'TT+,AQs+,AQo+,KQs,99,88,77';
      if (called >= 1) return '22+,A2s+,K9s+,Q9s+,J9s+,T8s+,98s,87s,ATo+,KJo+,QJo';
      return '22+,A2s+,K5s+,Q7s+,J8s+,T8s+,98s,87s,76s,A7o+,KTo+,QTo+,JTo';
    }
    snapshotFor(seat) {
      const p = this.getSeat(seat);
      if (!p) return null;
      const legal = this.legalActions(seat);
      const raiseLegal = legal.find(x => x.type === 'raise');
      const toCall = Math.max(0, Math.min(this.currentBet - p.committedRound, p.stack));
      const opps = [];
      for (const o of this.players) {
        if (o.seat === seat || o.folded || o.eliminated) continue;
        const evs = this.log.filter(e => e.seat === o.seat);
        let raises = 0, calls = 0;
        for (const e of evs) { if (e.type === 'raise') raises++; else if (e.type === 'call') calls++; }
        opps.push({ seat: o.seat, spec: this._rangeSpecOf(evs), raises, calls, committedRound: o.committedRound });
      }
      return {
        handNo: this.handNo, street: this.street,
        board: this.board.slice(), hole: p.hole.slice(),
        pot: this.totalPot(), currentBet: this.currentBet, minRaise: this.minRaise,
        committedRound: p.committedRound, stack: p.stack, toCall,
        canRaise: !!raiseLegal && p.canRaise,
        raiseMinTo: raiseLegal ? raiseLegal.minTo : null,
        raiseMaxTo: raiseLegal ? raiseLegal.maxTo : null,
        legalTypes: legal.map(x => x.type),
        pos: this.positionOf(seat),
        bb: this.cfg.bb,
        players: this.players.map(x => ({
          seat: x.seat, name: x.name, stack: x.stack, folded: x.folded,
          committedRound: x.committedRound, lastAction: x.lastAction, isHuman: x.isHuman
        })),
        opps
      };
    }

    act(seat, action, amount) {
      if (this.phase !== 'betting' || this.actor !== seat) return { ok: false, err: 'not your turn' };
      const p = this.getSeat(seat);
      if (!p || p.folded || p.allIn) return { ok: false, err: 'cannot act' };
      this.actionsThisHand++;
      if (this.actionsThisHand > this.maxActions) {
        // 保护：强制推进
        this._forceAdvance();
        return { ok: true, forced: true };
      }

      // 人类决策点留档，供复盘
      if (p.isHuman) {
        const snap = this.snapshotFor(seat);
        this.decisions.push({ snap, actual: { type: action, amount: amount } });
      }

      if (action === 'fold') {
        p.folded = true;
        p.hasActed = true;
        p.lastAction = 'fold';
        this._pushLog({ type: 'fold', seat, street: this.street });
      } else if (action === 'check') {
        if (this.currentBet - p.committedRound > 0) return { ok: false, err: 'cannot check facing bet' };
        p.hasActed = true;
        p.lastAction = 'check';
        this._pushLog({ type: 'check', seat, street: this.street });
      } else if (action === 'call') {
        const toCall = Math.max(0, Math.min(this.currentBet - p.committedRound, p.stack));
        const paid = this._putIn(p, toCall, 'call');
        p.hasActed = true;
        p.lastAction = 'call';
        this._pushLog({ type: 'call', seat, street: this.street, amount: paid, allIn: p.allIn });
      } else if (action === 'raise' || action === 'bet') {
        let to = Math.floor(amount);
        const maxTo = p.committedRound + p.stack;
        if (to > maxTo) to = maxTo;
        const isAllIn = (to === maxTo);

        // 筹码不够跟注：只能全下（算 all-in call，不是加注）
        if (to < this.currentBet) {
          if (!isAllIn) return { ok: false, err: 'must exceed current bet' };
          this._putIn(p, to - p.committedRound, 'call');
          p.hasActed = true;
          p.lastAction = 'call';
          p.pendingCallAmount = this.currentBet - p.committedRound; // 欠款，摊牌前若赢只按实际投入算
          this._pushLog({ type: 'call', seat, street: this.street, amount: to, allIn: true, shortAllIn: true });
          this._progress(seat, false);
          return { ok: true };
        }

        const minTo = this.currentBet + this.minRaise;
        if (!isAllIn && to < minTo) return { ok: false, err: 'below min raise ' + minTo };
        if (to <= this.currentBet) return { ok: false, err: 'must exceed current bet' };

        const inc = to - this.currentBet;
        const pay = to - p.committedRound;
        this._putIn(p, pay, 'raise');
        const fullRaise = inc >= this.minRaise;
        this.currentBet = to;
        p.hasActed = true;
        p.lastAction = this.street === 0 && this.currentBet > this.cfg.bb ? 'raise' : (this.street === 0 ? 'raise' : 'bet');
        this._pushLog({
          type: 'raise', seat, street: this.street, to, inc, allIn: p.allIn, fullRaise
        });
        if (fullRaise) {
          this.minRaise = inc;
          for (const o of this.players) {
            if (o !== p && !o.folded && !o.allIn) { o.hasActed = false; o.canRaise = true; }
          }
        } else if (p.allIn) {
          // 不足额全下：不重开加注权
          for (const o of this.players) {
            if (o !== p && !o.folded && !o.allIn) { o.hasActed = false; o.canRaise = false; }
          }
        } else {
          this.minRaise = inc;
          for (const o of this.players) {
            if (o !== p && !o.folded && !o.allIn) { o.hasActed = false; o.canRaise = true; }
          }
        }
      } else {
        return { ok: false, err: 'unknown action' };
      }

      this._progress(seat, false);
      return { ok: true };
    }

    _forceAdvance() {
      // 兜底：直接推进到下一街或摊牌
      this._nextStreet(true);
    }

    _needAction() {
      const list = [];
      for (const p of this.players) {
        if (p.eliminated || p.folded || p.allIn) continue;
        if (!p.hasActed || p.committedRound < this.currentBet) list.push(p);
      }
      return list;
    }

    /* ---- 推进主循环 ---- */
    _progress(afterSeat, isStart) {
      let guard = 0;
      while (guard++ < 50) {
        const live = this.players.filter(p => !p.folded && !p.eliminated);
        if (live.length <= 1) { this._awardUncontested(); return; }

        const need = this._needAction();
        if (need.length === 0) {
          // 本街结束
          this._refundUncalled();
          if (this.street >= 3) { this._showdown(); return; }
          this._nextStreet(false);
          if (this.phase !== 'betting') return;
          // 新街重新找行动者
          const canAct = this.players.filter(p => !p.folded && !p.allIn && !p.eliminated);
          if (canAct.length <= 1 && live.length > 1) {
            continue; // 无人可下注，_nextStreet 内部会一路发完
          }
          afterSeat = this.button;
          continue;
        }

        // 找 afterSeat 之后第一个需要行动的人
        const n = this.players.length;
        let found = null;
        for (let k = 1; k <= n; k++) {
          const s = (afterSeat + k) % n;
          const p = this.getSeat(s);
          if (p && need.indexOf(p) >= 0) { found = s; break; }
        }
        if (found === null) found = need[0].seat;
        this.actor = found;
        return;
      }
      // guard 用尽，强制推进
      this._nextStreet(true);
    }

    _nextStreet(force) {
      this._refundUncalled();
      const live = this.players.filter(p => !p.folded && !p.eliminated);
      for (const p of this.players) {
        p.committedRound = 0;
        p.hasActed = false;
        p.canRaise = true;
        p.lastAction = null;
        p.betThisStreet = 0;
      }
      this.currentBet = 0;
      this.minRaise = this.cfg.bb;

      if (this.street >= 3) { this._showdown(); return; }

      const canAct = this.players.filter(p => !p.folded && !p.allIn && !p.eliminated);
      if (force || canAct.length <= 1) {
        // 全下跑马：把剩余公牌一次发完
        while (this.street < 3) {
          this.street++;
          this._dealBoard();
        }
        this._showdown();
        return;
      }
      this.street++;
      this._dealBoard();
    }

    _dealBoard() {
      if (this.board.length === 0) {
        this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      } else {
        this.board.push(this.deck.pop());
      }
      this._pushLog({ type: 'board', street: this.street, cards: this.board.slice() });
    }

    _refundUncalled() {
      const sorted = this.players.filter(p => p.committedTotal > 0).sort((a, b) => b.committedTotal - a.committedTotal);
      if (sorted.length === 0) return;
      const top = sorted[0];
      const second = sorted.length > 1 ? sorted[1].committedTotal : 0;
      if (top.committedTotal > second) {
        const diff = top.committedTotal - second;
        top.stack += diff;
        top.committedTotal -= diff;
        top.committedRound = Math.max(0, top.committedRound - diff);
        if (diff > 0) this._pushLog({ type: 'refund', seat: top.seat, amount: diff });
      }
    }

    /* ---- 边池 ---- */
    buildPots() {
      const ps = this.players.filter(p => p.committedTotal > 0);
      if (ps.length === 0) return [];
      const levels = [];
      for (const p of ps) if (levels.indexOf(p.committedTotal) < 0) levels.push(p.committedTotal);
      levels.sort((a, b) => a - b);
      const pots = [];
      let prev = 0;
      for (const lv of levels) {
        let amount = 0;
        const eligible = [];
        for (const p of ps) {
          const take = Math.min(p.committedTotal, lv) - Math.min(p.committedTotal, prev);
          if (take > 0) amount += take;
          if (p.committedTotal >= lv && !p.folded) eligible.push(p);
        }
        if (amount > 0) pots.push({ amount, eligible, cap: lv });
        prev = lv;
      }
      return pots;
    }

    _seatOrderFromButton() {
      // 从按钮左手起顺时针的座位序（用于平分余数）
      const as = this.activeSeats();
      const n = as.length;
      const i = as.indexOf(this.button);
      const out = [];
      for (let k = 1; k <= n; k++) out.push(as[(i + k) % n]);
      return out;
    }

    _payout(pots) {
      const order = this._seatOrderFromButton();
      const wins = {};
      for (const pot of pots) {
        if (pot.eligible.length === 0) continue;
        let best = -1;
        for (const p of pot.eligible) {
          const sc = eval7(p.hole.concat(this.board));
          p._score = sc;
          if (sc > best) best = sc;
        }
        const winners = pot.eligible.filter(p => p._score === best);
        // 平分，余数给按钮左手第一位
        const share = Math.floor(pot.amount / winners.length);
        let rem = pot.amount - share * winners.length;
        const ordered = order.filter(s => winners.some(w => w.seat === s));
        const sortedWinners = ordered.length ? ordered.map(s => winners.find(w => w.seat === s)) : winners;
        for (const w of sortedWinners) {
          let got = share;
          if (rem > 0) { got += 1; rem--; }
          w.stack += got;
          if (!wins[w.seat]) wins[w.seat] = { amount: 0, pots: 0, score: best };
          wins[w.seat].amount += got;
          wins[w.seat].pots++;
        }
      }
      return wins;
    }

    _awardUncontested() {
      this._refundUncalled();
      const live = this.players.filter(p => !p.folded && !p.eliminated);
      const pot = this.totalPot();
      if (live.length === 1) {
        live[0].stack += pot;
        this.result = {
          type: 'uncontested',
          winners: [{ seat: live[0].seat, amount: pot }],
          pot,
          board: this.board.slice(),
          showdown: []
        };
      } else {
        this.result = { type: 'none', winners: [], pot, board: this.board.slice(), showdown: [] };
      }
      for (const p of this.players) p.committedTotal = 0;
      this.phase = 'done';
      this.actor = null;
      this._pushLog({ type: 'hand-end', result: this.result });
      this._closeHand();
    }

    _showdown() {
      // 亮牌
      const live = this.players.filter(p => !p.folded && !p.eliminated);
      for (const p of live) p.revealed = true;
      const pots = this.buildPots();
      const wins = this._payout(pots);
      const showdown = live.map(p => ({
        seat: p.seat,
        hole: p.hole.slice(),
        score: p._score,
        desc: describeHand(p._score)
      }));
      this.result = {
        type: 'showdown',
        pots: pots.map(x => ({ amount: x.amount, eligible: x.eligible.map(p => p.seat) })),
        winners: Object.keys(wins).map(k => ({ seat: +k, amount: wins[k].amount, pots: wins[k].pots })),
        pot: pots.reduce((s, x) => s + x.amount, 0),
        board: this.board.slice(),
        showdown
      };
      for (const p of this.players) p.committedTotal = 0;
      this.phase = 'done';
      this.actor = null;
      this._pushLog({ type: 'hand-end', result: this.result });
      this._closeHand();
    }

    _closeHand() {
      const rec = {
        handNo: this.handNo,
        button: this.button,
        board: this.board.slice(),
        result: this.result,
        decisions: this.decisions.slice(),
        startStacks: this._startStacks || {},
        actions: this.log.filter(x => x.type !== 'board' && x.type !== 'refund').slice(),
        stacks: this.players.map(p => ({ seat: p.seat, stack: p.stack, hole: p.hole.slice(), folded: p.folded }))
      };
      this.handHistory.push(rec);
    }

    _pushLog(ev) {
      ev.seq = ++this.actionSeq;
      this.log.push(ev);
    }
    _logBlinds() {
      const sb = this.getSeat(this._sbSeat()), bb = this.getSeat(this._bbSeat());
      this._pushLog({ type: 'blinds', sbSeat: sb.seat, sbAmt: sb.committedRound, bbSeat: bb.seat, bbAmt: bb.committedRound });
    }

    /* ---- 供 AI 与复盘使用的只读快照 ---- */
    publicState() {
      return {
        handNo: this.handNo,
        street: this.street,
        board: this.board.slice(),
        pot: this.totalPot(),
        currentBet: this.currentBet,
        minRaise: this.minRaise,
        actor: this.actor,
        button: this.button,
        sb: this.cfg.sb,
        bb: this.cfg.bb,
        players: this.players.map(p => ({
          seat: p.seat, stack: p.stack, folded: p.folded, allIn: p.allIn,
          committedRound: p.committedRound, committedTotal: p.committedTotal,
          hasActed: p.hasActed, lastAction: p.lastAction, isHuman: p.isHuman
        })),
        log: this.log.slice()
      };
    }

    /* ---- 下一手 ---- */
    nextHand() {
      for (const p of this.players) if (p.stack <= 0 && !p.eliminated) p.eliminated = true;
      return this.startHand();
    }

    /* ---- 补充筹码（玩家专属，续命用） ---- */
    rebuy(seat, amount) {
      const p = this.getSeat(seat);
      if (!p) return;
      p.stack += amount;
      p.eliminated = false;
    }
  }

  return {
    eval7, describeHand, CAT_NAMES,
    RANK_CHARS, SUIT_CHARS, RANK_TEXT, SUIT_TEXT, cardStr, cardsStr, cardText, cardsText, parseCard,
    mulberry32, ALL_CARDS, Game, STREET_NAMES
  };
});
