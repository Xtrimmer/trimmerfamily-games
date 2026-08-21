/*
 * Game manifest for the hub. To add a game:
 *   1. Drop its folder in games/<slug>/ (with its own index.html).
 *   2. Add an entry here. That's it — the hub renders the cards from this list.
 */
window.GAMES = [
  {
    slug: 'arrow-maze',
    name: 'Arrow Maze',
    blurb: 'Tap an arrow to slide it off the board. Read each lane, clear them all, and don’t tap a blocked one.',
    thumb: 'assets/thumbs/arrow-maze.png',
  },
  {
    slug: 'letter-trails',
    name: 'Letter Trails',
    blurb: 'Trace letters and numbers with colorful friends.',
    thumb: 'assets/thumbs/letter-trails.png',
  },
  {
    slug: 'road-rescue',
    name: 'Road Rescue',
    blurb: 'Drag the missing pieces into place, fix the road, and send the rescue vehicle on its way.',
    thumb: 'assets/thumbs/road-rescue.svg',
  },
];
