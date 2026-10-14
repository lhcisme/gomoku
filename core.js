/* ===========================================================
 * core.js — 五子棋核心逻辑（纯计算，不碰 DOM，可在 Node 下测试）
 * 棋盘 15x15，0=空 1=黑 2=白；坐标 x=列 y=行
 * =========================================================== */
(function (root) {
  'use strict';

  var SIZE = 15;
  var EMPTY = 0, BLACK = 1, WHITE = 2;
  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function createBoard() {
    var b = [];
    for (var y = 0; y < SIZE; y++) {
      b.push(new Array(SIZE).fill(EMPTY));
    }
    return b;
  }
  function inBoard(x, y) { return x >= 0 && x < SIZE && y >= 0 && y < SIZE; }
  function other(role) { return role === BLACK ? WHITE : BLACK; }

  /* ---------- 胜负判定：返回构成五连的坐标数组，否则 null ---------- */
  function checkWin(board, x, y, role) {
    for (var d = 0; d < 4; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1];
      var line = [[x, y]];
      for (var s = 1; s <= 4; s++) {
        var nx = x + dx * s, ny = y + dy * s;
        if (inBoard(nx, ny) && board[ny][nx] === role) line.push([nx, ny]); else break;
      }
      for (var t = 1; t <= 4; t++) {
        var mx = x - dx * t, my = y - dy * t;
        if (inBoard(mx, my) && board[my][mx] === role) line.unshift([mx, my]); else break;
      }
      if (line.length >= 5) return line;
    }
    return null;
  }

  /* ---------- 棋型模板（'1'=我方 '0'=空 '2'=对手或墙） ----------
   * 用 indexOf 计数（允许重叠），命中分数累加。分数级差设计：
   * 活四(50万) 必胜 > 冲四/活三(5万，一步威胁) > 眠三(3千) > 活二(2百)
   */
  var TEMPLATES = [
    ['11111', 100000000],                                  // 连五 —— 赢
    ['011110', 5000000],                                   // 活四 —— 等同于赢（对方堵不住）
    ['011112', 600000], ['211110', 600000],                // 冲四 —— 逼对方应一手
    ['10111', 600000], ['11101', 600000], ['11011', 600000],  // 跳冲四
    ['011100', 400000], ['001110', 400000],                // 活三 —— 一步成活四
    ['010110', 350000], ['011010', 350000],                // 跳活三
    ['001112', 5000], ['211100', 5000],                    // 眠三
    ['010112', 5000], ['211010', 5000],
    ['011012', 5000], ['210110', 5000],
    ['10011', 5000], ['11001', 5000], ['10101', 5000],
    ['001100', 500], ['011000', 500], ['000110', 500],     // 活二
    ['010100', 500], ['001010', 500]
  ];
  // 去重（保留首个）
  (function dedupe() {
    var seen = {}, out = [];
    for (var i = 0; i < TEMPLATES.length; i++) {
      if (seen[TEMPLATES[i][0]]) continue;
      seen[TEMPLATES[i][0]] = 1; out.push(TEMPLATES[i]);
    }
    TEMPLATES = out;
  })();

  // 搜索时同一条线的字符串会反复出现，缓存一下（打盘面上百次调用，命中率很高）
  var scoreCache = new Map();
  function strScore(s) {
    var hit = scoreCache.get(s);
    if (hit !== undefined) return hit;
    var total = 0;
    for (var i = 0; i < TEMPLATES.length; i++) {
      var pat = TEMPLATES[i][0], sc = TEMPLATES[i][1];
      var idx = s.indexOf(pat);
      while (idx !== -1) { total += sc; idx = s.indexOf(pat, idx + 1); }
    }
    if (scoreCache.size > 200000) scoreCache.clear();
    scoreCache.set(s, total);
    return total;
  }

  /* ---------- 某一方的全盘得分（扫所有行/列/斜线） ---------- */
  function sideScore(board, role) {
    var total = 0, x, y, k, s, v;
    var pad = '22222';
    for (y = 0; y < SIZE; y++) {                       // 行
      s = pad;
      for (x = 0; x < SIZE; x++) { v = board[y][x]; s += v === 0 ? '0' : (v === role ? '1' : '2'); }
      total += strScore(s + pad);
    }
    for (x = 0; x < SIZE; x++) {                       // 列
      s = pad;
      for (y = 0; y < SIZE; y++) { v = board[y][x]; s += v === 0 ? '0' : (v === role ? '1' : '2'); }
      total += strScore(s + pad);
    }
    for (k = -(SIZE - 1); k <= SIZE - 1; k++) {        // ↘ (x-y=k)
      s = pad;
      for (y = 0; y < SIZE; y++) { x = y + k; if (!inBoard(x, y)) continue; v = board[y][x]; s += v === 0 ? '0' : (v === role ? '1' : '2'); }
      if (s.length > 5) total += strScore(s + pad);
    }
    for (k = 0; k <= 2 * (SIZE - 1); k++) {            // ↗ (x+y=k)
      s = pad;
      for (y = 0; y < SIZE; y++) { x = k - y; if (!inBoard(x, y)) continue; v = board[y][x]; s += v === 0 ? '0' : (v === role ? '1' : '2'); }
      if (s.length > 5) total += strScore(s + pad);
    }
    return total;
  }

  /* 找到 role 的"一步成五"点，没有则返回 null */
  function findWinPoint(board, role) {
    var list = candidates(board);
    for (var i = 0; i < list.length; i++) {
      if (pointScore(board, list[i].x, list[i].y, role) >= 100000000) return list[i];
    }
    return null;
  }

  /* 静态局面评估：在棋型分差的基础上，补上「一步成五」这种终局信息的判断，
     否则搜索在叶子处看不出"对方下一手就赢了"。 */
  function evaluate(board, role) {
    var s = sideScore(board, role) - 1.15 * sideScore(board, other(role));
    if (findWinPoint(board, other(role))) s -= 50000000;      // 对方马上赢
    else if (findWinPoint(board, role)) s += 50000000;        // 我马上赢
    return s;
  }

  /* ---------- 取某点周围某方向的字符串（长度 11，中心在 index 5） ---------- */
  function lineStr(board, x, y, dx, dy, role, assume) {
    var s = '', i, nx, ny, v;
    for (i = -5; i <= 5; i++) {
      nx = x + dx * i; ny = y + dy * i;
      if (!inBoard(nx, ny)) { s += '2'; continue; }
      v = (i === 0 && assume) ? role : board[ny][nx];
      s += v === 0 ? '0' : (v === role ? '1' : '2');
    }
    return s;
  }

  /* 假设 role 落在 (x,y)，四个方向各自的棋型分 */
  function dirScores(board, x, y, role) {
    var out = [];
    for (var d = 0; d < 4; d++) {
      out.push(strScore(lineStr(board, x, y, DIRS[d][0], DIRS[d][1], role, true)));
    }
    return out;
  }

  /* 假设 role 落在 (x,y)，该点四方向的棋型分（用于走法排序 / 威胁判断） */
  function pointScore(board, x, y, role) {
    var ds = dirScores(board, x, y, role), t = 0;
    for (var i = 0; i < 4; i++) t += ds[i];
    return t;
  }

  /* 该点落子后形成的威胁等级
   * fours = 活四方向数(必胜) ; rushes = 冲四方向数(逼应) ; threes = 活三方向数
   */
  function threatsAt(board, x, y, role) {
    var ds = dirScores(board, x, y, role);
    var fours = 0, threes = 0, rushes = 0, max = 0;
    for (var i = 0; i < 4; i++) {
      var s = ds[i];
      if (s > max) max = s;
      if (s >= 5000000) fours++;
      else if (s >= 550000) rushes++;
      else if (s >= 350000) threes++;
    }
    return { fours: fours, rushes: rushes, threes: threes, max: max };
  }
  /* 该点落子后是否直接成五 */
  function isWinPoint(board, x, y, role) {
    return pointScore(board, x, y, role) >= 100000000;
  }
  /* 该点落子后是否形成活四（= 下一步必胜） */
  function isFourPoint(board, x, y, role) {
    return pointScore(board, x, y, role) >= 5000000;
  }

  /* ---------- 候选走法：离已有棋子 2 格内的空点 ---------- */
  function candidates(board) {
    var out = [], x, y, dx, dy, near, stones = 0;
    for (y = 0; y < SIZE; y++) for (x = 0; x < SIZE; x++) if (board[y][x]) stones++;
    if (stones === 0) return [{ x: 7, y: 7, score: 0 }];
    for (y = 0; y < SIZE; y++) {
      for (x = 0; x < SIZE; x++) {
        if (board[y][x]) continue;
        near = false;
        for (dy = -2; dy <= 2 && !near; dy++) {
          for (dx = -2; dx <= 2; dx++) {
            if (!dx && !dy) continue;
            var nx = x + dx, ny = y + dy;
            if (inBoard(nx, ny) && board[ny][nx]) { near = true; break; }
          }
        }
        if (near) out.push({ x: x, y: y, score: 0 });
      }
    }
    if (!out.length) return [{ x: 7, y: 7, score: 0 }];
    return out;
  }

  function orderedMoves(board, role, limit) {
    var list = candidates(board), opp = other(role);
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      m.score = pointScore(board, m.x, m.y, role) + pointScore(board, m.x, m.y, opp) * 0.9;
    }
    list.sort(function (a, b) { return b.score - a.score; });
    return limit ? list.slice(0, limit) : list;
  }

  var WIN_SCORE = 1e8;

  /* ---------- 搜索的时间管理：超时用异常跳出，回到上一轮完整结果 ---------- */
  var SEARCH = { deadline: 0, nodes: 0, ttHits: 0 };
  var TIMEOUT = { timeout: true };
  function checkTime() {
    if (!SEARCH.deadline) return;                      // 未限时（浅层调用）不打断
    if ((++SEARCH.nodes & 127) === 0 && Date.now() > SEARCH.deadline) throw TIMEOUT;
  }

  /* ---------- Zobrist 哈希 + 置换表（避免重复搜同一个局面） ---------- */
  var ZOB = [];
  (function () {
    for (var r = 0; r < 2; r++) {
      ZOB.push([]);
      for (var i = 0; i < SIZE * SIZE; i++) ZOB[r].push((Math.random() * 0x100000000) >>> 0);
    }
  })();
  var HASH = 0;
  function hashToggle(role, x, y) { HASH = (HASH ^ ZOB[role - 1][y * SIZE + x]) >>> 0; }
  function hashRebuild(board) {
    HASH = 0;
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) if (board[y][x]) hashToggle(board[y][x], x, y);
    }
  }
  var TT = new Map();   // key: hash → {d: 深度, v: 分数, f: 0精确/1下界/2上界, m: 最佳着法}

  /* ---------- negamax + alpha-beta ---------- */
  function negamax(board, depth, alpha, beta, role) {
    checkTime();
    if (depth === 0) return evaluate(board, role);

    var alpha0 = alpha, beta0 = beta;
    var entry = TT.get(HASH);
    var ttMove = null;
    if (entry) {
      ttMove = entry.m;
      if (entry.d >= depth) {
        SEARCH.ttHits++;
        if (entry.f === 0) return entry.v;
        if (entry.f === 1 && entry.v >= beta) return entry.v;
        if (entry.f === 2 && entry.v <= alpha) return entry.v;
      }
    }

    var moves = orderedMoves(board, role, depth >= 6 ? 6 : (depth >= 4 ? 8 : 10));
    if (ttMove) {                                   // 置换表里的最佳着法优先搜，剪枝更狠
      var found = false;
      for (var k = 0; k < moves.length; k++) {
        if (moves[k].x === ttMove.x && moves[k].y === ttMove.y) {
          var tmp = moves[0]; moves[0] = moves[k]; moves[k] = tmp; found = true; break;
        }
      }
      if (!found && board[ttMove.y][ttMove.x] === EMPTY) moves.unshift(ttMove);
    }

    var best = -Infinity, bestMoveLocal = null;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      board[m.y][m.x] = role;
      hashToggle(role, m.x, m.y);
      var v;
      if (checkWin(board, m.x, m.y, role)) {
        v = WIN_SCORE + depth * 100;         // 越早赢越好
      } else {
        v = -negamax(board, depth - 1, -beta, -alpha, other(role));
      }
      board[m.y][m.x] = EMPTY;
      hashToggle(role, m.x, m.y);
      if (v > best) { best = v; bestMoveLocal = m; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;              // 剪枝
    }

    var flag = best <= alpha0 ? 2 : (best >= beta0 ? 1 : 0);
    if (TT.size > 250000) TT.clear();
    TT.set(HASH, { d: depth, v: best, f: flag, m: bestMoveLocal });
    return best;
  }

  /* ---------- 迭代加深：每层都先搜上一轮的最佳着法，剪枝更狠 ---------- */
  function searchBest(board, role, maxDepth, timeLimit) {
    SEARCH.deadline = Date.now() + timeLimit;
    SEARCH.nodes = 0;
    SEARCH.ttHits = 0;
    hashRebuild(board);
    var backup = board.map(function (r) { return r.slice(); });
    var rootMoves = orderedMoves(board, role, 12);
    if (!rootMoves.length) return null;
    var best = null;
    for (var d = 2; d <= maxDepth; d += 2) {
      var alpha = -Infinity, localBest = null, localScore = -Infinity;
      var moves = rootMoves;
      if (best) {
        moves = [best].concat(rootMoves.filter(function (m) { return !(m.x === best.x && m.y === best.y); }));
      }
      try {
        for (var i = 0; i < moves.length; i++) {
          var m = moves[i];
          board[m.y][m.x] = role;
          hashToggle(role, m.x, m.y);
          var v;
          if (checkWin(board, m.x, m.y, role)) v = WIN_SCORE + d;
          else v = -negamax(board, d - 1, -Infinity, -alpha, other(role));
          board[m.y][m.x] = EMPTY;
          hashToggle(role, m.x, m.y);
          if (v > localScore) { localScore = v; localBest = m; }
          if (v > alpha) alpha = v;
        }
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) board[y][x] = backup[y][x];
        hashRebuild(board);
        break;
      }
      if (localBest) { best = localBest; best.score = localScore; }
      if (localScore >= WIN_SCORE / 2) break;          // 已经算到必胜，不用再深
      if (Date.now() > SEARCH.deadline) break;
    }
    SEARCH.deadline = 0;
    if (best) best.nodes = SEARCH.nodes;
    return best;
  }

  /* ---------- VCF：连续冲四取胜搜索 ----------
   * 只走"对方必须应答"的强制手（冲四/活四），看能不能一路杀到底。
   * 这是发现双三、四三、连冲杀棋的关键，浅层 alpha-beta 很难搜到。
   * 返回获胜着法序列，找不到返回 null。
   */
  function vcfSearch(board, role, depth) {
    if (depth <= 0) return null;
    checkTime();
    var opp = other(role);
    var list = candidates(board);
    var i, m, t;

    // 1) 一步成五
    for (i = 0; i < list.length; i++) {
      m = list[i];
      if (isWinPoint(board, m.x, m.y, role)) return [{ x: m.x, y: m.y }];
    }
    // 2) 一步成活四 / 双冲四 → 对方挡不住，必胜
    for (i = 0; i < list.length; i++) {
      m = list[i];
      t = threatsAt(board, m.x, m.y, role);
      if (t.fours >= 1 || t.rushes >= 2) return [{ x: m.x, y: m.y }];
    }
    // 3) 单个冲四：对方只能堵，堵完我继续找冲四
    for (i = 0; i < list.length; i++) {
      m = list[i];
      t = threatsAt(board, m.x, m.y, role);
      if (t.rushes < 1) continue;
      board[m.y][m.x] = role;
      var ow = findWinPoint(board, opp);
      if (ow) {
        board[ow.y][ow.x] = opp;
        var rest = vcfSearch(board, role, depth - 1);
        board[ow.y][ow.x] = EMPTY;
        board[m.y][m.x] = EMPTY;
        if (rest) return [{ x: m.x, y: m.y }].concat(rest);
      } else {
        board[m.y][m.x] = EMPTY;
      }
    }
    return null;
  }

  /* 我方能否靠连续冲四取胜（带时间保护，避免搜太久） */
  function canWinByVCF(board, role, depth, ms) {
    var saved = SEARCH.deadline;
    var backup = board.map(function (r) { return r.slice(); });
    SEARCH.deadline = Date.now() + (ms || 250);
    var seq = null;
    try {
      seq = vcfSearch(board, role, depth);
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) board[y][x] = backup[y][x];
    }
    SEARCH.deadline = saved;
    return seq;
  }

  /* ---------- 选点主函数 ----------
   * level: 'easy' | 'medium' | 'hard'
   * 返回 {x, y, score, nodes}
   */
  function bestMove(board, role, level, timeLimitMs) {
    var opp = other(role);
    var budget = timeLimitMs || 2000;                // 思考时间上限（毫秒）
    var emptyCount = 0;
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) if (!board[y][x]) emptyCount++;
    if (emptyCount === SIZE * SIZE) return { x: 7, y: 7, score: 0, nodes: 0 };

    var list = candidates(board);
    var i, m;

    /* 1) 我能立刻成五 → 直接赢 */
    for (i = 0; i < list.length; i++) {
      m = list[i];
      if (isWinPoint(board, m.x, m.y, role)) return { x: m.x, y: m.y, score: WIN_SCORE, nodes: 0 };
    }
    /* 2) 对手下一步成五 → 必须堵 */
    var blocks = [];
    for (i = 0; i < list.length; i++) {
      m = list[i];
      if (isWinPoint(board, m.x, m.y, opp)) blocks.push(m);
    }
    if (blocks.length) {
      var pick = blocks[0];
      for (i = 0; i < blocks.length; i++) {   // 多个点时挑最有利于我的（顺便形成自己的威胁）
        blocks[i].score = pointScore(board, blocks[i].x, blocks[i].y, role);
        if (blocks[i].score > pick.score) pick = blocks[i];
      }
      return { x: pick.x, y: pick.y, score: 0, nodes: 0 };
    }

    /* 3) 我能造活四 / 双冲四 → 下一步必胜（对手挡不住）；3.5) 双威胁同样是必胜 */
    if (level !== 'easy') {
      for (i = 0; i < list.length; i++) {
        m = list[i];
        var tt = threatsAt(board, m.x, m.y, role);
        if (tt.fours >= 1 || tt.rushes >= 2) {
          return { x: m.x, y: m.y, score: 4000000, nodes: 0 };
        }
      }
      if (level === 'hard') {                       // 双威胁的主动构造只有困难档会做
        var dbl = null, dblScore = -1;
        for (i = 0; i < list.length; i++) {
          m = list[i];
          var t0 = threatsAt(board, m.x, m.y, role);
          if (t0.fours + t0.rushes + t0.threes >= 2) {
            var sc = t0.max + pointScore(board, m.x, m.y, other(role)) * 0.5;
            if (sc > dblScore) { dblScore = sc; dbl = m; }
          }
        }
        if (dbl) return { x: dbl.x, y: dbl.y, score: 3800000, nodes: 0 };
      }
      /* 3.7) 算一算连续冲四能不能一路杀到底（VCF 连杀） */
      var vcfSeq = canWinByVCF(board, role, 12, Math.min(150, budget * 0.25));
      if (vcfSeq && vcfSeq.length) {
        return { x: vcfSeq[0].x, y: vcfSeq[0].y, score: 3900000, nodes: 0 };
      }
    }
    /* 4) 对手下一手能造活四或双威胁 → 必须先拆 */
    if (level !== 'easy') {
      var oppThreats = [];
      for (i = 0; i < list.length; i++) {
        m = list[i];
        var t = threatsAt(board, m.x, m.y, opp);
        var dangerous = t.fours >= 1 || (level === 'hard' && t.fours + t.rushes + t.threes >= 2);
        if (dangerous) oppThreats.push({ x: m.x, y: m.y, t: t });
      }
      if (oppThreats.length) {
        var defCands = [], seen = {};
        for (var k = 0; k < oppThreats.length; k++) {
          for (var dy = -3; dy <= 3; dy++) {
            for (var dx = -3; dx <= 3; dx++) {
              var nx = oppThreats[k].x + dx, ny = oppThreats[k].y + dy;
              if (!inBoard(nx, ny) || board[ny][nx]) continue;
              var key = nx + ',' + ny;
              if (seen[key]) continue;
              seen[key] = 1;
              defCands.push({ x: nx, y: ny });
            }
          }
        }
        var bestDef = null, bestDefVal = -Infinity;
        for (var c = 0; c < defCands.length; c++) {
          var cd = defCands[c];
          board[cd.y][cd.x] = role;
          var remain = 0;
          for (var q = 0; q < oppThreats.length; q++) {
            var oy = oppThreats[q].y, ox = oppThreats[q].x;
            if (board[oy][ox] !== EMPTY) continue;   // 该威胁点已被占据 → 威胁不复存在
            var t2 = threatsAt(board, ox, oy, opp);
            if (t2.fours >= 1) remain += 4;
            else if (t2.fours + t2.rushes + t2.threes >= 2) remain += 3;
            else if (t2.rushes + t2.threes >= 1) remain += 1;
          }
          var own = pointScore(board, cd.x, cd.y, role);
          board[cd.y][cd.x] = EMPTY;
          var val = -remain * 2000000 + own;
          if (val > bestDefVal) { bestDefVal = val; bestDef = cd; }
        }
        if (bestDef) return { x: bestDef.x, y: bestDef.y, score: 0, nodes: 0 };
      }
    }

    if (level === 'easy') {
      // 一层贪心 + 随机扰动：会下，但会漏招
      var cand = orderedMoves(board, role, 6);
      var r = Math.random();
      var idx = r < 0.45 ? 0 : (r < 0.75 ? 1 : 2 + Math.floor(Math.random() * Math.min(3, cand.length - 2)));
      idx = Math.max(0, Math.min(cand.length - 1, idx));
      return { x: cand[idx].x, y: cand[idx].y, score: cand[idx].score, nodes: 0 };
    }

    /* 困难档：迭代加深搜索（2→4→6→8 层），带时间上限，超时就退回上一层结果 */
    if (level === 'hard') {
      var res = searchBest(board, role, 10, budget);
      if (res) return { x: res.x, y: res.y, score: res.score || 0, nodes: res.nodes || 0 };
    }

    /* 中等档：浅搜索 + 一点随机，避免每局一模一样 */
    var depth = 2;
    var top = orderedMoves(board, role, 10);
    var bestVal = -Infinity, bestM = top[0];
    var alpha = -Infinity;
    var backup2 = board.map(function (r) { return r.slice(); });
    SEARCH.nodes = 0;
    SEARCH.deadline = Date.now() + 400;                 // 中等档也给个时间上限，防止卡顿
    try {
      for (i = 0; i < top.length; i++) {
        m = top[i];
        board[m.y][m.x] = role;
        var v;
        if (checkWin(board, m.x, m.y, role)) v = WIN_SCORE;
        else v = -negamax(board, depth - 1, -Infinity, -alpha, opp);
        board[m.y][m.x] = EMPTY;
        if (v > bestVal) { bestVal = v; bestM = m; }
        if (v > alpha) alpha = v;
      }
      if (top.length > 1) {
        board[top[0].y][top[0].x] = role;
        var v0 = checkWin(board, top[0].x, top[0].y, role) ? WIN_SCORE : -negamax(board, depth - 1, -Infinity, Infinity, opp);
        board[top[0].y][top[0].x] = EMPTY;
        if (bestVal < v0) bestVal = v0;
        if (Math.abs(bestVal - v0) < Math.abs(v0) * 0.15 + 1000 && Math.random() < 0.25) bestM = top[1];
      }
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      for (var yy = 0; yy < SIZE; yy++) for (var xx = 0; xx < SIZE; xx++) board[yy][xx] = backup2[yy][xx];
    }
    SEARCH.deadline = 0;
    return { x: bestM.x, y: bestM.y, score: bestVal, nodes: SEARCH.nodes };
  }

  var API = {
    SIZE: SIZE, EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE,
    createBoard: createBoard, checkWin: checkWin, pointScore: pointScore,
    isWinPoint: isWinPoint, threatsAt: threatsAt, evaluate: evaluate, bestMove: bestMove,
    candidates: candidates, orderedMoves: orderedMoves, inBoard: inBoard,
    searchBest: searchBest, vcfSearch: vcfSearch
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.GomokuCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
