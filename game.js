'use strict';

// 두더지 잡기: 화면·입력·소리. 규칙은 logic.js
const L = LOGIC_MOLE;
const $ = (id) => document.getElementById(id);
const INK = '#2b1d52';
const W = 360, H = 560;
const COLS = 3, ROWS = 3, CELL_W = 120, CELL_H = 118, X0 = 0, Y0 = 150;     // 구멍 칸: 칸 전체가 터치 영역이라 손가락으로 넉넉하게 맞힌다
const holeX = (i) => X0 + (i % COLS) * CELL_W + CELL_W / 2;
const holeY = (i) => Y0 + Math.floor(i / COLS) * CELL_H + 78;                 // 구멍 입구(앞쪽 가장자리) 높이

// ---------- 캔버스 ----------
const canvas = $('game');
const ctx = canvas.getContext('2d');
function fit() {
  const hudH = 52;
  const scale = Math.min((innerWidth - 16) / W, (innerHeight - 16 - hudH) / H, 1.5);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  $('col').style.width = cssW + 'px';
}
addEventListener('resize', fit);

// ---------- 저장소 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let best = Number(store.get('moleBest')) || 0;

// ---------- 소리 ----------
let audio = null;
let muted = store.get('moleMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.09, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  whack: (combo) => { tone(180, 0.08, 'square', 0.1, -80); tone(520 + Math.min(combo, 12) * 28, 0.09, 'triangle', 0.07, 200); },
  clang: () => tone(900, 0.12, 'square', 0.05, -300),
  gold: () => seq([784, 988, 1175, 1568], 70, 'triangle', 0.1),
  boom: () => { tone(120, 0.35, 'sawtooth', 0.12, -80); tone(70, 0.4, 'square', 0.08, -30); },
  miss: () => tone(200, 0.06, 'sine', 0.04, -60),
  escape: () => tone(330, 0.12, 'triangle', 0.05, -120),
  tick: () => tone(1000, 0.05, 'square', 0.04),
  end: () => seq([523, 392, 330, 262], 120, 'triangle', 0.1),
  medal: () => seq([523, 659, 784, 1047], 90, 'triangle', 0.1),
  go: () => seq([660, 880], 90, 'triangle', 0.09),
};
function toggleMute() { muted = !muted; store.set('moleMuted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 상태 ----------
let st = L.newGame(20241019);
let mode = 'title';                  // title | ready(3-2-1) | play | paused | over
let readyT = 0, overAt = 0, lastTick = 99;
let floats = [], particles = [], hammers = [], uiT = 0, shake = 0, flash = 0, flashColor = '255,255,255', stunned = 0;

function updateHud() { $('score').textContent = st.score; $('best').textContent = best; }

function startGame() {
  st = L.newGame((Math.random() * 2 ** 31) | 0);
  mode = 'ready'; readyT = 1.5; lastTick = 99; floats = []; particles = []; hammers = []; stunned = 0;
  $('overlay').classList.add('hidden');
  updateHud();
}

function floatText(x, y, text, color) { floats.push({ x, y, text, color, t: 0 }); }
function burst(x, y, color, n, sp = 140) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, v = sp * (0.3 + Math.random());
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.4 + Math.random() * 0.4, t: 0, r: 2 + Math.random() * 3, color });
  }
}

// ---------- 입력 ----------
function toLocal(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (mode !== 'play') return;
  const { x, y } = toLocal(e);
  hammers.push({ x, y, t: 0 });
  const col = Math.floor((x - X0) / CELL_W), row = Math.floor((y - Y0) / CELL_H);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;       // 구멍 칸 밖은 헛손질로 치지 않는다
  L.whack(st, row * COLS + col);
  handleEvents();
});
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { mode === 'paused' ? resume() : pause(); }
  else if (e.code === 'KeyM') toggleMute();
  else if ((e.code === 'Enter' || e.code === 'Space') && mode === 'over' && performance.now() - overAt > 600 && !$('overlay').classList.contains('hidden')) { e.preventDefault(); startGame(); }
  else if (mode === 'play') {                                            // PC: 숫자패드 모양 1~9 = 구멍 (7 8 9 / 4 5 6 / 1 2 3)
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (m) { const n = Number(m[1]); const i = (2 - Math.floor((n - 1) / 3)) * 3 + (n - 1) % 3; hammers.push({ x: holeX(i), y: holeY(i) - 30, t: 0 }); L.whack(st, i); handleEvents(); }
  }
});

