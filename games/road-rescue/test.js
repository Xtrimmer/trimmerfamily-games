const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Gen = require('./generator.js');
const repoRoot = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(repoRoot, rel));

let checked = 0;
for (let level = 1; level <= 500; level++) {
  const a = Gen.generate(level), b = Gen.generate(level);
  const validation = Gen.validate(a);
  assert.equal(validation.ok, true, `Level ${level}: ${validation.errors.join(', ')}`);
  assert.deepEqual(a, b, `Level ${level} must be deterministic`);
  assert.ok(a.width <= 8 && a.height <= 8, `Level ${level} exceeds grid cap`);
  assert.ok(a.route.length <= 28, `Level ${level} exceeds route cap`);
  assert.ok(a.holes.length >= 1 && a.holes.length <= 7, `Level ${level} hole count invalid`);
  assert.ok(a.pieces.filter(p => p.distractor).length <= 2, `Level ${level} distractor cap exceeded`);
  assert.equal(a.vehicle, Gen.VEHICLES[(level - 1) % 4], `Level ${level} vehicle cycle invalid`);
  assert.equal(a.theme, Gen.THEMES[Math.floor((level - 1) / 5) % 5], `Level ${level} theme cycle invalid`);
  checked++;
}
assert.deepEqual(Gen.generate(1).holes.map(h => [h.type, h.rotation]), [['straight', 0]]);
assert.deepEqual(Gen.generate(2).holes.map(h => [h.type, h.rotation]), [['straight', 90]]);
assert.equal(Gen.generate(3).holes[0].type, 'curve');
assert.equal(Gen.generate(9).holes.some(h => h.type === 'plus'), true, 'Level 9 must introduce an intersection');
assert.equal(Gen.profile(13).rotation, true, 'Level 13 must introduce rotation');
assert.ok(Gen.profile(21).distractors >= 1, 'Level 21 must introduce a distractor');
console.log(`✓ ${checked} deterministic procedural levels validated`);

const html = read('games/road-rescue/index.html');
const css = read('games/road-rescue/style.css');
const app = read('games/road-rescue/app.js');
assert.match(html, /class="control back"[^>]+href="\.\.\/\.\.\//, 'compact Back control missing');
assert.match(html, /id="help-btn"/, 'Help control missing');
assert.match(html, /id="settings-btn"/, 'Settings control missing');
assert.match(html, /id="piece-tray"/, 'piece tray missing');
assert.match(html, /id="sound-toggle"/, 'sound preference missing');
assert.match(html, /<filter[^>]+id="road-glow"[^>]+filterUnits="userSpaceOnUse"/,
  'road glow must use user-space bounds so straight and curved placed pieces render at full size');
assert.match(css, /grid-template-columns:minmax\(320px,1fr\).*minmax\(150px,190px\)/, 'landscape board/tray layout missing');
assert.match(css, /@media \(max-width:700px\)/, 'portrait layout missing');
assert.match(app, /localStorage\.setItem\(SAVE_KEY/, 'local progress persistence missing');
assert.match(app, /setTimeout\(\(\)\s*=>\s*showHint\(false\),\s*8000\)/, 'idle hint timing missing');
assert.match(app, /navigator\.serviceWorker\.register\('sw\.js'\)/, 'offline registration missing');
for (const vehicle of Gen.VEHICLES) assert.ok(exists(`games/road-rescue/audio/${vehicle}.wav`), `${vehicle} sound missing`);
console.log('✓ shell, responsive layout, interaction, persistence, audio, and offline wiring validated');

const context = { window: {} };
vm.runInNewContext(read('games.js'), context);
const entries = context.window.GAMES.filter(g => g.slug === 'road-rescue');
assert.equal(entries.length, 1, 'Road Rescue must appear once in the hub');
assert.ok(exists(entries[0].thumb), 'Road Rescue hub thumbnail missing');
console.log('✓ game hub integration validated');
