/* domstub.js — 给 ui.js 用的最小 DOM 桩件（Node 里跑没有浏览器）。
 * 只实现 ui.js 实际用到的那部分 API。
 */
'use strict';

class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(...c) { c.forEach(x => x && this.set.add(x)); this._sync(); }
  remove(...c) { c.forEach(x => this.set.delete(x)); this._sync(); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) { if (force === true) { this.set.add(c); } else if (force === false) { this.set.delete(c); } else if (this.set.has(c)) { this.set.delete(c); } else { this.set.add(c); } this._sync(); return this.set.has(c); }
  _sync() { this.el._className = [...this.set].join(' '); }
}

class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.attrs = {};
    this._className = '';
    this.classList = new ClassList(this);
    this._html = '';
    this._text = '';
    this.onclick = null;
    this.oninput = null;
    this.scrollTop = 0;
    this.clientHeight = 100;
    this.scrollHeight = 100;
    this.dataset = {};
    this.value = '';
    this.id = '';
  }
  get className() { return this._className; }
  set className(v) {
    this._className = v || '';
    this.classList.set = new Set(String(v || '').split(/\s+/).filter(Boolean));
  }
  get textContent() {
    // 与真实 DOM 一致：父节点的 textContent 是子孙文本的拼接
    if (!this.children.length) return this._text;
    let s = this._text;
    for (const c of this.children) s += c.textContent;
    return s;
  }
  set textContent(v) { this._text = String(v); this.children = []; this._html = ''; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._text = ''; this.children = []; this._parse(this._html); }
  _parse(html) {
    const stack = [];
    const re = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
    let m, last = 0;
    while ((m = re.exec(html))) {
      const text = html.slice(last, m.index).trim();
      last = re.lastIndex;
      if (text) { const host = stack.length ? stack[stack.length - 1] : this; host._text += text; }
      const [, close, tag, attrs, selfClose] = m;
      if (close) { if (stack.length) stack.pop(); continue; }
      const el = new El(tag);
      const idm = attrs.match(/id="([^"]+)"/); if (idm) { el.id = idm[1]; }
      const cm = attrs.match(/class="([^"]+)"/); if (cm) el.className = cm[1];
      const lm = attrs.match(/style="([^"]+)"/); if (lm) {
        for (const kv of lm[1].split(';')) { const [k, v] = kv.split(':'); if (k && v) el.style[k.trim()] = v.trim(); }
      }
      const dm = /data-([a-zA-Z0-9_-]+)="([^"]*)"/g;
      let dmm;
      while ((dmm = dm.exec(attrs))) el.dataset[dmm[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = dmm[2];
      el.parentNode = stack.length ? stack[stack.length - 1] : this;
      (stack.length ? stack[stack.length - 1] : this).children.push(el);
      if (!selfClose) stack.push(el);
    }
    const tail = html.slice(last).trim();
    if (tail) { const host = stack.length ? stack[stack.length - 1] : this; host._text += tail; }
  }
  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this; this.children.push(c);
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  // 真实 DOM 里 focus/blur 是空操作式的（只是切焦点），桩件保留同名方法即可
  focus() { this._focused = true; }
  blur() { this._focused = false; if (typeof this.onblur === 'function') this.onblur(); }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  insertAdjacentHTML(pos, html) {
    const tmp = new El('div');
    tmp.innerHTML = html;
    for (const c of tmp.children.slice()) this.appendChild(c);
    this._html += html;
  }
  querySelector(sel) { return this._qs(sel, true, []); }
  querySelectorAll(sel) { return this._qs(sel, false, []); }
  _qs(sel, first, out) {
    const visit = (node) => {
      for (const c of node.children) {
        if (matchSel(c, sel)) { out.push(c); if (first) return true; }
        if (visit(c) && first) return true;
      }
      return false;
    };
    visit(this);
    return first ? (out[0] || null) : out;
  }
}

function matchSel(el, sel) {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  return el.tagName === sel.toUpperCase();
}

/* 建一个可用的 document + window 沙箱；返回 { sandbox, doc, bodyEl, flush, allButtons } */
function createEnv() {
  const doc = {
    byId: {},
    createElement: (t) => new El(t),
    getElementById(id) {
      // 不缓存：ui.js 会重建 DOM，缓存会拿到已脱离树的旧节点
      let found = null;
      const walk = (n) => {
        for (const c of n.children) {
          if (c.id === id) { found = c; return; }
          if (!found) walk(c);
        }
      };
      if (this.body) walk(this.body);
      return found;
    },
    addEventListener() { },
    readyFns: []
  };

  let pending = [];
  const listeners = {};

  const sandbox = {
    console,
    setTimeout: (fn) => { pending.push(fn); return pending.length; },
    clearTimeout: () => { },
    Math, Date, JSON, Object, Array, String, Number, isFinite, parseInt, parseFloat, Set, Map, Boolean, Error,
    document: doc,
    confirm: () => true,
    alert: () => { },
    __listeners: listeners
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  doc.addEventListener = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  sandbox.module = undefined;   // 让 UMD 走浏览器分支

  const bodyEl = new El('body');
  doc.body = bodyEl;

  function flush() {
    let guard = 0;
    while (pending.length && guard++ < 800) {
      const fns = pending; pending = [];
      for (const f of fns) f();
    }
  }

  function allButtons() {
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (c.tagName === 'BUTTON') out.push(c); walk(c); } };
    walk(bodyEl);
    return out;
  }

  return { sandbox, doc, bodyEl, flush, allButtons };
}

module.exports = { createEnv, El, ClassList, matchSel };
