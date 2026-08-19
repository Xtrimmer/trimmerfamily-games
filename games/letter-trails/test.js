/* eslint-env node */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gameDir = __dirname;
const repoRoot = path.resolve(gameDir, "..", "..");

function loadBrowserScript(file, extraGlobals = {}) {
  const window = {};
  const sandbox = { window, console, ...extraGlobals };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  return window;
}

function exists(relativePath) {
  return fs.existsSync(path.resolve(repoRoot, relativePath));
}

function nonemptyString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim(), `${label} must not be empty`);
}

function validPoint(point, label) {
  assert.ok(Array.isArray(point), `${label} must be an array`);
  assert.equal(point.length, 2, `${label} must contain x and y`);
  point.forEach((coordinate, index) => {
    assert.equal(typeof coordinate, "number", `${label}[${index}] must be numeric`);
    assert.ok(Number.isFinite(coordinate), `${label}[${index}] must be finite`);
    assert.ok(coordinate >= 0 && coordinate <= 100,
      `${label}[${index}] (${coordinate}) must be in the 0..100 coordinate system`);
  });
}

// SVG path command arities. Repeated parameter groups after M are legal and
// interpreted as L by SVG, but still have the same two-coordinate arity.
const PATH_ARITY = Object.freeze({
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0
});

function validateSvgPathData(d, label) {
  nonemptyString(d, label);
  assert.match(d, /^\s*[Mm](?:\s|[-+.0-9])/, `${label} must start with moveto`);

  const tokenPattern = /([a-zA-Z])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  const tokens = [];
  let lastIndex = 0;
  let match;
  while ((match = tokenPattern.exec(d)) !== null) {
    const skipped = d.slice(lastIndex, match.index);
    assert.match(skipped, /^[\s,]*$/, `${label} contains invalid SVG path syntax near ${JSON.stringify(skipped)}`);
    tokens.push(match[1] || Number(match[2]));
    lastIndex = tokenPattern.lastIndex;
  }
  assert.match(d.slice(lastIndex), /^[\s,]*$/, `${label} contains trailing invalid SVG path syntax`);

  let index = 0;
  let command = null;
  let sawMoveto = false;
  while (index < tokens.length) {
    if (typeof tokens[index] === "string") {
      command = tokens[index++];
      const upper = command.toUpperCase();
      assert.ok(Object.hasOwn(PATH_ARITY, upper), `${label} uses unsupported command ${command}`);
      if (!sawMoveto) {
        assert.equal(upper, "M", `${label} must begin with M or m`);
        sawMoveto = true;
      }
      if (upper === "Z") continue;
    }
    assert.ok(command && command.toUpperCase() !== "Z", `${label} has numbers without a path command`);
    const arity = PATH_ARITY[command.toUpperCase()];
    assert.ok(index + arity <= tokens.length, `${label} has an incomplete ${command} command`);
    for (let offset = 0; offset < arity; offset += 1) {
      const value = tokens[index + offset];
      assert.equal(typeof value, "number", `${label} has an incomplete ${command} parameter group`);
      assert.ok(Number.isFinite(value), `${label} contains a non-finite coordinate`);
      // Curved glyphs may intentionally overshoot the nominal viewBox by one
      // unit for a smooth baseline/descender. Larger excursions are mistakes.
      if (command.toUpperCase() !== "A" || offset !== 3 && offset !== 4) {
        assert.ok(value >= -1 && value <= 101,
          `${label} coordinate ${value} is not normalized near the 0..100 viewBox`);
      }
    }
    index += arity;
  }
  assert.ok(sawMoveto, `${label} must contain a moveto`);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const dataPath = path.join(gameDir, "data.js");
assert.ok(fs.existsSync(dataPath), "games/letter-trails/data.js must exist");
const data = loadBrowserScript(dataPath).LETTER_TRAILS_DATA;

test("exports the versioned Letter Trails data contract", () => {
  assert.ok(data, "data.js must set window.LETTER_TRAILS_DATA");
  assert.equal(data.schemaVersion, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(data.coordinateSystem)), {
    viewBox: "0 0 100 100", min: 0, max: 100
  });
});

test("defines exactly the three approved modes and 62 characters", () => {
  const modes = JSON.parse(JSON.stringify(data.modes));
  assert.deepEqual(modes, [
    { id: "capital", label: "Capitals", count: 26 },
    { id: "lowercase", label: "Lowercase", count: 26 },
    { id: "number", label: "Numbers", count: 10 }
  ]);
  assert.equal(data.capitals.length, 26);
  assert.equal(data.lowercase.length, 26);
  assert.equal(data.numbers.length, 10);
  assert.equal(data.all.length, 62);
  assert.deepEqual(Array.from(data.capitals, entry => entry.display), [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]);
  assert.deepEqual(Array.from(data.lowercase, entry => entry.display), [..."abcdefghijklmnopqrstuvwxyz"]);
  assert.deepEqual(Array.from(data.numbers, entry => entry.display), [..."0123456789"]);
});

test("has unique stable IDs and a complete byId index", () => {
  const ids = data.all.map(entry => entry.id);
  assert.equal(new Set(ids).size, 62, "all character IDs must be unique");
  assert.equal(Object.keys(data.byId).length, 62);
  data.all.forEach(entry => assert.equal(data.byId[entry.id], entry, `${entry.id} must be indexed byId`));
});

