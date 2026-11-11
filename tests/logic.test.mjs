import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dailyIndexAt, isCorrectPair, calculateScore, dailyStreak } from '../app.js';

const cases = JSON.parse(readFileSync(new URL('../data/cases.json', import.meta.url), 'utf8'));

test('12 authored cases have exactly one answer pair each', () => {
  assert.equal(cases.length, 12);
  for (const c of cases) {
    assert.equal(c.clues.length, 6);
    assert.equal(c.answer.length, 2);
    assert.equal(isCorrectPair(c.answer, c.answer), true);
    assert.equal(isCorrectPair(c.answer.slice().reverse(), c.answer), true);
    const other = c.clues.map(x => x.id).filter(id => !c.answer.includes(id))[0];
    assert.equal(isCorrectPair([c.answer[0], other], c.answer), false);
  }
});

test('duplicate evidence never qualifies as solved', () => {
  assert.equal(isCorrectPair(['A','A'], ['A','B']), false);
  assert.equal(isCorrectPair(['A'], ['A','B']), false);
  assert.equal(isCorrectPair(['A','B','C'], ['A','B']), false);
});

test('daily case rotates predictably using UTC calendar days', () => {
  assert.equal(dailyIndexAt(0, 12), 0);
  assert.equal(dailyIndexAt(86_400_000, 12), 1);
  assert.equal(dailyIndexAt(12 * 86_400_000, 12), 0);
  assert.equal(dailyIndexAt(-86_400_000, 12), 11);
  assert.equal(dailyIndexAt(Date.UTC(2026, 10, 11, 23, 59), 12),
               dailyIndexAt(Date.UTC(2026, 10, 11, 0, 1), 12));
  assert.throws(() => dailyIndexAt(Date.now(), 0), RangeError);
});

test('scoring rewards no-hint first try but cannot become negative', () => {
  assert.equal(calculateScore(1,0), 100);
  assert.equal(calculateScore(1,1), 87);
  assert.equal(calculateScore(1,2), 74);
  assert.equal(calculateScore(2,0), 78);
  assert.equal(calculateScore(4,2), 10);
  assert.equal(calculateScore(300,2), 10);
  assert.throws(() => calculateScore(0,0), RangeError);
  assert.throws(() => calculateScore(2,3), RangeError);
});

test('daily streak counts consecutive UTC days without making up history', () => {
  const now = new Date('2026-11-11T23:00:00Z');
  assert.equal(dailyStreak([],now), 0);
  assert.equal(dailyStreak(['2026-11-11'],now), 1);
  assert.equal(dailyStreak(['2026-11-10'],now), 1);
  assert.equal(dailyStreak(['2026-11-10','2026-11-09'],now), 2);
  assert.equal(dailyStreak(['2026-11-11','2026-11-10','2026-11-08'],now), 2);
  assert.equal(dailyStreak(['2026-11-07'],now), 0);
  assert.equal(dailyStreak(['2026-11-11','2026-11-11'],now), 1);
  assert.equal(dailyStreak(['something'],now), 0);
});

test('case IDs work as plain shareable URL query values', () => {
  const ids = cases.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9-]+$/);
    const url = new URL('http://127.0.0.1:7777/?case=' + id);
    assert.equal(url.searchParams.get('case'), id);
  }
});
