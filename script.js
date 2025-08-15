const GRID_SIZE = 6;
const TILES = GRID_SIZE * GRID_SIZE; // 36
const REVEAL_INTERVAL_MS = 1100; // slower auto reveal cadence

// Scoring config per round
const STARTING_POINTS = 1000;
const POINTS_PER_TILE_REVEALED = 25; // subtract per reveal
const WRONG_GUESS_PENALTY = 100;
const MIN_ROUND_POINTS = 100;

let images = [];
let roundIndex = 0;
let score = 0;
let currentImage = null;
let revealedCount = 0;
let potentialPoints = STARTING_POINTS;
let intervalId = null;
let tilesOrder = [];
let roundOver = false;
let tilesRef = [];
let isPaused = false;

const photo = document.getElementById('photo');
const grid = document.getElementById('overlayGrid');
function fitGridToImage() {
  // Compute letterboxed area for object-fit: contain and place grid over it
  const container = document.getElementById('imageContainer');
  const img = photo;
  if (!container || !img || !img.naturalWidth || !img.naturalHeight) return;

  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const containerRatio = cw / ch;
  const imageRatio = iw / ih;

  let drawWidth, drawHeight, offsetLeft, offsetTop;
  if (imageRatio > containerRatio) {
    // image limited by width
    drawWidth = cw;
    drawHeight = cw / imageRatio;
    offsetLeft = 0;
    offsetTop = (ch - drawHeight) / 2;
  } else {
    // image limited by height
    drawHeight = ch;
    drawWidth = ch * imageRatio;
    offsetTop = 0;
    offsetLeft = (cw - drawWidth) / 2;
  }

  grid.style.left = `${offsetLeft}px`;
  grid.style.top = `${offsetTop}px`;
  grid.style.width = `${drawWidth}px`;
  grid.style.height = `${drawHeight}px`;


}

const scoreEl = document.getElementById('score');
const roundEl = document.getElementById('round');
const revealedEl = document.getElementById('revealed');
const potentialEl = document.getElementById('potential');
const attributionEl = document.getElementById('attribution');
const buttonsContainer = document.getElementById('buttons');
const pauseBtn = document.getElementById('pauseBtn');

async function fetchImages() {
  const candidates = [
    './sources/images.json',
    '/sources/images.json',
    `${location.origin}/sources/images.json`,
  ];
  let loaded = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        loaded = await res.json();
        break;
      }
    } catch (_) {
      // try next
    }
  }
  if (!loaded) throw new Error('Failed to load images.json');
  images = shuffle([...loaded]);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildGrid() {
  grid.innerHTML = '';
  const tiles = [];
  for (let i = 0; i < TILES; i++) {
    const div = document.createElement('div');
    div.className = 'tile';
    const row = Math.floor(i / GRID_SIZE);
    const col = i % GRID_SIZE;
    if (row === 0) div.classList.add('edge-top');
    if (row === GRID_SIZE - 1) div.classList.add('edge-bottom');
    if (col === 0) div.classList.add('edge-left');
    if (col === GRID_SIZE - 1) div.classList.add('edge-right');
    grid.appendChild(div);
    tiles.push(div);
  }
  tilesRef = tiles;
  return tiles;
}

function planTileRevealOrder() {
  // Random order
  tilesOrder = shuffle([...Array(TILES)].map((_, i) => i));
}

function startAutoReveal(tiles) {
  stopAutoReveal();
  intervalId = setInterval(() => {
    if (roundOver || isPaused) return;
    if (revealedCount >= TILES) return handleRoundEnd(false);
    revealNextTile(tiles);
  }, REVEAL_INTERVAL_MS);
}

function stopAutoReveal() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function revealNextTile(tiles) {
  const idx = tilesOrder[revealedCount];
  const tile = tiles[idx];
  if (!tile) return;
  tile.classList.add('hidden');
  revealedCount += 1;
  potentialPoints = Math.max(
    MIN_ROUND_POINTS,
    STARTING_POINTS - revealedCount * POINTS_PER_TILE_REVEALED
  );
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = String(score);
  revealedEl.textContent = String(revealedCount);
  potentialEl.textContent = String(potentialPoints);
  roundEl.textContent = String(roundIndex + 1);
}

