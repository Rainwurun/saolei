const PRESETS = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

const state = {
  rows: 9,
  cols: 9,
  mines: 10,
  cells: [],
  started: false,
  over: false,
  flags: 0,
  opened: 0,
  seconds: 0,
  timerId: null,
  activePreset: "beginner",
  fairMode: true,
  fairGenerated: false,
  hintsEnabled: true,
  hintsLeft: 3,
  hintsUsed: 0,
  combo: 0,
  maxCombo: 0,
  score: 0,
  moves: 0,
  lastActionAt: 0,
};

const els = {
  startScreen: document.querySelector("#startScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  board: document.querySelector("#board"),
  mineCounter: document.querySelector("#mineCounter"),
  timer: document.querySelector("#timer"),
  message: document.querySelector("#messageLine"),
  resetButton: document.querySelector("#resetButton"),
  startButton: document.querySelector("#startButton"),
  menuButton: document.querySelector("#menuButton"),
  newButton: document.querySelector("#newButton"),
  customToggle: document.querySelector("#customToggle"),
  fairModeToggle: document.querySelector("#fairModeToggle"),
  hintToggle: document.querySelector("#hintToggle"),
  rowsInput: document.querySelector("#rowsInput"),
  colsInput: document.querySelector("#colsInput"),
  minesInput: document.querySelector("#minesInput"),
  hintButton: document.querySelector("#hintButton"),
  hintCount: document.querySelector("#hintCount"),
  modeLabel: document.querySelector("#modeLabel"),
  comboLabel: document.querySelector("#comboLabel"),
  scoreLabel: document.querySelector("#scoreLabel"),
  resultPanel: document.querySelector("#resultPanel"),
  rankLabel: document.querySelector("#rankLabel"),
  resultText: document.querySelector("#resultText"),
  presetButtons: [...document.querySelectorAll("[data-preset]")],
};

function formatNumber(value) {
  return String(Math.max(0, value)).padStart(3, "0").slice(-3);
}

function setMessage(text) {
  els.message.textContent = text;
}

function updateCounters() {
  els.mineCounter.textContent = formatNumber(state.mines - state.flags);
  els.timer.textContent = formatNumber(state.seconds);
  updateHud();
}

function updateHud() {
  els.hintCount.textContent = state.hintsLeft;
  els.comboLabel.textContent = `x${state.combo}`;
  els.scoreLabel.textContent = Math.max(0, Math.round(state.score));
  els.modeLabel.textContent = state.fairMode ? (state.started && !state.fairGenerated ? "挑战" : "公平") : "经典";
  els.hintButton.disabled = state.over || !state.hintsEnabled || state.hintsLeft <= 0;
}

function startTimer() {
  if (state.timerId) return;
  state.timerId = window.setInterval(() => {
    state.seconds += 1;
    updateCounters();
  }, 1000);
}

function stopTimer() {
  window.clearInterval(state.timerId);
  state.timerId = null;
}

function clampConfig(config) {
  const rows = Math.min(24, Math.max(8, Number(config.rows) || 9));
  const cols = Math.min(32, Math.max(8, Number(config.cols) || 9));
  const maxMines = Math.max(1, rows * cols - 9);
  const mines = Math.min(maxMines, Math.max(1, Number(config.mines) || 10));
  return { rows, cols, mines };
}

function getCurrentConfig() {
  if (els.customToggle.checked) {
    return clampConfig({
      rows: els.rowsInput.value,
      cols: els.colsInput.value,
      mines: els.minesInput.value,
    });
  }
  return PRESETS[state.activePreset];
}

function makeCells() {
  state.cells = Array.from({ length: state.rows * state.cols }, (_, index) => ({
    index,
    row: Math.floor(index / state.cols),
    col: index % state.cols,
    mine: false,
    open: false,
    flagged: false,
    adjacent: 0,
  }));
}

function neighborsOf(index) {
  const cell = state.cells[index];
  const neighbors = [];
  for (let row = cell.row - 1; row <= cell.row + 1; row += 1) {
    for (let col = cell.col - 1; col <= cell.col + 1; col += 1) {
      if (row === cell.row && col === cell.col) continue;
      if (row < 0 || col < 0 || row >= state.rows || col >= state.cols) continue;
      neighbors.push(row * state.cols + col);
    }
  }
  return neighbors;
}

function safeZoneFor(firstIndex) {
  return new Set([firstIndex, ...neighborsOf(firstIndex)]);
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function clearMines() {
  state.cells.forEach((cell) => {
    cell.mine = false;
    cell.adjacent = 0;
  });
}

function calculateAdjacency() {
  state.cells.forEach((cell) => {
    cell.adjacent = neighborsOf(cell.index).filter((index) => state.cells[index].mine).length;
  });
}

function placeMinesRandom(firstIndex) {
  clearMines();
  const safeZone = safeZoneFor(firstIndex);
  const candidates = state.cells
    .map((cell) => cell.index)
    .filter((index) => !safeZone.has(index));

  shuffle(candidates);
  candidates.slice(0, state.mines).forEach((index) => {
    state.cells[index].mine = true;
  });
  calculateAdjacency();
}

function collectRevealedFrom(index, openedSet) {
  const cell = state.cells[index];
  if (openedSet.has(index) || cell.mine) return;
  openedSet.add(index);
  if (cell.adjacent !== 0) return;

  const queue = [index];
  while (queue.length) {
    const current = queue.shift();
    neighborsOf(current).forEach((neighborIndex) => {
      const neighbor = state.cells[neighborIndex];
      if (openedSet.has(neighborIndex) || neighbor.mine) return;
      openedSet.add(neighborIndex);
      if (neighbor.adjacent === 0) queue.push(neighborIndex);
    });
  }
}

function basicDeductions(openedSet, flaggedSet) {
  const safe = new Set();
  const mines = new Set();
  openedSet.forEach((index) => {
    const cell = state.cells[index];
    if (cell.mine || cell.adjacent === 0) return;
    const neighbors = neighborsOf(index);
    const hidden = neighbors.filter((neighborIndex) => !openedSet.has(neighborIndex) && !flaggedSet.has(neighborIndex));
    const flags = neighbors.filter((neighborIndex) => flaggedSet.has(neighborIndex)).length;
    const remaining = cell.adjacent - flags;

    if (remaining === 0) hidden.forEach((neighborIndex) => safe.add(neighborIndex));
    if (remaining === hidden.length) hidden.forEach((neighborIndex) => mines.add(neighborIndex));
  });
  return { safe, mines };
}

function canSolveWithBasicLogic(firstIndex) {
  const openedSet = new Set();
  const flaggedSet = new Set();
  collectRevealedFrom(firstIndex, openedSet);

  let changed = true;
  while (changed) {
    changed = false;
    const { safe, mines } = basicDeductions(openedSet, flaggedSet);

    mines.forEach((index) => {
      if (!flaggedSet.has(index)) {
        flaggedSet.add(index);
        changed = true;
      }
    });

    safe.forEach((index) => {
      if (!openedSet.has(index) && !state.cells[index].mine) {
        collectRevealedFrom(index, openedSet);
        changed = true;
      }
    });
  }

  return openedSet.size === state.rows * state.cols - state.mines;
}

function placeMines(firstIndex) {
  state.fairGenerated = false;
  const attempts = state.fairMode ? (state.rows * state.cols > 300 ? 35 : 90) : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    placeMinesRandom(firstIndex);
    if (!state.fairMode || canSolveWithBasicLogic(firstIndex)) {
      state.fairGenerated = state.fairMode;
      return;
    }
  }

  placeMinesRandom(firstIndex);
}

function resetGame(config = getCurrentConfig()) {
  const next = clampConfig(config);
  stopTimer();
  state.rows = next.rows;
  state.cols = next.cols;
  state.mines = next.mines;
  state.started = false;
  state.over = false;
  state.flags = 0;
  state.opened = 0;
  state.seconds = 0;
  state.fairMode = els.fairModeToggle.checked;
  state.fairGenerated = false;
  state.hintsEnabled = els.hintToggle.checked;
  state.hintsLeft = state.hintsEnabled ? 3 : 0;
  state.hintsUsed = 0;
  state.combo = 0;
  state.maxCombo = 0;
  state.score = 0;
  state.moves = 0;
  state.lastActionAt = 0;
  els.resultPanel.classList.add("hidden");
  makeCells();
  renderBoard();
  updateCounters();
  setMessage("点击任意格开始");
  els.resetButton.textContent = "🙂";
}

function renderBoard() {
  els.board.innerHTML = "";
  els.board.style.setProperty("--rows", state.rows);
  els.board.style.setProperty("--cols", state.cols);

  state.cells.forEach((cell) => {
    const button = document.createElement("button");
    button.className = "cell";
    button.type = "button";
    button.dataset.index = cell.index;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", `第 ${cell.row + 1} 行第 ${cell.col + 1} 列`);

    let longPressTimer = null;
    let longPressed = false;

    button.addEventListener("click", () => {
      if (longPressed) {
        longPressed = false;
        return;
      }
      openCell(cell.index);
    });

    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      toggleFlag(cell.index);
    });

    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      longPressed = false;
      longPressTimer = window.setTimeout(() => {
        longPressed = true;
        toggleFlag(cell.index);
      }, 430);
    });

    button.addEventListener("pointerup", () => {
      window.clearTimeout(longPressTimer);
    });

    button.addEventListener("pointercancel", () => {
      window.clearTimeout(longPressTimer);
    });

    els.board.appendChild(button);
  });
}

