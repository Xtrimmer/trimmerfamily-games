/* Road Rescue deterministic procedural generator. Browser global + CommonJS. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoadRescueGenerator = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const VERSION = 1;
  const THEMES = ['downtown', 'neighborhood', 'park', 'waterfront', 'construction'];
  const VEHICLES = ['taxi', 'police', 'fire', 'ambulance'];
  const DIRS = [
    { name: 'up', dr: -1, dc: 0, opposite: 'down' },
    { name: 'right', dr: 0, dc: 1, opposite: 'left' },
    { name: 'down', dr: 1, dc: 0, opposite: 'up' },
    { name: 'left', dr: 0, dc: -1, opposite: 'right' },
  ];
  const key = (r, c) => `${r},${c}`;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function hash(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = hash(seed) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffled(items, random) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function profile(level) {
    const l = Math.max(1, Math.floor(level));
    let size = l <= 3 ? 4 : l <= 8 ? 5 : l <= 16 ? 6 : l <= 30 ? 7 : 8;
    let holes = l <= 3 ? 1 : l <= 5 ? 2 : l <= 12 ? 3 : l <= 20 ? 4 : l <= 30 ? 5 : clamp(3 + Math.floor((l - 31) / 12) + (l % 5 === 0 ? -1 : 0), 3, 7);
    const distractors = l < 21 ? 0 : l < 28 ? 1 : Math.min(2, 1 + (l % 4 === 0 ? 1 : 0));
    const intersections = l < 9 ? 0 : l < 26 ? 1 : Math.min(2, 1 + (l % 6 === 0 ? 1 : 0));
    const rotation = l >= 13;
    const minLength = clamp(4 + Math.floor(l / 2), 4, 18);
    const maxLength = clamp(minLength + 5 + Math.floor(l / 8), 6, 28);
    return { size, holes, distractors, intersections, rotation, minLength, maxLength };
  }

  function direction(a, b) {
    const dr = b.r - a.r, dc = b.c - a.c;
    return DIRS.find(d => d.dr === dr && d.dc === dc)?.name || null;
  }
  function tileFromConnections(connections) {
    const dirs = [...connections].sort().join(',');
    if (connections.size === 4) return { type: 'plus', rotation: 0 };
    if (connections.size === 1) {
      const d = [...connections][0];
      return { type: 'straight', rotation: d === 'left' || d === 'right' ? 90 : 0 };
    }
    if (dirs === 'down,up') return { type: 'straight', rotation: 0 };
    if (dirs === 'left,right') return { type: 'straight', rotation: 90 };
    const curves = {
      'right,up': 0,
      'down,right': 90,
      'down,left': 180,
      'left,up': 270,
    };
    return { type: 'curve', rotation: curves[dirs] ?? 0 };
  }

  function starter(level) {
    if (level === 1) return { width: 4, height: 4, route: [{ r: 0, c: 1 }, { r: 1, c: 1 }, { r: 2, c: 1 }, { r: 3, c: 1 }] };
    if (level === 2) return { width: 4, height: 4, route: [{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 2, c: 3 }] };
    if (level === 3) return { width: 4, height: 4, route: [{ r: 0, c: 1 }, { r: 1, c: 1 }, { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 2, c: 3 }] };
    return null;
  }

  function searchRoute(width, height, minLength, maxLength, random) {
    const vertical = random() < 0.5;
    const start = vertical
      ? { r: 0, c: 1 + Math.floor(random() * Math.max(1, width - 2)) }
      : { r: 1 + Math.floor(random() * Math.max(1, height - 2)), c: 0 };
    const route = [start];
    const used = new Set([key(start.r, start.c)]);
    let attempts = 0;
    const isGoal = p => vertical ? p.r === height - 1 : p.c === width - 1;
    function dfs() {
      if (++attempts > 45000) return false;
      const cur = route[route.length - 1];
      if (isGoal(cur) && route.length >= minLength) return true;
      if (route.length >= maxLength) return false;
      let choices = shuffled(DIRS, random);
      choices.sort((a, b) => {
        const ap = vertical ? a.dr : a.dc, bp = vertical ? b.dr : b.dc;
        return bp - ap + (random() - 0.5) * 0.4;
      });
      for (const d of choices) {
        const next = { r: cur.r + d.dr, c: cur.c + d.dc };
        if (next.r < 0 || next.r >= height || next.c < 0 || next.c >= width) continue;
        const k = key(next.r, next.c);
        if (used.has(k)) continue;
        if (isGoal(next) && route.length + 1 < minLength) continue;
        if ((vertical ? next.r === 0 : next.c === 0) && route.length > 1) continue;
        used.add(k); route.push(next);
        if (dfs()) return true;
        route.pop(); used.delete(k);
      }
      return false;
    }
    return dfs() ? route : null;
  }

  function fallbackRoute(size, vertical) {
    const route = [];
    if (vertical) {
      const c = Math.floor(size / 2);
      for (let r = 0; r < size; r++) route.push({ r, c });
    } else {
      const r = Math.floor(size / 2);
      for (let c = 0; c < size; c++) route.push({ r, c });
    }
    return route;
  }

  function buildCells(route, width, height, intersectionTarget, random) {
    const connections = new Map();
    const mainKeys = new Set(route.map(p => key(p.r, p.c)));
    const ensure = k => { if (!connections.has(k)) connections.set(k, new Set()); return connections.get(k); };
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const d = direction(a, b), od = DIRS.find(x => x.name === d).opposite;
      ensure(key(a.r, a.c)).add(d);
      ensure(key(b.r, b.c)).add(od);
    }
    const intersectionKeys = [];
    const candidates = shuffled(route.slice(1, -1), random);
    for (const p of candidates) {
      if (intersectionKeys.length >= intersectionTarget) break;
      const k = key(p.r, p.c), set = connections.get(k);
      if (!set || set.size !== 2) continue;
      const verticalMain = set.has('up') && set.has('down');
      const horizontalMain = set.has('left') && set.has('right');
      if (!verticalMain && !horizontalMain) continue;
      const branch = [];
      if (verticalMain) {
        for (let c = 0; c < width; c++) if (c !== p.c) branch.push({ r: p.r, c });
      } else {
        for (let r = 0; r < height; r++) if (r !== p.r) branch.push({ r, c: p.c });
      }
      if (branch.some(q => mainKeys.has(key(q.r, q.c)) || connections.has(key(q.r, q.c)))) continue;
      if (verticalMain) {
        set.add('left'); set.add('right');
        for (const q of branch) ensure(key(q.r, q.c)).add(q.c < p.c ? (q.c === 0 ? 'right' : 'left') : (q.c === width - 1 ? 'left' : 'right'));
        for (let c = 0; c < width - 1; c++) {
          const a = key(p.r, c), b = key(p.r, c + 1); ensure(a).add('right'); ensure(b).add('left');
        }
      } else {
        set.add('up'); set.add('down');
        for (let r = 0; r < height - 1; r++) {
          const a = key(r, p.c), b = key(r + 1, p.c); ensure(a).add('down'); ensure(b).add('up');
        }
      }
      branch.forEach(q => mainKeys.add(key(q.r, q.c)));
      intersectionKeys.push(k);
    }
    const cells = [];
    for (const [k, set] of connections) {
      const [r, c] = k.split(',').map(Number);
      cells.push({ key: k, r, c, connections: [...set], ...tileFromConnections(set), onRoute: route.some(p => p.r === r && p.c === c) });
    }
    return { cells, intersectionKeys };
  }

  function normalizeRotation(type, rotation) {
    if (type === 'plus') return 0;
    if (type === 'straight') return ((rotation % 180) + 180) % 180;
    return ((rotation % 360) + 360) % 360;
  }

  function generate(level, seedOverride) {
    level = Math.max(1, Math.floor(level || 1));
    const p = profile(level);
    const seed = seedOverride || `rr-v${VERSION}-level-${level}`;
    let random = rng(seed);
    const fixed = starter(level);
    let width = fixed?.width || p.size, height = fixed?.height || p.size;
    let route = fixed?.route || null;
    let built = null;
    if (fixed) built = buildCells(route, width, height, p.intersections, random);
    else {
      for (let attempt = 0; attempt < 10; attempt++) {
        random = rng(`${seed}-attempt-${attempt}`);
        route = searchRoute(width, height, p.minLength, p.maxLength, random) || fallbackRoute(p.size, (level + attempt) % 2 === 1);
        built = buildCells(route, width, height, p.intersections, random);
        if (built.intersectionKeys.length >= p.intersections) break;
      }
    }
    const cellMap = Object.fromEntries(built.cells.map(c => [c.key, c]));
    const eligible = route.slice(1, -1).map(q => cellMap[key(q.r, q.c)]).filter(Boolean);
    let chosen = [];
    if (level === 1) chosen = [cellMap['1,1']];
    else if (level === 2) chosen = [cellMap['2,1']];
    else if (level === 3) chosen = [cellMap['2,1']];
    else {
      if (level >= 9 && built.intersectionKeys.length) chosen.push(cellMap[built.intersectionKeys[0]]);
      for (const cell of shuffled(eligible, random)) {
        if (chosen.length >= p.holes) break;
        if (chosen.includes(cell)) continue;
        const adjacent = chosen.some(x => Math.abs(x.r - cell.r) + Math.abs(x.c - cell.c) === 1);
        if (adjacent && level < 24) continue;
        chosen.push(cell);
      }
      for (const cell of shuffled(eligible, random)) if (chosen.length < p.holes && !chosen.includes(cell)) chosen.push(cell);
    }
    chosen = chosen.filter(Boolean).slice(0, Math.min(p.holes, eligible.length));
    const holes = chosen.map((cell, i) => ({ ...cell, id: `hole-${i + 1}` }));
    const pieces = holes.map((hole, i) => {
      const turns = p.rotation && hole.type !== 'plus' ? Math.floor(random() * 4) : 0;
      return {
        id: `piece-${i + 1}`,
        type: hole.type,
        rotation: normalizeRotation(hole.type, hole.rotation + turns * 90),
        requiredRotation: normalizeRotation(hole.type, hole.rotation),
        targetKey: hole.key,
        distractor: false,
      };
    });
    const types = ['straight', 'curve'];
    for (let i = 0; i < p.distractors; i++) {
      const type = types[Math.floor(random() * types.length)];
      pieces.push({ id: `distractor-${i + 1}`, type, rotation: Math.floor(random() * 4) * 90, requiredRotation: 0, targetKey: null, distractor: true });
    }
    const shuffledPieces = shuffled(pieces, random);
    const vehicle = VEHICLES[(level - 1) % VEHICLES.length];
    const theme = THEMES[Math.floor((level - 1) / 5) % THEMES.length];
    return {
      generatorVersion: VERSION, seed, level, width, height, profile: p,
      route, cells: built.cells, holes, pieces: shuffledPieces,
      start: route[0], destination: route[route.length - 1], vehicle, theme,
    };
  }

  function validate(board) {
    const errors = [];
    if (!board || !Array.isArray(board.route) || board.route.length < 2) errors.push('route missing');
    const cellByKey = new Map((board.cells || []).map(c => [c.key, c]));
    for (let i = 1; i < (board.route || []).length; i++) {
      const a = board.route[i - 1], b = board.route[i];
      if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) errors.push(`route discontinuity ${i}`);
    }
    for (const h of board.holes || []) {
      if (!cellByKey.has(h.key)) errors.push(`hole off road ${h.key}`);
      if (!['straight', 'curve', 'plus'].includes(h.type)) errors.push(`bad hole type ${h.type}`);
    }
    const required = (board.pieces || []).filter(x => !x.distractor);
    if (required.length !== (board.holes || []).length) errors.push('piece/hole mismatch');
    for (const h of board.holes || []) {
      const match = required.some(x => x.targetKey === h.key && x.type === h.type && normalizeRotation(x.type, x.requiredRotation) === normalizeRotation(h.type, h.rotation));
      if (!match) errors.push(`no solution for ${h.key}`);
    }
    return { ok: errors.length === 0, errors };
  }

  return { VERSION, THEMES, VEHICLES, DIRS, profile, generate, validate, normalizeRotation, tileFromConnections };
});
