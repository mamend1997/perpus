import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPromotionPlan, promoteRombel, promotionToken } from './school-year-promotion.js';

test('promotes vocational high-school rombel and keeps its study group', () => {
  assert.deepEqual(promoteRombel('X TKJ 1', 'SMK'), {
    action: 'promoted',
    nextRombel: 'XI TKJ 1'
  });
  assert.deepEqual(promoteRombel('Kelas XI-RPL 2', 'SMK'), {
    action: 'promoted',
    nextRombel: 'Kelas XII-RPL 2'
  });
});

test('marks final grades as graduates for each supported level family', () => {
  assert.deepEqual(promoteRombel('XII RPL 1', 'SMK'), { action: 'graduated', nextRombel: null });
  assert.deepEqual(promoteRombel('IX-A', 'MTs'), { action: 'graduated', nextRombel: null });
  assert.deepEqual(promoteRombel('6A', 'SD'), { action: 'graduated', nextRombel: null });
  assert.equal(promoteRombel('IV-A', 'MI').nextRombel, 'V-A');
  assert.deepEqual(promoteRombel('VI-A', 'MI'), { action: 'graduated', nextRombel: null });
});

test('keeps numeric and roman grade formats and flags unknown classes', () => {
  assert.equal(promoteRombel('7B', 'SMP').nextRombel, '8B');
  assert.equal(promoteRombel('VII TKJ', 'SMP').nextRombel, 'VIII TKJ');
  assert.equal(promoteRombel('XII RPL', 'SMP'), null);
  const plan = buildPromotionPlan([{ id: 1, rombel: 'kelas tanpa tingkat' }], 'SMK');
  assert.equal(plan[0].promotion.action, 'unmapped');
});

test('promotion preview token changes when roster fields change', () => {
  const roster = [{ id: 4, name: 'Siswa', rombel: 'X TKJ', status: 'active' }];
  const original = promotionToken(2, 'SMK', roster);
  assert.equal(promotionToken(2, 'SMK', roster), original);
  assert.notEqual(promotionToken(2, 'SMK', [{ ...roster[0], rombel: 'XI TKJ' }]), original);
});
