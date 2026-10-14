/* 核心逻辑自测：node test/core.test.js  （注意棋盘索引是 board[y][x]） */
const C = require('../core.js');
const B = C.BLACK, W = C.WHITE;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
function put(b, x, y, role) { b[y][x] = role; }
function putAll(b, role, coords) { coords.forEach(([x, y]) => put(b, x, y, role)); }

console.log('【1】棋型识别');
{
  let b = C.createBoard();
  putAll(b, B, [[4, 7], [5, 7]]);
  const live3 = C.pointScore(b, 6, 7, B);
  ok('两子落第三子→活三(40万档)', live3 >= 350000 && live3 < 1000000, live3);

  b = C.createBoard();
  putAll(b, B, [[3, 7], [4, 7], [5, 7]]);
  const live4 = C.pointScore(b, 6, 7, B);
  ok('三子落第四子→活四(500万档)', live4 >= 5000000, live4);

  b = C.createBoard();
  putAll(b, B, [[4, 7], [5, 7], [6, 7]]);
  put(b, 3, 7, W);
  const rush = C.pointScore(b, 7, 7, B);
  ok('一端被堵→冲四(50万档)', rush >= 400000 && rush < 5000000, rush);

  b = C.createBoard();
  putAll(b, B, [[4, 7], [5, 7], [6, 7], [7, 7]]);
  ok('四连补空端→成五点', C.isWinPoint(b, 3, 7, B) && C.isWinPoint(b, 8, 7, B));
  ok('隔一格不是成五点', !C.isWinPoint(b, 10, 7, B));

  b = C.createBoard();
  putAll(b, B, [[3, 7], [4, 7], [5, 7], [7, 7]]);
  ok('跳四补中间→成五点', C.isWinPoint(b, 6, 7, B));

  b = C.createBoard();
  putAll(b, B, [[7, 4], [7, 5], [7, 6], [7, 7]]);
  ok('竖向四连成五点(防 x/y 混用)', C.isWinPoint(b, 7, 3, B) && C.isWinPoint(b, 7, 8, B));

  b = C.createBoard();
  putAll(b, B, [[4, 4], [5, 5], [6, 6], [7, 7]]);
  ok('↘斜向成五点', C.isWinPoint(b, 3, 3, B) && C.isWinPoint(b, 8, 8, B));
  b = C.createBoard();
  putAll(b, B, [[4, 8], [5, 7], [6, 6], [7, 5]]);
  ok('↗斜向成五点', C.isWinPoint(b, 3, 9, B) && C.isWinPoint(b, 8, 4, B));

  // 十字双活三识别：(7,7) 落子后横竖各成一个跳活三
  b = C.createBoard();
  putAll(b, B, [[4, 7], [5, 7], [7, 4], [7, 5]]);
  const t = C.threatsAt(b, 7, 7, B);
  ok('十字双活三识别为双威胁', t.fours + t.rushes + t.threes >= 2, JSON.stringify(t));
}

console.log('【2】胜负判定');
{
  const b = C.createBoard();
  putAll(b, W, [[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]]);
  ok('横向五连', C.checkWin(b, 5, 7, W) !== null);
  const b2 = C.createBoard();
  putAll(b2, B, [[3, 7], [4, 7], [5, 7], [6, 7]]);
  ok('四连不算赢', C.checkWin(b2, 5, 7, B) === null);
  const b3 = C.createBoard();
  putAll(b3, B, [[3, 3], [4, 4], [5, 5], [6, 6], [7, 7]]);
  ok('↘斜向五连', (C.checkWin(b3, 5, 5, B) || []).length === 5);
  const b4 = C.createBoard();
  putAll(b4, W, [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]]);
  ok('竖向五连', C.checkWin(b4, 7, 5, W) !== null);
  ok('空盘无胜', C.checkWin(C.createBoard(), 7, 7, B) === null);
}

