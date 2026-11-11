/* ============================================================
   BLOCK BLAST ULTRA — logique du jeu
   - Grille 8x8, 3 pièces à la fois, lignes/colonnes complètes éliminées
   - 💡 Mode aide : montre OÙ placer la pièce sélectionnée
   - 🤖 Mode auto : place les blocs tout seul (meilleur coup)
   - 📱 Menu d'installation iOS / Samsung (PWA)
   ============================================================ */
"use strict";

const SIZE = 8;

/* ---------------- Formes des pièces ---------------- */
const SHAPES = [
  [[1]],
  [[1, 1]], [[1], [1]],
  [[1, 1, 1]], [[1], [1], [1]],
  [[1, 1], [1, 1]],
  [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
  [[1, 1, 1], [1, 1]],
  [[1, 1], [1, 1], [1]],
  [[1, 1, 1], [0, 1, 0]],
  [[1], [1], [1, 1]],
  [[1, 1], [0, 1], [0, 1]],
  [[0, 1], [1, 1], [1, 0]],
  [[1, 0], [1, 1], [0, 1]],
  [[1, 1, 1, 1]], [[1], [1], [1], [1]],
  [[1, 1, 1], [1, 0, 0]],
  [[1, 1, 1], [0, 0, 1]],
  [[1, 1], [1, 0], [1, 0]],
  [[1, 1], [0, 1], [0, 1]],
];
const COLORS = ["#6c5ce7", "#00cec9", "#fd79a8", "#fdcb6e", "#55efc4", "#74b9ff", "#ff7675"];

/* ---------------- État ---------------- */
let grid = [];            // grid[y][x] = 0 (vide) ou 1..7 (couleur)
let pieces = [null, null, null]; // {shape, color} ou null
let score = 0;
let best = Number(localStorage.getItem("bb-best") || 0);
let selected = -1;        // index de pièce sélectionnée (-1 = aucune)
let hintOn = false;       // 💡 mode aide
let autoOn = false;       // 🤖 mode auto
let soundOn = localStorage.getItem("bb-sound") !== "0";
let gameOver = false;
let autoTimer = null;

const $ = (id) => document.getElementById(id);
const boardEl = $("board");
const trayEl = $("tray");

/* ============================================================
   AUDIO (WebAudio, aucun fichier externe)
   ============================================================ */
let audioCtx = null;
function beep(freq, dur = 0.08, type = "square", vol = 0.12) {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* audio indisponible : silencieux */ }
}
const sndPlace = () => beep(320, 0.07, "triangle");
const sndClear = () => { beep(660, 0.1, "sine"); setTimeout(() => beep(880, 0.14, "sine"), 90); };
const sndOver  = () => { beep(220, 0.25, "sawtooth"); setTimeout(() => beep(140, 0.4, "sawtooth"), 220); };

/* ============================================================
   OUTILS
   ============================================================ */
const cloneGrid = (g) => g.map((row) => row.slice());

function canPlace(shape, px, py) {
  for (let y = 0; y < shape.length; y++)
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const gx = px + x, gy = py + y;
      if (gx < 0 || gy < 0 || gx >= SIZE || gy >= SIZE) return false;
      if (grid[gy][gx]) return false;
    }
  return true;
}

function anyPlacement(shape) {
  for (let y = 0; y <= SIZE - shape.length; y++)
    for (let x = 0; x <= SIZE - shape[0].length; x++)
      if (canPlace(shape, x, y)) return true;
  return false;
}

/* Évalue un coup : lignes/colonnes complétées + densité */
function evaluate(shape, px, py) {
  const g = cloneGrid(grid);
  let placed = 0;
  for (let y = 0; y < shape.length; y++)
    for (let x = 0; x < shape[y].length; x++)
      if (shape[y][x]) { g[py + y][px + x] = 1; placed++; }

  let full = 0;
  for (let y = 0; y < SIZE; y++) if (g[y].every((v) => v)) full++;
  for (let x = 0; x < SIZE; x++) { let ok = true; for (let y = 0; y < SIZE; y++) if (!g[y][x]) { ok = false; break; } if (ok) full++; }

  // Bonus : rester compact (près du centre et sans créer de trous isolés)
  const cx = px + shape[0].length / 2, cy = py + shape.length / 2;
  const center = 4 - Math.abs(cx - 4) - Math.abs(cy - 4);

  return full * 100 + placed + center * 0.5;
}