// ---------- 일시정지 ----------
let prevMode = 'play';
function pause() {
  if (mode !== 'play' && mode !== 'ready') return;
  prevMode = mode; mode = 'paused';
  $('overlay').innerHTML = `<h2>일시정지</h2><div class="col"><button id="resumeBtn">계속하기</button></div>`;
  $('overlay').classList.remove('hidden');
  $('resumeBtn').onclick = resume;
  $('pauseBtn').textContent = '▶';
}
function resume() {
  if (mode !== 'paused') return;
  mode = prevMode; $('overlay').classList.add('hidden'); $('pauseBtn').textContent = '⏸';
}
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); mode === 'paused' ? resume() : pause(); };
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------- 화면 메뉴 ----------
const MEDALS = [null, ['동메달', '#d98a4a'], ['은메달', '#c5ccd6'], ['금메달', '#ffd23f']];
function showTitle() {
  mode = 'title';
  $('overlay').innerHTML = `
    <h1>두더지<br>잡기</h1>
    <p>튀어나오는 두더지를 <b>탭</b>해서 잡아요 (60초)<br>🟡 금두더지 <b>+2초</b> · ⛑️ 헬멧은 <b>두 번</b><br>💣 폭탄은 건드리면 <b>-4초</b>!</p>
    <div class="col"><button id="startBtn">시작하기</button></div>
    <p style="font-size:12px;opacity:.85">PC: 마우스 클릭 · 숫자 1~9 &nbsp; P 일시정지 · M 소리</p>`;
  $('overlay').classList.remove('hidden');
  $('startBtn').onclick = (e) => { e.currentTarget.blur(); startGame(); };
}
function showOver() {
  const med = L.gradeOf(st.score);
  const rec = st.score > best;
  if (rec) { best = st.score; store.set('moleBest', String(best)); }
  updateHud();
  const m = MEDALS[med];
  $('overlay').innerHTML = `
    <h2>시간 끝!</h2>
    <div class="big">${st.score}</div>
    ${rec && st.score > 0 ? '<span class="tag">최고 기록!</span>' : ''}
    ${m ? `<p><span class="tag" style="background:${m[1]};color:${INK}">🏅 ${m[0]}</span></p>` : '<p>600점을 넘으면 메달을 받아요</p>'}
    <dl class="stats card2"><dt>잡은 두더지</dt><dd>${st.whacks}마리</dd><dt>최고 콤보</dt><dd>${st.maxCombo}</dd><dt>놓친 두더지</dt><dd>${st.escapes}마리</dd></dl>
    <p>최고 <b>${best}</b></p>
    <div class="col"><button id="againBtn">다시 하기</button></div>`;
  $('overlay').classList.remove('hidden');
  $('againBtn').onclick = (e) => { e.currentTarget.blur(); startGame(); };
  if (med) setTimeout(sfx.medal, 250);
}

