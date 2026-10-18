'use strict';

// 두더지 잡기: 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 3×3 구멍에서 두더지가 튀어나온다. 60초 동안 탭해서 잡는다
// - 보통 두더지 10점 · 금두더지 50점+2초 · 헬멧 두더지는 두 번 때려야 25점 · 폭탄은 때리면 시간 -4초, 콤보가 끊긴다
// - 잡을수록 콤보가 쌓여 점수가 늘고, 두더지를 놓치거나 빈 구멍을 때리면 콤보가 끊긴다
// - 시간이 갈수록 빨리 숨고, 한꺼번에 여러 마리가 나오고, 폭탄과 헬멧이 섞인다
const LOGIC_MOLE = (() => {
const HOLES = 9, DURATION = 60;
const RISE = 0.12, SINK = 0.14, HIT_SHOW = 0.3;        // 올라오는 시간, 숨는 시간, 맞은 뒤 어지러워하는 시간(초)
const BOMB_PENALTY = 4, GOLD_BONUS = 2;
const POINTS = { mole: 10, gold: 50, helmet: 25 };

const lerp = (a, b, p) => a + (b - a) * p;
const prog = (st) => Math.min(1, st.t / DURATION);
const lifeFor = (p) => lerp(1.25, 0.62, p);              // 머무는 시간
const gapFor = (p) => lerp(0.85, 0.36, p);               // 다음 두더지가 나오기까지
const maxUp = (p) => 1 + Math.floor(p * 3.2);            // 동시에 나오는 최대 수 1~4

function rng(seed) {                                     // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newGame(seed = (Math.random() * 2 ** 31) | 0) {
  return {
    seed, rand: rng(seed), state: 'play', t: 0, timeLeft: DURATION, score: 0, combo: 0, maxCombo: 0,
    holes: new Array(HOLES).fill(null), nextIn: 0.5, whacks: 0, escapes: 0, bombs: 0, golds: 0, taps: 0, events: [], over: false,
  };
}

function pickKind(st) {
  const p = prog(st), r = st.rand();
  const bomb = st.t > 6 ? lerp(0.1, 0.22, p) : 0;
  const helmet = st.t > 18 ? lerp(0.12, 0.2, p) : 0;
  const gold = st.t > 10 ? 0.06 : 0;
  if (r < bomb) return 'bomb';
  if (r < bomb + gold) return 'gold';
  if (r < bomb + gold + helmet) return 'helmet';
  return 'mole';
}

function spawn(st) {
  const p = prog(st);
  const free = [];
  let up = 0;
  st.holes.forEach((h, i) => { if (!h) free.push(i); else if (!h.hit) up++; });
  if (!free.length || up >= maxUp(p)) return false;
  const i = free[Math.floor(st.rand() * free.length)];
  const kind = pickKind(st);
  const life = lifeFor(p) * (kind === 'gold' ? 0.8 : kind === 'bomb' ? 1.0 : 1) * (0.9 + st.rand() * 0.25);
  st.holes[i] = { kind, age: 0, life, hp: kind === 'helmet' ? 2 : 1, hit: false, hitAge: 0 };
  return true;
}

// 두더지가 얼마나 올라와 있나 (0 숨음 ~ 1 완전히 나옴)
function showOf(h) {
  if (h.hit) return Math.max(0, 1 - h.hitAge / HIT_SHOW) * 0.9;
  if (h.age < RISE) return h.age / RISE;
  if (h.age < h.life - SINK) return 1;
  return Math.max(0, (h.life - h.age) / SINK);
}
const canHit = (h) => h && !h.hit && h.age >= RISE * 0.4 && h.age < h.life - SINK * 0.3;

function step(st, dt) {
  if (st.over) return;
  st.t += dt; st.timeLeft -= dt;
  st.nextIn -= dt;
  for (let i = 0; i < HOLES; i++) {
    const h = st.holes[i];
    if (!h) continue;
    if (h.hit) { h.hitAge += dt; if (h.hitAge >= HIT_SHOW) st.holes[i] = null; continue; }
    h.age += dt;
    if (h.age >= h.life) {
      st.holes[i] = null;
      if (h.kind === 'mole' || h.kind === 'helmet') { st.combo = 0; st.escapes++; st.events.push({ type: 'escape', i }); }
    }
  }
  if (st.nextIn <= 0) { if (spawn(st)) st.nextIn = gapFor(prog(st)) * (0.8 + st.rand() * 0.4); else st.nextIn = 0.1; }
  if (st.timeLeft <= 0) { st.timeLeft = 0; st.over = true; st.state = 'over'; st.events.push({ type: 'end' }); }
}

// i 번 구멍을 때린다. 결과: { kind, gain, ... } 또는 null(헛손질)
function whack(st, i) {
  if (st.over) return null;
  st.taps++;
  const h = st.holes[i];
  if (!canHit(h)) { st.combo = 0; st.events.push({ type: 'miss', i }); return null; }
  if (h.kind === 'bomb') {
    h.hit = true; h.hitAge = 0; st.bombs++; st.combo = 0; st.timeLeft = Math.max(0, st.timeLeft - BOMB_PENALTY);
    st.events.push({ type: 'boom', i, gain: -BOMB_PENALTY });
    if (st.timeLeft <= 0) { st.over = true; st.state = 'over'; st.events.push({ type: 'end' }); }
    return { kind: 'bomb', gain: 0 };
  }
  if (h.kind === 'helmet' && h.hp > 1) { h.hp--; st.events.push({ type: 'clang', i }); return { kind: 'helmet', gain: 0, hp: h.hp }; }
  const base = POINTS[h.kind];
  const gain = base + Math.min(st.combo, 20);
  st.score += gain; st.combo++; st.maxCombo = Math.max(st.maxCombo, st.combo); st.whacks++;
  if (h.kind === 'gold') { st.timeLeft += GOLD_BONUS; st.golds++; }
  h.hit = true; h.hitAge = 0;
  st.events.push({ type: 'whack', i, kind: h.kind, gain, combo: st.combo });
  return { kind: h.kind, gain };
}

const gradeOf = (score) => (score >= 2000 ? 3 : score >= 1200 ? 2 : score >= 600 ? 1 : 0);   // 0 없음 · 1 동 · 2 은 · 3 금

const LOGIC = { HOLES, DURATION, RISE, SINK, HIT_SHOW, BOMB_PENALTY, GOLD_BONUS, POINTS, lifeFor, gapFor, maxUp, newGame, step, whack, showOf, canHit, gradeOf };
return LOGIC;
})();
if (typeof module !== 'undefined') module.exports = LOGIC_MOLE;