test("gives every character complete instructional and companion data", () => {
  const allowedModes = new Set(["capital", "lowercase", "number"]);
  const colors = new Set(Object.values(data.palette));
  data.all.forEach(entry => {
    ["id", "display", "mode", "word", "label", "narration", "accent", "viewBox"]
      .forEach(field => nonemptyString(entry[field], `${entry.id}.${field}`));
    assert.ok(allowedModes.has(entry.mode), `${entry.id}.mode is invalid`);
    assert.equal(entry.viewBox, "0 0 100 100");
    assert.ok(colors.has(entry.accent), `${entry.id}.accent must use the shared palette`);
    assert.equal(typeof entry.strokeWidth, "number");
    assert.ok(entry.strokeWidth > 0 && entry.strokeWidth <= 25, `${entry.id}.strokeWidth is unreasonable`);
    assert.ok(entry.companion && typeof entry.companion === "object", `${entry.id} needs a companion`);
    nonemptyString(entry.companion.name, `${entry.id}.companion.name`);
    nonemptyString(entry.companion.emoji, `${entry.id}.companion.emoji`);
    if (entry.mode === "number") {
      assert.equal(entry.phoneme, null, `${entry.id} must not have a phoneme`);
    } else {
      nonemptyString(entry.phoneme, `${entry.id}.phoneme`);
    }
  });
});

test("provides at least one valid ordered stroke for every character", () => {
  data.all.forEach(entry => {
    assert.ok(Array.isArray(entry.strokes) && entry.strokes.length > 0,
      `${entry.id} must have at least one stroke`);
    entry.strokes.forEach((stroke, strokeIndex) => {
      const label = `${entry.id}.strokes[${strokeIndex}]`;
      assert.ok(stroke && typeof stroke === "object", `${label} must be an object`);
      assert.ok(stroke.type === "path" || stroke.type === "tap", `${label}.type must be path or tap`);
      nonemptyString(stroke.cue, `${label}.cue`);
      validPoint(stroke.start, `${label}.start`);
      validPoint(stroke.end, `${label}.end`);
      if (stroke.type === "path") {
        validateSvgPathData(stroke.d, `${label}.d`);
      } else {
        validPoint(stroke.at, `${label}.at`);
        assert.deepEqual(Array.from(stroke.start), Array.from(stroke.at), `${label}.start must equal at`);
        assert.deepEqual(Array.from(stroke.end), Array.from(stroke.at), `${label}.end must equal at`);
      }
    });
  });
});

test("models lowercase i and j dots as final tap actions", () => {
  ["lowercase-i", "lowercase-j"].forEach(id => {
    const entry = data.byId[id];
    assert.equal(entry.strokes.at(-1).type, "tap", `${id} must end with a dot tap`);
    assert.match(entry.strokes.at(-1).cue, /dot/i);
  });
});

test("uses the approved number quantities and reveal scenes", () => {
  const expected = [
    "empty cookie plate", "sun", "duck", "star", "fish", "apple",
    "flower", "ladybug", "balloon", "crayon"
  ];
  data.numbers.forEach((entry, number) => {
    assert.equal(entry.quantity, number, `${entry.id}.quantity must match its numeral`);
    assert.ok(Array.isArray(entry.reveal), `${entry.id}.reveal must be an array`);
    assert.equal(entry.reveal.length, number, `${entry.id} must reveal ${number} objects`);
    assert.equal(entry.companion.name, expected[number], `${entry.id} has the wrong scene companion`);
    nonemptyString(entry.numberSentence, `${entry.id}.numberSentence`);
    entry.reveal.forEach((symbol, index) => nonemptyString(symbol, `${entry.id}.reveal[${index}]`));
  });
  assert.match(data.byId["number-0"].numberSentence, /zero means none/i);
});

test("keeps the special X phoneme instruction explicit", () => {
  ["capital-x", "lowercase-x"].forEach(id => {
    const entry = data.byId[id];
    assert.equal(entry.word.toLowerCase(), "box");
    assert.equal(entry.phoneme, "/ks/");
    assert.equal(entry.phonemePosition, "final");
    assert.match(entry.narration, /end of box/i);
  });
});

test("is wired into the game hub with a real thumbnail and game entry point", () => {
  const manifestPath = path.join(repoRoot, "games.js");
  const games = loadBrowserScript(manifestPath).GAMES;
  assert.ok(Array.isArray(games), "games.js must export window.GAMES");
  const entries = games.filter(game => game.slug === "letter-trails");
  assert.equal(entries.length, 1, "hub must contain exactly one letter-trails entry");
  const game = entries[0];
  assert.equal(game.name, "Letter Trails");
  assert.match(game.blurb, /trace/i);
  nonemptyString(game.thumb, "letter-trails thumb");
  assert.ok(exists(game.thumb), `hub thumbnail does not exist: ${game.thumb}`);
  assert.ok(exists("games/letter-trails/index.html"), "Letter Trails index.html must exist");
  assert.ok(exists("games/letter-trails/data.js"), "Letter Trails data.js must exist");
  assert.ok(exists("games/letter-trails/app.js"), "Letter Trails app.js must exist");
  assert.ok(exists("games/letter-trails/style.css"), "Letter Trails style.css must exist");
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`\u2713 ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`\u2717 ${name}`);
    console.error(`  ${error.message}`);
  }
}

if (failures) {
  console.error(`\n${failures} of ${tests.length} Letter Trails checks failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${tests.length} Letter Trails checks passed.`);
}