// ---------- 이벤트 ----------
function handleEvents() {
  for (const e of st.events) {
    const x = e.i != null ? holeX(e.i) : 0, y = e.i != null ? holeY(e.i) : 0;
    if (e.type === 'whack') {
      if (e.kind === 'gold') { sfx.gold(); floatText(x, y - 80, `+${e.gain}  +2초`, '#ffd23f'); burst(x, y - 30, '#ffd23f', 14, 200); }
      else { sfx.whack(e.combo); floatText(x, y - 80, `+${e.gain}`, '#fff'); burst(x, y - 30, '#ffe0a8', 7); }
      if (e.combo >= 5 && e.combo % 5 === 0) floatText(W / 2, 128, `${e.combo} 콤보!`, '#ff5fa2');
      updateHud();
    } else if (e.type === 'clang') { sfx.clang(); burst(x, y - 55, '#cfd6e6', 6); }
    else if (e.type === 'boom') { sfx.boom(); floatText(x, y - 80, '-4초!', '#ff5f7a'); burst(x, y - 30, '#ff8a3d', 18, 240); shake = 0.6; flash = 0.45; flashColor = '255,120,60'; }
    else if (e.type === 'miss') sfx.miss();
    else if (e.type === 'escape') sfx.escape();
    else if (e.type === 'end') { sfx.end(); mode = 'over'; overAt = performance.now(); setTimeout(showOver, 700); }
  }
  st.events.length = 0;
}

