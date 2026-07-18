# Sudoku — Aurora

A beautifully animated Sudoku in pure vanilla JS. Zero build, zero dependencies — just open `index.html`.

**Design:** aurora-glass — drifting gradient orbs behind frosted-glass panels, spring-eased motion everywhere.

## Features

- **Full engine** — backtracking generator with a uniqueness guarantee (every puzzle has exactly one solution), symmetric clue digging, 4 difficulties (Easy / Medium / Hard / Expert)
- **Motion design**
  - Radial-stagger board deal-in on new game
  - Spring pop on number placement, shake on mistakes
  - Wave shimmer when a row / column / box completes
  - Full-board victory sweep + canvas confetti
- **Play aids** — pencil notes (auto-pruned as you place digits), 3 hints, undo, erase, per-digit remaining counts, mistake counter, timer, pause
- **Highlighting** — selected cell, peers (row/col/box), and same-number cells
- **Keyboard** — arrows to move, `1–9` to place, `Backspace` erase, `N` notes, `H` hint, `U`/`Ctrl+Z` undo, `P`/`Esc` pause
- **Dark / light themes** (persisted), fully responsive, `prefers-reduced-motion` respected

## Run

Any static server, e.g.:

```sh
npx serve .
```

Or deploy the folder as-is to Cloudflare Pages / GitHub Pages — no build step.

## Files

| File | Purpose |
| --- | --- |
| `sudoku.js` | Engine: generation, solving, uniqueness check, conflict detection |
| `app.js` | Game state, interactions, animation choreography |
| `style.css` | Aurora-glass design system, all keyframes |
| `index.html` | Markup, modals, HUD |