/* Meilleur coup pour UNE pièce */
function bestSpotFor(shape) {
  let best = null;
  for (let y = 0; y <= SIZE - shape.length; y++)
    for (let x = 0; x <= SIZE - shape[0].length; x++)
      if (canPlace(shape, x, y)) {
        const v = evaluate(shape, x, y);
        if (!best || v > best.v) best = { x, y, v };
      }
  return best;
}

/* Meilleur coup global (toutes pièces) — utilisé par le mode auto */
function bestMoveGlobal() {
  let best = null;
  pieces.forEach((p, i) => {
    if (!p) return;
    const spot = bestSpotFor(p.shape);
    if (spot && (!best || spot.v > best.v)) best = { index: i, ...spot };
  });
  return best;
}

/* ============================================================
   RENDU
   ============================================================ */
function buildBoard() {
  boardEl.innerHTML = "";
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const c = document.createElement("div");
      c.className = "cell";
      c.dataset.x = x;
      c.dataset.y = y;
      boardEl.appendChild(c);
    }
}

function renderBoard() {
  const cells = boardEl.children;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const c = cells[y * SIZE + x];
      const v = grid[y][x];
      c.className = "cell" + (v ? " filled" : "");
      if (v) c.style.setProperty("--bc", COLORS[v - 1]);
      else c.style.removeProperty("--bc");
    }
}

function pieceEl(piece) {
  const el = document.createElement("div");
  el.className = "piece";
  el.style.gridTemplateColumns = `repeat(${piece.shape[0].length}, 20px)`;
  piece.shape.forEach((row) =>
    row.forEach((v) => {
      const b = document.createElement("div");
      b.className = "block" + (v ? "" : " void");
      if (v) b.style.setProperty("--bc", COLORS[piece.color - 1]);
      el.appendChild(b);
    })
  );
  return el;
}

function renderTray() {
  trayEl.innerHTML = "";
  pieces.forEach((p, i) => {
    const slot = document.createElement("div");
    slot.className = "piece-slot" + (p ? "" : " empty") + (selected === i ? " selected" : "");
    if (p) {
      const el = pieceEl(p);
      if (hintOn && selected === i) el.classList.add("hint-glow");
      slot.appendChild(el);
      bindPiece(slot, el, i);
    }
    trayEl.appendChild(slot);
  });
  $("score").textContent = score;
  $("best").textContent = Math.max(best, score);
}

/* ============================================================
   AIDE (💡) — surligne la meilleure position de la pièce
   ============================================================ */
function clearHints() {
  [...boardEl.children].forEach((c) => c.classList.remove("hint", "ghost"));
}

function showHint(pieceIdx) {
  clearHints();
  if (!hintOn || pieceIdx < 0 || !pieces[pieceIdx]) return;
  const spot = bestSpotFor(pieces[pieceIdx].shape);
  if (!spot) return;
  const shape = pieces[pieceIdx].shape;
  for (let y = 0; y < shape.length; y++)
    for (let x = 0; x < shape[y].length; x++)
      if (shape[y][x]) boardEl.children[(spot.y + y) * SIZE + (spot.x + x)].classList.add("hint");
}

/* ============================================================
   PLACEMENT
   ============================================================ */
function placePiece(idx, px, py) {
  const piece = pieces[idx];
  if (!piece || gameOver) return false;
  if (!canPlace(piece.shape, px, py)) return false;

  // 1. poser les blocs
  let n = 0;
  for (let y = 0; y < piece.shape.length; y++)
    for (let x = 0; x < piece.shape[y].length; x++)
      if (piece.shape[y][x]) { grid[py + y][px + x] = piece.color; n++; }
  score += n;
  sndPlace();

  // 2. lignes / colonnes complètes
  const fullRows = [], fullCols = [];
  for (let y = 0; y < SIZE; y++) if (grid[y].every((v) => v)) fullRows.push(y);
  for (let x = 0; x < SIZE; x++) { let ok = true; for (let y = 0; y < SIZE; y++) if (!grid[y][x]) { ok = false; break; } if (ok) fullCols.push(x); }

  const total = fullRows.length + fullCols.length;
  if (total > 0) {
    // animation de destruction
    fullRows.forEach((y) => { for (let x = 0; x < SIZE; x++) boardEl.children[y * SIZE + x].classList.add("dying"); });
    fullCols.forEach((x) => { for (let y = 0; y < SIZE; y++) boardEl.children[y * SIZE + x].classList.add("dying"); });

    const bonus = 10 * (total * (total + 1)) / 2; // 10, 30, 60, 100…
    score += bonus;
    sndClear();
    if (total >= 2) toast(`COMBO ×${total}  +${bonus} 🎉`);
    else toast(`Ligne ! +${bonus}`);

    setTimeout(() => {
      fullRows.forEach((y) => { for (let x = 0; x < SIZE; x++) grid[y][x] = 0; });
      fullCols.forEach((x) => { for (let y = 0; y < SIZE; y++) grid[y][x] = 0; });
      renderBoard();
      renderTray();
      updateBest();
    }, 280);
  }

  // 3. pièce consommée
  pieces[idx] = null;
  selected = -1;

  // 4. nouvelles pièces si les 3 sont utilisées
  if (pieces.every((p) => p === null)) pieces = [newPiece(), newPiece(), newPiece()];

  // 5. état
  updateBest();
  renderBoard();
  renderTray();
  checkGameOver();
  return true;
}

