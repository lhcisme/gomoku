/* 界面逻辑自测（用假 DOM 跑 ui.js）：node test/ui.selftest.js */
const path = require('path');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 假 DOM ---------- */
function makeEl(id) {
  const el = {
    id: id, listeners: {}, dataset: {}, style: {}, children: [], hidden: false,
    textContent: '', className: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); },
    dispatch(t, e) { (el.listeners[t] || []).forEach(fn => fn(e || {})); },
    closest() { return null; },
    querySelector() { return null; },
    getBoundingClientRect() {
      const w = parseFloat(el.style.width) || 400;
      return { left: 0, top: 0, width: w, height: w, right: w, bottom: w };
    }
  };
  return el;
}

const els = {
  board: makeEl('board'),
  status: makeEl('status'),
  meta: makeEl('meta'),
  turnDot: makeEl('turnDot'),
  result: makeEl('result'),
  resultTitle: makeEl('resultTitle'),
  resultSub: makeEl('resultSub'),
  segLevel: makeEl('segLevel'),
  segSide: makeEl('segSide'),
  undo: makeEl('undo'),
  restart: makeEl('restart'),
  resultAgain: makeEl('resultAgain')
};

const fakeCtx = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') {
      return () => ({ addColorStop() {} });
    }
    return () => {};
  },
  set() { return true; }
});
els.board.getContext = () => fakeCtx;

global.document = {
  getElementById: id => els[id] || makeEl(id),
  querySelector: sel => ({ clientWidth: 400 })
};
global.window = {
  innerWidth: 400, innerHeight: 800, devicePixelRatio: 2,
  addEventListener() {},
  setTimeout: setTimeout, clearTimeout: clearTimeout
};

/* ---------- 首屏防回归检查 ---------- */
console.log('【0】首屏（曾经出过 bug：CSS 的 display:flex 顶掉 hidden，一进来就显示"你赢了"）');
{
  const fs = require('fs');
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  ok('CSS 有 [hidden]{display:none !important} 兜底',
    /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(css));
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok('结算层默认带 hidden 属性', /id="result"[^>]*hidden/.test(html));
}

/* ---------- 加载 ---------- */
console.log('【1】加载');
let loadErr = null;
try {
  require(path.join(__dirname, '..', 'core.js'));
  global.GomokuCore = global.window.GomokuCore;
  require(path.join(__dirname, '..', 'ui.js'));
} catch (e) { loadErr = e; }
ok('core.js + ui.js 加载无异常', !loadErr, loadErr && loadErr.message);
if (loadErr) { console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败'); process.exit(1); }

const G = global.window.__gomoku;
ok('调试句柄可用', !!(G && G.state));
els.result.hidden = false;   // 故意弄脏，验证初始化会隐藏结算层
delete require.cache[require.resolve(path.join(__dirname, '..', 'ui.js'))];
require(path.join(__dirname, '..', 'ui.js'));
ok('初始化时结算层被隐藏', els.result.hidden === true);

const st = G.state;
console.log('【2】玩家落子 & AI 应手');
function clickPoint(x, y) {
  // 通过 canvas 的 pointerup 回调模拟点击
  const rect = els.board.getBoundingClientRect();
  const cell = (st ? (parseFloat(els.board.style.width) - 2 * (parseFloat(els.board.style.width) * 0.058)) / 14 : 20);
  const pad = parseFloat(els.board.style.width) * 0.058;
  els.board.dispatch('pointerup', {
    clientX: pad + x * cell, clientY: pad + y * cell
  });
}
(async function () {
  const boardSize = parseFloat(els.board.style.width);
  ok('canvas 尺寸已计算', boardSize > 200, boardSize);

  await sleep(20);
  clickPoint(7, 7);
  await sleep(20);
  ok('点击后玩家落子(黑@7,7)', st.board[7][7] === st.human, JSON.stringify({ c: st.board[7][7], human: st.human }));
  ok('history 记录一手', st.history.length === 1, st.history.length);

  await sleep(700);
  ok('AI 已应手', st.history.length === 2, st.history.length);
  ok('AI 落在空位且为我方回合', st.turn === st.human && !st.thinking, JSON.stringify(st.turn));

  console.log('【3】悔棋 / 重开');
  st.over = false;
  els.undo.dispatch('click');
  await sleep(20);
  ok('悔棋撤回到玩家落子前', st.history.length === 0, st.history.length);
  ok('棋盘已清空该点', st.board[7][7] === 0);

  clickPoint(6, 6);
  await sleep(700);
  const before = st.history.length;
  els.restart.dispatch('click');
  await sleep(20);
  ok('重开后棋盘清空', st.history.length === 0 && st.board.every(r => r.every(v => v === 0)), before);
  ok('重开后轮到玩家', st.turn === st.human && !st.over);

  console.log('【4】胜负判定与结算界面');
  els.result.hidden = true;
  const b = st.board;
  for (let i = 0; i < 5; i++) b[0][i] = st.human;   // 摆一个假的玩家五连
  st.history = [{ x: 0, y: 0, role: st.human }];
  G.place(4, 0, st.human);
  await sleep(20);
  ok('五连触发结束', st.over === true);
  ok('记录获胜连线', Array.isArray(st.winLine) && st.winLine.length >= 5, st.winLine && st.winLine.length);
  ok('结算面板显示', els.result.hidden === false && /赢/.test(els.resultTitle.textContent), els.resultTitle.textContent);

  console.log('【5】玩家执白（AI 先手）');
  els.restart.dispatch('click');
  await sleep(20);
  st.human = 2; st.ai = 1; st.turn = 1;
  st.history = []; st.over = false;
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) st.board[y][x] = 0;
  st.turn = 1;
  G.restart();
  await sleep(800);
  ok('执白时 AI 先走一手', st.history.length === 1 && st.history[0].role === st.ai, JSON.stringify(st.history));

  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
