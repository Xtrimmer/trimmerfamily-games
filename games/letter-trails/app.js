(function () {
  "use strict";

  const DATA = window.LETTER_TRAILS_DATA;
  if (!DATA || !Array.isArray(DATA.all)) throw new Error("Letter Trails data did not load.");

  const $ = (selector) => document.querySelector(selector);
  const NS = "http://www.w3.org/2000/svg";
  const STORAGE_KEY = "letter-trails-state-v1";
  const MODE_ALIASES = { capitals: "capital", lowercase: "lowercase", numbers: "number" };
  const MODE_TO_TAB = { capital: "capitals", lowercase: "lowercase", number: "numbers" };
  const cheerLines = ["You did it!", "Wonderful tracing!", "Great job!", "Trail complete!"];

  const els = {
    picker: $("#picker-view"), trace: $("#trace-view"), grid: $("#character-grid"), explored: $("#explored-count"), back: $("#back-btn"),
    help: $("#help-btn"), settings: $("#settings-btn"), settingsModal: $("#settings-modal"), settingsClose: $("#settings-close"),
    narrationToggle: $("#narration-toggle"), effectsToggle: $("#effects-toggle"), resetDemos: $("#reset-demos"), resetProgress: $("#reset-progress"), storageNote: $("#storage-note"),
    kicker: $("#trace-kicker"), title: $("#trace-title"), instruction: $("#instruction"), wordSticker: $("#word-sticker"),
    card: $("#trace-card"), svg: $("#trace-svg"), guides: $("#guide-layer"), progress: $("#progress-layer"), cues: $("#cue-layer"), companion: $("#companion"),
    strokeCount: $("#stroke-count"), choose: $("#choose-btn"), celebration: $("#celebration"), confetti: $("#confetti"), celebrationFriend: $("#celebration-friend"), celebrationTitle: $("#celebration-title"), celebrationCopy: $("#celebration-copy"), again: $("#again-btn"), celebrationChoose: $("#celebration-choose-btn")
  };

  let storageAvailable = true;
  let saved = loadState();
  let mode = saved.mode && DATA.modes.some(m => m.id === saved.mode) ? saved.mode : "capital";
  let item = null;
  let strokeIndex = 0;
  let progressPaths = [];
  let guidePaths = [];
  let dragging = false;
  let pointerId = null;
  let progressLength = 0;
  let departures = 0;
  let helpTimer = 0;
  let demoFrame = 0;
  let cueFrame = 0;
  let resetHoldTimer = 0;
  let audioContext = null;

  function defaultState() {
    return { version: 1, mode: "capital", completed: [], demos: [], narration: true, effects: true };
  }

  function loadState() {
    const fallback = defaultState();
    try {
      const probe = "__letter_trails_probe__";
      localStorage.setItem(probe, "1"); localStorage.removeItem(probe);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        ...fallback, ...parsed, version: 1,
        completed: Array.isArray(parsed.completed) ? parsed.completed.filter(id => DATA.byId[id]) : [],
        demos: Array.isArray(parsed.demos) ? parsed.demos.filter(id => DATA.byId[id]) : []
      };
    } catch (_) {
      storageAvailable = false;
      return fallback;
    }
  }

  function persist() {
    if (!storageAvailable) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); }
    catch (_) { storageAvailable = false; els.storageNote.classList.remove("hidden"); }
  }

  function setView(name) {
    const tracing = name === "trace";
    els.picker.classList.toggle("active", !tracing);
    els.trace.classList.toggle("active", tracing);
    els.help.classList.toggle("hidden", !tracing);
    if (!tracing) stopAnimations();
  }

  function entriesForMode(which = mode) {
    return DATA.all.filter(entry => entry.mode === which);
  }

  function renderPicker() {
    document.querySelectorAll("[role=tab]").forEach(tab => {
      tab.setAttribute("aria-selected", String(MODE_ALIASES[tab.dataset.mode] === mode));
    });
    const entries = entriesForMode();
    const done = new Set(saved.completed);
    els.explored.textContent = `${entries.filter(entry => done.has(entry.id)).length} of ${entries.length} explored`;
    els.grid.replaceChildren(...entries.map(entry => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "character-tile";
      button.style.setProperty("--accent", entry.accent);
      button.setAttribute("aria-label", `${entry.mode === "number" ? "Number" : entry.mode === "capital" ? "Capital" : "Lowercase"} ${entry.display}${done.has(entry.id) ? ", explored" : ""}`);
      button.innerHTML = `<span class="tile-char">${entry.display}</span>${done.has(entry.id) ? '<span class="tile-star" aria-hidden="true">★</span>' : ""}`;
      button.addEventListener("click", () => openCharacter(entry));
      return button;
    }));
  }

  function openCharacter(next) {
    item = next;
    strokeIndex = 0;
    progressLength = 0;
    departures = 0;
    setView("trace");
    renderCharacter();
    const firstTime = !saved.demos.includes(item.id);
    if (firstTime) {
      saved.demos.push(item.id); persist();
      setTimeout(() => playDemo(true), 380);
    } else {
      announceIntro();
      armInactivityHint();
    }
  }

  function renderCharacter() {
    stopAnimations();
    els.card.style.setProperty("--accent", item.accent);
    els.wordSticker.textContent = item.companion.emoji;
    const kind = item.mode === "capital" ? "Capital" : item.mode === "lowercase" ? "Lowercase" : "Number";
    els.kicker.textContent = `${kind} ${item.display}`;
    els.title.textContent = item.mode === "number" ? item.numberSentence : `${item.display} is for ${item.word}`;
    els.companion.textContent = item.companion.emoji;
    els.guides.replaceChildren(); els.progress.replaceChildren(); els.cues.replaceChildren();
    progressPaths = []; guidePaths = [];

    item.strokes.forEach((stroke, index) => {
      if (stroke.type === "tap") {
        const halo = svgEl("circle", { cx: stroke.at[0], cy: stroke.at[1], r: 7, class: "guide-halo" });
        const dot = svgEl("circle", { cx: stroke.at[0], cy: stroke.at[1], r: 2.2, class: "guide-path" });
        const filled = svgEl("circle", { cx: stroke.at[0], cy: stroke.at[1], r: 6, class: "progress-path", opacity: 0 });
        els.guides.append(halo, dot); els.progress.append(filled);
        guidePaths.push(null); progressPaths.push(filled);
      } else {
        const halo = svgEl("path", { d: stroke.d, class: "guide-halo" });
        const guide = svgEl("path", { d: stroke.d, class: "guide-path" });
        const complete = svgEl("path", { d: stroke.d, class: "progress-path" });
        els.guides.append(halo, guide); els.progress.append(complete);
        complete.dataset.totalLength = String(complete.getTotalLength());
        setPathProgress(complete, 0);
        guidePaths.push(guide); progressPaths.push(complete);
      }
    });
    updateStrokeVisuals();
  }

  function svgEl(tag, attrs) {
    const element = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  // Reveal an explicit dash from the start of the path instead of moving one
  // full-length dash with stroke-dashoffset. The latter can disappear on
  // perfectly vertical SVG paths in some browser/GPU combinations.
  function setPathProgress(path, ratio) {
    const total = Number(path.dataset.totalLength) || path.getTotalLength();
    const clamped = Math.max(0, Math.min(1, ratio));
    path.style.strokeDashoffset = "0";
    if (clamped <= 0) {
      path.style.opacity = "0";
      path.style.strokeDasharray = `0 ${total + 1}`;
    } else if (clamped >= .999) {
      path.style.opacity = "1";
      path.style.strokeDasharray = "none";
    } else {
      path.style.opacity = "1";
      path.style.strokeDasharray = `${Math.max(.01, total * clamped)} ${total + 1}`;
    }
  }

  function updateStrokeVisuals() {
    els.cues.replaceChildren();
    item.strokes.forEach((stroke, index) => {
      const isCurrent = index === strokeIndex;
      const group = svgEl("g", { class: isCurrent ? "cue-active" : "" });
      const ring = svgEl("circle", { cx: stroke.start[0], cy: stroke.start[1], r: isCurrent ? 5.8 : 4.8, class: "start-ring", opacity: index < strokeIndex ? .35 : 1 });
      const label = svgEl("text", { x: stroke.start[0], y: stroke.start[1], class: "start-number", opacity: index < strokeIndex ? .4 : 1 });
      label.textContent = index + 1;
      group.append(ring, label); els.cues.append(group);
    });
    const stroke = item.strokes[strokeIndex];
    if (!stroke) return;
    progressLength = 0;
    setCompanion(stroke.start[0], stroke.start[1]);
    els.companion.classList.add("waiting");
    els.strokeCount.textContent = `${stroke.type === "tap" ? "Dot" : "Stroke"} ${strokeIndex + 1} of ${item.strokes.length}`;
    els.instruction.textContent = stroke.type === "tap"
      ? `Tap the glowing dot for number ${strokeIndex + 1}.`
      : `Drag the ${item.companion.name} from number ${strokeIndex + 1}.`;
    startDirectionCue();
  }

  function setCompanion(x, y) {
    els.companion.style.left = `${x}%`;
    els.companion.style.top = `${y}%`;
  }

  function pointFromEvent(event) {
    const point = els.svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const matrix = els.svg.getScreenCTM();
    return matrix ? point.matrixTransform(matrix.inverse()) : { x: 0, y: 0 };
  }

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function onPointerDown(event) {
    if (!item || demoFrame || strokeIndex >= item.strokes.length) return;
    const stroke = item.strokes[strokeIndex];
    const p = pointFromEvent(event);
    const expected = stroke.type === "tap" ? { x: stroke.at[0], y: stroke.at[1] } : pointAtCurrent();
    const corridor = departures >= 2 ? 20 : 15;
    if (distance(p, expected) > corridor) {
      departures++;
      hintCurrentStroke();
      return;
    }
    event.preventDefault();
    if (stroke.type === "tap") { completeStroke(); return; }
    dragging = true; pointerId = event.pointerId;
    els.card.setPointerCapture?.(pointerId);
    els.companion.classList.remove("waiting");
    clearTimeout(helpTimer);
  }

  function onPointerMove(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    event.preventDefault();
    const p = pointFromEvent(event);
    const path = progressPaths[strokeIndex];
    const total = path.getTotalLength();
    const currentRatio = progressLength / total;
    const minRatio = Math.max(0, currentRatio - .025);
    const maxRatio = Math.min(1, currentRatio + (departures >= 2 ? .22 : .14));
    let best = { dist: Infinity, len: progressLength, point: path.getPointAtLength(progressLength) };
    const samples = departures >= 2 ? 34 : 24;
    for (let i = 0; i <= samples; i++) {
      const len = total * (minRatio + (maxRatio - minRatio) * i / samples);
      const candidate = path.getPointAtLength(len);
      const d = distance(p, candidate);
      if (d < best.dist) best = { dist: d, len, point: candidate };
    }
    const corridor = departures >= 2 ? 21 : 15;
    if (best.dist > corridor) {
      departures++;
      dragging = false;
      els.companion.classList.add("waiting");
      hintCurrentStroke();
      return;
    }
    if (best.len > progressLength) progressLength = best.len;
    const snapped = path.getPointAtLength(progressLength);
    setCompanion(snapped.x, snapped.y);
    setPathProgress(path, progressLength / total);
    if (progressLength / total >= .975) completeStroke();
  }

  function onPointerUp(event) {
    if (event.pointerId !== pointerId) return;
    dragging = false; pointerId = null;
    els.companion.classList.add("waiting");
    armInactivityHint();
  }

  function pointAtCurrent() {
    const path = progressPaths[strokeIndex];
    const p = path.getPointAtLength(progressLength);
    return { x: p.x, y: p.y };
  }

  function completeStroke() {
    dragging = false; pointerId = null; clearTimeout(helpTimer);
    const stroke = item.strokes[strokeIndex];
    const path = progressPaths[strokeIndex];
    if (stroke.type === "tap") path.setAttribute("opacity", "1");
    else setPathProgress(path, 1);
    setCompanion(stroke.end[0], stroke.end[1]);
    sparkleTone();
    strokeIndex++;
    if (strokeIndex >= item.strokes.length) {
      setTimeout(completeCharacter, 350);
    } else {
      departures = 0;
      setTimeout(() => { updateStrokeVisuals(); armInactivityHint(); }, 300);
    }
  }

  function hintCurrentStroke() {
    const stroke = item.strokes[strokeIndex];
    if (!stroke) return;
    els.instruction.textContent = `${stroke.cue || "Follow the glowing trail"}. Start at number ${strokeIndex + 1}.`;
    speak(stroke.cue || "Follow the glowing trail");
    armInactivityHint();
  }

  function armInactivityHint() {
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => hintCurrentStroke(), 4000);
  }

  function announceIntro() {
    speak(item.narration);
  }

  function playDemo(firstTime = false) {
    if (!item) return;
    stopAnimations();
    strokeIndex = 0;
    progressPaths.forEach(path => {
      if (path.tagName === "circle") path.setAttribute("opacity", "0");
      else setPathProgress(path, 0);
    });
    updateStrokeVisuals();
    speak(item.narration);
    let active = 0;
    let start = 0;
    const animate = (now) => {
      if (!start) start = now;
      const stroke = item.strokes[active];
      const elapsed = now - start;
      if (stroke.type === "tap") {
        if (elapsed > 620) progressPaths[active].setAttribute("opacity", "1");
        setCompanion(stroke.at[0], stroke.at[1]);
      } else {
        const path = progressPaths[active];
        const total = path.getTotalLength();
        const ratio = Math.min(1, elapsed / Math.max(900, total * 15));
        const eased = ratio * ratio * (3 - 2 * ratio);
        const p = path.getPointAtLength(total * eased);
        setPathProgress(path, eased);
        setCompanion(p.x, p.y);
      }
      const duration = stroke.type === "tap" ? 850 : Math.max(900, progressPaths[active].getTotalLength() * 15);
      if (elapsed >= duration) {
        active++; start = now;
        if (active >= item.strokes.length) {
          demoFrame = 0;
          setTimeout(() => {
            strokeIndex = 0;
            progressPaths.forEach(path => path.tagName === "circle" ? path.setAttribute("opacity", "0") : setPathProgress(path, 0));
            updateStrokeVisuals();
            els.instruction.textContent = firstTime ? `Now it’s your turn—drag the ${item.companion.name} from number 1.` : `Your turn! Start at number 1.`;
            speak(firstTime ? `Now it's your turn. Drag the ${item.companion.name} from number one.` : "Your turn.");
            armInactivityHint();
          }, 350);
          return;
        }
      }
      demoFrame = requestAnimationFrame(animate);
    };
    demoFrame = requestAnimationFrame(animate);
  }

  function startDirectionCue() {
    cancelAnimationFrame(cueFrame);
    const stroke = item && item.strokes[strokeIndex];
    if (!stroke || stroke.type !== "path") return;
    const dot = svgEl("circle", { r: 1.5, class: "direction-dot" });
    els.cues.append(dot);
    const path = progressPaths[strokeIndex];
    const total = path.getTotalLength();
    let origin = performance.now();
    const loop = (now) => {
      const ratio = ((now - origin) % 1800) / 1800;
      const p = path.getPointAtLength(total * ratio);
      dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y);
      cueFrame = requestAnimationFrame(loop);
    };
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) cueFrame = requestAnimationFrame(loop);
  }

  function stopAnimations() {
    cancelAnimationFrame(demoFrame); cancelAnimationFrame(cueFrame);
    demoFrame = 0; cueFrame = 0; clearTimeout(helpTimer);
    window.speechSynthesis?.cancel?.();
  }

  function completeCharacter() {
    if (!saved.completed.includes(item.id)) saved.completed.push(item.id);
    persist();
    const line = cheerLines[Math.floor(Math.random() * cheerLines.length)];
    els.celebrationTitle.textContent = line;
    els.celebrationCopy.textContent = item.mode === "number" ? item.numberSentence + "." : `${item.display} is for ${item.word}.`;
    if (item.mode === "number") {
      els.celebrationFriend.className = "celebration-friend count-scene";
      els.celebrationFriend.textContent = item.quantity === 0 ? "An empty plate — none!" : item.reveal.join(" ");
    } else {
      els.celebrationFriend.className = "celebration-friend";
      els.celebrationFriend.textContent = item.companion.emoji;
    }
    els.celebration.classList.remove("hidden");
    celebrateTone(); makeConfetti();
    speak(`${line} ${els.celebrationCopy.textContent}`);
  }

  function makeConfetti() {
    els.confetti.replaceChildren();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = Object.values(DATA.palette);
    for (let i = 0; i < 34; i++) {
      const piece = document.createElement("i");
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * .45}s`;
      els.confetti.append(piece);
    }
  }

  function speak(text) {
    if (!saved.narration || !text || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replaceAll("/", ""));
    utterance.lang = "en-US"; utterance.rate = .82; utterance.pitch = 1.12;
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find(v => v.lang === "en-US" && /Jenny|Aria|Samantha|Zira|female/i.test(v.name)) || voices.find(v => v.lang === "en-US") || null;
    speechSynthesis.speak(utterance);
  }

  function tone(notes) {
    if (!saved.effects) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const start = audioContext.currentTime;
      notes.forEach(([frequency, offset, duration]) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine"; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(.11, start + offset + .015);
        gain.gain.exponentialRampToValueAtTime(.0001, start + offset + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start + offset); oscillator.stop(start + offset + duration + .02);
      });
    } catch (_) { /* visual feedback remains available */ }
  }
  const sparkleTone = () => tone([[660, 0, .1], [880, .07, .14]]);
  const celebrateTone = () => tone([[523, 0, .2], [659, .16, .2], [784, .32, .3]]);

  function returnToPicker() {
    els.celebration.classList.add("hidden");
    item = null; renderPicker(); setView("picker");
  }

  document.querySelectorAll("[role=tab]").forEach(tab => tab.addEventListener("click", () => {
    mode = MODE_ALIASES[tab.dataset.mode]; saved.mode = mode; persist(); renderPicker();
  }));
  els.card.addEventListener("pointerdown", onPointerDown);
  els.card.addEventListener("pointermove", onPointerMove);
  els.card.addEventListener("pointerup", onPointerUp);
  els.card.addEventListener("pointercancel", onPointerUp);
  els.choose.addEventListener("click", returnToPicker);
  els.celebrationChoose.addEventListener("click", returnToPicker);
  els.back.addEventListener("click", event => { if (item) { event.preventDefault(); returnToPicker(); } });
  els.again.addEventListener("click", () => { els.celebration.classList.add("hidden"); strokeIndex = 0; renderCharacter(); announceIntro(); armInactivityHint(); });
  els.help.addEventListener("click", () => playDemo(false));
  els.settings.addEventListener("click", () => { els.settingsModal.classList.remove("hidden"); els.settingsClose.focus(); });
  els.settingsClose.addEventListener("click", () => { els.settingsModal.classList.add("hidden"); els.settings.focus(); });
  els.settingsModal.addEventListener("click", event => { if (event.target === els.settingsModal) els.settingsClose.click(); });
  els.narrationToggle.addEventListener("change", () => { saved.narration = els.narrationToggle.checked; persist(); if (!saved.narration) window.speechSynthesis?.cancel?.(); });
  els.effectsToggle.addEventListener("change", () => { saved.effects = els.effectsToggle.checked; persist(); });
  els.resetDemos.addEventListener("click", () => { saved.demos = []; persist(); els.resetDemos.textContent = "First-time demos reset ✓"; setTimeout(() => els.resetDemos.textContent = "Replay first-time demos", 1500); });

  function beginResetHold(event) {
    event.preventDefault();
    const start = performance.now();
    els.resetProgress.classList.add("holding");
    const tick = () => {
      const ratio = Math.min(1, (performance.now() - start) / 3000);
      els.resetProgress.style.setProperty("--hold", `${ratio * 100}%`);
      els.resetProgress.textContent = ratio < 1 ? `Keep holding… ${Math.ceil(3 * (1 - ratio))}` : "Progress reset ✓";
      if (ratio >= 1) {
        saved.completed = []; persist(); renderPicker(); resetHoldTimer = 0;
        setTimeout(() => { els.resetProgress.textContent = "Hold to reset progress"; els.resetProgress.classList.remove("holding"); els.resetProgress.style.removeProperty("--hold"); }, 1300);
      } else resetHoldTimer = requestAnimationFrame(tick);
    };
    resetHoldTimer = requestAnimationFrame(tick);
  }
  function cancelResetHold() {
    if (!resetHoldTimer) return;
    cancelAnimationFrame(resetHoldTimer); resetHoldTimer = 0;
    els.resetProgress.textContent = "Hold to reset progress"; els.resetProgress.classList.remove("holding"); els.resetProgress.style.removeProperty("--hold");
  }
  els.resetProgress.addEventListener("pointerdown", beginResetHold);
  els.resetProgress.addEventListener("pointerup", cancelResetHold);
  els.resetProgress.addEventListener("pointerleave", cancelResetHold);
  els.resetProgress.addEventListener("pointercancel", cancelResetHold);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!els.settingsModal.classList.contains("hidden")) els.settingsClose.click();
    else if (!els.celebration.classList.contains("hidden")) returnToPicker();
    else if (item) returnToPicker();
  });
  window.addEventListener("resize", () => { if (item && dragging) { dragging = false; progressLength = 0; const path = progressPaths[strokeIndex]; if (path && path.tagName !== "circle") setPathProgress(path, 0); updateStrokeVisuals(); } });

  els.narrationToggle.checked = saved.narration;
  els.effectsToggle.checked = saved.effects;
  els.storageNote.classList.toggle("hidden", storageAvailable);
  renderPicker();
  if ("serviceWorker" in navigator && location.protocol !== "file:" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