function setAttribution(info) {
  if (!info) {
    attributionEl.textContent = '';
    return;
  }
  const { credit, license, year, source } = info;
  const parts = [];
  if (year) parts.push(year);
  if (credit) parts.push(`© ${credit}`);
  if (license) parts.push(license);
  if (source) {
    attributionEl.innerHTML = `${parts.join(' · ')} · <a href="${source}" target="_blank" rel="noopener noreferrer">source</a>`;
  } else {
    attributionEl.textContent = parts.join(' · ');
  }
}

function loadRound() {
  roundOver = false;
  revealedCount = 0;
  potentialPoints = STARTING_POINTS;
  updateHUD();
  Array.from(buttonsContainer.querySelectorAll('button')).forEach((b) => {
    b.disabled = false;
    b.classList.remove('correct', 'wrong');
  });

  // pick an image and ensure buttons contain all 5 members already
  currentImage = images[roundIndex % images.length];
  if (!currentImage) return;

  // reset aspect ratio until we know the image natural size
  const container = document.getElementById('imageContainer');
  container.style.aspectRatio = '4 / 3';
  photo.src = currentImage.url;
  photo.onload = () => {
    try {
      const { naturalWidth: w, naturalHeight: h } = photo;
      if (w && h) {
        container.style.aspectRatio = `${w} / ${h}`;
      }
    } catch (_) {}
    const tiles = buildGrid();
    planTileRevealOrder();
    fitGridToImage();
    startAutoReveal(tiles);
  };
  setAttribution(currentImage);
}

function handleGuess(guess) {
  if (roundOver) return;
  const correct = currentImage && currentImage.member === guess;

  const allButtons = Array.from(buttonsContainer.querySelectorAll('button'));
  let correctBtn = null;
  let pressedBtn = null;
  allButtons.forEach((btn) => {
    if (btn.dataset.member === currentImage.member) {
      correctBtn = btn;
    }
    if (btn.dataset.member === guess) {
      pressedBtn = btn;
    }
  });
  if (pressedBtn) pressedBtn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct && correctBtn) correctBtn.classList.add('correct');

  if (correct) {
    score += potentialPoints;
    handleRoundEnd(true);
  } else {
    score = Math.max(0, score - WRONG_GUESS_PENALTY);
    updateHUD();
    handleRoundEnd(false);
  }
}

function handleRoundEnd(won) {
  if (roundOver) return;
  roundOver = true;
  stopAutoReveal();
  Array.from(buttonsContainer.querySelectorAll('button')).forEach((b) => (b.disabled = true));
  // reveal full image immediately
  if (tilesRef && tilesRef.length) {
    tilesRef.forEach((t) => t.classList.add('hidden'));
  }
  // show the full image for 2 seconds before advancing
  setTimeout(() => {
    nextRound();
  }, 2000);
}

function nextRound() {
  roundIndex += 1;
  loadRound();
}

function togglePause() {
  isPaused = !isPaused;
  pauseBtn.classList.toggle('paused', isPaused);
  pauseBtn.querySelector('.pause-icon').textContent = isPaused ? '▶' : '⏸';
}

function onGuessClick(e) {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains('guess')) return;
  const member = target.dataset.member;
  if (!member) return;
  handleGuess(member);
}

async function init() {
  try {
    await fetchImages();
  } catch (e) {
    console.error(e);
    alert('Could not load images.json. Make sure you are visiting the site via http://localhost:5173/ (not file://). Try a hard refresh (Cmd+Shift+R).');
    return;
  }
  buttonsContainer.addEventListener('click', onGuessClick);
  pauseBtn.addEventListener('click', togglePause);
  window.addEventListener('resize', fitGridToImage);
  loadRound();
}

document.addEventListener('DOMContentLoaded', init);