// ---------- 그리기 ----------
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#9be86a'); g.addColorStop(1, '#5fc24a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i < 8; i++) ctx.fillRect(0, i * 80 + 10, W, 40);                 // 잔디 줄무늬
  ctx.fillStyle = '#ffffff';
  for (const [x, y] of [[40, 138], [300, 142], [190, 540], [50, 520], [320, 500]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.arc(x + 7, y + 2, 3, 0, 7); ctx.arc(x + 3, y - 5, 3, 0, 7); ctx.fill(); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x + 3.5, y, 2, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; }
}
function drawHoleBack(i) {
  const x = holeX(i), y = holeY(i);
  ctx.fillStyle = '#a9743c'; ctx.beginPath(); ctx.ellipse(x, y + 2, 52, 20, 0, 0, 7); ctx.fill();            // 흙 두렁
  ctx.fillStyle = '#3b2412'; ctx.beginPath(); ctx.ellipse(x, y - 2, 42, 15, 0, 0, 7); ctx.fill();            // 구멍
  ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.ellipse(x, y + 2, 52, 20, 0, 0, 7); ctx.stroke();
}
function drawMole(h, i) {
  const x = holeX(i), y = holeY(i), sh = L.showOf(h);
  if (sh <= 0.01) return;
  const rise = sh * 60;                                                   // 올라온 높이
  ctx.save();
  ctx.beginPath(); ctx.rect(x - 70, y - 120, 140, 120 + 4); ctx.clip();   // 구멍 입구 아래는 안 보이게
  ctx.translate(x, y - 2 + (60 - rise));
  const hit = h.hit;
  ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = INK;
  if (h.kind === 'bomb') {
    ctx.fillStyle = '#3a3a4a'; ctx.beginPath(); ctx.arc(0, -28, 30, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-10, -40, 6, 9, 0.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#9a9aa8'; ctx.fillRect(-7, -64, 14, 9); ctx.strokeRect(-7, -64, 14, 9);
    ctx.strokeStyle = '#c98a5c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -64); ctx.quadraticCurveTo(8, -76, 16, -72); ctx.stroke();
    ctx.fillStyle = Math.floor(uiT * 12) % 2 ? '#ffd23f' : '#ff5f2a'; ctx.beginPath(); ctx.arc(17, -73, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff5f7a'; ctx.font = '22px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, -20);   // 위험 표시
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-9, -30, 5, 0, 7); ctx.arc(9, -30, 5, 0, 7); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-8, -29, 2.3, 0, 7); ctx.arc(10, -29, 2.3, 0, 7); ctx.fill();
  } else {
    const body = h.kind === 'gold' ? '#ffd23f' : '#b97a47';
    const belly = h.kind === 'gold' ? '#fff0a8' : '#e8c298';
    const squash = hit ? 0.8 : 1;
    ctx.scale(1, squash);
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-32, 6); ctx.quadraticCurveTo(-36, -62, 0, -62); ctx.quadraticCurveTo(36, -62, 32, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(0, -14, 18, 20, 0, 0, 7); ctx.fill();
    // 귀
    ctx.fillStyle = body; for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * 24, -52, 8, 0, 7); ctx.fill(); ctx.stroke(); }
    if (h.kind === 'helmet') {
      ctx.fillStyle = h.hp > 1 ? '#aab4c8' : '#8a93a8';
      ctx.beginPath(); ctx.moveTo(-34, -40); ctx.quadraticCurveTo(-34, -78, 0, -78); ctx.quadraticCurveTo(34, -78, 34, -40); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(-18, -72, 8, 18);
      if (h.hp <= 1) { ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(6, -76); ctx.lineTo(12, -64); ctx.lineTo(4, -58); ctx.stroke(); ctx.lineWidth = 3.5; }
    }
    // 눈 / 어지러움
    if (hit) {
      ctx.strokeStyle = INK; ctx.lineWidth = 3;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * 12 - 5, -44); ctx.lineTo(d * 12 + 5, -34); ctx.moveTo(d * 12 + 5, -44); ctx.lineTo(d * 12 - 5, -34); ctx.stroke(); }
      ctx.fillStyle = '#ffd23f';
      for (let k = 0; k < 3; k++) { const a = uiT * 9 + k * 2.1; ctx.beginPath(); ctx.arc(Math.cos(a) * 26, -72 + Math.sin(a) * 6, 4, 0, 7); ctx.fill(); }
    } else {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-12, -40, 7, 0, 7); ctx.arc(12, -40, 7, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-11, -39, 3, 0, 7); ctx.arc(13, -39, 3, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    ctx.fillStyle = '#ff8fb3'; ctx.beginPath(); ctx.ellipse(0, -28, 8, 6, 0, 0, 7); ctx.fill(); ctx.stroke();          // 코
    ctx.fillStyle = '#fff'; ctx.fillRect(-5, -21, 4.5, 7); ctx.fillRect(0.5, -21, 4.5, 7);                              // 앞니
    if (h.kind === 'gold' && !hit) { ctx.fillStyle = '#fff'; const a = uiT * 6; for (const [sx, sy] of [[-30, -58], [32, -36]]) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillRect(-1.5, -6, 3, 12); ctx.fillRect(-6, -1.5, 12, 3); ctx.restore(); } }
  }
  ctx.restore();
}
function drawHoleFront(i) {
  const x = holeX(i), y = holeY(i);
  ctx.fillStyle = '#b8814a'; ctx.beginPath(); ctx.ellipse(x, y + 8, 54, 17, 0, 0, Math.PI); ctx.fill();         // 앞쪽 흙
  ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.ellipse(x, y + 8, 54, 17, 0, 0, Math.PI); ctx.stroke();
  ctx.fillStyle = '#6fd04f';
  for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(x + k * 15 - 5, y + 20); ctx.lineTo(x + k * 15, y + 13); ctx.lineTo(x + k * 15 + 5, y + 20); ctx.fill(); }
}
function drawHammer(hm) {
  const p = hm.t / 0.22;
  if (p >= 1) return;
  const ang = -0.9 + 1.5 * Math.min(1, p * 2.2);
  ctx.save(); ctx.translate(hm.x, hm.y); ctx.rotate(ang); ctx.globalAlpha = 1 - Math.max(0, p - 0.6) / 0.4;
  ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = INK;
  ctx.fillStyle = '#c98a5c'; ctx.beginPath(); ctx.roundRect(-5, -6, 10, 66, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ff5f7a'; ctx.beginPath(); ctx.roundRect(-26, -34, 52, 34, 9); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(-20, -28, 8, 20);
  ctx.restore(); ctx.globalAlpha = 1;
}
function drawTop() {
  // 시간 막대
  const frac = Math.max(0, st.timeLeft / L.DURATION), low = st.timeLeft < 10 && mode === 'play';
  ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = INK;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(14, 14, W - 28, 24, 12); ctx.fill();
  ctx.fillStyle = low ? (Math.floor(uiT * 6) % 2 ? '#ff5f7a' : '#ffa0b0') : '#4cd964';
  if (frac > 0) { ctx.beginPath(); ctx.roundRect(14, 14, Math.max(24, (W - 28) * Math.min(1, frac)), 24, 12); ctx.fill(); }
  ctx.beginPath(); ctx.roundRect(14, 14, W - 28, 24, 12); ctx.stroke();
  ctx.font = '16px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = INK; ctx.fillText(`${Math.ceil(st.timeLeft)}초`, W / 2, 32);
  // 점수·콤보
  ctx.font = '44px Jua, sans-serif'; ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.strokeText(st.score, W / 2, 90); ctx.fillStyle = '#fff'; ctx.fillText(st.score, W / 2, 90);
  if (st.combo >= 2) {
    ctx.font = '20px Jua, sans-serif'; ctx.lineWidth = 6; const t = `🔥 ${st.combo} 콤보`;
    ctx.strokeText(t, W / 2, 120); ctx.fillStyle = '#ffd23f'; ctx.fillText(t, W / 2, 120);
  }
}
function drawFloats(dt) {
  ctx.font = '24px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = INK;
  for (const f of floats) {
    f.t += dt; const a = Math.max(0, 1 - f.t / 0.8);
    ctx.globalAlpha = a; const y = f.y - f.t * 50;
    ctx.strokeText(f.text, f.x, y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, y);
  }
  ctx.globalAlpha = 1; floats = floats.filter((f) => f.t < 0.8);
}
function drawParticles(dt) {
  for (const p of particles) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt;
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1; particles = particles.filter((p) => p.t < p.life);
}
function drawReady() {
  if (mode !== 'ready') return;
  const n = Math.ceil(readyT / 0.5);                                      // 3 2 1 (0.5초씩)
  const txt = readyT > 0.1 ? String(Math.min(3, n)) : '시작!';
  ctx.font = '84px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = INK;
  ctx.strokeText(txt, W / 2, 300); ctx.fillStyle = '#ffd23f'; ctx.fillText(txt, W / 2, 300);
}

function drawScene(dt) {
  ctx.save();
  if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake * 18, (Math.random() - 0.5) * shake * 18); shake = Math.max(0, shake - dt * 3); }
  drawBackground();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {                 // 뒤쪽 줄부터 그려야 앞줄이 가리지 않는다
    const i = r * COLS + c;
    drawHoleBack(i);
    const h = st.holes[i];
    if (h) drawMole(h, i);
    drawHoleFront(i);
  }
  drawTop();
  drawParticles(dt);
  drawFloats(dt);
  for (const hm of hammers) { hm.t += dt; drawHammer(hm); }
  hammers = hammers.filter((hm) => hm.t < 0.22);
  drawReady();
  if (flash > 0) { ctx.fillStyle = `rgba(${flashColor},${flash})`; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 2.5); }
  ctx.restore();
}

// ---------- 루프 ----------
let last = 0;
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016); last = now; uiT += dt;
  if (mode === 'ready') {
    const before = Math.ceil(readyT / 0.5);
    readyT -= dt;
    if (Math.ceil(Math.max(readyT, 0) / 0.5) !== before && readyT > 0.1) sfx.tick();
    if (readyT <= 0) { mode = 'play'; sfx.go(); }
  } else if (mode === 'play') {
    let left = dt;
    while (left > 0 && !st.over) { const d = Math.min(1 / 60, left); L.step(st, d); left -= d; }
    // 마지막 5초는 똑딱 소리
    const sec = Math.ceil(st.timeLeft);
    if (sec <= 5 && sec > 0 && sec !== lastTick) { lastTick = sec; sfx.tick(); }
    handleEvents();
  }
  drawScene(dt);
  requestAnimationFrame(frame);
}

updateHud();
showTitle();
fit();
requestAnimationFrame(frame);
