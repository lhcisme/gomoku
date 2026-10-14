/* 自战调试：node test/selfplay.js [blackLevel] [whiteLevel] */
const C = require('../core.js');
const B = C.BLACK, W = C.WHITE;
const lvB = process.argv[2] || 'hard';
const lvW = process.argv[3] || 'medium';

const b = C.createBoard();
let role = B, moves = 0, winner = null;
const log = [];
while (moves < 150) {
  const lv = role === B ? lvB : lvW;
  const t0 = Date.now();
  const mv = C.bestMove(b, role, lv);
  const dt = Date.now() - t0;
  if (b[mv.y][mv.x] !== 0) { console.log('非法着法!'); process.exit(1); }
  b[mv.y][mv.x] = role;
  log.push((role === B ? '黑' : '白') + '(' + lv + ') ' + 'x' + mv.x + ',y' + mv.y + '  ' + dt + 'ms');
  if (C.checkWin(b, mv.x, mv.y, role)) { winner = role; break; }
  role = role === B ? W : B;
  moves++;
}
const sym = { 0: '·', 1: '●', 2: '○' };
console.log('  0 1 2 3 4 5 6 7 8 9 10 11 12 13 14');
for (let y = 0; y < 15; y++) {
  let row = y < 10 ? y + ' ' : y + '';
  for (let x = 0; x < 15; x++) row += sym[b[y][x]];
  console.log(row);
}
console.log('\n共 ' + log.length + ' 手，' + (winner ? (winner === B ? '黑胜' : '白胜') : '未分胜负'));
log.forEach((s, i) => { if (i % 2 === 0) console.log('  ' + s + '   |   ' + (log[i + 1] || '')); });
