/* Aurora Sudoku — UI, state, motion choreography. */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const board = $('#board');
  const pad = $('#pad');

  const state = {
    puzzle: null,      // starting grid (0 = empty)
    solution: null,
    grid: null,        // current values
    notes: null,       // 9x9 array of Sets
    given: null,       // 9x9 booleans
    selected: null,    // [r, c]
    difficulty: 'medium',
    mistakes: 0,
    hintsLeft: 3,
    seconds: 0,
    timerId: null,
    paused: false,
    won: false,
    notesMode: false,
    history: [],       // undo stack
    completedUnits: new Set(),
  };

  let cells = []; // 81 DOM nodes

  /* ─── Board construction ─── */
  function buildBoard() {
    board.innerHTML = '';
    cells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const el = document.createElement('div');
        el.className = 'cell';
        el.dataset.r = r;
        el.dataset.c = c;
        el.setAttribute('role', 'gridcell');
        el.addEventListener('pointerdown', () => select(r, c));
        board.appendChild(el);
        cells.push(el);
      }
    }
  }

  function buildPad() {
    pad.innerHTML = '';
    for (let v = 1; v <= 9; v++) {
      const b = document.createElement('button');
      b.className = 'key';
      b.dataset.v = v;
      b.innerHTML = `${v}<span class="count"></span>`;
      b.addEventListener('click', () => input(v));
      pad.appendChild(b);
    }
  }

  const cellAt = (r, c) => cells[r * 9 + c];

  /* ─── Rendering ─── */
  function renderCell(r, c) {
    const el = cellAt(r, c);
    const v = state.grid[r][c];
    el.classList.toggle('given', state.given[r][c]);
    el.classList.toggle('user', !state.given[r][c] && v !== 0);
    if (v !== 0) {
      el.innerHTML = `<span class="val">${v}</span>`;
    } else if (state.notes[r][c].size) {
      const marks = Array.from({ length: 9 }, (_, i) =>
        `<i>${state.notes[r][c].has(i + 1) ? i + 1 : ''}</i>`).join('');
      el.innerHTML = `<div class="notes">${marks}</div>`;
    } else {
      el.innerHTML = '';
    }
  }

  function renderAll() {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) renderCell(r, c);
    refreshHighlights();
    refreshPad();
  }

  function refreshHighlights() {
    const sel = state.selected;
    const sv = sel ? state.grid[sel[0]][sel[1]] : 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const el = cellAt(r, c);
        el.classList.remove('selected', 'peer', 'same', 'error');
        if (!sel) continue;
        const [sr, sc] = sel;
        const sameBox = Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3);
        if (r === sr && c === sc) el.classList.add('selected');
        else if (r === sr || c === sc || sameBox) el.classList.add('peer');
        if (sv !== 0 && state.grid[r][c] === sv && !(r === sr && c === sc)) el.classList.add('same');
      }
    }
    // persist error coloring for wrong entries
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const v = state.grid[r][c];
      if (v !== 0 && !state.given[r][c] && v !== state.solution[r][c]) cellAt(r, c).classList.add('error');
    }
  }

  function refreshPad() {
    const counts = new Array(10).fill(0);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) counts[state.grid[r][c]]++;
    pad.querySelectorAll('.key').forEach((b) => {
      const v = +b.dataset.v;
      const left = 9 - counts[v];
      b.querySelector('.count').textContent = left;
      b.classList.toggle('done', left <= 0);
    });
  }

  /* ─── Game flow ─── */
  function newGame(difficulty) {
    state.difficulty = difficulty;
    const { puzzle, solution } = Sudoku.generate(difficulty);
    state.puzzle = puzzle;
    state.solution = solution;
    state.grid = Sudoku.clone(puzzle);
    state.given = puzzle.map((row) => row.map((v) => v !== 0));
    state.notes = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
    state.selected = null;
    state.mistakes = 0;
    state.hintsLeft = 3;
    state.seconds = 0;
    state.won = false;
    state.paused = false;
    state.history = [];
    state.completedUnits = new Set();

    $('#difficulty').textContent = difficulty;
    $('#mistakes').textContent = '0';
    $('#hints-left').textContent = '3';
    $('#timer').textContent = '0:00';

    renderAll();
    dealAnimation();
    startTimer();
    hideOverlay('#ov-new');
    hideOverlay('#ov-win');
  }

  function dealAnimation() {
    // radial stagger from the board center
    cells.forEach((el) => {
      el.classList.remove('dealt');
      const r = +el.dataset.r, c = +el.dataset.c;
      const d = Math.hypot(r - 4, c - 4);
      el.style.animationDelay = `${d * 55}ms`;
    });
    // synchronous reflow restarts the animation — rAF would never fire in a background tab
    void board.offsetWidth;
    cells.forEach((el) => el.classList.add('dealt'));
  }

  function select(r, c) {
    if (state.paused || state.won) return;
    state.selected = [r, c];
    refreshHighlights();
  }

  function pushHistory(r, c) {
    state.history.push({ r, c, v: state.grid[r][c], notes: new Set(state.notes[r][c]) });
    if (state.history.length > 200) state.history.shift();
  }

  function input(v) {
    if (!state.selected || state.paused || state.won) return;
    const [r, c] = state.selected;
    if (state.given[r][c]) return nudge(r, c);

    if (state.notesMode) {
      if (state.grid[r][c] !== 0) return;
      pushHistory(r, c);
      state.notes[r][c].has(v) ? state.notes[r][c].delete(v) : state.notes[r][c].add(v);
      renderCell(r, c);
      return;
    }

    if (state.grid[r][c] === v) return; // no-op

    pushHistory(r, c);
    state.grid[r][c] = v;
    state.notes[r][c].clear();
    renderCell(r, c);

    if (v !== state.solution[r][c]) {
      state.mistakes++;
      const m = $('#mistakes');
      m.textContent = state.mistakes;
      m.classList.remove('hot'); void m.offsetWidth; m.classList.add('hot');
      nudge(r, c);
    } else {
      pruneNotes(r, c, v);
      celebrateUnits(r, c);
      checkWin();
    }
    refreshHighlights();
    refreshPad();
  }

  function nudge(r, c) {
    const el = cellAt(r, c);
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }

  function pruneNotes(r, c, v) {
    for (let i = 0; i < 9; i++) {
      if (state.notes[r][i].delete(v)) renderCell(r, i);
      if (state.notes[i][c].delete(v)) renderCell(i, c);
    }
    const br = r - (r % 3), bc = c - (c % 3);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      if (state.notes[br + i][bc + j].delete(v)) renderCell(br + i, bc + j);
    }
  }

  function unitComplete(coords) {
    return coords.every(([r, c]) => state.grid[r][c] === state.solution[r][c]);
  }

  function celebrateUnits(r, c) {
    const units = [];
    units.push({ key: `r${r}`, coords: Array.from({ length: 9 }, (_, i) => [r, i]) });
    units.push({ key: `c${c}`, coords: Array.from({ length: 9 }, (_, i) => [i, c]) });
    const br = r - (r % 3), bc = c - (c % 3);
    const box = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) box.push([br + i, bc + j]);
    units.push({ key: `b${br}${bc}`, coords: box });

    units.forEach((u) => {
      if (state.completedUnits.has(u.key) || !unitComplete(u.coords)) return;
      state.completedUnits.add(u.key);
      u.coords
        .slice()
        .sort((a, b) => (Math.abs(a[0] - r) + Math.abs(a[1] - c)) - (Math.abs(b[0] - r) + Math.abs(b[1] - c)))
        .forEach(([rr, cc], i) => {
          setTimeout(() => {
            const el = cellAt(rr, cc);
            el.classList.remove('wave'); void el.offsetWidth; el.classList.add('wave');
          }, i * 45);
        });
    });
  }

  function undo() {
    if (state.paused || state.won) return;
    const h = state.history.pop();
    if (!h) return;
    state.grid[h.r][h.c] = h.v;
    state.notes[h.r][h.c] = h.notes;
    state.selected = [h.r, h.c];
    renderCell(h.r, h.c);
    refreshHighlights();
    refreshPad();
  }

  function erase() {
    if (!state.selected || state.paused || state.won) return;
    const [r, c] = state.selected;
    if (state.given[r][c]) return nudge(r, c);
    if (state.grid[r][c] === 0 && !state.notes[r][c].size) return;
    pushHistory(r, c);
    state.grid[r][c] = 0;
    state.notes[r][c].clear();
    renderCell(r, c);
    refreshHighlights();
    refreshPad();
  }

  function hint() {
    if (state.paused || state.won || state.hintsLeft <= 0) return;
    // prefer the selected empty/wrong cell, else a random one
    let target = null;
    const wrongOrEmpty = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (!state.given[r][c] && state.grid[r][c] !== state.solution[r][c]) wrongOrEmpty.push([r, c]);
    }
    if (!wrongOrEmpty.length) return;
    if (state.selected) {
      const [sr, sc] = state.selected;
      if (wrongOrEmpty.some(([r, c]) => r === sr && c === sc)) target = [sr, sc];
    }
    if (!target) target = wrongOrEmpty[Math.floor(Math.random() * wrongOrEmpty.length)];

    const [r, c] = target;
    pushHistory(r, c);
    state.grid[r][c] = state.solution[r][c];
    state.notes[r][c].clear();
    state.hintsLeft--;
    $('#hints-left').textContent = state.hintsLeft;
    state.selected = [r, c];
    renderCell(r, c);
    const el = cellAt(r, c);
    el.classList.add('hinted');
    setTimeout(() => el.classList.remove('hinted'), 800);
    pruneNotes(r, c, state.grid[r][c]);
    celebrateUnits(r, c);
    refreshHighlights();
    refreshPad();
    checkWin();
  }

  /* ─── Win ─── */
  function checkWin() {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (state.grid[r][c] !== state.solution[r][c]) return;
    }
    state.won = true;
    stopTimer();
    // full-board wave sweep, then modal + confetti
    cells.forEach((el) => {
      const r = +el.dataset.r, c = +el.dataset.c;
      setTimeout(() => {
        el.classList.remove('wave'); void el.offsetWidth; el.classList.add('wave');
      }, (r + c) * 55);
    });
    setTimeout(() => {
      const quips = {
        easy: 'A gentle warm-up, elegantly done.',
        medium: 'Sharp mind, steady hand.',
        hard: 'That grid never stood a chance.',
        expert: 'Absolute mastery. Take a bow.',
      };
      $('#win-quip').textContent = quips[state.difficulty] || 'Beautiful work.';
      $('#win-time').textContent = fmtTime(state.seconds);
      $('#win-mistakes').textContent = state.mistakes;
      $('#win-hints').textContent = 3 - state.hintsLeft;
      showOverlay('#ov-win');
      confetti();
    }, 1300);
  }

  /* ─── Confetti (canvas particles) ─── */
  function confetti() {
    const canvas = $('#fx');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = ['#faac0f', '#2ebd73', '#ff6a2b', '#ffd166', '#e6e1d7'];
    const parts = Array.from({ length: 160 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 220,
      y: innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 15 - 4,
      w: 5 + Math.random() * 7,
      h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() < 0.3 ? 'circle' : 'rect',
    }));

    let frame = 0;
    (function tick() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach((p) => {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / 220);
        if (p.shape === 'circle') {
          ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      });
      frame++;
      if (frame < 240) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })();
  }

  /* ─── Timer ─── */
  function fmtTime(s) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function startTimer() {
    stopTimer();
    state.timerId = setInterval(() => {
      if (state.paused || state.won) return;
      state.seconds++;
      $('#timer').textContent = fmtTime(state.seconds);
    }, 1000);
  }
  function stopTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
  }

  /* ─── Overlays ─── */
  function showOverlay(sel) { $(sel).classList.add('show'); }
  function hideOverlay(sel) { $(sel).classList.remove('show'); }

  function pause() {
    if (state.won || !state.grid) return;
    state.paused = true;
    showOverlay('#ov-pause');
  }
  function resume() {
    state.paused = false;
    hideOverlay('#ov-pause');
  }

  /* ─── Wiring ─── */
  $('#btn-new').addEventListener('click', () => showOverlay('#ov-new'));
  $('#btn-pause').addEventListener('click', pause);
  $('#btn-resume').addEventListener('click', resume);
  $('#btn-again').addEventListener('click', () => { hideOverlay('#ov-win'); showOverlay('#ov-new'); });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-erase').addEventListener('click', erase);
  $('#btn-hint').addEventListener('click', hint);
  $('#btn-notes').addEventListener('click', () => {
    state.notesMode = !state.notesMode;
    $('#btn-notes').classList.toggle('active', state.notesMode);
    $('#notes-badge').hidden = !state.notesMode;
  });
  $('#btn-theme').addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('sudoku-theme', next); } catch (e) {}
  });

  document.querySelectorAll('.diff-btn').forEach((b) =>
    b.addEventListener('click', () => newGame(b.dataset.diff)));

  document.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '9') return input(+e.key);
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') return erase();
    if (e.key === 'n' || e.key === 'N') return $('#btn-notes').click();
    if (e.key === 'u' || e.key === 'U' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) return undo();
    if (e.key === 'h' || e.key === 'H') return hint();
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') return state.paused ? resume() : pause();
    if (e.key.startsWith('Arrow') && state.grid) {
      e.preventDefault();
      let [r, c] = state.selected || [4, 4];
      if (e.key === 'ArrowUp') r = (r + 8) % 9;
      if (e.key === 'ArrowDown') r = (r + 1) % 9;
      if (e.key === 'ArrowLeft') c = (c + 8) % 9;
      if (e.key === 'ArrowRight') c = (c + 1) % 9;
      select(r, c);
    }
  });

  /* ─── Boot ─── */
  try {
    const saved = localStorage.getItem('sudoku-theme');
    if (saved) document.documentElement.dataset.theme = saved;
  } catch (e) {}
  buildBoard();
  buildPad();
  showOverlay('#ov-new');
  window.__sudoku = { state, input, select };
})();
