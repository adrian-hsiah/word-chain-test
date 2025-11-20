// Five-Word Chain — vanilla JS
// Rules:
// - 5 hidden 5-letter words form a chain: last letter of word[i] == first letter of word[i+1].
// - Game shows first letter of the first word as a green "hint" tile.
// - Typing creates blue tiles (max 5). Backspace removes them.
// - On Enter: if length < 5 => shake + "too short".
//   Else we enforce sequential correctness: we extend the green prefix by however many consecutive correct letters were typed;
//   any extra (incorrect) letters are removed, leaving the player to continue from the new prefix.
// - When a word reaches 5 green tiles, it "slides left" and focus moves to the next word.
// - After finishing the 5th word, stop timer and show results.

const chainEl = document.getElementById("chain");
const statusEl = document.getElementById("status");
const newBtn = document.getElementById("newBtn");
const timerEl = document.getElementById("timer");
const winDialog = document.getElementById("winDialog");
const summaryEl = document.getElementById("summary");

// -------- Utilities --------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pad2 = (n) => (n < 10 ? "0" + n : "" + n);

function shuffle(a){
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseCSV(text){
  // Accept comma or newline separated values
  const raw = text
    .split(/[, \n\r\t]+/g)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  // Letters only, exactly 5 chars
  return raw.filter(w => /^[A-Z]{5}$/.test(w));
}

// -------- Data loading & chain building --------
async function loadWords(){
  const res = await fetch("./words.csv?cache="+Date.now());
  const text = await res.text();
  const words = parseCSV(text);
  if (words.length < 50){
    console.warn("Small word list; consider adding more 5-letter words for better chains.");
  }
  return words;
}

function buildIndexByFirstLetter(words){
  const map = new Map(); // letter -> array of words
  for (const w of words){
    const l = w[0];
    if (!map.has(l)) map.set(l, []);
    map.get(l).push(w);
  }
  return map;
}

function tryBuildChain(words, maxTries=5000){
  // Attempt to build a chain of 5 words with adjacency rule.
  const byFirst = buildIndexByFirstLetter(words);
  for (let t=0; t<maxTries; t++){
    const w1 = words[Math.floor(Math.random()*words.length)];
    const chain = [w1];
    const used = new Set([w1]);
    let ok = true;
    for (let i=1; i<5; i++){
      const prev = chain[i-1];
      const need = prev[4]; // last letter
      const candidates = (byFirst.get(need) || []).filter(w => !used.has(w));
      if (candidates.length === 0){ ok = false; break; }
      const pick = candidates[Math.floor(Math.random()*candidates.length)];
      chain.push(pick);
      used.add(pick);
    }
    if (ok) return chain;
  }
  return null;
}

// -------- Rendering --------
function makeWordEl(){
  const word = document.createElement("div");
  word.className = "word";
  for (let i=0;i<5;i++){
    const tile = document.createElement("div");
    tile.className = "tile hidden";
    tile.textContent = "";
    word.appendChild(tile);
  }
  return word;
}

function renderChain(){
  chainEl.innerHTML = "";
  for (let i=0;i<5;i++){
    chainEl.appendChild(makeWordEl());
  }
}

function setTile(el, ch, cls){
  el.textContent = ch || "";
  el.className = "tile " + (cls || "");
}

function shakeWord(wordEl){
  wordEl.classList.remove("shake");
  // force reflow to restart animation
  void wordEl.offsetWidth;
  wordEl.classList.add("shake");
}

// -------- Game State --------
const game = {
  words: [],        // target words (array of 5 strings)
  idx: 0,           // current word index [0..4]
  typed: "",        // player's current buffer (not yet permanent)
  greenCount: 0,    // how many leading letters are fixed (green) in current word
  timerStart: 0,    // ms timestamp
  timerId: null,    // setInterval id
  active: false,
};

function resetTimer(){
  if (game.timerId) clearInterval(game.timerId);
  timerEl.textContent = "00:00";
}
function startTimer(){
  resetTimer();
  game.timerStart = Date.now();
  game.timerId = setInterval(()=>{
    const secs = Math.floor((Date.now() - game.timerStart)/1000);
    const m = Math.floor(secs/60), s = secs%60;
    timerEl.textContent = `${pad2(m)}:${pad2(s)}`;
  }, 200);
}
function stopTimer(){
  if (game.timerId) clearInterval(game.timerId);
  game.timerId = null;
}

// Initialize visible tiles for current word:
function paintCurrent(){
  const wordEl = chainEl.children[game.idx];
  const tiles = wordEl.querySelectorAll(".tile");

  // Greens first (fixed correct prefix)
  for (let i=0;i<game.greenCount;i++){
    setTile(tiles[i], game.words[game.idx][i], "green");
  }
  // Typed (blue) next
  for (let i=0;i<game.typed.length;i++){
    const pos = game.greenCount + i;
    setTile(tiles[pos], game.typed[i], "blue");
  }
  // Remaining hidden
  for (let i=game.greenCount + game.typed.length; i<5; i++){
    setTile(tiles[i], "", "hidden");
  }
}

// Show starting hint: first letter of the first word is green
function showStartHint(){
  const wordEl = chainEl.children[0];
  const tiles = wordEl.querySelectorAll(".tile");
  setTile(tiles[0], game.words[0][0], "hint green");
}

// Slide current word slightly then advance
async function completeWord(){
  const wordEl = chainEl.children[game.idx];
  wordEl.classList.add("slide-left");
  await sleep(200);
  game.idx += 1;
  game.typed = "";
  game.greenCount = 0;
  statusEl.textContent = game.idx < 5
    ? `Word ${game.idx+1} of 5 — starts with '${game.words[game.idx][0]}'`
    : "";

  if (game.idx < 5){
    // Reveal first letter of the next word as a green hint immediately
    const tiles = chainEl.children[game.idx].querySelectorAll(".tile");
    setTile(tiles[0], game.words[game.idx][0], "hint green");
    game.greenCount = 1;
    paintCurrent();
  } else {
    // All done
    game.active = false;
    stopTimer();
    const time = timerEl.textContent;
    statusEl.textContent = `Solved in ${time}! 🎉`;
    summaryEl.textContent = `Words: ${game.words.join(" → ")} | Time: ${time}`;
    try { winDialog.showModal(); } catch {}
  }
}

// -------- Input handling --------
function onKeyDown(e){
  if (!game.active) return;

  const key = e.key;
  if (key === "Enter"){
    const total = game.greenCount + game.typed.length;
    if (total < 5){
      statusEl.textContent = "Too short.";
      shakeWord(chainEl.children[game.idx]);
      return;
    }
    // Evaluate sequential correctness
    const target = game.words[game.idx];
    let newGreens = game.greenCount;
    // Compare typed characters against target starting at current prefix
    for (let i=0; i<game.typed.length; i++){
      const pos = game.greenCount + i;
      if (game.typed[i] === target[pos]){
        newGreens++;
      } else {
        break; // stop at first mismatch
      }
    }
    game.greenCount = newGreens;

    // Remove any extra characters the player typed beyond the correct prefix
    const keepLen = Math.max(0, game.greenCount - (game.idx === 0 ? 1 : 1)); // we always start each word with 1 revealed
    // But simpler: just clear typed buffer — we'll rebuild as needed
    game.typed = "";

    paintCurrent();

    if (game.greenCount >= 5){
      // Completed word
      completeWord();
    } else {
      // Prompt next letter
      const nextChar = game.words[game.idx][game.greenCount];
      statusEl.textContent = `Good! Next letter is position ${game.greenCount+1}.`;
      // Subtle nudge
      shakeWord(chainEl.children[game.idx]);
    }
    return;
  }

  if (key === "Backspace"){
    if (game.typed.length > 0){
      game.typed = game.typed.slice(0, -1);
      paintCurrent();
    } else {
      // don't allow deleting fixed greens
    }
    return;
  }

  if (/^[a-z]$/i.test(key)){
    if (game.greenCount + game.typed.length >= 5) return;
    game.typed += key.toUpperCase();
    paintCurrent();
    return;
  }
}

// -------- Game boot/reset --------
async function newGame(){
  // Load dictionary (once per page load is fine)
  statusEl.textContent = "Loading words…";
  if (!newGame._cache){
    const list = await loadWords();
    newGame._cache = list;
  }

  statusEl.textContent = "Building chain…";
  let chain = tryBuildChain(newGame._cache);
  let safety = 0;
  while (!chain && safety < 3){
    chain = tryBuildChain(shuffle([...newGame._cache]));
    safety++;
  }
  if (!chain){
    statusEl.textContent = "Could not build a valid chain. Add more words to words.csv.";
    return;
  }

  // Reset visuals & state
  renderChain();

  game.words = chain;
  game.idx = 0;
  game.typed = "";
  game.greenCount = 1; // first tile is revealed
  game.active = true;

  // Paint first word hint
  showStartHint();
  paintCurrent();

  // Timer
  startTimer();

  statusEl.textContent = `Type letters. Press Enter to lock in sequential matches. Word 1 starts with '${game.words[0][0]}'.`;
}

document.addEventListener("keydown", onKeyDown);
newBtn.addEventListener("click", newGame);
window.addEventListener("DOMContentLoaded", newGame);
