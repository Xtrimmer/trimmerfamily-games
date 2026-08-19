// Node proof: every generated board is 100% tiled and clears with zero
// forced collisions when fired in the generated order.
const G = require('./generator.js');

const levels = [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200];
const trialsPer = 60;

let totalOk = 0, totalBoards = 0, totalArrows = 0, worstMs = 0, genFails = 0;
const problems = [];

for (const level of levels) {
  const { W, H } = G.sizeForLevel(level);
  let ok = 0, arrowsSum = 0, lenSum = 0, cellSum = 0, maxLen = 0, stubs = 0;
  const t0 = Date.now();
  for (let i = 0; i < trialsPer; i++) {
    const board = G.generate(level, 'proof-' + i);
    totalBoards++;
    if (!board) { genFails++; problems.push(`L${level} trial ${i}: generate() returned null`); continue; }
    const sim = G.simulate(board);
    if (sim.ok) { ok++; totalOk++; }
    else problems.push(`L${level} trial ${i}: ${JSON.stringify(sim)}`);
    arrowsSum += board.arrows.length;
    cellSum += W * H;
    for (const a of board.arrows) {
      lenSum += a.cells.length;
      if (a.cells.length > maxLen) maxLen = a.cells.length;
      if (a.cells.length === 1) stubs++;
    }
    totalArrows += board.arrows.length;
  }
  const ms = Date.now() - t0;
  if (ms / trialsPer > worstMs) worstMs = ms / trialsPer;
  const avgArrows = (arrowsSum / trialsPer).toFixed(1);
  const avgLen = (lenSum / arrowsSum).toFixed(2);
  const stubPct = ((stubs / arrowsSum) * 100).toFixed(1);
  console.log(
    `L${String(level).padStart(3)}  ${W}x${H}  ok=${ok}/${trialsPer}  ` +
    `arrows~${avgArrows}  avgLen=${avgLen}  maxLen=${maxLen}  ` +
    `stubs=${stubPct}%  ${(ms / trialsPer).toFixed(1)}ms/board`
  );
}

console.log('\n=== SUMMARY ===');
console.log(`boards: ${totalBoards}  solvable+full: ${totalOk}  gen-fails: ${genFails}`);
console.log(`worst avg gen time: ${worstMs.toFixed(1)} ms/board`);
if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  problems.slice(0, 20).forEach((p) => console.log('  ' + p));
  process.exit(1);
} else {
  console.log('\nALL BOARDS: 100% tiled, zero forced collisions, fully cleared. ✓');
}
