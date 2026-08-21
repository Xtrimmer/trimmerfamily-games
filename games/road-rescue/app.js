/* Road Rescue game shell, SVG renderer, interaction, audio, and persistence. */
(() => {
  'use strict';
  const G = window.RoadRescueGenerator;
  const $ = id => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SAVE_KEY = 'road-rescue.v1';
  const MAX_LEVEL = 999;
  const COLORS = ['#5cc8ff', '#ffcc33', '#3ddc84', '#ff5470', '#b06cff', '#34d9e0'];
  const VEHICLES = {
    taxi: { label: 'TAXI', emoji: '🚕', color: '#ffcc33', copy: 'The taxi reached its passenger.' },
    police: { label: 'POLICE', emoji: '🚓', color: '#5c91ff', copy: 'The police car reached the station.' },
    fire: { label: 'FIRE', emoji: '🚒', color: '#ff5470', copy: 'The fire engine reached the station.' },
    ambulance: { label: 'HOSPITAL', emoji: '🚑', color: '#f4f6ff', copy: 'The ambulance reached the hospital.' },
  };
  const els = {
    game: $('game'), boardWrap: $('board-wrap'), board: $('board'), scenery: $('scenery-layer'), road: $('road-layer'), holes: $('hole-layer'), route: $('route-layer'), destination: $('destination-layer'), vehicle: $('vehicle-layer'), message: $('board-message'),
    tray: $('piece-tray'), trayPanel: $('tray-panel'), trayTip: $('tray-tip'), help: $('help-btn'), showMe: $('show-me-btn'),
    level: $('level-number'), stars: $('star-count'), piecesLeft: $('pieces-left'), levelBtn: $('level-btn'),
    celebration: $('celebration'), celebrationIcon: $('celebration-icon'), celebrationCopy: $('celebration-copy'), confetti: $('confetti'), next: $('next-btn'), replay: $('replay-btn'), levelsFromWin: $('levels-from-win'),
    levelsModal: $('levels-modal'), levelsClose: $('levels-close'), continueBtn: $('continue-btn'), levelGrid: $('level-grid'), pagePrev: $('page-prev'), pageNext: $('page-next'), pageLabel: $('page-label'),
    settingsBtn: $('settings-btn'), settingsModal: $('settings-modal'), settingsClose: $('settings-close'), soundToggle: $('sound-toggle'), unlock: $('unlock-btn'), resetLevel: $('reset-level-btn'), resetProgress: $('reset-progress-btn'), storageNote: $('storage-note'),
    ghost: $('drag-ghost'),
  };

  let storageAvailable = true;
  function defaultState() { return { version: 1, generatorVersion: G.VERSION, currentLevel: 1, unlocked: 1, stars: [], placed: {}, sound: true, introSeen: false, unlockAll: false }; }
  function loadState() {
    const fallback = defaultState();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        ...fallback, ...parsed,
        stars: Array.isArray(parsed.stars) ? [...new Set(parsed.stars.map(Number).filter(n => n >= 1 && n <= MAX_LEVEL))] : [],
        placed: parsed.placed && typeof parsed.placed === 'object' ? parsed.placed : {},
        currentLevel: Math.max(1, Math.min(MAX_LEVEL, Number(parsed.currentLevel) || 1)),
        unlocked: Math.max(1, Math.min(MAX_LEVEL, Number(parsed.unlocked) || 1)),
      };
    } catch (_) { storageAvailable = false; return fallback; }
  }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
    catch (_) { storageAvailable = false; els.storageNote.classList.remove('hidden'); }
  }

  let state = loadState();
  let board = null;
  let selectedPiece = null;
  let page = 0;
  let idleTimer = 0;
  let currentHintKey = null;
  const hintRequests = {};
  let completing = false;
  let driving = false;
  let driveSpeed = 1;
  let vehicleAudio = null;
  let audioContext = null;
  let drag = null;
  let suppressClickUntil = 0;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const normalize = (type, rotation) => G.normalizeRotation(type, rotation);
  const placedForLevel = () => state.placed[board.level] || (state.placed[board.level] = {});
  const isPlaced = key => Boolean(placedForLevel()[key]);
  const pieceById = id => board.pieces.find(p => p.id === id);
  const holeByKey = key => board.holes.find(h => h.key === key);
  const availablePieces = () => board.pieces.filter(p => !Object.values(placedForLevel()).includes(p.id));

  function tilePath(type, rotation, x = 0, y = 0, size = 100) {
    const c = size / 2, r = normalize(type, rotation);
    const p = (a, b) => `${x + a * size / 100},${y + b * size / 100}`;
    if (type === 'plus') return `M${p(50,0)} L${p(50,100)} M${p(0,50)} L${p(100,50)}`;
    if (type === 'straight') return r === 90 ? `M${p(0,50)} L${p(100,50)}` : `M${p(50,0)} L${p(50,100)}`;
    const paths = {
      0: `M${p(50,0)} Q${p(50,50)} ${p(100,50)}`,
      90: `M${p(100,50)} Q${p(50,50)} ${p(50,100)}`,
      180: `M${p(50,100)} Q${p(50,50)} ${p(0,50)}`,
      270: `M${p(0,50)} Q${p(50,50)} ${p(50,0)}`,
    };
    return paths[r] || paths[0];
  }
  function roadMarkup(cell, className = 'fixed-road') {
    const x = cell.c * 100, y = cell.r * 100, d = tilePath(cell.type, cell.rotation, x, y);
    return `<g class="${className}" data-road-key="${cell.key}"><path class="road-outline" d="${d}"/><path class="road-asphalt" d="${d}"/><path class="road-center" d="${d}"/></g>`;
  }
  function miniMarkup(piece) {
    const d = tilePath(piece.type, 0);
    return `<svg viewBox="0 0 100 100" aria-hidden="true" style="--rotation:${piece.rotation}deg"><path class="mini-outline" d="${d}"/><path class="mini-road" d="${d}"/><path class="mini-line" d="${d}"/></svg>`;
  }
  function center(p) { return { x: p.c * 100 + 50, y: p.r * 100 + 50 }; }

  function renderScenery() {
    const occupied = new Set(board.cells.map(c => c.key));
    let html = '';
    const themeColors = { downtown:'#b06cff', neighborhood:'#ffcc33', park:'#3ddc84', waterfront:'#34d9e0', construction:'#ff8a3d' };
    let n = 0;
    for (let r = 0; r < board.height; r++) for (let c = 0; c < board.width; c++) {
      if (occupied.has(`${r},${c}`) || (r + c + board.level) % 3 !== 0) continue;
      const x = c * 100 + 50, y = r * 100 + 50, color = themeColors[board.theme];
      if (board.theme === 'park') html += `<g class="scenery-icon"><circle cx="${x}" cy="${y}" r="24" fill="#245b3d"/><circle cx="${x-12}" cy="${y-8}" r="17" fill="${color}"/><circle cx="${x+12}" cy="${y-4}" r="18" fill="#52ef9f"/></g>`;
      else if (board.theme === 'waterfront') html += `<path class="scenery-icon" d="M${x-32},${y} q16,-15 32,0 t32,0" fill="none" stroke="${color}" stroke-width="7" opacity=".65"/>`;
      else html += `<g class="scenery-icon"><rect x="${x-27}" y="${y-30}" width="54" height="60" rx="8" fill="#222942" stroke="${color}" stroke-width="3"/><rect x="${x-15}" y="${y-16}" width="10" height="10" fill="${color}"/><rect x="${x+6}" y="${y-16}" width="10" height="10" fill="${color}"/></g>`;
      if (++n >= Math.max(4, Math.floor(board.width * board.height / 5))) break;
    }
    els.scenery.innerHTML = html;
  }
  function renderRoad() {
    const holes = new Set(board.holes.map(h => h.key));
    let fixed = '', placed = '';
    for (const cell of board.cells) {
      if (!holes.has(cell.key)) fixed += roadMarkup(cell);
      else if (isPlaced(cell.key)) placed += roadMarkup(cell, 'placed-road');
    }
    els.road.innerHTML = fixed + placed;
    els.holes.innerHTML = board.holes.filter(h => !isPlaced(h.key)).map(h => {
      const x = h.c * 100, y = h.r * 100, d = tilePath(h.type, h.rotation, x, y);
      return `<g class="road-hole" data-key="${h.key}" role="button" tabindex="0" aria-label="Empty ${h.type} road opening"><rect class="hole-bed" x="${x+9}" y="${y+9}" width="82" height="82" rx="17"/><path class="hole-shape" d="${d}"/><circle cx="${x+17}" cy="${y+18}" r="5" fill="#ff8a3d"/><circle cx="${x+83}" cy="${y+82}" r="5" fill="#ffcc33"/></g>`;
    }).join('');
    [...els.holes.querySelectorAll('.road-hole')].forEach(h => {
      h.addEventListener('click', () => { if (selectedPiece) tryPlace(selectedPiece, h.dataset.key, 'tap'); });
      h.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && selectedPiece) { e.preventDefault(); tryPlace(selectedPiece, h.dataset.key, 'keyboard'); } });
    });
    const points = board.route.map(center);
    els.route.innerHTML = `<polyline class="route-cue" points="${points.map(p => `${p.x},${p.y}`).join(' ')}"/>`;
  }
  function destinationMarkup() {
    const d = center(board.destination), info = VEHICLES[board.vehicle];
    const label = board.vehicle === 'taxi' ? 'STOP' : info.label;
    return `<g transform="translate(${d.x} ${d.y})" class="destination"><rect x="-37" y="-34" width="74" height="68" rx="13" fill="#182035" stroke="${info.color}" stroke-width="5"/><path d="M-29,-10 L0,-31 L29,-10" fill="${info.color}" opacity=".8"/><rect x="-12" y="9" width="24" height="25" rx="4" fill="${info.color}"/><text y="4" class="destination-label">${label}</text></g>`;
  }
  function vehicleMarkup(x, y, angle = 0) {
    const info = VEHICLES[board.vehicle], emergency = board.vehicle !== 'taxi';
    return `<g id="vehicle" class="vehicle" transform="translate(${x} ${y}) rotate(${angle})"><rect class="vehicle-wheel" x="-27" y="-21" width="8" height="17" rx="3"/><rect class="vehicle-wheel" x="19" y="-21" width="8" height="17" rx="3"/><rect class="vehicle-wheel" x="-27" y="13" width="8" height="17" rx="3"/><rect class="vehicle-wheel" x="19" y="13" width="8" height="17" rx="3"/><rect class="vehicle-body" x="-23" y="-34" width="46" height="68" rx="15" fill="${info.color}"/><rect class="vehicle-window" x="-16" y="-20" width="32" height="19" rx="7"/><rect class="vehicle-window" x="-15" y="8" width="30" height="14" rx="6"/>${emergency ? '<rect class="vehicle-light" x="-14" y="-4" width="12" height="7" rx="2" fill="#ff5470"/><rect class="vehicle-light" x="2" y="-4" width="12" height="7" rx="2" fill="#5cc8ff"/>' : '<rect x="-14" y="-5" width="28" height="9" rx="4" fill="#171923"/><text x="0" y="2" text-anchor="middle" font-size="7" font-weight="900" fill="#ffcc33">TAXI</text>'}</g>`;
  }
  function initialAngle() {
    const a = board.route[0], b = board.route[1];
    return Math.atan2(b.r-a.r,b.c-a.c)*180/Math.PI+90;
  }
  function renderDestinationAndVehicle() {
    els.destination.innerHTML = destinationMarkup();
    const s = center(board.start);
    els.vehicle.innerHTML = vehicleMarkup(s.x, s.y, initialAngle());
  }

  function renderTray() {
    const placedIds = new Set(Object.values(placedForLevel()));
    const pieces = board.pieces.filter(p => !placedIds.has(p.id));
    els.tray.innerHTML = pieces.map((p, i) => `<button class="piece${selectedPiece === p.id ? ' selected' : ''}" style="--piece-color:${COLORS[i%COLORS.length]};--rotation:${p.rotation}deg" data-id="${p.id}" role="listitem" aria-label="${p.distractor ? 'Extra ' : ''}${p.type} road piece${board.profile.rotation && p.type !== 'plus' ? ', tap again to rotate' : ''}">${miniMarkup(p)}</button>`).join('');
    [...els.tray.querySelectorAll('.piece')].forEach(button => bindPiece(button));
    const remaining = board.holes.filter(h => !isPlaced(h.key)).length;
    els.piecesLeft.textContent = remaining;
    els.trayTip.textContent = board.profile.rotation ? 'Tap twice to turn' : 'Drag or tap';
    if (!pieces.length) els.trayPanel.classList.add('empty'); else els.trayPanel.classList.remove('empty');
  }
  function renderHud() {
    els.level.textContent = board.level;
    els.stars.textContent = state.stars.length;
    els.continueBtn.textContent = `Continue Level ${state.currentLevel}`;
  }
  function renderAll() {
    els.game.className = `theme-${board.theme}`;
    els.board.setAttribute('viewBox', `0 0 ${board.width*100} ${board.height*100}`);
    els.board.style.setProperty('--board-ratio', board.width / board.height);
    els.game.style.setProperty('--board-ratio', board.width / board.height);
    renderScenery(); renderRoad(); renderDestinationAndVehicle(); renderTray(); renderHud();
  }

  function setMessage(text) { els.message.textContent = text; }
  function meaningfulInteraction() { clearTimeout(idleTimer); clearHints(false); if (!completing) idleTimer = setTimeout(() => showHint(false), 8000); }
  function clearHints(clearCurrent = true) {
    els.holes.querySelectorAll('.hint,.compatible,.rotate-hint,.wrong').forEach(x => x.classList.remove('hint','compatible','rotate-hint','wrong'));
    els.tray.querySelectorAll('.hint').forEach(x => x.classList.remove('hint'));
    if (clearCurrent) currentHintKey = null;
  }
  function chooseHintHole() {
    const pending = board.holes.filter(h => !isPlaced(h.key));
    return pending.find(h => h.key === currentHintKey) || pending[0] || null;
  }
  function compatiblePiece(hole) {
    return availablePieces().find(p => !p.distractor && p.type === hole.type) || null;
  }
  function showHint(requested = true) {
    const hole = chooseHintHole(); if (!hole) return;
    currentHintKey = hole.key;
    if (requested) hintRequests[hole.key] = (hintRequests[hole.key] || 0) + 1;
    const piece = compatiblePiece(hole);
    els.holes.querySelector(`[data-key="${hole.key}"]`)?.classList.add('hint');
    els.tray.querySelector(`[data-id="${piece?.id}"]`)?.classList.add('hint');
    setMessage(piece ? 'This piece matches the glowing opening.' : 'Look for the glowing opening.');
    if ((hintRequests[hole.key] || 0) >= 3) els.showMe.classList.remove('hidden');
  }
  function demoFirstMove() {
    const hole = board.holes[0], piece = compatiblePiece(hole); if (!hole || !piece) return;
    const from = els.tray.querySelector(`[data-id="${piece.id}"]`)?.getBoundingClientRect();
    const to = els.holes.querySelector(`[data-key="${hole.key}"]`)?.getBoundingClientRect();
    if (!from || !to) return showHint(false);
    els.ghost.innerHTML = miniMarkup(piece); els.ghost.style.setProperty('--rotation', `${piece.rotation}deg`); els.ghost.classList.remove('hidden');
    els.ghost.style.left = `${from.left+from.width/2}px`; els.ghost.style.top = `${from.top+from.height/2}px`;
    setMessage('Watch: move the road piece to the opening.');
    const anim = els.ghost.animate([
      { left:`${from.left+from.width/2}px`, top:`${from.top+from.height/2}px`, transform:'translate(-50%,-50%) scale(1)' },
      { left:`${to.left+to.width/2}px`, top:`${to.top+to.height/2}px`, transform:'translate(-50%,-50%) scale(1.08)' },
      { left:`${from.left+from.width/2}px`, top:`${from.top+from.height/2}px`, transform:'translate(-50%,-50%) scale(1)' },
    ], { duration:2200, easing:'ease-in-out' });
    anim.onfinish = () => { els.ghost.classList.add('hidden'); meaningfulInteraction(); showHint(false); setMessage('Now it’s your turn!'); };
  }

  function bindPiece(button) {
    button.addEventListener('click', e => {
      if (performance.now() < suppressClickUntil) return;
      const id = button.dataset.id, piece = pieceById(id);
      if (selectedPiece === id && board.profile.rotation && piece.type !== 'plus') {
        piece.rotation = normalize(piece.type, piece.rotation + 90); playEffect('turn');
      } else selectedPiece = id;
      renderTray(); meaningfulInteraction();
    });
    button.addEventListener('pointerdown', e => {
      if (driving || completing) return;
      drag = { id:button.dataset.id, pointerId:e.pointerId, startX:e.clientX, startY:e.clientY, x:e.clientX, y:e.clientY, active:false, button };
      try { button.setPointerCapture(e.pointerId); } catch (_) {}
    });
    button.addEventListener('pointermove', e => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      drag.x=e.clientX; drag.y=e.clientY;
      if (!drag.active && Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>9) beginDrag();
      if (drag.active) { e.preventDefault(); moveGhost(e.clientX,e.clientY); }
    });
    const end = e => { if (!drag || drag.pointerId !== e.pointerId) return; if (drag.active) { e.preventDefault(); finishDrag(e.clientX,e.clientY); suppressClickUntil=performance.now()+350; } drag=null; };
    button.addEventListener('pointerup', end); button.addEventListener('pointercancel', end);
  }
  function beginDrag() {
    if (!drag) return; drag.active=true; selectedPiece=drag.id;
    const piece=pieceById(drag.id); els.ghost.innerHTML=miniMarkup(piece); els.ghost.style.setProperty('--rotation',`${piece.rotation}deg`); els.ghost.classList.remove('hidden'); moveGhost(drag.x,drag.y);
  }
  function moveGhost(x,y) {
    els.ghost.style.left=`${x}px`; els.ghost.style.top=`${y}px`;
    clearHints(false);
    const target=document.elementFromPoint(x,y)?.closest?.('.road-hole');
    if (!target) return;
    const piece=pieceById(drag.id), hole=holeByKey(target.dataset.key);
    if (piece.type===hole.type && normalize(piece.type,piece.rotation)===normalize(hole.type,hole.rotation)) target.classList.add('compatible');
    else if (piece.type===hole.type) target.classList.add('rotate-hint');
    else target.classList.add('wrong');
  }
  function finishDrag(x,y) {
    els.ghost.classList.add('hidden');
    const target=document.elementFromPoint(x,y)?.closest?.('.road-hole');
    if (target) tryPlace(drag.id,target.dataset.key,'drag');
    else { playEffect('return'); setMessage('Try another opening.'); }
  }

  function tryPlace(pieceId,key,source) {
    const piece=pieceById(pieceId), hole=holeByKey(key); if (!piece||!hole||isPlaced(key)) return false;
    currentHintKey=key;
    const correctType=piece.type===hole.type;
    const correctRotation=normalize(piece.type,piece.rotation)===normalize(hole.type,hole.rotation);
    if (!correctType || !correctRotation) {
      meaningfulInteraction();
      const h=els.holes.querySelector(`[data-key="${key}"]`); h?.classList.add(correctType?'rotate-hint':'wrong');
      setTimeout(()=>h?.classList.remove('rotate-hint','wrong'),500);
      setMessage(correctType ? 'Right shape—tap it again to turn it.' : 'That shape fits somewhere else.');
      playEffect(correctType?'turn':'wrong'); return false;
    }
    placedForLevel()[key]=piece.id; selectedPiece=null; persist(); playEffect('lock');
    setMessage('Great repair!'); renderRoad();
    const button=els.tray.querySelector(`[data-id="${piece.id}"]`); button?.classList.add('placed');
    setTimeout(()=>renderTray(),220); renderHud(); meaningfulInteraction();
    if (board.holes.every(h=>isPlaced(h.key))) { clearTimeout(idleTimer); completing=true; setTimeout(beginCompletion,450); }
    return true;
  }

  function ensureAudio() {
    if (!audioContext) try { audioContext=new (window.AudioContext||window.webkitAudioContext)(); } catch (_) {}
    if (audioContext?.state==='suspended') audioContext.resume(); return audioContext;
  }
  function playEffect(kind) {
    if (!state.sound) return; const a=ensureAudio(); if (!a) return;
    const map={lock:[660,.11,'sine'],wrong:[150,.13,'square'],turn:[390,.08,'triangle'],return:[230,.07,'sine'],star:[880,.18,'triangle']};
    const [freq,dur,type]=map[kind]||map.lock, o=a.createOscillator(),g=a.createGain(); o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,a.currentTime);g.gain.exponentialRampToValueAtTime(.09,a.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+dur);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+dur+.02);
  }
  function startVehicleAudio() {
    if (!state.sound) return;
    stopVehicleAudio(); vehicleAudio=new Audio(`audio/${board.vehicle}.wav`); vehicleAudio.loop=true; vehicleAudio.volume=.38; vehicleAudio.play().catch(()=>playEffect('star'));
  }
  function stopVehicleAudio() { if (vehicleAudio) { vehicleAudio.pause(); vehicleAudio.currentTime=0; vehicleAudio=null; } }

  function beginCompletion() {
    els.tray.querySelectorAll('.piece').forEach((p,i)=>setTimeout(()=>p.classList.add('placed'),i*55));
    setTimeout(()=>{els.tray.innerHTML='';els.trayPanel.classList.add('empty');},520);
    setMessage(`${VEHICLES[board.vehicle].label} is ready!`); els.boardWrap.classList.add('road-complete'); startVehicleAudio();
    setTimeout(driveVehicle,1200);
  }
  function driveVehicle() {
    driving=true; driveSpeed=1; const pts=board.route.map(center), lengths=[], cumulative=[0]; let total=0;
    for(let i=1;i<pts.length;i++){const len=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);lengths.push(len);total+=len;cumulative.push(total);}
    const duration=Math.max(3000,Math.min(6000,pts.length*360)); let last=performance.now(),progress=0;
    function frame(now){
      const dt=now-last;last=now;progress+=dt*driveSpeed/duration;const dist=Math.min(total,total*progress);let seg=0;while(seg<lengths.length-1&&cumulative[seg+1]<dist)seg++;const local=(dist-cumulative[seg])/(lengths[seg]||1);const a=pts[seg],b=pts[Math.min(seg+1,pts.length-1)];const x=a.x+(b.x-a.x)*local,y=a.y+(b.y-a.y)*local,angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI+90;els.vehicle.innerHTML=vehicleMarkup(x,y,angle);if(progress<1)requestAnimationFrame(frame);else arrive();
    }
    requestAnimationFrame(frame);
  }
  function arrive() {
    driving=false; stopVehicleAudio(); playEffect('star'); setMessage('Destination reached!');
    if (!state.stars.includes(board.level)) state.stars.push(board.level);
    state.unlocked=Math.max(state.unlocked,Math.min(MAX_LEVEL,board.level+1)); persist(); renderHud();
    setTimeout(showCelebration,500);
  }
  function showCelebration() {
    const info=VEHICLES[board.vehicle];els.celebrationIcon.textContent=info.emoji;els.celebrationCopy.textContent=info.copy;els.celebration.classList.remove('hidden');els.next.focus();
    els.confetti.innerHTML=Array.from({length:30},(_,i)=>`<i class="confetti-piece" style="left:${(i*37)%100}%;background:${COLORS[i%COLORS.length]};animation-delay:${(i%7)*.06}s"></i>`).join('');
  }

  function startLevel(level,{fresh=false}={}) {
    stopVehicleAudio();clearTimeout(idleTimer);completing=false;driving=false;selectedPiece=null;currentHintKey=null;els.showMe.classList.add('hidden');els.celebration.classList.add('hidden');els.boardWrap.classList.remove('road-complete');
    level=Math.max(1,Math.min(MAX_LEVEL,Number(level)||1));state.currentLevel=level;if(fresh)delete state.placed[level];board=G.generate(level);persist();renderAll();setMessage('Fix the road!');meaningfulInteraction();
    if(level===1&&!state.introSeen){state.introSeen=true;persist();setTimeout(demoFirstMove,650);}
  }

  function openModal(modal,focus){modal.classList.remove('hidden');setTimeout(()=>focus?.focus(),20);}
  function closeModal(modal,returnFocus){modal.classList.add('hidden');returnFocus?.focus();}
  function renderLevels() {
    const start=page*20+1,end=start+19;els.pageLabel.textContent=`${start}–${end}`;
    els.levelGrid.innerHTML=Array.from({length:20},(_,i)=>{const n=start+i,enabled=state.unlockAll||n<=state.unlocked,star=state.stars.includes(n);return `<button class="level-tile${n===board.level?' current':''}" data-level="${n}" ${enabled?'':'disabled'}>${n}${star?'<span class="level-star">★</span>':''}</button>`;}).join('');
    els.levelGrid.querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>{const n=Number(b.dataset.level);closeModal(els.levelsModal,els.levelBtn);startLevel(n,{fresh:state.stars.includes(n)});}));
    els.pagePrev.disabled=page===0;els.pageNext.disabled=!state.unlockAll&&(page+1)*20>=state.unlocked;els.continueBtn.textContent=`Continue Level ${state.currentLevel}`;
  }
  function openLevels(){page=Math.floor((board.level-1)/20);renderLevels();openModal(els.levelsModal,els.continueBtn);}
  function openSettings(){els.soundToggle.checked=state.sound;els.storageNote.classList.toggle('hidden',storageAvailable);openModal(els.settingsModal,els.settingsClose);}

  function bindHold(button,action) {
    let timer=0,frame=0,start=0;
    const cancel=()=>{clearTimeout(timer);cancelAnimationFrame(frame);button.style.setProperty('--hold','0%');};
    const begin=e=>{e.preventDefault();cancel();start=performance.now();const tick=()=>{button.style.setProperty('--hold',`${Math.min(100,(performance.now()-start)/30)}%`);frame=requestAnimationFrame(tick);};tick();timer=setTimeout(()=>{cancel();action();},3000);};
    button.addEventListener('pointerdown',begin);button.addEventListener('pointerup',cancel);button.addEventListener('pointerleave',cancel);button.addEventListener('pointercancel',cancel);
  }

  els.help.addEventListener('click',()=>{meaningfulInteraction();showHint(true);});
  els.showMe.addEventListener('click',()=>{const h=chooseHintHole(),p=h&&compatiblePiece(h);if(h&&p){p.rotation=normalize(p.type,h.rotation);tryPlace(p.id,h.key,'show');}els.showMe.classList.add('hidden');});
  els.boardWrap.addEventListener('pointerdown',()=>{if(driving)driveSpeed=2.5;});
  els.levelBtn.addEventListener('click',openLevels);els.levelsFromWin.addEventListener('click',()=>{els.celebration.classList.add('hidden');openLevels();});
  els.levelsClose.addEventListener('click',()=>closeModal(els.levelsModal,els.levelBtn));
  els.continueBtn.addEventListener('click',()=>{closeModal(els.levelsModal,els.levelBtn);startLevel(state.currentLevel);});
  els.pagePrev.addEventListener('click',()=>{page=Math.max(0,page-1);renderLevels();});els.pageNext.addEventListener('click',()=>{page=Math.min(49,page+1);renderLevels();});
  els.next.addEventListener('click',()=>startLevel(Math.min(MAX_LEVEL,board.level+1)));
  els.replay.addEventListener('click',()=>startLevel(board.level,{fresh:true}));
  els.settingsBtn.addEventListener('click',openSettings);els.settingsClose.addEventListener('click',()=>closeModal(els.settingsModal,els.settingsBtn));
  els.soundToggle.addEventListener('change',()=>{state.sound=els.soundToggle.checked;if(!state.sound)stopVehicleAudio();persist();});
  bindHold(els.unlock,()=>{state.unlockAll=true;persist();els.unlock.textContent='All levels unlocked ✓';});
  bindHold(els.resetLevel,()=>{delete state.placed[board.level];persist();closeModal(els.settingsModal,els.settingsBtn);startLevel(board.level,{fresh:true});});
  bindHold(els.resetProgress,()=>{const sound=state.sound;state=defaultState();state.sound=sound;persist();closeModal(els.settingsModal,els.settingsBtn);startLevel(1,{fresh:true});});
  [els.levelsModal,els.settingsModal].forEach(modal=>modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal,modal===els.settingsModal?els.settingsBtn:els.levelBtn);}));
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!els.settingsModal.classList.contains('hidden'))closeModal(els.settingsModal,els.settingsBtn);else if(!els.levelsModal.classList.contains('hidden'))closeModal(els.levelsModal,els.levelBtn);});
  window.addEventListener('resize',()=>{if(drag?.active){els.ghost.classList.add('hidden');drag=null;}clearTimeout(idleTimer);meaningfulInteraction();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopVehicleAudio();});

  let initial=state.currentLevel;if(state.stars.includes(initial)&&initial<state.unlocked)initial=state.unlocked;
  const qaLevel = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&#]level=(\d+)/.exec(location.search + location.hash);
  if (qaLevel) initial = Math.max(1, Math.min(MAX_LEVEL, Number(qaLevel[1])));
  startLevel(initial);
  if('serviceWorker'in navigator&&location.protocol!=='file:'&&!/^(localhost|127\.0\.0\.1)$/.test(location.hostname))navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
