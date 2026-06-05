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
  rowsInput: document.querySelector("#rowsInput"),
  colsInput: document.querySelector("#colsInput"),
  minesInput: document.querySelector("#minesInput"),
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

function placeMines(firstIndex) {
  const safeZone = safeZoneFor(firstIndex);
  const candidates = state.cells
    .map((cell) => cell.index)
    .filter((index) => !safeZone.has(index));

  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  candidates.slice(0, state.mines).forEach((index) => {
    state.cells[index].mine = true;
  });

  state.cells.forEach((cell) => {
    cell.adjacent = neighborsOf(cell.index).filter((index) => state.cells[index].mine).length;
  });
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

function paintCell(cell) {
  const button = els.board.children[cell.index];
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
}

function paintBoard() {
  state.cells.forEach(paintCell);
}

function openCell(index) {
  if (state.over) return;
  const cell = state.cells[index];
  if (cell.flagged) return;

  if (!state.started) {
    state.started = true;
    placeMines(index);
    startTimer();
    setMessage("扫雷进行中");
  }

  if (cell.open && cell.adjacent > 0) {
    chordOpen(index);
    return;
  }

  if (cell.mine) {
    loseGame(index);
    return;
  }

  reveal(index);
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

  neighbors.forEach((neighborIndex) => {
    const neighbor = state.cells[neighborIndex];
    if (!neighbor.open && !neighbor.flagged) reveal(neighborIndex);
  });
  paintBoard();
  checkWin();
}

function toggleFlag(index) {
  if (state.over) return;
  const cell = state.cells[index];
  if (cell.open) return;
  cell.flagged = !cell.flagged;
  state.flags += cell.flagged ? 1 : -1;
  paintCell(cell);
  updateCounters();
}

function loseGame(triggerIndex) {
  state.over = true;
  stopTimer();
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
}

function checkWin() {
  if (state.opened !== state.rows * state.cols - state.mines) return;
  state.over = true;
  stopTimer();
  els.resetButton.textContent = "😎";
  setMessage(`完成！用时 ${state.seconds} 秒`);
  state.cells.forEach((cell) => {
    if (cell.mine && !cell.flagged) {
      cell.flagged = true;
      state.flags += 1;
      paintCell(cell);
    }
  });
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

resetGame(PRESETS.beginner);
