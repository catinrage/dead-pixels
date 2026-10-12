# Dead Pixels

A pixel-art incremental game about deleting a corrupted picture. You are the cursor: erase the rock, earn ink, buy upgrades and machines, Defrag for Bits, and catch the Dead Pixel hiding in each picture to restore it.

Version 0.2 is the long-game skeleton: the permanent Bit tree, Restore, Select All, the gallery of pictures with story fragments, the Dead Pixel hunt, and pictures 2 and 3 with their own pixel types.

## Run it

```sh
bun install
bun run dev          # local dev server
bun run build        # type-check, then build the site into dist/
bun run preview      # serve dist/ on http://localhost:4173
```

`bun run build:artifact` makes a single self-contained page in `dist-artifact/index.html` (music stays in `public/music`).

## Test it

```sh
bun run test         # rules: depth, saves and MVP migration, hunt, static, ice, Prism, transmuter
bun run test:e2e     # browser: desktop and phone (needs `bun run build` first)
bun run lint
```

In a container with its own Chromium, set `PW_CHROMIUM=/path/to/chromium` for the browser tests.

## Balance

```sh
bun scripts/balance.ts 5 2             # 5 hours of play, 2 runs per strategy
bun scripts/balance.ts 3 1 --only=alch --log
```

The simulator plays the game headless with four bots (Demolition, Precision, Swarm, Alchemy) and prints when each reached the pacing milestones from the design doc. Flags override the tuning without editing code: `--hp=` and `--yield=` set how fast rock health and ink grow with depth, and `--galaxy=hp,yield,bits` and `--lake=hp,yield,bits` set a picture's multipliers.

## Layout

- `src/content` holds the data: pixel types and the depth curves, both upgrade trees, pictures, tools.
- `src/sim` is the game itself, with no DOM. It runs on a fixed tick, so the same seed and input replay exactly. Saves are versioned JSON, and v1 saves from the MVP migrate.
- `src/client` draws the world and runs the screens. `src/main.ts` wires them together.
- `src/images` paints the procedural pictures and turns generated images into pixel art.
- In the page, `window.__dp` exposes test hooks (state, gain, buy, clearTo, catchDp, defrag, restore, choose).
