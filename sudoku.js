/* Sudoku engine — generation, solving, validation. Zero dependencies. */
(function (global) {
  'use strict';

  const SIZE = 9;
  const BOX = 3;

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
  }

  function clone(grid) {
    return grid.map((row) => row.slice());
  }

  function isValid(grid, r, c, v) {
    for (let i = 0; i < SIZE; i++) {
      if (grid[r][i] === v || grid[i][c] === v) return false;
    }
    const br = r - (r % BOX);
    const bc = c - (c % BOX);
    for (let i = 0; i < BOX; i++) {
      for (let j = 0; j < BOX; j++) {
        if (grid[br + i][bc + j] === v) return false;
      }
    }
    return true;
  }

  function findEmpty(grid) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === 0) return [r, c];
      }
    }
    return null;
  }

  function fill(grid) {
    const spot = findEmpty(grid);
    if (!spot) return true;
    const [r, c] = spot;
    for (const v of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (isValid(grid, r, c, v)) {
        grid[r][c] = v;
        if (fill(grid)) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }

  function countSolutions(grid, cap) {
    let count = 0;
    (function solve() {
      if (count >= cap) return;
      const spot = findEmpty(grid);
      if (!spot) {
        count++;
        return;
      }
      const [r, c] = spot;
      for (let v = 1; v <= 9; v++) {
        if (isValid(grid, r, c, v)) {
          grid[r][c] = v;
          solve();
          grid[r][c] = 0;
          if (count >= cap) return;
        }
      }
    })();
    return count;
  }

  const CLUES = { easy: 40, medium: 32, hard: 27, expert: 23 };

  function generate(difficulty) {
    const solution = emptyGrid();
    fill(solution);

    const puzzle = clone(solution);
    const targetClues = CLUES[difficulty] || CLUES.medium;
    let clues = SIZE * SIZE;

    // Dig symmetric pairs while keeping the solution unique.
    const cells = shuffled(Array.from({ length: 81 }, (_, i) => i));
    for (const idx of cells) {
      if (clues <= targetClues) break;
      const r = Math.floor(idx / SIZE);
      const c = idx % SIZE;
      const r2 = SIZE - 1 - r;
      const c2 = SIZE - 1 - c;
      const pair = !(r === r2 && c === c2);
      if (puzzle[r][c] === 0) continue;
      if (pair && puzzle[r2][c2] === 0) continue;

      const a = puzzle[r][c];
      const b = pair ? puzzle[r2][c2] : 0;
      puzzle[r][c] = 0;
      if (pair) puzzle[r2][c2] = 0;

      if (countSolutions(clone(puzzle), 2) !== 1) {
        puzzle[r][c] = a;
        if (pair) puzzle[r2][c2] = b;
      } else {
        clues -= pair ? 2 : 1;
      }
    }
    return { puzzle, solution };
  }

  function conflicts(grid, r, c, v) {
    const out = [];
    for (let i = 0; i < SIZE; i++) {
      if (i !== c && grid[r][i] === v) out.push([r, i]);
      if (i !== r && grid[i][c] === v) out.push([i, c]);
    }
    const br = r - (r % BOX);
    const bc = c - (c % BOX);
    for (let i = 0; i < BOX; i++) {
      for (let j = 0; j < BOX; j++) {
        const rr = br + i;
        const cc = bc + j;
        if ((rr !== r || cc !== c) && grid[rr][cc] === v) out.push([rr, cc]);
      }
    }
    return out;
  }

  global.Sudoku = { generate, isValid, conflicts, clone, SIZE, BOX };
})(window);