function updateBest() {
  if (score > best) {
    best = score;
    localStorage.setItem("bb-best", String(best));
  }
  $("best").textContent = best;
}

function checkGameOver() {
  const remaining = pieces.filter(Boolean);
  if (remaining.length === 0) { newRound(); return; }
  if (!remaining.some((p) => anyPlacement(p.shape))) {
    endGame();
  }
}

function newRound() {
  pieces = [newPiece(), newPiece(), newPiece()];
  if (!pieces.some((p) => anyPlacement(p.shape))) { endGame(); return; }
  renderTray();
}

function newPiece() {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  return { shape, color: 1 + Math.floor(Math.random() * COLORS.length) };
}

function endGame() {
  gameOver = true;
  stopAuto();
  updateBest();
  $("final-score").textContent = score;
  $("new-record").classList.toggle("hidden", score < best || score === 0);
  $("overlay").classList.remove("hidden");
  sndOver();
}

function restart() {
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  pieces = [newPiece(), newPiece(), newPiece()];
  score = 0;
  selected = -1;
  gameOver = false;
  $("overlay").classList.add("hidden");
  buildBoard();
  renderBoard();
  renderTray();
}

/* ============================================================
   INTERACTION — tap + glisser-déposer
   ============================================================ */
let drag = null; // {index, moved, ghost}

function bindPiece(slot, el, idx) {
  slot.addEventListener("pointerdown", (e) => {
    if (gameOver) return;
    e.preventDefault();
    drag = { index: idx, moved: false, sx: e.clientX, sy: e.clientY };
    slot.setPointerCapture(e.pointerId);

    // ghost de drag (visible dès le départ pour feedback immédiat)
    const ghost = el.cloneNode(true);
    ghost.id = "drag-ghost";
    ghost.style.display = "grid";
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    moveGhost(e.clientX, e.clientY);
  });

  slot.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 10) drag.moved = true;
    if (drag.moved) {
      moveGhost(e.clientX, e.clientY);
      previewAt(e.clientX, e.clientY);
    }
  });

  slot.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const { index, moved } = drag;
    killGhost();
    if (moved) {
      tryDrop(e.clientX, e.clientY, index);
    } else {
      // simple tap : sélection / dé-sélection
      selected = selected === index ? -1 : index;
      renderTray();
      showHint(selected);
      if (selected >= 0) beep(520, 0.05, "sine", 0.08);
    }
    drag = null;
  });

  slot.addEventListener("pointercancel", () => { killGhost(); drag = null; });
}

function moveGhost(x, y) {
  if (drag && drag.ghost) {
    drag.ghost.style.left = x + "px";
    drag.ghost.style.top = y + "px";
  }
}

function killGhost() {
  if (drag && drag.ghost) { drag.ghost.remove(); drag.ghost = null; }
  clearHints();
}

/* Cellule sous le point */
function cellAt(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  return el && el.closest ? el.closest(".cell") : null;
}

/* Aperçu fantôme pendant le drag */
function previewAt(clientX, clientY) {
  if (!drag) return;
  clearHints();
  const cell = cellAt(clientX, clientY);
  const piece = pieces[drag.index];
  if (!cell || !piece) return;
  const px = +cell.dataset.x, py = +cell.dataset.y;
  const shape = piece.shape;
  const ok = canPlace(shape, px, py);
  for (let y = 0; y < shape.length; y++)
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const gx = px + x, gy = py + y;
      if (gx >= SIZE || gy >= SIZE) continue;
      const c = boardEl.children[gy * SIZE + gx];
      if (c) c.classList.add(ok ? "ghost" : "hint");
    }
}

