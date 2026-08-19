/* Letter Trails content: normalized to a 0..100 SVG viewBox. */
(function () {
  "use strict";

  const P = {
    cyan: "#5cc8ff", green: "#3ddc84", pink: "#ff5470",
    gold: "#ffcc33", aqua: "#34d9e0", violet: "#b06cff", orange: "#ff8a3d"
  };

  const path = (d, start, end, cue) => ({ type: "path", d, start, end, cue });
  const tap = (at, cue) => ({ type: "tap", at, start: at, end: at, cue });
  const item = (id, display, mode, word, sound, companionName, emoji, accent, strokes, extra) => ({
    id, display, mode, word,
    label: word,
    phoneme: mode === "number" ? null : sound,
    narration: mode === "number"
      ? `${display}. ${extra && extra.numberSentence ? extra.numberSentence : word}.`
      : `${mode === "capital" ? "Capital" : "Lowercase"} ${display}. ${display} says ${sound}, as in ${word}.`,
    companion: { name: companionName, emoji },
    accent,
    viewBox: "0 0 100 100",
    strokeWidth: 14,
    strokes,
    ...(extra || {})
  });

  const capitals = [
    item("capital-a", "A", "capital", "Apple", "/ă/", "apple", "🍎", P.pink, [
      path("M18 88 L50 14", [18,88], [50,14], "Up to the top"),
      path("M50 14 L82 88", [50,14], [82,88], "Slant down"),
      path("M31 60 L69 60", [31,60], [69,60], "Across")]),
    item("capital-b", "B", "capital", "Ball", "/b/", "ball", "🏀", P.gold, [
      path("M24 14 L24 88", [24,14], [24,88], "Down"),
      path("M24 14 C76 10 78 48 24 50", [24,14], [24,50], "Around the top"),
      path("M24 50 C82 48 82 90 24 88", [24,50], [24,88], "Around the bottom")]),
    item("capital-c", "C", "capital", "Cat", "/k/", "cat", "🐱", P.cyan, [
      path("M80 25 C65 8 25 11 20 49 C16 84 61 96 81 76", [80,25], [81,76], "Around and stop")]),
    item("capital-d", "D", "capital", "Dinosaur", "/d/", "dinosaur", "🦕", P.green, [
      path("M23 14 L23 88", [23,14], [23,88], "Down"),
      path("M23 14 C82 12 88 83 23 88", [23,14], [23,88], "Around")]),
    item("capital-e", "E", "capital", "Elephant", "/ĕ/", "elephant", "🐘", P.violet, [
      path("M25 14 L25 88", [25,14], [25,88], "Down"),
      path("M25 14 L79 14", [25,14], [79,14], "Across"),
      path("M25 51 L70 51", [25,51], [70,51], "Across"),
      path("M25 88 L79 88", [25,88], [79,88], "Across")]),
    item("capital-f", "F", "capital", "Fish", "/f/", "fish", "🐟", P.aqua, [
      path("M26 14 L26 88", [26,14], [26,88], "Down"),
      path("M26 14 L80 14", [26,14], [80,14], "Across"),
      path("M26 51 L70 51", [26,51], [70,51], "Across")]),
    item("capital-g", "G", "capital", "Grape", "/g/", "grape", "🍇", P.violet, [
      path("M80 25 C65 8 23 11 19 50 C16 87 62 96 82 72 L82 55 L57 55", [80,25], [57,55], "Around, in, and across")]),
    item("capital-h", "H", "capital", "Hat", "/h/", "hat", "🎩", P.orange, [
      path("M24 14 L24 88", [24,14], [24,88], "Down"),
      path("M76 14 L76 88", [76,14], [76,88], "Down"),
      path("M24 51 L76 51", [24,51], [76,51], "Across")]),
    item("capital-i", "I", "capital", "Igloo", "/ĭ/", "igloo", "🧊", P.cyan, [
      path("M50 14 L50 88", [50,14], [50,88], "Down")]),
    item("capital-j", "J", "capital", "Jet", "/j/", "jet", "✈️", P.pink, [
      path("M70 14 L70 70 C70 94 25 95 23 69", [70,14], [23,69], "Down and hook")]),
    item("capital-k", "K", "capital", "Kite", "/k/", "kite", "🪁", P.gold, [
      path("M24 14 L24 88", [24,14], [24,88], "Down"),
      path("M78 14 L24 55", [78,14], [24,55], "Slant in"),
      path("M43 41 L80 88", [43,41], [80,88], "Slant out")]),
    item("capital-l", "L", "capital", "Lion", "/l/", "lion", "🦁", P.orange, [
      path("M27 14 L27 88 L80 88", [27,14], [80,88], "Down and across")]),
    item("capital-m", "M", "capital", "Moon", "/m/", "moon", "🌙", P.violet, [
      path("M16 88 L16 14", [16,88], [16,14], "Up"),
      path("M16 14 L50 58", [16,14], [50,58], "Slant down"),
      path("M50 58 L84 14", [50,58], [84,14], "Slant up"),
      path("M84 14 L84 88", [84,14], [84,88], "Down")]),
    item("capital-n", "N", "capital", "Nose", "/n/", "nose", "👃", P.pink, [
      path("M21 88 L21 14", [21,88], [21,14], "Up"),
      path("M21 14 L79 88", [21,14], [79,88], "Slant down"),
      path("M79 88 L79 14", [79,88], [79,14], "Up")]),
    item("capital-o", "O", "capital", "Orange", "/ŏ/", "orange", "🍊", P.orange, [
      path("M50 13 C20 13 15 34 15 51 C15 76 29 89 50 89 C73 89 85 75 85 51 C85 27 71 13 50 13 Z", [50,13], [50,13], "Around and close")]),
    item("capital-p", "P", "capital", "Pizza", "/p/", "pizza", "🍕", P.pink, [
      path("M24 14 L24 88", [24,14], [24,88], "Down"),
      path("M24 14 C80 9 80 56 24 54", [24,14], [24,54], "Around the top")]),
    item("capital-q", "Q", "capital", "Queen", "/kw/", "queen", "👑", P.gold, [
      path("M50 13 C20 13 15 34 15 51 C15 76 29 89 50 89 C73 89 85 75 85 51 C85 27 71 13 50 13 Z", [50,13], [50,13], "Around and close"),
      path("M59 68 L84 92", [59,68], [84,92], "Slant out")]),
    item("capital-r", "R", "capital", "Rainbow", "/r/", "rainbow", "🌈", P.aqua, [
      path("M23 14 L23 88", [23,14], [23,88], "Down"),
      path("M23 14 C79 9 79 55 23 53", [23,14], [23,53], "Around the top"),
      path("M50 53 L82 88", [50,53], [82,88], "Slant down")]),
    item("capital-s", "S", "capital", "Sun", "/s/", "sun", "☀️", P.gold, [
      path("M78 25 C61 7 24 15 23 37 C22 55 75 48 77 68 C80 94 34 97 19 77", [78,25], [19,77], "Curve, slant, curve")]),
    item("capital-t", "T", "capital", "Tree", "/t/", "tree", "🌳", P.green, [
      path("M15 14 L85 14", [15,14], [85,14], "Across"),
      path("M50 14 L50 88", [50,14], [50,88], "Down")]),
    item("capital-u", "U", "capital", "Umbrella", "/ŭ/", "umbrella", "☂️", P.cyan, [
      path("M20 14 L20 63 C20 97 80 97 80 63 L80 14", [20,14], [80,14], "Down, curve, and up")]),
    item("capital-v", "V", "capital", "Volcano", "/v/", "volcano", "🌋", P.orange, [
      path("M17 14 L50 88", [17,14], [50,88], "Slant down"),
      path("M50 88 L83 14", [50,88], [83,14], "Slant up")]),
    item("capital-w", "W", "capital", "Wagon", "/w/", "wagon", "🛒", P.green, [
      path("M10 14 L29 88", [10,14], [29,88], "Slant down"),
      path("M29 88 L50 43", [29,88], [50,43], "Slant up"),
      path("M50 43 L71 88", [50,43], [71,88], "Slant down"),
      path("M71 88 L90 14", [71,88], [90,14], "Slant up")]),
    item("capital-x", "X", "capital", "Box", "/ks/", "box", "📦", P.gold, [
      path("M20 14 L80 88", [20,14], [80,88], "Slant down"),
      path("M80 14 L20 88", [80,14], [20,88], "Slant down")], { phonemePosition: "final", narration: "Capital X. X says /ks/ at the end of box." }),
    item("capital-y", "Y", "capital", "Yarn", "/y/", "yarn", "🧶", P.pink, [
      path("M18 14 L50 52", [18,14], [50,52], "Slant down"),
      path("M82 14 L50 52 L50 88", [82,14], [50,88], "Slant in and down")]),
    item("capital-z", "Z", "capital", "Zebra", "/z/", "zebra", "🦓", P.violet, [
      path("M18 14 L82 14", [18,14], [82,14], "Across"),
      path("M82 14 L18 88", [82,14], [18,88], "Slant down"),
      path("M18 88 L82 88", [18,88], [82,88], "Across")])
  ];

  const lowercase = [
    item("lowercase-a", "a", "lowercase", "ant", "/ă/", "ant", "🐜", P.pink, [
      path("M65 43 C52 29 25 35 24 58 C23 80 51 85 65 68 C70 61 69 45 65 43 Z", [65,43], [65,43], "Around, up, and close"),
      path("M66 39 L66 82", [66,39], [66,82], "Down")]),
    item("lowercase-b", "b", "lowercase", "butterfly", "/b/", "butterfly", "🦋", P.violet, [
      path("M30 13 L30 82", [30,13], [30,82], "Down"),
      path("M30 39 C39 30 71 33 72 58 C72 82 43 88 30 70", [30,39], [30,70], "Up and around")]),
    item("lowercase-c", "c", "lowercase", "cookie", "/k/", "cookie", "🍪", P.gold, [
      path("M73 44 C61 31 29 33 26 58 C24 81 57 90 74 72", [73,44], [74,72], "Around and stop")]),
    item("lowercase-d", "d", "lowercase", "duck", "/d/", "duck", "🦆", P.green, [
      path("M64 43 C51 29 25 35 24 58 C23 80 51 85 65 68 C70 61 69 45 64 43 Z", [64,43], [64,43], "Around, up, and close"),
      path("M67 13 L67 82", [67,13], [67,82], "Up and down")]),
    item("lowercase-e", "e", "lowercase", "egg", "/ĕ/", "egg", "🥚", P.cyan, [
      path("M25 58 L73 58 C72 35 32 29 25 55 C17 84 58 91 75 72", [25,58], [75,72], "Across, around, and stop")]),
    item("lowercase-f", "f", "lowercase", "flower", "/f/", "flower", "🌼", P.aqua, [
      path("M68 20 C56 8 40 16 40 32 L40 84", [68,20], [40,84], "Curve and down"),
      path("M24 45 L65 45", [24,45], [65,45], "Across")]),
    item("lowercase-g", "g", "lowercase", "goat", "/g/", "goat", "🐐", P.orange, [
      path("M64 42 C51 29 25 35 24 57 C23 79 51 84 65 67 C70 60 69 44 64 42 Z", [64,42], [64,42], "Around and close"),
      path("M67 39 L67 83 C67 101 36 101 28 88", [67,39], [28,88], "Down and hook back")]),
    item("lowercase-h", "h", "lowercase", "house", "/h/", "house", "🏠", P.orange, [
      path("M29 13 L29 83", [29,13], [29,83], "Down"),
      path("M29 51 C39 32 68 34 69 56 L69 83", [29,51], [69,83], "Up, over, and down")]),
    item("lowercase-i", "i", "lowercase", "insect", "/ĭ/", "insect", "🐞", P.cyan, [
      path("M50 39 L50 83", [50,39], [50,83], "Down"), tap([50,22], "Dot")]),
    item("lowercase-j", "j", "lowercase", "jam", "/j/", "jam", "🍓", P.pink, [
      path("M58 39 L58 82 C58 99 32 100 27 87", [58,39], [27,87], "Down and hook"), tap([58,22], "Dot")]),
    item("lowercase-k", "k", "lowercase", "kangaroo", "/k/", "kangaroo", "🦘", P.gold, [
      path("M29 13 L29 83", [29,13], [29,83], "Down"),
      path("M70 37 L29 61", [70,37], [29,61], "Slant in"),
      path("M44 52 L72 83", [44,52], [72,83], "Slant out")]),
    item("lowercase-l", "l", "lowercase", "leaf", "/l/", "leaf", "🍃", P.green, [
      path("M50 13 L50 83", [50,13], [50,83], "Down")]),
    item("lowercase-m", "m", "lowercase", "mouse", "/m/", "mouse", "🐭", P.violet, [
      path("M20 39 L20 83", [20,39], [20,83], "Down"),
      path("M20 51 C27 34 49 35 49 55 L49 83", [20,51], [49,83], "Up, over, and down"),
      path("M49 52 C58 34 80 36 80 56 L80 83", [49,52], [80,83], "Up, over, and down")]),
    item("lowercase-n", "n", "lowercase", "nest", "/n/", "nest", "🪺", P.green, [
      path("M28 39 L28 83", [28,39], [28,83], "Down"),
      path("M28 51 C38 32 70 35 70 57 L70 83", [28,51], [70,83], "Up, over, and down")]),
    item("lowercase-o", "o", "lowercase", "octopus", "/ŏ/", "octopus", "🐙", P.orange, [
      path("M50 34 C25 34 21 51 23 61 C25 83 48 87 61 81 C82 71 79 42 61 36 C58 35 54 34 50 34 Z", [50,34], [50,34], "Around and close")]),
    item("lowercase-p", "p", "lowercase", "pig", "/p/", "pig", "🐷", P.pink, [
      path("M29 39 L29 98", [29,39], [29,98], "Down"),
      path("M29 49 C40 31 71 36 71 58 C71 80 42 86 29 69", [29,49], [29,69], "Up and around")]),
    item("lowercase-q", "q", "lowercase", "quail", "/kw/", "quail", "🐦", P.gold, [
      path("M64 42 C51 29 25 35 24 57 C23 79 51 84 65 67 C70 60 69 44 64 42 Z", [64,42], [64,42], "Around and close"),
      path("M67 39 L67 91 C67 98 76 98 82 91", [67,39], [82,91], "Down and hook back")]),
    item("lowercase-r", "r", "lowercase", "rabbit", "/r/", "rabbit", "🐰", P.aqua, [
      path("M32 39 L32 83", [32,39], [32,83], "Down"),
      path("M32 52 C40 34 60 34 69 42", [32,52], [69,42], "Up and over")]),
    item("lowercase-s", "s", "lowercase", "snake", "/s/", "snake", "🐍", P.green, [
      path("M72 43 C59 29 30 36 30 51 C30 62 67 57 70 70 C74 88 37 91 25 77", [72,43], [25,77], "Curve, slant, curve")]),
    item("lowercase-t", "t", "lowercase", "turtle", "/t/", "turtle", "🐢", P.green, [
      path("M49 20 L49 75 C49 87 65 87 72 80", [49,20], [72,80], "Down"),
      path("M30 43 L69 43", [30,43], [69,43], "Across")]),
    item("lowercase-u", "u", "lowercase", "up", "/ŭ/", "rising balloon", "🎈", P.cyan, [
      path("M27 39 L27 65 C27 89 67 89 68 65 L68 39", [27,39], [68,39], "Down, curve up, and down")]),
    item("lowercase-v", "v", "lowercase", "violin", "/v/", "violin", "🎻", P.violet, [
      path("M24 39 L50 83", [24,39], [50,83], "Slant down"),
      path("M50 83 L76 39", [50,83], [76,39], "Slant up")]),
    item("lowercase-w", "w", "lowercase", "worm", "/w/", "worm", "🪱", P.orange, [
      path("M13 39 L31 83", [13,39], [31,83], "Slant down"),
      path("M31 83 L50 48", [31,83], [50,48], "Slant up"),
      path("M50 48 L69 83", [50,48], [69,83], "Slant down"),
      path("M69 83 L87 39", [69,83], [87,39], "Slant up")]),
    item("lowercase-x", "x", "lowercase", "box", "/ks/", "box", "📦", P.gold, [
      path("M27 39 L73 83", [27,39], [73,83], "Slant down"),
      path("M73 39 L27 83", [73,39], [27,83], "Slant down")], { phonemePosition: "final", narration: "Lowercase x. X says /ks/ at the end of box." }),
    item("lowercase-y", "y", "lowercase", "yo-yo", "/y/", "yo-yo", "🪀", P.pink, [
      path("M24 39 L49 78", [24,39], [49,78], "Slant down"),
      path("M76 39 L45 92 C39 101 28 98 24 91", [76,39], [24,91], "Slant down and back")]),
    item("lowercase-z", "z", "lowercase", "zipper", "/z/", "zipper", "🤐", P.violet, [
      path("M25 39 L76 39", [25,39], [76,39], "Across"),
      path("M76 39 L25 83", [76,39], [25,83], "Slant down"),
      path("M25 83 L76 83", [25,83], [76,83], "Across")])
  ];

  const numerals = [
    item("number-0", "0", "number", "Zero means none", null, "empty cookie plate", "🍽️", P.cyan, [
      path("M50 13 C25 13 20 31 20 51 C20 75 28 89 50 89 C72 89 80 75 80 51 C80 28 71 13 50 13 Z", [50,13], [50,13], "Around and close")], { quantity: 0, numberSentence: "Zero means none", reveal: [] }),
    item("number-1", "1", "number", "one sun", null, "sun", "☀️", P.gold, [
      path("M50 16 L50 88", [50,16], [50,88], "Down")], { quantity: 1, numberSentence: "One sun", reveal: ["☀️"] }),
    item("number-2", "2", "number", "two ducks", null, "duck", "🦆", P.green, [
      path("M23 31 C29 8 72 8 78 30 C83 48 59 61 22 88 L80 88", [23,31], [80,88], "Curve, slant, and across")], { quantity: 2, numberSentence: "Two ducks", reveal: ["🦆","🦆"] }),
    item("number-3", "3", "number", "three stars", null, "star", "⭐", P.gold, [
      path("M25 24 C42 8 76 13 75 34 C74 47 61 51 49 51 C66 50 79 57 77 73 C74 96 39 95 22 78", [25,24], [22,78], "Around, around")], { quantity: 3, numberSentence: "Three stars", reveal: ["⭐","⭐","⭐"] }),
    item("number-4", "4", "number", "four fish", null, "fish", "🐟", P.aqua, [
      path("M67 88 L67 14 L18 64 L83 64", [67,88], [83,64], "Up, slant, and across")], { quantity: 4, numberSentence: "Four fish", reveal: ["🐟","🐟","🐟","🐟"] }),
    item("number-5", "5", "number", "five apples", null, "apple", "🍎", P.pink, [
      path("M77 15 L28 15 L25 50 C40 42 76 46 77 67 C78 94 37 98 20 78", [77,15], [20,78], "Across, down, and around")], { quantity: 5, numberSentence: "Five apples", reveal: ["🍎","🍎","🍎","🍎","🍎"] }),
    item("number-6", "6", "number", "six flowers", null, "flower", "🌼", P.violet, [
      path("M72 22 C46 6 22 29 22 57 C22 90 67 99 78 70 C87 45 55 34 24 56", [72,22], [24,56], "Curve down and around")], { quantity: 6, numberSentence: "Six flowers", reveal: ["🌼","🌼","🌼","🌼","🌼","🌼"] }),
    item("number-7", "7", "number", "seven ladybugs", null, "ladybug", "🐞", P.pink, [
      path("M19 15 L82 15 L39 89", [19,15], [39,89], "Across and slant down")], { quantity: 7, numberSentence: "Seven ladybugs", reveal: ["🐞","🐞","🐞","🐞","🐞","🐞","🐞"] }),
    item("number-8", "8", "number", "eight balloons", null, "balloon", "🎈", P.orange, [
      path("M50 12 C24 12 23 45 50 50 C80 44 76 12 50 12 Z C19 18 18 50 50 50 C79 55 80 89 50 90 C18 90 20 56 50 50", [50,12], [50,50], "Around the top and bottom")], { quantity: 8, numberSentence: "Eight balloons", reveal: ["🎈","🎈","🎈","🎈","🎈","🎈","🎈","🎈"] }),
    item("number-9", "9", "number", "nine crayons", null, "crayon", "🖍️", P.violet, [
      path("M76 46 C45 68 17 50 25 26 C35 0 78 10 78 42 C78 68 64 87 34 90", [76,46], [34,90], "Around, then down")], { quantity: 9, numberSentence: "Nine crayons", reveal: ["🖍️","🖍️","🖍️","🖍️","🖍️","🖍️","🖍️","🖍️","🖍️"] })
  ];

  const all = [...capitals, ...lowercase, ...numerals];
  window.LETTER_TRAILS_DATA = Object.freeze({
    schemaVersion: 1,
    coordinateSystem: { viewBox: "0 0 100 100", min: 0, max: 100 },
    modes: Object.freeze([
      { id: "capital", label: "Capitals", count: 26 },
      { id: "lowercase", label: "Lowercase", count: 26 },
      { id: "number", label: "Numbers", count: 10 }
    ]),
    palette: Object.freeze({ ...P }),
    capitals: Object.freeze(capitals),
    lowercase: Object.freeze(lowercase),
    numbers: Object.freeze(numerals),
    all: Object.freeze(all),
    byId: Object.freeze(Object.fromEntries(all.map(entry => [entry.id, entry])))
  });
})();
