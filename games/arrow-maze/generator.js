/*
 * Arrow Maze — puzzle generator (UMD: works in browser + Node)
 *
 * Core idea: a board is 100% tiled by winding, self-avoiding arrows. It is
 * built by REVERSE ("un-fire") construction onto an initially empty board:
 * repeatedly drop an arrow onto empty cells such that, given only the arrows
 * already placed, its head's straight corridor to the board edge is clear.
 * Firing the arrows in the reverse of that placement order then clears the
 * whole board with zero forced collisions (proven empirically in test.js).
 *
 * An arrow:
 *   { id, cells: [{r,c}...], dir }   tail = cells[0], head = cells[last]
 *   dir is the facing/fire direction (also the head's straight-exit direction).
 *   The neck (cells[len-2] -> head) is a straight continuation in `dir`, so the
 *   arrowhead always reads as pointing forward; the rest of the body may wind.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.ArrowMazeGen = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- seeded RNG (xmur3 seed -> mulberry32 stream) -------------------------
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seedStr) {
    const seed = xmur3(String(seedStr))();
    return mulberry32(seed);
  }

  // ---- directions -----------------------------------------------------------
  const DIRS = [
    { name: 'up', dr: -1, dc: 0 },
    { name: 'down', dr: 1, dc: 0 },
    { name: 'left', dr: 0, dc: -1 },
    { name: 'right', dr: 0, dc: 1 },
  ];

  // ---- difficulty curve -----------------------------------------------------
  function sizeForLevel(level) {
    const base = 6;
    const extra = Math.floor((level - 1) / 2); // one cell per two levels
    let W = base + Math.ceil(extra / 2);
    let H = base + Math.floor(extra / 2);
    // gently alternate which axis is longer so it isn't always wider
    if (level % 4 >= 2) { const t = W; W = H; H = t; }
    W = Math.min(W, 100); H = Math.min(H, 100);
    return { W, H };
  }
  function lenParamsForLevel(level, W, H) {
    // Arrows should be long and winding: length grows with both level and
    // board size so big boards read as coils, not confetti.
    const area = W * H;
    const hi = Math.max(6, Math.min(Math.floor(area / 6),
                                    8 + level, Math.floor(Math.min(W, H) * 2.5)));
    const lo = Math.max(3, Math.floor(hi * 0.45));
    // straighter early, windier later
    const turnProb = Math.min(0.55, 0.28 + level * 0.008);
    // difficulty: bias heads toward long lanes that cross many other arrows.
    // laneBias 0 -> pick nearest edge (easy, obvious). laneBias ~1 -> prefer
    // long, multi-arrow corridors => deep interdependence + near-miss decoys.
    const laneBias = Math.min(0.9, level / 80);
    return { minLen: lo, maxLen: hi, turnProb, laneBias, crossWeight: 1.6 };
  }

  // ---------------------------------------------------------------------------
  // Generate a fully-tiled, guaranteed-solvable board.
  // Returns { W, H, arrows, order } or null if this attempt got stuck.
  //   order = indices into `arrows` giving a valid FIRE order (edges inward).
  // ---------------------------------------------------------------------------
  function buildAttempt(W, H, rng, lp) {
    const N = W * H;
    const occ = new Int32Array(N).fill(-1); // -1 empty, else arrow index
    const idx = (r, c) => r * W + c;
    const inBounds = (r, c) => r >= 0 && r < H && c >= 0 && c < W;

    const randInt = (n) => Math.floor(rng() * n);
    const shuffle = (a) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    };

    const distOf = (r, c) => Math.min(r, H - 1 - r, c, W - 1 - c);

    // "PEEL CARVING": build arrows in FIRE order (first created fires first).
    // occ >= 0 means a cell is already assigned to an earlier-created (=earlier
    // firing) arrow -> effectively empty at any later arrow's fire time. An
    // arrow's head may face ANY direction whose straight corridor to the edge
    // is entirely already-assigned; its body then winds through still-empty
    // cells. Firing in creation order clears the board with zero collisions.
    //
    // Completion is guaranteed: the still-empty cell nearest an edge always has
    // an all-assigned corridor toward that edge (any empty cell on that ray
    // would be nearer the edge, contradiction), so a legal head always exists.

    // is dir d a legal facing for a head at (hr,hc)? corridor to edge must be
    // entirely assigned (occ>=0), i.e. already fired by this arrow's turn.
    function corridorAssigned(hr, hc, d) {
      let r = hr + d.dr, c = hc + d.dc;
      while (inBounds(r, c)) {
        if (occ[idx(r, c)] < 0) return false; // an unfired cell would block
        r += d.dr; c += d.dc;
      }
      return true;
    }
    function legalDirs(hr, hc) {
      const out = [];
      for (const d of DIRS) if (corridorAssigned(hr, hc, d)) out.push(d);
      return out;
    }
    // For a legal facing, how long is the exit lane and how many distinct other
    // arrows does it cross? (length + crossings = how hard it is to read, and
    // how many other arrows depend on this one). Returns null if illegal.
    function laneStat(hr, hc, d) {
      let r = hr + d.dr, c = hc + d.dc, len = 0;
      const seen = new Set();
      while (inBounds(r, c)) {
        const o = occ[idx(r, c)];
        if (o < 0) return null;
        seen.add(o); len++;
        r += d.dr; c += d.dc;
      }
      return { len, cross: seen.size };
    }

    const arrows = [];

    function growBody(hr, hc, d, targetLen, turnProb) {
      const path = [{ r: hr, c: hc }];
      const inPath = new Set([idx(hr, hc)]);
      // neck: straight continuation behind the head (-d), an empty cell, so the
      // arrowhead reads as pointing forward. If unavailable, keep a clean stub.
      const nr = hr - d.dr, nc = hc - d.dc;
      if (targetLen >= 2 && inBounds(nr, nc) && occ[idx(nr, nc)] === -1) {
        path.push({ r: nr, c: nc }); inPath.add(idx(nr, nc));
      } else if (targetLen >= 2) {
        return path; // stub
      }

      const emptyExits = (r, c, claimed) => {
        let n = 0;
        for (const dd of DIRS) {
          const r2 = r + dd.dr, c2 = c + dd.dc;
          if (inBounds(r2, c2) && occ[idx(r2, c2)] === -1 &&
              !inPath.has(idx(r2, c2)) && !(claimed && claimed === idx(r2, c2))) n++;
        }
        return n;
      };

      let lastDir = { dr: -d.dr, dc: -d.dc };
      while (path.length < targetLen) {
        const cur = path[path.length - 1];
        let cands = [];
        for (const dd of DIRS) {
          const r = cur.r + dd.dr, c = cur.c + dd.dc;
          if (!inBounds(r, c)) continue;
          const k = idx(r, c);
          if (occ[k] !== -1 || inPath.has(k)) continue;
          cands.push({ r, c, k, dd });
        }
        if (!cands.length) break;
        // avoid stranding: drop steps that would isolate a sibling empty cell
        const safe = cands.filter((cd) => {
          for (const other of cands) {
            if (other.k === cd.k) continue;
            if (emptyExits(other.r, other.c, cd.k) === 0) return false;
          }
          return true;
        });
        if (safe.length) cands = safe;
        shuffle(cands);
        const straight = cands.find(
          (cd) => cd.dd.dr === lastDir.dr && cd.dd.dc === lastDir.dc);
        if (straight && rng() > turnProb) cands = [straight];
        const pick = cands[0];
        path.push({ r: pick.r, c: pick.c });
        inPath.add(pick.k);
        lastDir = pick.dd;
      }
      path.reverse(); // tail-first, head last
      return path;
    }

    function commit(path, d) {
      const id = arrows.length;
      for (const p of path) occ[idx(p.r, p.c)] = id;
      arrows.push({ id, cells: path, dir: d.name });
    }

    // Absorb residual 1-cell stubs into an adjacent arrow's TAIL, breaking up
    // stub clusters. Safe because: appending to a tail never changes any head's
    // exit corridor, and we only merge into an arrow that fires BEFORE the stub
    // would have (A.id < stub.id) so the cell simply vacates earlier -> it can
    // never newly block another arrow. We also require the target length >= 2 so
    // its clean forward-pointing head is untouched.
    function mergeStubs() {
      let changed = true, guard = 0;
      while (changed && guard++ < 8) {
        changed = false;
        for (const s of arrows) {
          if (s._rm || s.cells.length !== 1) continue;
          const sc = s.cells[0];
          for (const dd of DIRS) {
            const r = sc.r + dd.dr, c = sc.c + dd.dc;
            if (!inBounds(r, c)) continue;
            const aid = occ[idx(r, c)];
            if (aid < 0 || aid === s.id) continue;
            const A = arrows[aid];
            if (!A || A._rm || A.id >= s.id || A.cells.length < 2) continue;
            const tail = A.cells[0];
            if (tail.r !== r || tail.c !== c) continue; // must touch A's tail
            A.cells.unshift({ r: sc.r, c: sc.c });
            occ[idx(sc.r, sc.c)] = A.id;
            s._rm = true;
            changed = true;
            break;
          }
        }
      }
      const kept = arrows.filter((a) => !a._rm);
      kept.forEach((a, i) => { a.id = i; delete a._rm; });
      occ.fill(-1);
      for (const a of kept) for (const p of a.cells) occ[idx(p.r, p.c)] = a.id;
      arrows.length = 0;
      for (const a of kept) arrows.push(a);
    }

    // fallback head: the empty cell nearest an edge (guaranteed a legal head).
    const byDist = [];
    for (let k = 0; k < N; k++) byDist.push(k);
    byDist.sort((a, b) =>
      distOf((a / W) | 0, a % W) - distOf((b / W) | 0, b % W));
    let fp = 0;

    // is the straight-back neck of head (hr,hc) facing dd currently empty?
    // (a "growable" head can start a clean multi-cell arrow; otherwise stub)
    const neckFree = (hr, hc, dd) => {
      const r = hr - dd.dr, c = hc - dd.dc;
      return inBounds(r, c) && occ[idx(r, c)] === -1;
    };

    const laneBias = lp.laneBias || 0;
    const cw = lp.crossWeight || 1.5;
    // score a head's best facing: (1-bias)*interiorDist + bias*(laneLen + cw*crossings)
    // returns {dir, score} for growable (clean-head) and any-legal facings.
    function scoreCell(hr, hc) {
      const dist = distOf(hr, hc);
      let gDir = null, gS = -1, aDir = null, aS = -1;
      for (const d of DIRS) {
        const st = laneStat(hr, hc, d);
        if (!st) continue; // illegal facing
        const lane = st.len + cw * st.cross;
        if (lane > aS) { aS = lane; aDir = d; }
        if (neckFree(hr, hc, d) && lane > gS) { gS = lane; gDir = d; }
      }
      if (!aDir) return null;
      const mix = (lane) => (1 - laneBias) * dist + laneBias * lane;
      return { gDir, gScore: gDir ? mix(gS) : -1, aDir, aScore: mix(aS) };
    }

    let rem = N;
    while (rem > 0) {
      // Sample empty cells; prefer a GROWABLE head (clean, non-stub) with the
      // highest lane score, so higher levels favour long lanes crossing many
      // arrows (deep interdependence + near-miss decoys) while low levels stay
      // near obvious edge lanes.
      let bestG = null, bestA = null;
      const cap = Math.min(240, rem * 3 + 40);
      for (let tries = 0; tries < cap; tries++) {
        const cell = randInt(N);
        if (occ[cell] >= 0) continue;
        const hr = (cell / W) | 0, hc = cell % W;
        const sc = scoreCell(hr, hc);
        if (!sc) continue;
        if (sc.gDir) {
          if (!bestG || sc.gScore > bestG.s) bestG = { hr, hc, dir: sc.gDir, s: sc.gScore };
        } else if (!bestA || sc.aScore > bestA.s) {
          bestA = { hr, hc, dir: sc.aDir, s: sc.aScore };
        }
        if (bestG && tries > 60) break;
      }
      let chosen = bestG || bestA;
      if (!chosen) { // guaranteed fallback: empty cell nearest an edge
        while (fp < N && occ[byDist[fp]] >= 0) fp++;
        if (fp >= N) break;
        const cell = byDist[fp];
        const hr = (cell / W) | 0, hc = cell % W;
        const sc = scoreCell(hr, hc);
        if (!sc) break; // should never happen
        chosen = { hr, hc, dir: sc.gDir || sc.aDir };
      }
      const range = Math.max(1, lp.maxLen - lp.minLen + 1);
      // bias target toward the long end so arrows coil and consume runs
      const target = Math.min(lp.maxLen,
        lp.minLen + Math.floor(Math.pow(rng(), 0.55) * range));
      const path = growBody(chosen.hr, chosen.hc, chosen.dir, target, lp.turnProb || 0.4);
      commit(path, chosen.dir);
      rem -= path.length;
    }

    mergeStubs(); // absorb residual stub clusters into neighbours (safe)

    // fire order = creation order (each arrow's corridor is already-fired)
    const order = arrows.map((a) => a.id);
    return { W, H, arrows, order };
  }

  // Public: generate a board for a level+seed, retrying stuck attempts.
  function generate(level, seed) {
    const { W, H } = sizeForLevel(level);
    const lp = lenParamsForLevel(level, W, H);
    for (let attempt = 0; attempt < 40; attempt++) {
      const rng = makeRng(seed + ':' + level + ':' + attempt);
      const res = buildAttempt(W, H, rng, lp);
      if (res) { res.level = level; res.seed = seed; res.attempt = attempt; return res; }
    }
    return null; // should be astronomically rare; caller can reseed
  }

  // ---- solvability simulation (used by tests AND as a runtime assert) -------
  // Fires arrows in the given order; each must have a clear straight corridor
  // beyond its head at fire time. Returns { ok, cleared, collisions, covered }.
  function simulate(board) {
    const { W, H, arrows, order } = board;
    const idx = (r, c) => r * W + c;
    const inB = (r, c) => r >= 0 && r < H && c >= 0 && c < W;
    const occ = new Int32Array(W * H).fill(-1);
    let covered = 0;
    for (const a of arrows) for (const p of a.cells) {
      if (occ[idx(p.r, p.c)] !== -1) return { ok: false, reason: 'overlap-at-rest' };
      occ[idx(p.r, p.c)] = a.id;
      covered++;
    }
    const dirByName = {};
    for (const d of DIRS) dirByName[d.name] = d;
    let collisions = 0, cleared = 0;
    for (const ai of order) {
      const a = arrows[ai];
      const head = a.cells[a.cells.length - 1];
      const d = dirByName[a.dir];
      let r = head.r + d.dr, c = head.c + d.dc, blocked = false;
      while (inB(r, c)) {
        const o = occ[idx(r, c)];
        if (o !== -1 && o !== a.id) { blocked = true; break; }
        r += d.dr; c += d.dc;
      }
      if (blocked) { collisions++; continue; }
      for (const p of a.cells) occ[idx(p.r, p.c)] = -1; // fire: vacate
      cleared++;
    }
    return {
      ok: collisions === 0 && cleared === arrows.length && covered === W * H,
      cleared, total: arrows.length, collisions, covered, cells: W * H,
    };
  }

  return {
    makeRng, DIRS, sizeForLevel, lenParamsForLevel,
    generate, buildAttempt, simulate,
  };
});
