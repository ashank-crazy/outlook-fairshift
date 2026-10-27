/*
 * Fairshift engine — scores how much a meeting time costs each attendee in
 * their own local time, and plans a recurring series that rotates the time
 * so the after-hours load is shared instead of always landing on the same people.
 *
 * Pure functions, no dependencies, DST-aware via Intl. Works in the browser
 * (window.Fairshift) and in Node (module.exports) for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Fairshift = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Time-zone helpers
  // ---------------------------------------------------------------------------

  const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const formatters = new Map();
  const offsetCache = new Map();

  function formatterFor(tz) {
    let f = formatters.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', weekday: 'short',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      formatters.set(tz, f);
    }
    return f;
  }

  function localParts(ms, tz) {
    const p = {};
    for (const part of formatterFor(tz).formatToParts(new Date(ms))) p[part.type] = part.value;
    return {
      y: +p.year, m: +p.month, d: +p.day,
      hour: +p.hour % 24, minute: +p.minute, weekday: WEEKDAYS[p.weekday],
    };
  }

  /** Minutes the zone is ahead of UTC at instant `ms` (e.g. +330 for India). */
  function offsetMinutes(ms, tz) {
    // DST transitions land on hour boundaries for every zone we care about.
    const key = tz + '|' + Math.floor(ms / 3600000);
    let off = offsetCache.get(key);
    if (off === undefined) {
      const p = localParts(ms, tz);
      const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute);
      off = Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
      offsetCache.set(key, off);
    }
    return off;
  }

  /** UTC instant (ms) for wall-clock `minuteOfDay` on y-m-d in `tz`. */
  function zonedTime(y, m, d, minuteOfDay, tz) {
    const guess = Date.UTC(y, m - 1, d, 0, minuteOfDay);
    const off = offsetMinutes(guess, tz);
    let t = guess - off * 60000;
    const off2 = offsetMinutes(t, tz);
    if (off2 !== off) t = guess - off2 * 60000;
    return t;
  }

  /** Wall-clock time in `tz` at instant `ms`, as minute-of-day + weekday. */
  function wallClock(ms, tz) {
    const local = new Date(ms + offsetMinutes(ms, tz) * 60000);
    return {
      minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
      weekday: local.getUTCDay(),
      y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate(),
    };
  }

  const ABBR = {
    'America/Los_Angeles': { '-480': 'PST', '-420': 'PDT' },
    'America/New_York': { '-300': 'EST', '-240': 'EDT' },
    'America/Sao_Paulo': { '-180': 'BRT' },
    'Europe/London': { '0': 'GMT', '60': 'BST' },
    'Europe/Berlin': { '60': 'CET', '120': 'CEST' },
    'Africa/Lagos': { '60': 'WAT' },
    'Asia/Kolkata': { '330': 'IST' },
    'Asia/Singapore': { '480': 'SGT' },
    'Asia/Tokyo': { '540': 'JST' },
    'Australia/Sydney': { '600': 'AEST', '660': 'AEDT' },
  };

  function tzAbbr(tz, ms) {
    const off = offsetMinutes(ms, tz);
    const named = ABBR[tz] && ABBR[tz][String(off)];
    if (named) return named;
    const sign = off < 0 ? '-' : '+';
    const a = Math.abs(off);
    return 'UTC' + sign + Math.floor(a / 60) + (a % 60 ? ':' + String(a % 60).padStart(2, '0') : '');
  }

  function formatMinute(min) {
    const m = ((min % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return (h % 12 || 12) + ':' + String(mm).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  // ---------------------------------------------------------------------------
  // Burden model
  // ---------------------------------------------------------------------------

  // weight = burden points per hour spent in that band (1 pt ≈ 1 hour just past your day)
  const CATEGORIES = {
    work:    { weight: 0,  rank: 0, label: 'Working hours' },
    edge:    { weight: 1,  rank: 1, label: 'Just outside hours' },
    evening: { weight: 2,  rank: 2, label: 'Evening / early morning' },
    weekend: { weight: 4,  rank: 3, label: 'Weekend' },
    late:    { weight: 4,  rank: 4, label: 'Late night / pre-dawn' },
    sleep:   { weight: 10, rank: 5, label: 'Sleep hours' },
  };
  const SLEEP_START = 23 * 60;
  const SLEEP_END = 6 * 60;
  const LATE_START = 21 * 60;
  const LATE_END = 7 * 60;
  const SLICE = 15;
  const CONFLICT_COST = 8; // planner-only penalty per hour of double booking

  function categorize(minute, weekday, person) {
    if (minute >= SLEEP_START || minute < SLEEP_END) return 'sleep';
    if (minute >= LATE_START || minute < LATE_END) return 'late';
    if (weekday === 0 || weekday === 6) return 'weekend';
    const ws = person.work[0] * 60;
    const we = person.work[1] * 60;
    if (minute >= ws && minute < we) return 'work';
    if ((minute >= ws - 60 && minute < ws) || (minute >= we && minute < we + 60)) return 'edge';
    return 'evening';
  }

  /**
   * Personal preference: an early bird minds a 7 AM call less than a 9 PM one,
   * a night owl the reverse. Sleep and weekends are never discounted.
   */
  function chronoFactor(cat, minute, person) {
    if (!person.chrono || cat === 'work' || cat === 'sleep' || cat === 'weekend') return 1;
    const morning = minute < 12 * 60;
    if (person.chrono === 'early') return morning ? 0.5 : 1.5;
    if (person.chrono === 'late') return morning ? 1.5 : 0.5;
    return 1;
  }

  function busyAt(minute, weekday, person) {
    if (weekday === 0 || weekday === 6 || !person.busy) return null;
    for (const b of person.busy) {
      if (minute >= b[0] * 60 && minute < b[1] * 60) return b[2] || 'Busy';
    }
    return null;
  }

  /** What one occurrence starting at `startMs` costs `person`. */
  function scoreAttendance(startMs, durMin, person) {
    let pain = 0;
    let offHours = 0;
    let conflictHours = 0;
    let conflict = null;
    let worst = 'work';
    for (let t = 0; t < durMin; t += SLICE) {
      const len = Math.min(SLICE, durMin - t) / 60;
      const wc = wallClock(startMs + t * 60000, person.tz);
      const cat = categorize(wc.minute, wc.weekday, person);
      pain += CATEGORIES[cat].weight * chronoFactor(cat, wc.minute, person) * len;
      if (cat !== 'work') offHours += len;
      if (CATEGORIES[cat].rank > CATEGORIES[worst].rank) worst = cat;
      const busy = busyAt(wc.minute, wc.weekday, person);
      if (busy) { conflictHours += len; conflict = conflict || busy; }
    }
    const start = wallClock(startMs, person.tz);
    return {
      pain, offHours, worst, conflict, conflictHours,
      localMinute: start.minute, localWeekday: start.weekday,
      abbr: tzAbbr(person.tz, startMs),
    };
  }

  function plannerCost(score) {
    return score.pain + CONFLICT_COST * score.conflictHours;
  }

  // ---------------------------------------------------------------------------
  // Series evaluation
  // ---------------------------------------------------------------------------

  function seriesDates(start, count, everyDays) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const dt = new Date(Date.UTC(start.y, start.m - 1, start.d + i * (everyDays || 7)));
      out.push({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), weekday: dt.getUTCDay() });
    }
    return out;
  }

  function evaluateSlot(slot, ctx) {
    return ctx.dates.map((date) => {
      const startMs = zonedTime(date.y, date.m, date.d, slot, ctx.organizerTz);
      return { slot, startMs, date, per: ctx.people.map((p) => scoreAttendance(startMs, ctx.durMin, p)) };
    });
  }

  function tally(occurrences, people, base) {
    const totals = people.map((_, a) => base[a]);
    const series = people.map(() => 0);
    const offHours = people.map(() => 0);
    const lateCount = people.map(() => 0);
    const conflicts = people.map(() => 0);
    for (const occ of occurrences) {
      occ.per.forEach((s, a) => {
        totals[a] += s.pain;
        series[a] += s.pain;
        offHours[a] += s.offHours;
        if (s.worst === 'late' || s.worst === 'sleep') lateCount[a] += 1;
        if (s.conflict) conflicts[a] += 1;
      });
    }
    const seriesTotal = series.reduce((x, y) => x + y, 0);
    return {
      totals, series, offHours, lateCount, conflicts, seriesTotal,
      shares: series.map((v) => (seriesTotal > 0 ? v / seriesTotal : 0)),
      equality: fairnessScore(totals),
      maxBurden: Math.max.apply(null, totals),
    };
  }

  /**
   * 0–100 where 100 = burden spread perfectly evenly, 0 = one person carries all of it.
   * Normalised Gini coefficient over each attendee's total burden.
   */
  function fairnessScore(values) {
    const n = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    if (n < 2 || sum <= 1e-9) return 100;
    let diff = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) diff += Math.abs(values[i] - values[j]);
    const gini = diff / (2 * n * sum);
    const maxGini = (n - 1) / n;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - gini / maxGini))));
  }

  // ---------------------------------------------------------------------------
  // Rotation planner
  // ---------------------------------------------------------------------------

  const LAMBDA = 0.35;      // weight on total burden vs. the worst-off person
  const SLOT_COST = 0.12;   // per occurrence, per extra rotating time (keeps series simple)
  const POOL_SIZE = 10;

  function dominates(a, b) {
    let strictly = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] > b[i] + 1e-9) return false;
      if (a[i] < b[i] - 1e-9) strictly = true;
    }
    return strictly;
  }

  function combinations(items, k) {
    const out = [];
    (function pick(startIdx, acc) {
      if (acc.length === k) { out.push(acc.slice()); return; }
      for (let i = startIdx; i < items.length; i++) { acc.push(items[i]); pick(i + 1, acc); acc.pop(); }
    })(0, []);
    return out;
  }

  function greedyRotation(subset, evals, ctx, base) {
    const cum = base.slice();
    const lastUsed = new Map();
    const sequence = [];
    let seriesSum = 0;
    for (let i = 0; i < ctx.dates.length; i++) {
      let best = null;
      let bestVal = Infinity;
      for (const slot of subset) {
        const per = evals.get(slot)[i].per;
        let worst = 0;
        let total = 0;
        for (let a = 0; a < per.length; a++) {
          const c = plannerCost(per[a]);
          worst = Math.max(worst, cum[a] + c);
          total += c;
        }
        const recency = lastUsed.has(slot) ? lastUsed.get(slot) + 1 : 0;
        const val = worst + LAMBDA * total + 1e-6 * recency;
        if (val < bestVal) { bestVal = val; best = slot; }
      }
      const occ = evals.get(best)[i];
      occ.per.forEach((s, a) => { const c = plannerCost(s); cum[a] += c; seriesSum += c; });
      lastUsed.set(best, i);
      sequence.push(occ);
    }
    const objective = Math.max.apply(null, cum) + LAMBDA * seriesSum + SLOT_COST * (subset.length - 1) * ctx.dates.length;
    return { sequence, objective };
  }

  /**
   * @param {object} cfg
   *   people: [{ id, name, tz, work:[startHour,endHour], busy:[[s,e,label]], ledger }]
   *   organizerTz, start:{y,m,d}, occurrences, durMin, fixedSlot (organizer minute-of-day)
   *   maxSlots (1–3), protectSleep (bool), useLedger (bool), step (minutes, default 30)
   */
  function plan(cfg) {
    const step = cfg.step || 30;
    const ctx = {
      people: cfg.people,
      organizerTz: cfg.organizerTz,
      durMin: cfg.durMin,
      dates: seriesDates(cfg.start, cfg.occurrences, 7),
    };
    const base = cfg.people.map((p) => (cfg.useLedger ? p.ledger || 0 : 0));

    const evals = new Map();
    for (let s = 0; s < 1440; s += step) evals.set(s, evaluateSlot(s, ctx));
    if (!evals.has(cfg.fixedSlot)) evals.set(cfg.fixedSlot, evaluateSlot(cfg.fixedSlot, ctx));

    const fixedOcc = evals.get(cfg.fixedSlot);
    const fixed = Object.assign({ slot: cfg.fixedSlot, occurrences: fixedOcc }, tally(fixedOcc, cfg.people, base));

    // Candidate pool: drop slots that wake anyone up (if asked), then keep the Pareto front.
    const meanCost = (slot) => cfg.people.map((_, a) =>
      evals.get(slot).reduce((sum, occ) => sum + plannerCost(occ.per[a]), 0) / ctx.dates.length);
    const allSlots = Array.from(evals.keys()).filter((s) => s % step === 0);
    let eligible = allSlots;
    if (cfg.protectSleep) {
      const awake = allSlots.filter((s) => evals.get(s).every((occ) => occ.per.every((x) => x.worst !== 'sleep')));
      if (awake.length) eligible = awake;
    }
    const vectors = new Map(eligible.map((s) => [s, meanCost(s)]));
    let pool = eligible.filter((s) => !eligible.some((o) => o !== s && dominates(vectors.get(o), vectors.get(s))));
    const rank = (s) => { const v = vectors.get(s); return Math.max.apply(null, v) + LAMBDA * v.reduce((a, b) => a + b, 0); };
    pool.sort((a, b) => rank(a) - rank(b));
    pool = pool.slice(0, POOL_SIZE);

    // Search every rotation of up to 3 times. `floor` is the lightest load the
    // heaviest-hit person can get across these time zones — the fairness yardstick.
    let best = null;
    let bestSingle = null;
    let floor = Infinity;
    const maxSlots = Math.max(1, Math.min(3, cfg.maxSlots || 2));
    for (let k = 1; k <= Math.min(3, pool.length); k++) {
      for (const subset of combinations(pool, k)) {
        const r = greedyRotation(subset, evals, ctx, base);
        const heaviest = Math.max.apply(null, tally(r.sequence, cfg.people, base).totals);
        floor = Math.min(floor, heaviest);
        if (k <= maxSlots && (!best || r.objective < best.objective - 1e-9)) best = Object.assign({ subset }, r);
        if (k === 1 && (!bestSingle || r.objective < bestSingle.objective - 1e-9)) bestSingle = Object.assign({ subset }, r);
      }
    }

    const usage = new Map();
    best.sequence.forEach((occ) => usage.set(occ.slot, (usage.get(occ.slot) || 0) + 1));
    const slots = best.subset.slice().sort((a, b) => a - b).map((slot) => ({ slot, uses: usage.get(slot) || 0 }))
      .filter((s) => s.uses > 0);
    const rotation = Object.assign({ slots, occurrences: best.sequence }, tally(best.sequence, cfg.people, base));
    const single = Object.assign({ slot: bestSingle.subset[0], occurrences: bestSingle.sequence },
      tally(bestSingle.sequence, cfg.people, base));

    for (const r of [fixed, rotation, single]) r.fairness = fairnessVsFloor(r.maxBurden, floor);

    return { dates: ctx.dates, base, floor, fixed, rotation, single, clockChanges: clockChanges(ctx, cfg.people) };
  }

  /** 100 = the heaviest-hit person carries no more than the fairest possible schedule would give them. */
  function fairnessVsFloor(heaviest, floor) {
    if (heaviest <= 1e-9) return 100;
    return Math.max(0, Math.min(100, Math.round((100 * floor) / heaviest)));
  }

  /** Occurrence indexes where someone's offset relative to the organizer moves (DST). */
  function clockChanges(ctx, people) {
    const out = [];
    let prev = null;
    ctx.dates.forEach((date, i) => {
      const ms = zonedTime(date.y, date.m, date.d, 12 * 60, ctx.organizerTz);
      const org = offsetMinutes(ms, ctx.organizerTz);
      const rel = people.map((p) => offsetMinutes(ms, p.tz) - org);
      if (prev) {
        const moved = people.filter((_, a) => rel[a] !== prev[a]);
        if (moved.length) out.push({ index: i, people: moved.map((p) => p.id) });
      }
      prev = rel;
    });
    return out;
  }

  return {
    CATEGORIES, categorize, busyAt, scoreAttendance, fairnessScore, plan, seriesDates,
    zonedTime, wallClock, offsetMinutes, tzAbbr, formatMinute,
  };
});