function clearHintMarks() {
  [...els.board.children].forEach((button) => {
    button.classList.remove("hint-safe", "hint-mine");
  });
}

function paintCell(cell) {
  const button = els.board.children[cell.index];
  const hintedSafe = button.classList.contains("hint-safe");
  const hintedMine = button.classList.contains("hint-mine");
  button.className = "cell";
  button.textContent = "";

  if (cell.open) {
    button.classList.add("open");
    if (cell.mine) {
      button.classList.add("mine");
      button.textContent = "✹";
    } else if (cell.adjacent > 0) {
      button.classList.add(`n${cell.adjacent}`);
      button.textContent = cell.adjacent;
    }
    return;
  }

  if (cell.flagged) {
    button.classList.add("flagged");
    button.textContent = "⚑";
  }

  if (hintedSafe) button.classList.add("hint-safe");
  if (hintedMine) button.classList.add("hint-mine");
}

function paintBoard() {
  state.cells.forEach(paintCell);
}

function rewardMove(openedDelta) {
  if (openedDelta <= 0) return;
  const now = Date.now();
  state.combo = now - state.lastActionAt <= 4200 ? state.combo + 1 : 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.lastActionAt = now;
  state.moves += 1;
  state.score += openedDelta * 10 + state.combo * 6;
  updateHud();
}

