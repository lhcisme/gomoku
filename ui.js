/* ui.js — 界面与交互（棋盘绘制、落子、悔棋、AI 调度） */
(function () {
  'use strict';
  var Core = window.GomokuCore;
  var SIZE = Core.SIZE, BLACK = Core.BLACK, WHITE = Core.WHITE;

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');
  var metaEl = document.getElementById('meta');
  var dotEl = document.getElementById('turnDot');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultSub = document.getElementById('resultSub');
  var segLevel = document.getElementById('segLevel');
  var segSide = document.getElementById('segSide');

  var state = {
    board: Core.createBoard(),
    turn: BLACK,
    human: BLACK,
    ai: WHITE,
    level: 'medium',
    over: false,
    winLine: null,
    history: [],
    thinking: false
  };

  var size = 320, pad = 20, cell = 20, timer = null;

  /* ---------------- 布局 ---------------- */
  function layout() {
    var appW = document.querySelector('.app').clientWidth || 320;
    var maxH = window.innerHeight * 0.56;
    size = Math.max(250, Math.floor(Math.min(appW, maxH, 520)));
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.style.margin = '0 auto';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pad = size * 0.058;
    cell = (size - pad * 2) / (SIZE - 1);
    draw();
  }
  function px(i) { return pad + i * cell; }

  /* ---------------- 绘制 ---------------- */
  function draw() {
    ctx.clearRect(0, 0, size, size);

    var bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#eecd98');
    bg.addColorStop(0.5, '#e9c68c');
    bg.addColorStop(1, '#dfb578');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // 细木纹
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#7a4d18';
    for (var t = 0; t < 26; t++) {
      ctx.beginPath();
      var yy = (t * 37 % size);
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(size * 0.3, yy + 5, size * 0.7, yy - 5, size, yy + 2);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // 网格
    ctx.strokeStyle = 'rgba(92,62,26,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < SIZE; i++) {
      ctx.moveTo(px(0), px(i)); ctx.lineTo(px(SIZE - 1), px(i));
      ctx.moveTo(px(i), px(0)); ctx.lineTo(px(i), px(SIZE - 1));
    }
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(92,62,26,.6)';
    ctx.strokeRect(px(0), px(0), cell * (SIZE - 1), cell * (SIZE - 1));

    // 星位
    ctx.fillStyle = 'rgba(80,52,20,.55)';
    [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]].forEach(function (s) {
      ctx.beginPath();
      ctx.arc(px(s[0]), px(s[1]), Math.max(1.8, cell * 0.085), 0, Math.PI * 2);
      ctx.fill();
    });

    // 棋子
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        if (state.board[y][x]) drawStone(x, y, state.board[y][x]);
      }
    }

    // 最后一手
    var last = state.history[state.history.length - 1];
    if (last && !state.winLine) {
      ctx.fillStyle = 'rgba(192,57,43,.92)';
      ctx.beginPath();
      ctx.arc(px(last.x), px(last.y), Math.max(2, cell * 0.17), 0, Math.PI * 2);
      ctx.fill();
    }

    // 获胜五子
    if (state.winLine) {
      var a = state.winLine[0], b = state.winLine[state.winLine.length - 1];
      ctx.strokeStyle = 'rgba(192,57,43,.85)';
      ctx.lineWidth = Math.max(2, cell * 0.13);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px(a[0]), px(a[1]));
      ctx.lineTo(px(b[0]), px(b[1]));
      ctx.stroke();
      state.winLine.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(px(p[0]), px(p[1]), cell * 0.46, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.lineWidth = Math.max(2, cell * 0.08);
        ctx.stroke();
      });
    }
  }

  function drawStone(x, y, role) {
    var cx = px(x), cy = px(y), r = cell * 0.44;
    ctx.save();
    ctx.shadowColor = 'rgba(70,45,15,.35)';
    ctx.shadowBlur = r * 0.55;
    ctx.shadowOffsetY = r * 0.2;
    var g = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.36, r * 0.12, cx, cy, r * 1.08);
    if (role === BLACK) {
      g.addColorStop(0, '#757575');
      g.addColorStop(0.5, '#2c2c2c');
      g.addColorStop(1, '#080808');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.62, '#f4f2ee');
      g.addColorStop(1, '#cec9be');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- 状态提示 ---------------- */
  function updateStatus() {
    dotEl.className = 'dot' + (state.turn === WHITE ? ' white' : '');
    if (state.over) return;
    if (state.thinking) { statusEl.textContent = 'AI 思考中…'; }
    else if (state.turn === state.human) { statusEl.textContent = '轮到你落子'; }
    else { statusEl.textContent = 'AI 走棋'; }
    metaEl.textContent = state.history.length ? '第 ' + state.history.length + ' 手' : '';
  }

  function showResult(title, sub) {
    resultTitle.textContent = title;
    resultSub.textContent = sub || '';
    resultEl.hidden = false;
  }
  function hideResult() { resultEl.hidden = true; }

  /* ---------------- 落子 ---------------- */
  function place(x, y, role) {
    state.board[y][x] = role;
    state.history.push({ x: x, y: y, role: role });
    var line = Core.checkWin(state.board, x, y, role);
    if (line) { state.winLine = line; }
    draw();

    if (line) {
      state.over = true;
      dotEl.className = 'dot win';
      if (role === state.human) {
        statusEl.textContent = '你赢了 🎉';
        showResult('你赢了 🎉', '共 ' + state.history.length + ' 手');
      } else {
        statusEl.textContent = 'AI 赢了';
        showResult('AI 赢了', '共 ' + state.history.length + ' 手 · 试试悔棋或降低难度');
      }
      metaEl.textContent = '第 ' + state.history.length + ' 手';
      return;
    }
    if (state.history.length >= SIZE * SIZE) {
      state.over = true;
      statusEl.textContent = '平局';
      showResult('平局', '棋盘满了');
      return;
    }
    state.turn = role === BLACK ? WHITE : BLACK;
    updateStatus();
    if (state.turn === state.ai) scheduleAI();
  }

  function scheduleAI() {
    state.thinking = true;
    updateStatus();
    var started = Date.now();
    timer = setTimeout(function () {
      var mv = Core.bestMove(state.board, state.ai, state.level);
      var wait = Math.max(0, 340 - (Date.now() - started));
      setTimeout(function () {
        state.thinking = false;
        if (state.over) return;
        if (state.board[mv.y][mv.x] !== 0) {   // 理论上不会发生，兜底找第一个空位
          for (var y = 0; y < SIZE; y++) {
            for (var x = 0; x < SIZE; x++) {
              if (!state.board[y][x]) { mv = { x: x, y: y }; break; }
            }
          }
        }
        place(mv.x, mv.y, state.ai);
      }, wait);
    }, 40);
  }

  /* ---------------- 交互 ---------------- */
  canvas.addEventListener('pointerup', function (e) {
    if (state.over || state.thinking || state.turn !== state.human) return;
    var rect = canvas.getBoundingClientRect();
    var sx = size / rect.width, sy = size / rect.height;
    var mx = (e.clientX - rect.left) * sx;
    var my = (e.clientY - rect.top) * sy;
    var x = Math.round((mx - pad) / cell);
    var y = Math.round((my - pad) / cell);
    if (!Core.inBoard(x, y)) return;
    if (Math.abs(mx - px(x)) > cell * 0.6 || Math.abs(my - px(y)) > cell * 0.6) return;
    if (state.board[y][x] !== 0) return;
    place(x, y, state.human);
  });

  function popOne() {
    var last = state.history.pop();
    if (!last) return null;
    state.board[last.y][last.x] = 0;
    state.winLine = null;
    return last;
  }

  function undo() {
    if (state.thinking || !state.history.length) return;
    clearTimeout(timer);
    var wasOver = state.over;
    state.over = false;
    hideResult();
    var last = state.history[state.history.length - 1];
    popOne();
    if (last.role === state.ai && state.history.length) popOne();
    state.turn = state.human;
    draw();
    if (state.turn === state.ai) { scheduleAI(); return; }
    updateStatus();
    if (wasOver) statusEl.textContent = '继续对局';
  }

  function restart() {
    clearTimeout(timer);
    state.board = Core.createBoard();
    state.history = [];
    state.over = false;
    state.winLine = null;
    state.thinking = false;
    state.turn = BLACK;
    hideResult();
    draw();
    if (state.human !== BLACK) { updateStatus(); scheduleAI(); }
    else { updateStatus(); }
  }

  /* ---------------- 控件 ---------------- */
  segLevel.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    state.level = b.dataset.v;
    Array.prototype.forEach.call(segLevel.children, function (c) {
      c.classList.toggle('on', c === b);
    });
    if (state.history.length && !state.over) metaEl.textContent = '难度：' + b.textContent;
  });

  segSide.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var v = parseInt(b.dataset.v, 10);
    if (v === state.human) return;
    state.human = v;
    state.ai = v === BLACK ? WHITE : BLACK;
    Array.prototype.forEach.call(segSide.children, function (c) {
      c.classList.toggle('on', c === b);
    });
    restart();
  });

  document.getElementById('undo').addEventListener('click', undo);
  document.getElementById('restart').addEventListener('click', restart);
  document.getElementById('resultAgain').addEventListener('click', restart);

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 200); });

  hideResult();          // 双保险：首屏绝不出现结算层
  layout();
  updateStatus();

  // 调试句柄（自动化测试用，正常游玩不受影响）
  window.__gomoku = { state: state, place: place, undo: undo, restart: restart, draw: draw };
})();
