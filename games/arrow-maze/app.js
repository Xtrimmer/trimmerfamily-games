/* Arrow Maze — game shell, Canvas renderer, interaction, animation, audio. */
(() => {
  'use strict';
  const Gen = window.ArrowMazeGen;

  // ---- direction vectors (by name) ----------------------------------------
  const DV = {
    up: { dr: -1, dc: 0 }, down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 }, right: { dr: 0, dc: 1 },
  };

  // ---- neon palette --------------------------------------------------------
  // core = pipe body, tint = glossy highlight/head, name for reference.
  const PALETTE = [
    { core: '#3ddc84', tint: '#b6ffd6' }, // green
    { core: '#ff5470', tint: '#ffc2cd' }, // red/pink
    { core: '#ffcc33', tint: '#fff0b8' }, // gold
    { core: '#34d9e0', tint: '#bff6f9' }, // cyan
    { core: '#b06cff', tint: '#e4ccff' }, // violet
    { core: '#ff8a3d', tint: '#ffd6b0' }, // orange
  ];

  // ---- DOM -----------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const stage = $('stage');
  const elLevel = $('level');
  const elArrows = $('arrows-left');
  const elHearts = $('hearts');
  const btnMute = $('btn-mute');
  const btnReset = $('btn-reset-view');
  const btnNew = $('btn-new');
  const backdrop = $('modal-backdrop');
  const modalTitle = $('modal-title');
  const modalBody = $('modal-body');
  const modalActions = $('modal-actions');
  const zoomHint = $('zoom-hint');
  const btnLevel = $('btn-level');
  const levelBackdrop = $('level-backdrop');
  const lvlInput = $('lvl-input');

  // offscreen static layer (all alive, non-animating arrows)
  const stat = document.createElement('canvas');
  const sctx = stat.getContext('2d');

  const MAX_STRIKES = 3;

  // ---- persistence ---------------------------------------------------------
  const SAVE_KEY = 'arrowmaze.v2';
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        level: S.level, seed: S.seed, mute: S.mute, perfect: S.perfect,
      }));
    } catch (e) { /* ignore */ }
  }

  // ---- game state ----------------------------------------------------------
  const S = {
    level: 1,
    seed: 's1',
    board: null,       // generator output
    W: 0, H: 0,
    occ: null,         // Int32Array cell -> arrow id (-1 empty / fired)
    alive: null,       // bool per arrow id
    colorOf: null,     // palette index per arrow id
    aliveCount: 0,
    strikes: 0,
    perfectThisLevel: true,
    mute: false,
    perfect: {},       // level -> true
    view: { px: 20, ox: 0, oy: 0, pxFit: 20 },
    anim: null,        // active animation or null
    dpr: 1,
    flash: 0,          // strike flash 0..1
    busy: false,       // input locked during animation / modal
  };

  const idx = (r, c) => r * S.W + c;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- colour assignment (adjacency-distinct) ------------------------------
  function assignColors() {
    const { arrows } = S.board;
    const n = arrows.length;
    const adj = Array.from({ length: n }, () => new Set());
    for (let r = 0; r < S.H; r++) {
      for (let c = 0; c < S.W; c++) {
        const a = S.occ[idx(r, c)];
        if (a < 0) continue;
        for (const k in DV) {
          const nr = r + DV[k].dr, nc = c + DV[k].dc;
          if (nr < 0 || nr >= S.H || nc < 0 || nc >= S.W) continue;
          const b = S.occ[idx(nr, nc)];
          if (b >= 0 && b !== a) { adj[a].add(b); adj[b].add(a); }
        }
      }
    }
    const order = [...Array(n).keys()].sort((x, y) => adj[y].size - adj[x].size);
    const color = new Int32Array(n).fill(-1);
    for (const a of order) {
      const used = new Array(PALETTE.length).fill(0);
      for (const b of adj[a]) if (color[b] >= 0) used[color[b]]++;
      let best = 0;
      for (let i = 1; i < PALETTE.length; i++) if (used[i] < used[best]) best = i;
      // deterministic-ish nudge so equal boards don't all start green
      if (used[best] === 0) {
        for (let i = (a * 7) % PALETTE.length, j = 0; j < PALETTE.length; j++) {
          const p = (i + j) % PALETTE.length;
          if (used[p] === 0) { best = p; break; }
        }
      }
      color[a] = best;
    }
    S.colorOf = color;
  }

  // ---- board lifecycle -----------------------------------------------------
  function startBoard(level, seed) {
    S.level = level;
    S.seed = seed;
    S.board = Gen.generate(level, seed);
    S.W = S.board.W; S.H = S.board.H;
    const n = S.board.arrows.length;
    S.occ = new Int32Array(S.W * S.H).fill(-1);
    for (const a of S.board.arrows)
      for (const p of a.cells) S.occ[idx(p.r, p.c)] = a.id;
    S.alive = new Array(n).fill(true);
    S.aliveCount = n;
    S.strikes = 0;
    S.perfectThisLevel = true;
    S.anim = null;
    S.busy = false;
    assignColors();
    resize(true);      // fit view
    renderHud();
    hideModal();
    persist();
  }

  // ---- view / sizing -------------------------------------------------------
  function resize(refit) {
    const rect = stage.getBoundingClientRect();
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const cv of [canvas, stat]) {
      cv.width = Math.max(1, Math.round(rect.width * S.dpr));
      cv.height = Math.max(1, Math.round(rect.height * S.dpr));
    }
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    if (refit || !S.view.px) fitView(rect);
    renderStatic();
    compose();
  }
  function fitView(rect) {
    const pad = 28;
    const px = Math.min((rect.width - 2 * pad) / S.W,
                        (rect.height - 2 * pad) / S.H);
    S.view.pxFit = px;
    S.view.px = px;
    S.view.ox = (rect.width - S.W * px) / 2;
    S.view.oy = (rect.height - S.H * px) / 2;
  }
  const cx = (c) => S.view.ox + (c + 0.5) * S.view.px;
  const cy = (r) => S.view.oy + (r + 0.5) * S.view.px;

  function zoomAt(factor, fx, fy) {
    const v = S.view;
    const npx = clamp(v.px * factor, v.pxFit, 84);
    if (npx === v.px) return;
    const bx = (fx - v.ox) / v.px, by = (fy - v.oy) / v.px;
    v.px = npx;
    v.ox = fx - bx * npx;
    v.oy = fy - by * npx;
    clampPan();
    renderStatic();
    compose();
  }
  function clampPan() {
    // keep board from drifting entirely off-screen
    const v = S.view, rect = stage.getBoundingClientRect();
    const bw = S.W * v.px, bh = S.H * v.px;
    const margin = Math.min(rect.width, rect.height) * 0.5;
    v.ox = clamp(v.ox, rect.width - bw - margin, margin);
    v.oy = clamp(v.oy, rect.height - bh - margin, margin);
  }

  // ---- drawing primitives --------------------------------------------------
  function pipePoints(cells) {
    const pts = cells.map((p) => ({ x: cx(p.c), y: cy(p.r) }));
    if (pts.length === 1) {
      // stub: synthesize a short neck behind the head so it reads as an arrow
      // (dir handled by caller's head triangle)
      return pts;
    }
    return pts;
  }

  function strokePipe(g, pts, pal, px, glow) {
    if (pts.length < 2) return;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (glow) {
      g.shadowColor = pal.core;
      g.shadowBlur = px * 0.3;
    } else {
      g.shadowBlur = 0;
    }
    g.strokeStyle = pal.core;
    g.lineWidth = px * 0.36;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.stroke();
    g.shadowBlur = 0;
    // glossy inner highlight
    g.strokeStyle = pal.tint;
    g.globalAlpha = 0.5;
    g.lineWidth = px * 0.12;
    g.stroke();
    g.globalAlpha = 1;
  }

  function drawHead(g, center, dirName, pal, px, glow) {
    const d = DV[dirName];
    const perp = { x: -d.dr, y: d.dc }; // rotate dir 90°, in screen coords
    const dx = d.dc, dy = d.dr;
    // keep the whole triangle within the head cell (apex at the cell boundary);
    // head is wider than the pipe so it reads clearly as an arrowhead
    const tip = px * 0.46, half = px * 0.3, back = px * 0.05;
    const ax = center.x + dx * tip, ay = center.y + dy * tip;
    const b1x = center.x - dx * back + perp.x * half;
    const b1y = center.y - dy * back + perp.y * half;
    const b2x = center.x - dx * back - perp.x * half;
    const b2y = center.y - dy * back - perp.y * half;
    if (glow) { g.shadowColor = pal.core; g.shadowBlur = px * 0.26; }
    g.fillStyle = pal.core;
    g.beginPath();
    g.moveTo(ax, ay); g.lineTo(b1x, b1y); g.lineTo(b2x, b2y);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
  }

  function drawArrow(g, cells, dirName, palIdx, px, glow) {
    const pal = PALETTE[palIdx];
    let pts = pipePoints(cells);
    if (pts.length === 1) {
      // draw a short body so the stub looks like an arrow, then the head
      const d = DV[dirName];
      const h = pts[0];
      const tail = { x: h.x - d.dc * px * 0.3, y: h.y - d.dr * px * 0.3 };
      strokePipe(g, [tail, h], pal, px, glow);
    } else {
      strokePipe(g, pts, pal, px, glow);
    }
    drawHead(g, pts[pts.length - 1], dirName, pal, px, glow);
  }

  // ---- static layer + composite -------------------------------------------
  function boardRectPx() {
    return {
      x: S.view.ox, y: S.view.oy, w: S.W * S.view.px, h: S.H * S.view.px,
    };
  }
  function renderStatic() {
    const g = sctx;
    g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    g.clearRect(0, 0, stat.width, stat.height);
    // board backdrop
    const br = boardRectPx();
    const rad = Math.min(18, S.view.px * 0.6);
    roundRect(g, br.x - 6, br.y - 6, br.w + 12, br.h + 12, rad);
    g.fillStyle = 'rgba(255,255,255,0.03)';
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;
    g.stroke();

    // alignment dots: a faint dot at the centre of every currently-empty cell.
    // Drawn behind the arrows and only where no arrow sits, so each dot is
    // hidden until its cell's arrow leaves — revealing a grid that helps trace
    // whether two distant arrows share a row or column.
    // A firing arrow's cells get their dots baked in now, so they're revealed
    // progressively behind the threading snake (drawn on top) rather than
    // popping in only once the arrow is fully gone.
    const animId = (S.anim && S.anim.kind === 'fire') ? S.anim.arrow.id : -2;
    const dotR = Math.max(1, S.view.px * 0.06);
    g.fillStyle = 'rgba(200,206,224,0.17)';
    for (let r = 0; r < S.H; r++) {
      for (let c = 0; c < S.W; c++) {
        const o = S.occ[idx(r, c)];
        if (o !== -1 && o !== animId) continue; // covered by a resting arrow
        g.beginPath();
        g.arc(cx(c), cy(r), dotR, 0, Math.PI * 2);
        g.fill();
      }
    }

    const glow = S.view.px >= 13;
    for (const a of S.board.arrows) {
      if (!S.alive[a.id]) continue;
      if (S.anim && S.anim.arrow.id === a.id) continue; // drawn live
      drawArrow(g, a.cells, a.dir, S.colorOf[a.id], S.view.px, glow);
    }
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function compose() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(stat, 0, 0);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    if (S.anim) drawAnim();
    if (S.flash > 0) {
      const rect = stage.getBoundingClientRect();
      ctx.fillStyle = `rgba(255,84,112,${0.28 * S.flash})`;
      ctx.fillRect(0, 0, rect.width, rect.height);
    }
  }

  // ---- animation -----------------------------------------------------------
  function extendedPath(arrow) {
    // arrow.cells (tail..head) + corridor beyond head + a few off-board cells
    const d = DV[arrow.dir];
    const cells = arrow.cells.slice();
    const head = cells[cells.length - 1];
    let r = head.r + d.dr, c = head.c + d.dc;
    const beyond = cells.length + 3;
    while (r >= -beyond && r <= S.H - 1 + beyond &&
           c >= -beyond && c <= S.W - 1 + beyond &&
           cells.length < arrow.cells.length + 200) {
      cells.push({ r, c });
      if (r < -2 || r > S.H + 1 || c < -2 || c > S.W + 1) break;
      r += d.dr; c += d.dc;
    }
    return cells.map((p) => ({ x: cx(p.c), y: cy(p.r) }));
  }
  function pointAt(pts, p) {
    const i = Math.floor(p);
    if (i >= pts.length - 1) return pts[pts.length - 1];
    if (i < 0) return pts[0];
    const f = p - i;
    return {
      x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
      y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
    };
  }
  function subPath(pts, a, b) {
    const out = [pointAt(pts, a)];
    for (let i = Math.ceil(a); i <= Math.floor(b); i++) {
      if (i >= 0 && i < pts.length) out.push(pts[i]);
    }
    out.push(pointAt(pts, b));
    // dedupe consecutive identical points
    const clean = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const p = out[i], q = clean[clean.length - 1];
      if (Math.abs(p.x - q.x) > 0.01 || Math.abs(p.y - q.y) > 0.01) clean.push(p);
    }
    return clean;
  }
  function drawAnim() {
    const an = S.anim;
    const pal = PALETTE[S.colorOf[an.arrow.id]];
    const glow = S.view.px >= 13;
    const br = boardRectPx();
    ctx.save();
    roundRect(ctx, br.x - 6, br.y - 6, br.w + 12, br.h + 12,
              Math.min(18, S.view.px * 0.6));
    ctx.clip();
    const L = an.arrow.cells.length;
    const headP = an.headParam;
    const tailP = headP - (L - 1);
    const pts = subPath(an.pts, Math.max(0, tailP), headP);
    if (pts.length >= 2) strokePipe(ctx, pts, pal, S.view.px, glow);
    else if (pts.length === 1) {
      // nearly gone
    }
    const headPt = pointAt(an.pts, headP);
    if (headP <= an.pts.length - 1) drawHead(ctx, headPt, an.arrow.dir, pal, S.view.px, glow);
    ctx.restore();
  }

  let rafId = 0;
  function animate(ts) {
    const an = S.anim;
    if (!an) return;
    if (!an.t0) an.t0 = ts;
    const t = clamp((ts - an.t0) / an.dur, 0, 1);
    if (an.kind === 'fire') {
      an.headParam = an.startParam + easeIn(t) * an.travel;
    } else { // bump
      const b = t < 0.5 ? easeOut(t * 2) : easeOut((1 - t) * 2);
      an.headParam = an.startParam + b * an.travel;
      if (S.flash > 0) S.flash = Math.max(0, 1 - t * 1.4);
    }
    compose();
    if (t >= 1) { finishAnim(); return; }
    rafId = requestAnimationFrame(animate);
  }
  function finishAnim() {
    const an = S.anim;
    S.anim = null;
    if (an.kind === 'fire') {
      for (const p of an.arrow.cells) S.occ[idx(p.r, p.c)] = -1;
      S.alive[an.arrow.id] = false;
      S.aliveCount--;
      renderStatic();
      renderHud();
      compose();
      persist();
      if (S.aliveCount === 0) { win(); return; }
      S.busy = false;
    } else {
      S.flash = 0;
      renderStatic();
      compose();
      if (S.strikes >= MAX_STRIKES) { lose(); return; }
      S.busy = false;
    }
  }

  // ---- firing logic --------------------------------------------------------
  function corridorInfo(arrow) {
    const d = DV[arrow.dir];
    const head = arrow.cells[arrow.cells.length - 1];
    let r = head.r + d.dr, c = head.c + d.dc, dist = 0;
    while (r >= 0 && r < S.H && c >= 0 && c < S.W) {
      const o = S.occ[idx(r, c)];
      if (o >= 0 && o !== arrow.id) return { blocked: true, dist };
      dist++; r += d.dr; c += d.dc;
    }
    return { blocked: false, dist };
  }

  function fireArrow(arrow) {
    if (S.busy || !S.alive[arrow.id]) return;
    const info = corridorInfo(arrow);
    const pts = extendedPath(arrow);
    const L = arrow.cells.length;
    const startParam = L - 1;
    if (!info.blocked) {
      S.busy = true;
      Sound.whoosh(arrow.cells.length);
      S.anim = {
        kind: 'fire', arrow, pts, startParam, headParam: startParam,
        travel: info.dist + L + 3,
        dur: clamp(230 + arrow.cells.length * 26, 240, 620), t0: 0,
      };
      renderStatic(); // exclude the now-animating arrow from the static layer
      rafId = requestAnimationFrame(animate);
    } else {
      S.busy = true;
      S.strikes++;
      S.perfectThisLevel = false;
      S.flash = 1;
      Sound.thud();
      popHeart(S.strikes - 1);
      renderHud();
      const nose = Math.max(0.28, info.dist - 0.22);
      S.anim = {
        kind: 'bump', arrow, pts, startParam, headParam: startParam,
        travel: nose, dur: 240, t0: 0,
      };
      renderStatic(); // exclude the bumping arrow from the static layer
      rafId = requestAnimationFrame(animate);
    }
  }

  // ---- win / lose ----------------------------------------------------------
  function win() {
    S.busy = true;
    Sound.win();
    const perfect = S.perfectThisLevel;
    if (perfect) S.perfect[S.level] = true;
    persist();
    showModal('win', perfect ? 'Perfect!' : 'Level cleared',
      perfect ? 'Cleared with no strikes. A clean board.'
              : 'Board cleared. Onward.',
      [
        { label: 'Next Level', primary: true, act: () => {
            startBoard(S.level + 1, 'L' + (S.level + 1) + '-' + rndSeed()); } },
      ]);
  }
  function lose() {
    S.busy = true;
    Sound.lose();
    showModal('lose', 'Out of strikes',
      'Three blocked taps. Retry this board, or reshuffle it.',
      [
        { label: 'Retry', primary: true, act: () => startBoard(S.level, S.seed) },
        { label: 'New Board', act: () => startBoard(S.level, rndSeed()) },
      ]);
  }

  // ---- HUD -----------------------------------------------------------------
  function renderHud() {
    elLevel.textContent = S.level;
    elArrows.textContent = S.aliveCount;
    if (elHearts.childElementCount !== MAX_STRIKES) {
      elHearts.innerHTML = '';
      for (let i = 0; i < MAX_STRIKES; i++) {
        const d = document.createElement('div');
        d.className = 'heart';
        elHearts.appendChild(d);
      }
    }
    [...elHearts.children].forEach((h, i) => {
      h.classList.toggle('full', i < S.strikes);
      h.classList.toggle('empty', i >= S.strikes);
    });
  }
  function popHeart(i) {
    const h = elHearts.children[i];
    if (!h) return;
    h.classList.add('pop');
    setTimeout(() => h.classList.remove('pop'), 200);
  }

  // ---- modal ---------------------------------------------------------------
  function showModal(kind, title, body, actions) {
    modalTitle.textContent = title;
    modalTitle.className = kind;
    modalBody.textContent = body;
    modalActions.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      if (a.primary) b.className = 'primary';
      b.addEventListener('click', () => { hideModal(); a.act(); });
      modalActions.appendChild(b);
    }
    backdrop.classList.remove('hidden');
  }
  function hideModal() { backdrop.classList.add('hidden'); }

  // ---- audio (Web Audio synth) --------------------------------------------
  const Sound = (() => {
    let actx = null;
    const ensure = () => {
      if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
      if (actx && actx.state === 'suspended') actx.resume();
      return actx;
    };
    function tone(freq, dur, type, gain, slideTo) {
      if (S.mute) return;
      const a = ensure(); if (!a) return;
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(gain || 0.15, a.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + dur + 0.02);
    }
    function noise(dur, gain) {
      if (S.mute) return;
      const a = ensure(); if (!a) return;
      const n = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, n, a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = a.createBufferSource(); src.buffer = buf;
      const g = a.createGain(); g.gain.value = gain || 0.12;
      const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400;
      src.connect(f); f.connect(g); g.connect(a.destination);
      src.start();
    }
    return {
      whoosh(len) {
        const base = 320 + Math.min(len, 16) * 18 + Math.random() * 40;
        tone(base, 0.22, 'triangle', 0.12, base * 2.4);
        noise(0.18, 0.06);
      },
      thud() { tone(150, 0.16, 'sawtooth', 0.16, 70); },
      win() {
        [523, 659, 784, 1047].forEach((f, i) =>
          setTimeout(() => tone(f, 0.3, 'triangle', 0.13), i * 90));
      },
      lose() {
        [330, 260, 180].forEach((f, i) =>
          setTimeout(() => tone(f, 0.4, 'sine', 0.14), i * 130));
      },
    };
  })();

  // ---- input: tap / drag / zoom -------------------------------------------
  const pointers = new Map();
  let down = null;         // single-pointer gesture: {x,y,ox,oy,dragged}
  let pinch = null;        // {dist, cx, cy}
  let gestureMulti = false; // latched true if the gesture ever had 2+ pointers
  const MOVE_THRESH = 7;

  function localXY(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function hitArrow(x, y) {
    const c = Math.floor((x - S.view.ox) / S.view.px);
    const r = Math.floor((y - S.view.oy) / S.view.px);
    if (r < 0 || r >= S.H || c < 0 || c >= S.W) return null;
    const a = S.occ[idx(r, c)];
    return a >= 0 && S.alive[a] ? S.board.arrows[a] : null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    pointers.set(e.pointerId, localXY(e));
    if (pointers.size >= 2) {
      // any multi-touch: latch, cancel the single-tap candidate, start pinch
      gestureMulti = true;
      down = null;
      const [p, q] = [...pointers.values()];
      pinch = {
        dist: Math.hypot(p.x - q.x, p.y - q.y),
        cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2,
      };
    } else {
      const p = localXY(e);
      down = { x: p.x, y: p.y, ox: S.view.ox, oy: S.view.oy, dragged: false };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = localXY(e);
    pointers.set(e.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cxp = (a.x + b.x) / 2, cyp = (a.y + b.y) / 2;
      if (pinch.dist > 0) zoomAt(dist / pinch.dist, cxp, cyp);
      pinch.dist = dist; pinch.cx = cxp; pinch.cy = cyp;
      return;
    }
    if (down) {
      const dx = p.x - down.x, dy = p.y - down.y;
      if (!down.dragged && Math.hypot(dx, dy) > MOVE_THRESH) down.dragged = true;
      if (down.dragged) {
        S.view.ox = down.ox + dx;
        S.view.oy = down.oy + dy;
        clampPan();
        renderStatic();
        compose();
      }
    }
  });
  function endPointer(e) {
    const had = pointers.has(e.pointerId);
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    // fire a tap only for a gesture that stayed single-touch the whole time
    if (pointers.size === 0) {
      if (down && had && !down.dragged && !gestureMulti && p) {
        const a = hitArrow(p.x, p.y);
        if (a) fireArrow(a);
      }
      down = null;
      gestureMulti = false;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = localXY(e);
    const factor = Math.exp(-e.deltaY * 0.0016);
    zoomAt(factor, p.x, p.y);
    flashHint();
  }, { passive: false });

  // ---- misc UI -------------------------------------------------------------
  let hintTimer = 0;
  function flashHint() {
    zoomHint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => zoomHint.classList.remove('show'), 1400);
  }
  btnMute.addEventListener('click', () => {
    S.mute = !S.mute;
    btnMute.textContent = S.mute ? '🔇' : '🔊';
    btnMute.classList.toggle('off', S.mute);
    persist();
  });
  btnReset.addEventListener('click', () => { resize(true); });
  btnNew.addEventListener('click', () => {
    if (S.busy && !backdrop.classList.contains('hidden')) return;
    startBoard(S.level, rndSeed());
  });

  // ---- level picker --------------------------------------------------------
  const MAX_LEVEL = 999;
  function openLevelPicker() {
    hideModal();
    lvlInput.value = S.level;
    levelBackdrop.classList.remove('hidden');
    setTimeout(() => { lvlInput.focus(); lvlInput.select(); }, 30);
  }
  function closeLevelPicker() { levelBackdrop.classList.add('hidden'); }
  function gotoLevel(n) {
    n = Math.max(1, Math.min(MAX_LEVEL, Math.round(n) || 1));
    closeLevelPicker();
    startBoard(n, 'L' + n + '-' + rndSeed());
  }
  btnLevel.addEventListener('click', openLevelPicker);
  $('lvl-go').addEventListener('click', () => gotoLevel(parseInt(lvlInput.value, 10)));
  $('lvl-cancel').addEventListener('click', closeLevelPicker);
  $('lvl-minus').addEventListener('click', () => {
    lvlInput.value = Math.max(1, (parseInt(lvlInput.value, 10) || 1) - 1);
  });
  $('lvl-plus').addEventListener('click', () => {
    lvlInput.value = Math.min(MAX_LEVEL, (parseInt(lvlInput.value, 10) || 1) + 1);
  });
  $('level-chips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lvl]');
    if (b) gotoLevel(parseInt(b.dataset.lvl, 10));
  });
  lvlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') gotoLevel(parseInt(lvlInput.value, 10));
    else if (e.key === 'Escape') closeLevelPicker();
  });
  levelBackdrop.addEventListener('click', (e) => {
    if (e.target === levelBackdrop) closeLevelPicker();
  });

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => resize(true), 120);
  });

  function rndSeed() {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  // ---- boot ----------------------------------------------------------------
  function boot() {
    const sv = loadSave();
    S.mute = !!sv.mute;
    S.perfect = sv.perfect || {};
    btnMute.textContent = S.mute ? '🔇' : '🔊';
    btnMute.classList.toggle('off', S.mute);
    let level = Math.max(1, sv.level || 1);
    let seed = sv.seed || ('L' + level + '-' + rndSeed());
    const m = /level=(\d+)/.exec(location.hash);   // testing override
    if (m) { level = parseInt(m[1], 10); seed = 'demo-' + level; }
    startBoard(level, seed);
    setTimeout(flashHint, 500);
    const tm = /test=(\w+)/.exec(location.hash);
    if (tm) runTest(tm[1]);
  }

  // ---- headless verification scenarios (guarded by #test=..., harmless) ----
  function runTest(kind) {
    if (kind === 'solve') {
      // fire every arrow in generated order; each must be unblocked -> win.
      let bad = 0;
      for (const id of S.board.order) {
        const ar = S.board.arrows[id];
        if (corridorInfo(ar).blocked) { bad++; continue; }
        for (const p of ar.cells) S.occ[idx(p.r, p.c)] = -1;
        S.alive[id] = false; S.aliveCount--;
      }
      renderStatic(); renderHud(); compose();
      if (bad === 0 && S.aliveCount === 0) win();
      else showModal('lose', 'TEST FAIL',
        `blocked=${bad} left=${S.aliveCount}`, []);
    } else if (kind === 'strikes') {
      // an interior arrow MUST be detected as blocked; accrue 3 strikes.
      const blocked = S.board.arrows.find((a) => corridorInfo(a).blocked);
      if (!blocked) { showModal('lose', 'TEST FAIL', 'no blocked arrow found', []); return; }
      S.strikes = MAX_STRIKES; renderHud(); lose();
    } else if (kind === 'advance') {
      // simulate clicking "Next Level": advances + persists
      startBoard(S.level + 1, 'L' + (S.level + 1) + '-' + rndSeed());
    } else if (kind === 'pinch' || kind === 'tap') {
      const rect = canvas.getBoundingClientRect();
      const pe = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(
        type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
      const before = S.aliveCount, beforeStrk = S.strikes;
      if (kind === 'pinch') {
        // two-finger pinch centred on the board — must NOT fire or strike
        const mx = rect.left + rect.width / 2, my = rect.top + rect.height / 2;
        pe('pointerdown', 1, mx - 25, my); pe('pointerdown', 2, mx + 25, my);
        pe('pointermove', 1, mx - 70, my); pe('pointermove', 2, mx + 70, my);
        pe('pointerup', 1, mx - 70, my); pe('pointerup', 2, mx + 70, my);
        const ok = S.aliveCount === before && S.strikes === beforeStrk && !S.anim;
        showModal(ok ? 'win' : 'lose', ok ? 'Pinch OK' : 'PINCH BUG',
          `alive ${before}->${S.aliveCount}, strikes ${beforeStrk}->${S.strikes}, anim=${!!S.anim}`, []);
      } else {
        // single tap on a firable arrow's head — MUST start a fire, no strike
        const ar = S.board.order.map((i) => S.board.arrows[i])
          .find((a) => !corridorInfo(a).blocked);
        const hd = ar.cells[ar.cells.length - 1];
        const x = rect.left + cx(hd.c), y = rect.top + cy(hd.r);
        pe('pointerdown', 1, x, y); pe('pointerup', 1, x, y);
        const firing = !!S.anim && S.anim.kind === 'fire';
        const ok = firing && S.strikes === beforeStrk;
        showModal(ok ? 'win' : 'lose', ok ? 'Tap OK' : 'TAP BUG',
          `firing=${firing}, strikes ${beforeStrk}->${S.strikes}`, []);
      }
    } else if (kind === 'picker') {
      openLevelPicker();
    } else if (kind === 'jump') {
      openLevelPicker();
      document.querySelector('#level-chips button[data-lvl="200"]').click();
    } else if (kind === 'sparse') {
      // clear all but a few arrows to reveal the alignment-dot grid
      const keep = 5;
      const ids = S.board.order.slice(0, Math.max(0, S.board.arrows.length - keep));
      for (const id of ids) {
        const ar = S.board.arrows[id];
        for (const p of ar.cells) S.occ[idx(p.r, p.c)] = -1;
        S.alive[id] = false; S.aliveCount--;
      }
      renderStatic(); renderHud(); compose();
    } else if (kind === 'zoom') {
      const rect = stage.getBoundingClientRect();
      zoomAt(2.4, rect.width * 0.5, rect.height * 0.5);
    } else if (kind === 'anim') {
      // fire a clean edge arrow with the real animation running
      const ar = S.board.order.map((i) => S.board.arrows[i])
        .find((a) => !corridorInfo(a).blocked);
      if (ar) fireArrow(ar);
    } else if (kind === 'animframe') {
      // deterministic mid-thread-out frame (no rAF): pick a long clean arrow,
      // set headParam partway along its travel, compose once.
      const cands = S.board.order.map((i) => S.board.arrows[i])
        .filter((a) => !corridorInfo(a).blocked);
      const ar = cands.sort((a, b) => b.cells.length - a.cells.length)[0];
      if (ar) {
        const info = corridorInfo(ar);
        const L = ar.cells.length, startParam = L - 1;
        const travel = info.dist + L + 3;
        S.busy = true;
        const pm = /[&#]p=(\d+)/.exec(location.hash);
        const frac = pm ? parseInt(pm[1], 10) / 100 : 0.45;
        S.anim = { kind: 'fire', arrow: ar, pts: extendedPath(ar),
          startParam, headParam: startParam + travel * frac,
          travel, dur: 400, t0: 1 };
        renderStatic(); // mirror fireArrow: original must not remain in static
        compose();
      }
    }
  }

  // expose a tiny hook for headless screenshot testing
  window.__AM = {
    S, startBoard,
    fireByCell(r, c) {
      const a = S.occ[idx(r, c)];
      if (a >= 0 && S.alive[a]) fireArrow(S.board.arrows[a]);
    },
  };

  boot();
})();