/* Déposer à une position écran */
function tryDrop(clientX, clientY, idx) {
  const cell = cellAt(clientX, clientY);
  clearHints();
  if (!cell) return;
  const ok = placePiece(idx, +cell.dataset.x, +cell.dataset.y);
  if (!ok) beep(160, 0.1, "square", 0.1); // refus
}

/* Tap sur la grille (après sélection d'une pièce) */
boardEl.addEventListener("pointerup", (e) => {
  if (gameOver || selected < 0 || drag) return;
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const ok = placePiece(selected, +cell.dataset.x, +cell.dataset.y);
  if (!ok) beep(160, 0.1, "square", 0.1);
});

/* ============================================================
   TOAST
   ============================================================ */
let toastEl = null, toastTimer = null;
function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
}

/* ============================================================
   MODES : AIDE 💡 et AUTO 🤖
   ============================================================ */
function toggleHint() {
  hintOn = !hintOn;
  $("btn-hint").classList.toggle("active", hintOn);
  toast(hintOn ? "💡 Aide ACTIVE — la position idéale s'affiche en vert" : "Aide désactivée");
  if (hintOn && selected >= 0) showHint(selected);
  else clearHints();
}

function toggleAuto() {
  autoOn = !autoOn;
  $("btn-auto").classList.toggle("active", autoOn);
  if (autoOn) {
    selected = -1;
    toast("🤖 AUTO — NOVA place les blocs à ta place !");
    autoStep();
  } else {
    stopAuto();
    toast("Auto désactivé");
  }
}

function stopAuto() {
  autoOn = false;
  clearTimeout(autoTimer);
  $("btn-auto").classList.remove("active");
}

function autoStep() {
  if (!autoOn || gameOver) return;
  const move = bestMoveGlobal();
  if (!move) { endGame(); return; }

  // sélection visuelle puis placement (laisse le temps de voir)
  selected = move.index;
  renderTray();
  showHint(move.index);

  autoTimer = setTimeout(() => {
    if (!autoOn || gameOver) return;
    const again = bestMoveGlobal();
    if (again) placePiece(again.index, again.x, again.y);
    autoTimer = setTimeout(autoStep, 550);
  }, 650);
}

/* ============================================================
   MENU D'INSTALLATION 📱
   ============================================================ */
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Sur Android/Chrome : on montre directement le bouton natif
  $("install-native").classList.remove("hidden");
});

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

function openInstall() {
  const ios = isIOS();
  const android = isAndroid();
  $("install-ios").classList.toggle("hidden", !ios);
  $("install-android").classList.toggle("hidden", !android || !!deferredPrompt);
  $("install-native").classList.toggle("hidden", !deferredPrompt);
  $("install-desktop").classList.toggle("hidden", ios || android || !!deferredPrompt);
  $("install-modal").classList.remove("hidden");
}

async function nativeInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  toast(outcome === "accepted" ? "✅ Installation lancée !" : "Installation annulée");
  deferredPrompt = null;
  $("install-modal").classList.add("hidden");
}

/* ============================================================
   SON
   ============================================================ */
function toggleSound() {
  soundOn = !soundOn;
  localStorage.setItem("bb-sound", soundOn ? "1" : "0");
  $("btn-sound").textContent = soundOn ? "🔊" : "🔇";
  if (soundOn) beep(600, 0.07, "sine");
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  buildBoard();
  restart();
  $("btn-hint").addEventListener("click", toggleHint);
  $("btn-auto").addEventListener("click", toggleAuto);
  $("btn-install").addEventListener("click", openInstall);
  $("btn-sound").addEventListener("click", toggleSound);
  $("modal-close").addEventListener("click", () => $("install-modal").classList.add("hidden"));
  $("btn-native-install").addEventListener("click", nativeInstall);
  $("btn-restart").addEventListener("click", restart);
  $("btn-sound").textContent = soundOn ? "🔊" : "🔇";

  // Service worker (hors connexion + installation)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // Masquer l'overlay si on recharge en plein jeu
  window.addEventListener("pagehide", updateBest);
}

init();
