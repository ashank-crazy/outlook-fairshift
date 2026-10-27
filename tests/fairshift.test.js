const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/fairshift.js');

const maya = { id: 'maya', name: 'Maya', tz: 'America/Los_Angeles', work: [9, 17], busy: [[12, 13, 'Lunch']] };
const tom = { id: 'tom', name: 'Tom', tz: 'Europe/London', work: [9, 17], busy: [[10, 11, '1:1']], ledger: 6 };
const priya = { id: 'priya', name: 'Priya', tz: 'Asia/Kolkata', work: [10, 18], busy: [[13, 14, 'Lunch']], ledger: 48 };
const jack = { id: 'jack', name: 'Jack', tz: 'Australia/Sydney', work: [9, 17], busy: [], ledger: 26 };

const base = {
  organizerTz: 'America/Los_Angeles', start: { y: 2026, m: 11, d: 3 }, occurrences: 26,
  durMin: 60, fixedSlot: 9 * 60, maxSlots: 2, protectSleep: true, useLedger: false,
};

test('time-zone offsets follow real DST rules', () => {
  const nov = F.zonedTime(2026, 11, 3, 9 * 60, 'America/Los_Angeles');
  const apr = F.zonedTime(2027, 4, 6, 9 * 60, 'America/Los_Angeles');
  assert.equal(F.offsetMinutes(nov, 'America/Los_Angeles'), -480);
  assert.equal(F.offsetMinutes(apr, 'America/Los_Angeles'), -420);
  assert.equal(F.offsetMinutes(nov, 'Asia/Kolkata'), 330);
  assert.equal(F.tzAbbr('Australia/Sydney', nov), 'AEDT');
  assert.equal(F.tzAbbr('Europe/London', apr), 'BST');
});

test('9:00 AM Pacific is 10:30 PM in Bengaluru and crosses into sleep hours', () => {
  const start = F.zonedTime(2026, 11, 3, 9 * 60, 'America/Los_Angeles');
  const s = F.scoreAttendance(start, 60, priya);
  assert.equal(F.formatMinute(s.localMinute), '10:30 PM');
  assert.equal(s.worst, 'sleep');
  assert.equal(s.pain, 0.5 * 4 + 0.5 * 10);
  assert.equal(F.scoreAttendance(start, 60, maya).pain, 0);
});

test('the date line turns a Friday afternoon into a Saturday', () => {
  const fri = F.zonedTime(2026, 11, 6, 16 * 60, 'America/Los_Angeles');
  const s = F.scoreAttendance(fri, 60, jack);
  assert.equal(s.localWeekday, 6);
  assert.equal(s.worst, 'weekend');
});

test('fairness score: 100 when even, 0 when one person carries everything', () => {
  assert.equal(F.fairnessScore([5, 5, 5]), 100);
  assert.equal(F.fairnessScore([0, 0, 12]), 0);
  assert.equal(F.fairnessScore([0, 0, 0]), 100);
});

test('rotation is fairer than a fixed HQ-friendly time and keeps everyone out of sleep hours', () => {
  const r = F.plan(Object.assign({ people: [maya, tom, priya] }, base));
  assert.ok(r.rotation.fairness > r.fixed.fairness + 30, r.fixed.fairness + ' -> ' + r.rotation.fairness);
  assert.ok(r.rotation.maxBurden < r.fixed.maxBurden * 0.5);
  assert.ok(r.rotation.slots.length <= 2);
  assert.equal(r.rotation.occurrences.length, 26);
  for (const occ of r.rotation.occurrences) for (const s of occ.per) assert.notEqual(s.worst, 'sleep');
});

test('the fairness ledger spares people already carrying late calls', () => {
  const people = [maya, tom, priya];
  const without = F.plan(Object.assign({ people }, base));
  const withLedger = F.plan(Object.assign({ people }, base, { useLedger: true }));
  assert.ok(withLedger.rotation.series[2] < without.rotation.series[2]);
});

test('detects the March clock changes in the US and UK as separate events', () => {
  const r = F.plan(Object.assign({ people: [maya, tom, priya] }, base));
  const dates = r.clockChanges.map((c) => r.dates[c.index]);
  assert.deepEqual(dates.map((d) => d.m + '/' + d.d), ['3/16', '3/30']);
});

test('an early bird minds a 6:30 AM start less, a night owl minds it more', () => {
  const start = F.zonedTime(2026, 11, 3, 6 * 60 + 30, 'America/Los_Angeles');
  const plain = F.scoreAttendance(start, 60, maya).pain;
  const early = F.scoreAttendance(start, 60, Object.assign({}, maya, { chrono: 'early' })).pain;
  const owl = F.scoreAttendance(start, 60, Object.assign({}, maya, { chrono: 'late' })).pain;
  assert.ok(early < plain && plain < owl, [early, plain, owl].join(' < '));
});