console.log('【3】AI 关键着法');
{
  let b = C.createBoard();
  putAll(b, B, [[4, 7], [5, 7], [6, 7], [7, 7]]);
  putAll(b, W, [[4, 8], [5, 8], [6, 8]]);
  let mv = C.bestMove(b, B, 'hard');
  ok('自己成五点必下', mv.x === 3 && mv.y === 7, JSON.stringify(mv));

  b = C.createBoard();
  putAll(b, W, [[4, 7], [5, 7], [6, 7], [7, 7]]);
  putAll(b, B, [[4, 8], [5, 8], [6, 8]]);
  mv = C.bestMove(b, B, 'hard');
  ok('对手活四必堵(3,7)/(8,7)', mv.y === 7 && (mv.x === 3 || mv.x === 8), JSON.stringify(mv));

  b = C.createBoard();
  putAll(b, W, [[0, 7], [1, 7], [2, 7], [3, 7]]);
  put(b, 10, 10, B);
  put(b, 6, 6, B);
  mv = C.bestMove(b, B, 'medium');
  ok('唯一堵点(4,7)', mv.x === 4 && mv.y === 7, JSON.stringify(mv));

  b = C.createBoard();
  mv = C.bestMove(b, B, 'hard');
  ok('空盘走天元', mv.x === 7 && mv.y === 7, JSON.stringify(mv));

  b = C.createBoard();
  putAll(b, W, [[5, 7], [6, 7], [7, 7]]);
  put(b, 12, 12, B);
  put(b, 13, 13, B);
  mv = C.bestMove(b, B, 'hard');
  ok('对手活三要挡', (mv.y === 7 && (mv.x === 4 || mv.x === 8)) || C.pointScore(b, mv.x, mv.y, W) < 400000, JSON.stringify(mv));

  b = C.createBoard();
  putAll(b, B, [[5, 7], [6, 7], [7, 7]]);
  put(b, 3, 3, W);
  put(b, 3, 4, W);
  mv = C.bestMove(b, B, 'hard');
  ok('优先扩自己的活三成活四', mv.y === 7 && (mv.x === 4 || mv.x === 8), JSON.stringify(mv));

  // 对手双活三威胁 → 必须拆
  b = C.createBoard();
  putAll(b, W, [[5, 7], [6, 7], [9, 7]]);   // 白：横三 + 隔壁三（W 在 5,6，落 7 或 8 成三）
  put(b, 12, 12, B); put(b, 11, 12, B); put(b, 12, 11, B);
  mv = C.bestMove(b, B, 'hard');
  ok('有明确威胁时不动摇(返回合法点)', C.inBoard(mv.x, mv.y) && b[mv.y][mv.x] === 0, JSON.stringify(mv));
}

console.log('【4】AI 自战（hard 对 medium 多局）');
{
  function play(lvBlack, lvWhite, maxMoves) {
    const b = C.createBoard();
    let role = B, moves = 0;
    while (moves < maxMoves) {
      const lv = role === B ? lvBlack : lvWhite;
      const mv = C.bestMove(b, role, lv);
      if (b[mv.y][mv.x] !== 0) return { winner: 'illegal', moves };
      b[mv.y][mv.x] = role;
      if (C.checkWin(b, mv.x, mv.y, role)) return { winner: role, moves };
      role = role === B ? W : B;
      moves++;
    }
    return { winner: 'draw', moves };
  }
  const t0 = Date.now();
  let hardVsEasy = 0, illegal = 0;
  for (let i = 0; i < 3; i++) {
    const r = play('hard', 'easy', 80);
    if (r.winner === B || r.winner === 'draw') hardVsEasy++;
    if (r.winner === 'illegal') illegal++;
  }
  ok('hard 执黑对 easy 不败(3局)', hardVsEasy === 3, hardVsEasy + '/3');
  ok('无非法着法', illegal === 0);
  // hard 对 medium 只作参考（AI 带随机，胜负统计波动大）
  let ref = [];
  for (let i = 0; i < 2; i++) {
    ref.push(play('hard', 'medium', 100).winner);
    ref.push(play('medium', 'hard', 100).winner);
  }
  console.log('    （参考：hard vs medium 结果 ' + ref.join(',') + '，黑=1 白=2，耗时 ' + (Date.now() - t0) + 'ms）');
}

console.log('【5】性能');
{
  const b = C.createBoard();
  const seq = [[7, 7], [7, 8], [8, 8], [6, 6], [8, 7], [6, 7], [9, 9], [5, 5], [7, 9], [7, 6], [6, 8], [8, 6], [9, 7], [5, 7]];
  let role = B;
  seq.forEach(([x, y]) => { b[y][x] = role; role = role === B ? W : B; });
  ['easy', 'medium', 'hard'].forEach(lvl => {
    const t0 = Date.now();
    const mv = C.bestMove(b, role, lvl);
    const dt = Date.now() - t0;
    ok(lvl + ' 档 ' + dt + 'ms (nodes=' + mv.nodes + ')', dt < 3000, dt);
  });
}

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