function openCell(index) {
  if (state.over) return;
  clearHintMarks();
  const cell = state.cells[index];
  if (cell.flagged) return;

  if (!state.started) {
    state.started = true;
    placeMines(index);
    startTimer();
    setMessage(state.fairMode && state.fairGenerated ? "公平盘已生成" : "扫雷进行中");
  }

  if (cell.open && cell.adjacent > 0) {
    chordOpen(index);
    return;
  }

  if (cell.mine) {
    loseGame(index);
    return;
  }

  const before = state.opened;
  reveal(index);
  rewardMove(state.opened - before);
  paintBoard();
  checkWin();
}

function reveal(index) {
  const cell = state.cells[index];
  if (cell.open || cell.flagged) return;
  cell.open = true;
  state.opened += 1;

  if (cell.adjacent !== 0) return;

  const queue = [index];
  while (queue.length) {
    const current = queue.shift();
    neighborsOf(current).forEach((neighborIndex) => {
      const neighbor = state.cells[neighborIndex];
      if (neighbor.open || neighbor.flagged || neighbor.mine) return;
      neighbor.open = true;
      state.opened += 1;
      if (neighbor.adjacent === 0) queue.push(neighborIndex);
    });
  }
}

function chordOpen(index) {
  const cell = state.cells[index];
  const neighbors = neighborsOf(index);
  const flags = neighbors.filter((neighborIndex) => state.cells[neighborIndex].flagged).length;
  if (flags !== cell.adjacent) return;

  for (const neighborIndex of neighbors) {
    const neighbor = state.cells[neighborIndex];
    if (!neighbor.open && !neighbor.flagged && neighbor.mine) {
      loseGame(neighborIndex);
      return;
    }
  }

  const before = state.opened;
  neighbors.forEach((neighborIndex) => {
    const neighbor = state.cells[neighborIndex];
    if (!neighbor.open && !neighbor.flagged) reveal(neighborIndex);
  });
  rewardMove(state.opened - before);
  paintBoard();
  checkWin();
}

function toggleFlag(index) {
  if (state.over) return;
  clearHintMarks();
  const cell = state.cells[index];
  if (cell.open) return;
  cell.flagged = !cell.flagged;
  state.flags += cell.flagged ? 1 : -1;

  if (state.started && cell.flagged) {
    state.moves += 1;
    state.score += cell.mine ? 18 : -12;
  }

  paintCell(cell);
  updateCounters();
}

function currentDeductions() {
  const openedSet = new Set(state.cells.filter((cell) => cell.open).map((cell) => cell.index));
  const flaggedSet = new Set(state.cells.filter((cell) => cell.flagged).map((cell) => cell.index));
  const deductions = basicDeductions(openedSet, flaggedSet);
  return {
    safe: [...deductions.safe].filter((index) => !state.cells[index].open && !state.cells[index].flagged),
    mines: [...deductions.mines].filter((index) => !state.cells[index].open && !state.cells[index].flagged),
  };
}

