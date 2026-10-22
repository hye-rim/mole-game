'use strict';
// 두더지 잡기 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

const DT = 1 / 60;
// i 번 구멍에 원하는 두더지를 세워 둔다 (완전히 올라온 상태)
function put(st, i, kind) {
  st.holes[i] = { kind, age: L.RISE, life: 5, hp: kind === 'helmet' ? 2 : 1, hit: false, hitAge: 0 };
}

test('a normal mole: points plus combo bonus; a miss breaks the combo', () => {
  const st = L.newGame(1);
  st.holes.fill(null);
  put(st, 0, 'mole');
  assert.deepStrictEqual(L.whack(st, 0), { kind: 'mole', gain: 10 });
  put(st, 1, 'mole');
  assert.strictEqual(L.whack(st, 1).gain, 11);            // 콤보 1
  assert.strictEqual(st.combo, 2);
  assert.strictEqual(L.whack(st, 5), null, 'empty hole');
  assert.strictEqual(st.combo, 0);
  assert.strictEqual(st.score, 21);
  assert.strictEqual(L.whack(st, 0), null, 'a mole that was already hit cannot be hit again');
});

test('helmet needs two hits, gold adds time, bomb takes time and breaks the combo', () => {
  const st = L.newGame(2);
  st.holes.fill(null);
  put(st, 0, 'helmet');
  assert.deepStrictEqual(L.whack(st, 0), { kind: 'helmet', gain: 0, hp: 1 });
  assert.strictEqual(L.whack(st, 0).gain, L.POINTS.helmet);
  put(st, 1, 'gold');
  const t = st.timeLeft;
  L.whack(st, 1);
  assert.strictEqual(st.timeLeft, t + L.GOLD_BONUS);
  put(st, 2, 'bomb');
  L.whack(st, 2);
  assert.strictEqual(st.timeLeft, t + L.GOLD_BONUS - L.BOMB_PENALTY);
  assert.strictEqual(st.combo, 0);
  assert.strictEqual(st.bombs, 1);
});

test('a bomb with less than 4 seconds left ends the game at 0', () => {
  const st = L.newGame(3);
  st.holes.fill(null);
  st.timeLeft = 2;
  put(st, 4, 'bomb');
  L.whack(st, 4);
  assert.ok(st.over);
  assert.strictEqual(st.timeLeft, 0);
  assert.strictEqual(L.whack(st, 4), null);
});

test('moles that are still rising or already sinking cannot be hit', () => {
  const st = L.newGame(4);
  st.holes.fill(null);
  st.holes[0] = { kind: 'mole', age: 0, life: 1, hp: 1, hit: false, hitAge: 0 };
  assert.ok(!L.canHit(st.holes[0]));
  st.holes[0].age = 0.99;
  assert.ok(!L.canHit(st.holes[0]));
  st.holes[0].age = 0.5;
  assert.ok(L.canHit(st.holes[0]));
  assert.strictEqual(L.showOf(st.holes[0]), 1);
});

test('an escaped mole breaks the combo; an ignored bomb does not', () => {
  const st = L.newGame(5);
  st.holes.fill(null); st.nextIn = 999; st.combo = 3;
  st.holes[0] = { kind: 'bomb', age: 0.5, life: 0.6, hp: 1, hit: false, hitAge: 0 };
  for (let k = 0; k < 20; k++) L.step(st, DT);
  assert.strictEqual(st.combo, 3);
  st.holes[1] = { kind: 'mole', age: 0.5, life: 0.6, hp: 1, hit: false, hitAge: 0 };
  for (let k = 0; k < 20; k++) L.step(st, DT);
  assert.strictEqual(st.combo, 0);
  assert.strictEqual(st.escapes, 1);
});

test('a full 60-second game: never more moles up than allowed, harder over time, ends on time', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const st = L.newGame(seed);
    const kinds = new Set();
    let maxUpSeen = 0, early = 0, late = 0;
    while (!st.over) {
      L.step(st, DT);
      const up = st.holes.filter((h) => h && !h.hit).length;
      maxUpSeen = Math.max(maxUpSeen, up);
      assert.ok(up <= L.maxUp(Math.min(1, st.t / L.DURATION)) + 1);
      st.holes.forEach((h, i) => {
        if (!h || !L.canHit(h)) return;
        kinds.add(h.kind);
        if (st.t < 6 && h.kind !== 'mole') assert.fail('only plain moles in the first 6 seconds: ' + h.kind);
        if (st.t < 18 && h.kind === 'helmet') assert.fail('no helmets before 18 seconds');
        if (h.kind !== 'bomb') { L.whack(st, i); if (st.t < 20) early++; else if (st.t > 40) late++; }
      });
    }
    assert.ok(Math.abs(st.t - L.DURATION - st.golds * L.GOLD_BONUS) < 0.05, `ends on time (seed ${seed})`);
    assert.ok(kinds.has('bomb') && kinds.has('helmet'), 'bombs and helmets show up');
    assert.ok(late > early, 'more moles later in the game');
    assert.ok(L.gradeOf(st.score) >= 2, 'hitting every mole reaches at least silver: ' + st.score);
  }
});

test('left alone, several moles come up at once near the end but never more than allowed', () => {
  const st = L.newGame(9);
  let most = 0;
  while (!st.over) {
    L.step(st, DT);
    const up = st.holes.filter((h) => h && !h.hit).length;
    assert.ok(up <= L.maxUp(Math.min(1, st.t / L.DURATION)) + 1);
    most = Math.max(most, up);
  }
  assert.ok(most >= 3, 'most at once: ' + most);
  assert.ok(st.escapes > 30);
  assert.strictEqual(st.score, 0);
});
