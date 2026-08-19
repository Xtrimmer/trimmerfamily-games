# Trimmer Family Games

A small static arcade hosted at **[games.trimmerfamily.us](https://games.trimmerfamily.us)**.
The site is plain HTML/CSS/JS with no build step — the root page lists the games,
and each game lives in its own folder.

## Layout

```
/
├── index.html            # the hub — renders a card per game
├── games.js              # the game list the hub reads
├── assets/
│   ├── hub.css
│   └── thumbs/           # one thumbnail image per game
├── games/
│   ├── arrow-maze/       # a self-contained game (its own index.html)
│   └── letter-trails/    # guided letter and number tracing
└── README.md
```

## Adding a game

1. Drop the game in `games/<slug>/` with its own `index.html` and use only
   relative paths so it works at `/games/<slug>/`.
2. Add a thumbnail to `assets/thumbs/<slug>.png`.
3. Add one entry to `games.js`:

   ```js
   { slug: 'my-game', name: 'My Game', blurb: 'One line about it.', thumb: 'assets/thumbs/my-game.png' }
   ```

The hub picks it up automatically — no need to touch `index.html`.

## Running locally

It's static, so any static server works, e.g.:

```
python3 -m http.server 8080
```

then open <http://localhost:8080>. (Opening `index.html` directly over `file://`
also works, since the hub reads `games.js` via a `<script>` tag, not `fetch`.)

## Hosting

Cloudflare Pages, connected to this repo:

- Framework preset: **None**
- Build command: *(empty)*
- Build output directory: `/` (the repo root)
- Custom domain: `games.trimmerfamily.us`

Every push to `main` redeploys.

## Games

- **Arrow Maze** — tap arrows to slide them off the board; read each lane and
  clear them all without tapping a blocked one. Procedurally generated,
  guaranteed solvable, difficulty climbs with the level.
- **Letter Trails** — trace all 26 capital letters, 26 lowercase letters, and
  numerals 0–9 with guided stroke order, colorful companions, local progress,
  narration, and touch/mouse/stylus support.