function useHint() {
  if (state.over || !state.hintsEnabled || state.hintsLeft <= 0) return;
  clearHintMarks();

  if (!state.started) {
    setMessage("先点击一格，再使用提示");
    return;
  }

  const { safe, mines } = currentDeductions();
  let target = null;
  let type = "safe";

  if (mines.length > 0) {
    target = mines[0];
    type = "mine";
  } else if (safe.length > 0) {
    target = safe[0];
  } else {
    const fallback = state.cells.find((cell) => !cell.open && !cell.flagged && !cell.mine);
    if (fallback) target = fallback.index;
  }

  if (target === null) {
    setMessage("当前没有可提示的格子");
    return;
  }

  state.hintsLeft -= 1;
  state.hintsUsed += 1;
  state.score -= 70;
  const button = els.board.children[target];
  button.classList.add(type === "mine" ? "hint-mine" : "hint-safe");
  setMessage(type === "mine" ? "橙框是确定雷，建议插旗" : "绿框是安全建议，可点击");
  updateCounters();
}

function wrongFlagCount() {
  return state.cells.filter((cell) => cell.flagged && !cell.mine).length;
}

function finalScore(won) {
  const base = Math.max(0, state.score);
  const speedBonus = won ? Math.max(0, 360 - state.seconds) * 2 : 0;
  const fairBonus = won && state.fairGenerated ? 180 : 0;
  const comboBonus = state.maxCombo * 18;
  const penalty = state.hintsUsed * 90 + wrongFlagCount() * 55;
  return Math.max(0, Math.round(base + speedBonus + fairBonus + comboBonus - penalty));
}

function rankFor(score, won) {
  if (!won) return "D";
  if (score >= 1800) return "S";
  if (score >= 1200) return "A";
  if (score >= 700) return "B";
  return "C";
}

function showResult(won, score) {
  const rank = rankFor(score, won);
  els.rankLabel.textContent = rank;
  els.resultText.textContent = won
    ? `评分 ${score}，最高连击 x${state.maxCombo}，提示 ${state.hintsUsed} 次`
    : `本局评分 ${score}，最高连击 x${state.maxCombo}，误旗 ${wrongFlagCount()} 个`;
  els.resultPanel.classList.remove("hidden");
  els.scoreLabel.textContent = score;
}

function loseGame(triggerIndex) {
  state.over = true;
  stopTimer();
  clearHintMarks();
  els.resetButton.textContent = "😵";
  setMessage("踩到雷了，重新来一局");

  state.cells.forEach((cell) => {
    if (cell.mine) cell.open = true;
    paintCell(cell);
    if (cell.flagged && !cell.mine) {
      const button = els.board.children[cell.index];
      button.classList.add("wrong");
      button.textContent = "×";
    }
  });

  els.board.children[triggerIndex].classList.add("mine");
  showResult(false, finalScore(false));
  updateHud();
}

function checkWin() {
  if (state.opened !== state.rows * state.cols - state.mines) return;
  state.over = true;
  stopTimer();
  clearHintMarks();
  els.resetButton.textContent = "😎";
  state.cells.forEach((cell) => {
    if (cell.mine && !cell.flagged) {
      cell.flagged = true;
      state.flags += 1;
      paintCell(cell);
    }
  });
  const score = finalScore(true);
  setMessage(`完成！用时 ${state.seconds} 秒`);
  showResult(true, score);
  updateCounters();
}

function showGame() {
  const config = getCurrentConfig();
  els.startScreen.classList.add("hidden");
  els.gameScreen.classList.remove("hidden");
  resetGame(config);
}

function showMenu() {
  stopTimer();
  els.gameScreen.classList.add("hidden");
  els.startScreen.classList.remove("hidden");
}

els.presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    els.customToggle.checked = false;
    setCustomEnabled(false);
    state.activePreset = button.dataset.preset;
    els.presetButtons.forEach((item) => item.classList.toggle("active", item === button));
  });
});

function setCustomEnabled(enabled) {
  [els.rowsInput, els.colsInput, els.minesInput].forEach((input) => {
    input.disabled = !enabled;
  });
  els.presetButtons.forEach((button) => button.classList.toggle("active", !enabled && button.dataset.preset === state.activePreset));
}

els.customToggle.addEventListener("change", () => {
  setCustomEnabled(els.customToggle.checked);
});

[els.rowsInput, els.colsInput, els.minesInput].forEach((input) => {
  input.addEventListener("change", () => {
    const config = getCurrentConfig();
    els.rowsInput.value = config.rows;
    els.colsInput.value = config.cols;
    els.minesInput.value = config.mines;
  });
});

els.startButton.addEventListener("click", showGame);
els.resetButton.addEventListener("click", () => resetGame());
els.newButton.addEventListener("click", () => resetGame());
els.menuButton.addEventListener("click", showMenu);
els.hintButton.addEventListener("click", useHint);

resetGame(PRESETS.beginner);
