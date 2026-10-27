/* Fairshift prototype UI — an Outlook-style Scheduling Assistant with fair rotation. */
(function () {
  'use strict';

  const F = window.Fairshift;
  const DIRECTORY = window.FS_DIRECTORY;
  const SCENARIOS = window.FS_SCENARIOS;
  const PEOPLE = Object.fromEntries(DIRECTORY.map((p) => [p.id, p]));
  const ORG_TZ = 'America/Los_Angeles';
  const SLOT_COLORS = ['#0f6cbd', '#8764b8', '#038387'];
  const SLOT_NAMES = ['A', 'B', 'C'];
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const CAT_SHORT = { work: 'Work hours', edge: 'Edge', evening: 'Evening', weekend: 'Weekend', late: 'Late', sleep: 'Sleep' };

  const START = nextTuesday();

  const state = {
    mode: 'fairshift',
    scenario: 'us-uk-in',
    title: '',
    people: [],
    slot: 0,
    dur: 60,
    occurrences: 26,
    rotate: false,
    maxSlots: 2,
    protectSleep: true,
    useLedger: false,
    preview: 0,
    chrono: {},
  };

  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const firstName = (p) => p.name.split(' ')[0];
  const fmtDate = (d) => DAY[d.weekday] + ', ' + MONTH[d.m - 1] + ' ' + d.d;
  const fmtPts = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

  function nextTuesday() {
    const now = F.wallClock(Date.now(), ORG_TZ);
    const add = ((2 - now.weekday + 7) % 7) || 7;
    const dt = new Date(Date.UTC(now.y, now.m - 1, now.d + add));
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  function loadScenario(key) {
    const s = SCENARIOS[key];
    state.scenario = key;
    state.title = s.title;
    state.people = s.people.slice();
    state.slot = s.slot;
    state.dur = s.dur;
    state.preview = 0;
    state.chrono = {};
  }

  // ---------------------------------------------------------------------------
  // Planning (memoised — the engine searches ~48 times × every rotation)
  // ---------------------------------------------------------------------------

  let cacheKey = '';
  let cachePlan = null;

  function attendees() {
    return state.people.map((id) => (state.chrono[id] ? Object.assign({}, PEOPLE[id], { chrono: state.chrono[id] }) : PEOPLE[id]));
  }

  function currentPlan() {
    const key = JSON.stringify([state.people, state.slot, state.dur, state.occurrences, state.maxSlots, state.protectSleep, state.useLedger, state.chrono]);
    if (key !== cacheKey) {
      cachePlan = F.plan({
        people: attendees(), organizerTz: ORG_TZ, start: START, occurrences: state.occurrences,
        durMin: state.dur, fixedSlot: state.slot, maxSlots: state.maxSlots,
        protectSleep: state.protectSleep, useLedger: state.useLedger,
      });
      cacheKey = key;
    }
    return cachePlan;
  }

  const fairshiftOn = () => state.mode === 'fairshift';
  const rotating = () => fairshiftOn() && state.rotate;
  function activeSeries(plan) { return rotating() ? plan.rotation : plan.fixed; }

  function slotIndex(plan, slot) {
    return plan.rotation.slots.findIndex((s) => s.slot === slot);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function render() {
    snapshotAnimations();
    const plan = currentPlan();
    state.preview = Math.min(state.preview, plan.dates.length - 1);
    document.body.classList.toggle('mode-classic', !fairshiftOn());
    document.body.classList.toggle('mode-fairshift', fairshiftOn());
    document.querySelectorAll('.seg-btn').forEach((b) => {
      const on = b.dataset.mode === state.mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
    const seriesScroll = $('#series') ? $('#series').scrollTop : 0;
    renderDetails(plan);
    renderAssistant(plan);
    renderInsights(plan);
    if ($('#series')) $('#series').scrollTop = seriesScroll;
    playAnimations();
  }

  // Scores and bars glide from their previous value instead of jumping.
  const animMemory = new Map();
  const RING_CIRC = 2 * Math.PI * 30;
  const STILL = new URLSearchParams(location.search).has('still') ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function snapshotAnimations() {
    document.querySelectorAll('[data-anim]').forEach((el) => animMemory.set(el.dataset.anim, +el.dataset.val));
  }

  function playAnimations() {
    if (STILL) return;
    document.querySelectorAll('[data-anim]').forEach((el) => {
      const to = +el.dataset.val;
      const from = animMemory.has(el.dataset.anim) ? animMemory.get(el.dataset.anim) : 0;
      if (from === to) return;
      if (el.classList.contains('score')) {
        const fg = el.querySelector('.ring-fg');
        const txt = el.querySelector('text');
        fg.style.strokeDasharray = (from / 100) * RING_CIRC + ' ' + RING_CIRC;
        fg.getBoundingClientRect();
        fg.style.strokeDasharray = (to / 100) * RING_CIRC + ' ' + RING_CIRC;
        const t0 = performance.now();
        (function tick(now) {
          const k = Math.min(1, (now - t0) / 650);
          const eased = 1 - Math.pow(1 - k, 3);
          txt.textContent = Math.round(from + (to - from) * eased);
          if (k < 1 && txt.isConnected) requestAnimationFrame(tick);
        })(t0);
        setTimeout(() => { txt.textContent = to; }, 800); // rAF pauses in background tabs
      } else {
        el.style.width = from + '%';
        el.getBoundingClientRect();
        el.style.width = to + '%';
      }
    });
  }

  function avatar(p, cls) {
    return '<span class="avatar ' + (cls || '') + '" style="--c:' + p.color + '">' + esc(initials(p.name)) + '</span>';
  }

  function timeOptions(selected) {
    let html = '';
    for (let m = 0; m < 1440; m += 30) html += '<option value="' + m + '"' + (m === selected ? ' selected' : '') + '>' + F.formatMinute(m) + '</option>';
    return html;
  }

  function options(list, selected) {
    return list.map(([v, label]) => '<option value="' + v + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
  }

  function renderDetails(plan) {
    const series = activeSeries(plan);
    const occ = series.occurrences[state.preview];
    const people = attendees();
    const chips = people.map((p, a) => {
      const s = occ.per[a];
      const local = fairshiftOn()
        ? '<span class="chip-local cat-text-' + s.worst + '">' + F.formatMinute(s.localMinute) + ' ' + s.abbr + '</span>'
        : '<span class="chip-local">' + esc(p.city) + '</span>';
      const chrono = fairshiftOn()
        ? '<button class="chrono' + (p.chrono ? ' on' : '') + '" data-chrono="' + p.id + '" title="Meeting-time preference">' +
          (p.chrono === 'early' ? '🌅 Early bird' : p.chrono === 'late' ? '🌙 Night owl' : '+ Preference') + '</button>'
        : '';
      const remove = a === 0 ? '<span class="chip-tag">Organizer</span>'
        : '<button class="chip-x" data-remove="' + p.id + '" aria-label="Remove ' + esc(p.name) + '">✕</button>';
      return '<div class="chip">' + avatar(p, 'small') + '<span class="chip-main"><span class="chip-name">' + esc(p.name) +
        '</span><span class="chip-sub">' + local + chrono + '</span></span>' + remove + '</div>';
    }).join('');
    const addable = DIRECTORY.filter((p) => !state.people.includes(p.id));
    const lastDate = plan.dates[plan.dates.length - 1];

    $('#details').innerHTML =
      '<div class="field"><label for="title">Title</label><input id="title" class="input title-input" value="' + esc(state.title) + '"></div>' +
      '<div class="field"><label>Required attendees</label><div class="chips" id="chips">' + chips + '</div>' +
        (addable.length ? '<select id="addPerson" class="input"><option value="">+ Add people…</option>' +
          addable.map((p) => '<option value="' + p.id + '">' + esc(p.name) + ' — ' + esc(p.city) + '</option>').join('') + '</select>' : '') +
      '</div>' +
      '<div class="field two"><div><label>Starts</label><div class="input static">' + fmtDate(plan.dates[0]) + ', ' + plan.dates[0].y + '</div></div>' +
        '<div><label for="slot">Time (' + F.tzAbbr(ORG_TZ, plan.fixed.occurrences[0].startMs) + ')</label><select id="slot" class="input">' + timeOptions(state.slot) + '</select></div></div>' +
      '<div class="field two"><div><label for="dur">Duration</label><select id="dur" class="input">' +
          options([[30, '30 min'], [45, '45 min'], [60, '1 hour'], [90, '1.5 hours']], state.dur) + '</select></div>' +
        '<div><label for="occ">Ends after</label><select id="occ" class="input">' +
          options([[12, '12 meetings'], [26, '26 meetings'], [52, '52 meetings']], state.occurrences) + '</select></div></div>' +
      '<div class="field"><label>Repeat</label><div class="input static">Weekly on Tuesday · until ' + MONTH[lastDate.m - 1] + ' ' + lastDate.d + ', ' + lastDate.y + '</div></div>' +
      '<div class="fs-card" id="fsCard">' +
        '<div class="fs-card-head"><span class="spark">✦</span> Fairshift <span class="new-pill">New</span></div>' +
        '<label class="switch-row"><span class="switch-text"><b>Rotate time fairly</b><small>Share the after-hours load across the series instead of always landing on the same people.</small></span>' +
          '<input type="checkbox" id="rotate" class="switch"' + (state.rotate ? ' checked' : '') + '></label>' +
        '<div class="sub-opts' + (state.rotate ? '' : ' disabled') + '">' +
          '<label class="opt">Rotate between up to <select id="maxSlots" class="input inline">' + options([[2, '2 times'], [3, '3 times']], state.maxSlots) + '</select></label>' +
          '<label class="opt check"><input type="checkbox" id="protectSleep"' + (state.protectSleep ? ' checked' : '') + '> Protect sleep — never 11 PM – 6 AM for anyone</label>' +
          '<label class="opt check"><input type="checkbox" id="useLedger"' + (state.useLedger ? ' checked' : '') + '> Fairness ledger — remember late calls from their other meetings</label>' +
        '</div>' +
      '</div>' +
      '<div class="field scenario"><label for="scenario">Example team</label><select id="scenario" class="input">' +
        options(Object.keys(SCENARIOS).map((k) => [k, SCENARIOS[k].label]), state.scenario) + '</select></div>';
  }

  function hourLabel(h) { return h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? h + ' AM' : (h - 12) + ' PM'; }

  function bandStyle(slot, dur) {
    const left = (slot / 1440) * 100;
    const width = Math.min(dur, 1440 - slot) / 1440 * 100;
    return 'left:' + left + '%;width:' + width + '%';
  }

  function renderAssistant(plan) {
    const date = plan.dates[state.preview];
    const series = activeSeries(plan);
    const occ = series.occurrences[state.preview];
    const people = attendees();
    const fs = fairshiftOn();

    let hours = '';
    for (let h = 0; h < 24; h += 3) hours += '<span style="left:' + (h / 24) * 100 + '%">' + hourLabel(h) + '</span>';

    const rows = people.map((p, a) => {
      let cells = '';
      for (let c = 0; c < 48; c++) {
        const ms = F.zonedTime(date.y, date.m, date.d, c * 30, ORG_TZ);
        const wc = F.wallClock(ms, p.tz);
        const cat = F.categorize(wc.minute, wc.weekday, p);
        const busy = F.busyAt(wc.minute, wc.weekday, p);
        const cls = fs ? 'cat-' + cat : (cat === 'work' ? 'work' : 'off');
        const tip = fs
          ? p.name + ' · ' + DAY[wc.weekday] + ' ' + F.formatMinute(wc.minute) + ' (' + F.CATEGORIES[cat].label + ')' + (busy ? ' · ' + busy : '')
          : (busy ? p.name + ' · Busy' : p.name + ' · Free');
        cells += '<div class="cell ' + cls + (c % 2 === 0 ? ' hour' : '') + '" title="' + esc(tip) + '">' +
          (busy ? '<i class="busy"></i>' : '') + '</div>';
      }
      const s = occ.per[a];
      const local = fs
        ? '<div class="g-local"><b class="cat-text-' + s.worst + '">' + F.formatMinute(s.localMinute) + '</b>' +
          (s.localWeekday !== date.weekday ? '<em>' + DAY[s.localWeekday] + '</em>' : '') +
          '<span class="pill cat-' + s.worst + '">' + CAT_SHORT[s.worst] + '</span></div>'
        : '';
      const ghosts = rotating()
        ? plan.rotation.slots.filter((x) => x.slot !== occ.slot).map((x) =>
          '<div class="band ghost" style="' + bandStyle(x.slot, state.dur) + ';--bc:' + SLOT_COLORS[slotIndex(plan, x.slot)] + '"></div>').join('')
        : '';
      const bandColor = rotating() ? SLOT_COLORS[slotIndex(plan, occ.slot)] : '#0f6cbd';
      return '<div class="g-row">' +
        '<div class="g-name">' + avatar(p, 'small') + '<span><b>' + esc(p.name) + (fs && p.chrono ? (p.chrono === 'early' ? ' 🌅' : ' 🌙') : '') + '</b><small>' +
          (fs ? esc(p.city) + ' · ' + s.abbr : (a === 0 ? 'Organizer' : 'Required')) + '</small></span></div>' +
        '<div class="g-track" data-track>' + cells + ghosts +
          '<div class="band" style="' + bandStyle(occ.slot, state.dur) + ';--bc:' + bandColor + '"></div></div>' +
        local + '</div>';
    }).join('');

    const legend = fs
      ? '<div class="legend">' + ['work', 'edge', 'evening', 'late', 'sleep', 'weekend'].map((c) =>
        '<span><i class="sw cat-' + c + '"></i>' + CAT_SHORT[c] + '</span>').join('') + '<span><i class="sw busy-sw"></i>Busy</span></div>'
      : '<div class="legend"><span><i class="sw work"></i>Working hours</span><span><i class="sw off"></i>Outside working hours</span><span><i class="sw busy-sw"></i>Busy</span></div>';

    const week = rotating() || fs
      ? '<div class="week-nav"><button class="icon-btn" data-week="-1" aria-label="Previous meeting"' + (state.preview === 0 ? ' disabled' : '') + '>‹</button>' +
        '<span>Meeting ' + (state.preview + 1) + ' of ' + plan.dates.length + '</span>' +
        '<button class="icon-btn" data-week="1" aria-label="Next meeting"' + (state.preview === plan.dates.length - 1 ? ' disabled' : '') + '>›</button></div>'
      : '';

    const rotationKey = rotating()
      ? '<div class="rot-key">Rotation: ' + plan.rotation.slots.map((x, i) =>
        '<span class="slot-tag" style="--bc:' + SLOT_COLORS[i] + '">' + SLOT_NAMES[i] + '</span>' + F.formatMinute(x.slot) +
        ' <small>×' + x.uses + '</small>').join(' &nbsp; ') + '</div>'
      : '';

    $('#assistant').innerHTML =
      '<div class="g-head"><div class="g-title"><b>' + fmtDate(date) + ', ' + date.y + '</b><span>' +
        F.formatMinute(occ.slot) + ' – ' + F.formatMinute(occ.slot + state.dur) + ' · Pacific Time</span></div>' + week + '</div>' +
      legend +
      '<div class="g-scroll"><div class="grid">' +
        '<div class="g-row g-hours"><div class="g-name"></div><div class="g-track hours">' + hours + '</div>' + (fs ? '<div class="g-local head">Local time</div>' : '') + '</div>' +
        rows +
      '</div></div>' +
      '<div class="g-foot">' + (rotationKey || '<span class="muted">Click the grid to move the meeting. All times shown in your time zone (Pacific Time).</span>') + '</div>' +
      (fs ? renderTrend(plan) : '');
  }

  function niceStep(raw) {
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  }

  /** Cumulative burden per person across the series: fixed (dashed) vs. fair rotation (solid). */
  function renderTrend(plan) {
    const people = attendees();
    const n = plan.dates.length;
    const W = 760, H = 230, L = 44, R = 96, T = 14, B = 28;
    const cumulative = (series) => people.map((_, a) => {
      let v = plan.base[a];
      const pts = [v];
      series.occurrences.forEach((o) => { v += o.per[a].pain; pts.push(v); });
      return pts;
    });
    const fixedC = cumulative(plan.fixed);
    const rotC = rotating() ? cumulative(plan.rotation) : null;
    const maxY = Math.max(1, ...fixedC.flat(), ...(rotC ? rotC.flat() : []));
    const step = niceStep(maxY / 4);
    const top = Math.ceil(maxY / step) * step;
    const x = (i) => L + (i / n) * (W - L - R);
    const y = (v) => T + (1 - v / top) * (H - T - B);
    const path = (pts) => pts.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');

    let svg = '';
    for (let v = 0; v <= top + 1e-9; v += step) {
      svg += '<line class="tr-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        '<text class="tr-axis" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Math.round(v) + '</text>';
    }
    let lastLabel = -Infinity;
    plan.clockChanges.forEach((c) => {
      const cx = x(c.index);
      svg += '<line class="tr-dst" x1="' + cx + '" x2="' + cx + '" y1="' + T + '" y2="' + (H - B) + '"/>';
      if (cx - lastLabel > 34) { svg += '<text class="tr-axis" x="' + (cx + 3) + '" y="' + (T + 9) + '">DST</text>'; lastLabel = cx; }
    });
    [0, Math.floor(n / 2), n].forEach((i) => {
      const d = i === 0 ? plan.dates[0] : plan.dates[i - 1];
      svg += '<text class="tr-axis" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + (i === 0 ? 'Start' : MONTH[d.m - 1] + ' ' + d.d) + '</text>';
    });
    people.forEach((p, a) => {
      svg += '<path d="' + path(fixedC[a]) + '" class="tr-line' + (rotC ? ' faded' : '') + '" stroke="' + p.color + '"' + (rotC ? ' stroke-dasharray="5 4"' : '') + '/>';
      if (rotC) svg += '<path d="' + path(rotC[a]) + '" class="tr-line" stroke="' + p.color + '"/>';
    });
    // end-of-line labels, nudged apart so they never overlap
    const finals = people.map((p, a) => ({ p, v: (rotC || fixedC)[a][n], yy: y((rotC || fixedC)[a][n]) })).sort((m, k) => m.yy - k.yy);
    for (let i = 1; i < finals.length; i++) finals[i].yy = Math.max(finals[i].yy, finals[i - 1].yy + 14);
    finals.forEach((f) => {
      svg += '<text class="tr-label" x="' + (W - R + 8) + '" y="' + (f.yy + 4) + '" fill="' + f.p.color + '">' + esc(firstName(f.p)) + ' ' + Math.round(f.v) + '</text>';
    });

    return '<div class="trend"><div class="trend-head"><b>After-hours burden piling up over the series</b><span class="muted">' +
      (rotC ? '<i class="ln dashed"></i>Fixed time <i class="ln"></i>Fair rotation' : 'Cumulative burden pts per person') + '</span></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cumulative burden per attendee">' + svg + '</svg></div>';
  }

  function ring(score, label, sub, tone) {
    const r = 30;
    const circ = 2 * Math.PI * r;
    const dash = (score / 100) * circ;
    return '<div class="score ' + tone + '" data-anim="ring:' + label + '" data-val="' + score + '"><svg viewBox="0 0 76 76" width="76" height="76" aria-hidden="true">' +
      '<circle cx="38" cy="38" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="38" cy="38" r="' + r + '" class="ring-fg" stroke-dasharray="' + dash + ' ' + circ + '" transform="rotate(-90 38 38)"/>' +
      '<text x="38" y="44" text-anchor="middle">' + score + '</text></svg>' +
      '<div class="score-label"><b>' + label + '</b><small>' + sub + '</small></div></div>';
  }

  const tone = (score) => (score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad');

  function heaviest(series) {
    let idx = 0;
    series.series.forEach((v, i) => { if (v > series.series[idx]) idx = i; });
    return idx;
  }

  function insightText(plan) {
    const people = attendees();
    const fixed = plan.fixed;
    const h = heaviest(fixed);
    const hp = people[h];
    const occ0 = fixed.occurrences[0].per[h];
    const n = plan.dates.length;
    const share = Math.round(fixed.shares[h] * 100);
    if (fixed.seriesTotal <= 1e-9) {
      return '<p class="headline good-text">Everyone joins during working hours at ' + F.formatMinute(state.slot) + ' PT. Nothing to rotate — this time is already fair.</p>';
    }
    let html = '<p class="headline">At a fixed <b>' + F.formatMinute(state.slot) + ' PT</b>, ' + esc(firstName(hp)) + ' in ' + esc(hp.city) +
      ' joins at <b class="cat-text-' + occ0.worst + '">' + F.formatMinute(occ0.localMinute) + '</b>' +
      (fixed.lateCount[h] ? ' — ' + fixed.lateCount[h] + ' of ' + n + ' meetings at night' : '') +
      '. That is <b>' + share + '%</b> of the team\'s after-hours load on one person.</p>';
    if (rotating()) {
      const r = plan.rotation;
      const drop = fixed.series[h] > 0 ? Math.round((1 - r.series[h] / fixed.series[h]) * 100) : 0;
      const lateBefore = fixed.lateCount.reduce((a, b) => a + b, 0);
      const lateAfter = r.lateCount.reduce((a, b) => a + b, 0);
      html += '<p class="headline good-text">' + (r.slots.length > 1 ? 'Fairshift rotates between ' : 'Fairshift moves the series to ') +
        r.slots.map((x) => '<b>' + F.formatMinute(x.slot) + '</b>').join(' and ') + ' PT. ' + esc(firstName(hp)) + '\'s load drops <b>' + drop + '%</b>' +
        (lateBefore !== lateAfter ? ', night or pre-dawn joins go from <b>' + lateBefore + ' → ' + lateAfter + '</b>' : '') +
        ', and the heaviest load is ' + (r.fairness >= 99 ? 'as low as these time zones allow' : 'within ' + (100 - r.fairness) + '% of the fairest possible schedule') + '.' +
        (fixed.lateCount[h] > r.lateCount[h]
          ? ' That is about <b>' + Math.round(((fixed.lateCount[h] - r.lateCount[h]) * 52) / n) + ' late nights a year</b> ' + esc(firstName(hp)) + ' gets back.'
          : '') + '</p>';
    }
    return html;
  }

  function renderInsights(plan) {
    if (!fairshiftOn()) {
      const people = attendees();
      const h = heaviest(plan.fixed);
      const s = plan.fixed.occurrences[0].per[h];
      $('#insights').innerHTML =
        '<div class="today-card"><div class="today-eyebrow">How it works today</div>' +
        '<h3>Everyone looks free. Ship it?</h3>' +
        '<p>The Scheduling Assistant shows free/busy in <b>your</b> time zone. It never says that ' + F.formatMinute(state.slot) +
        ' PT is <b>' + F.formatMinute(s.localMinute) + '</b> for ' + esc(people[h].name) + ' — or that a recurring series will put them there <b>' +
        plan.dates.length + ' times</b>.</p>' +
        '<ul><li>No local-time view per attendee</li><li>No memory of who keeps taking the late call</li><li>Recurring meetings are frozen at one time forever</li></ul>' +
        '<button class="btn primary wide" data-mode-switch="fairshift">See it with Fairshift ✦</button></div>';
      return;
    }

    const people = attendees();
    const fixed = plan.fixed;
    const rot = plan.rotation;
    const showRot = rotating();
    const maxVal = Math.max(1e-9, ...fixed.totals, ...(showRot ? rot.totals : []));

    const scores = '<div class="score-row" id="scoreRow">' +
      ring(fixed.fairness, 'Fixed time', F.formatMinute(state.slot) + ' PT every week', tone(fixed.fairness)) +
      (showRot
        ? '<span class="score-arrow">→</span>' + ring(rot.fairness, 'Fair rotation', rot.slots.length > 1 ? rot.slots.length + ' rotating times' : 'one fairer time', tone(rot.fairness))
        : '<button class="cta" id="ctaRotate"><span class="spark">✦</span><b>Rotate fairly</b><small>Fairness ' + rot.fairness + (rot.slots.length > 1 ? ' with ' + rot.slots.length + ' rotating times' : ' at one fairer time') + '</small></button>') +
      '</div>' +
      (!showRot && plan.single.slot !== state.slot && plan.single.fairness > fixed.fairness
        ? '<div class="alt">Prefer one fixed time? <b>' + F.formatMinute(plan.single.slot) + ' PT</b> scores <b>' + plan.single.fairness +
          '</b>. <button class="link" data-use-slot="' + plan.single.slot + '">Use it</button></div>'
        : '');

    const loads = people.map((p, a) => {
      const ledger = plan.base[a];
      const bar = (series, cls) => {
        const total = series.totals[a];
        const lw = (ledger / maxVal) * 100;
        const fw = ((total - ledger) / maxVal) * 100;
        return '<div class="bar ' + cls + '"><i class="bar-ledger" data-anim="bl:' + cls + ':' + p.id + '" data-val="' + lw + '" style="width:' + lw + '%"></i>' +
          '<i class="bar-fill" data-anim="bf:' + cls + ':' + p.id + '" data-val="' + fw + '" style="width:' + fw + '%"></i>' +
          '<span>' + fmtPts(total) + '</span></div>';
      };
      const late = showRot ? rot.lateCount[a] : fixed.lateCount[a];
      return '<div class="load">' + avatar(p, 'small') +
        '<div class="load-main"><div class="load-name"><b>' + esc(firstName(p)) + '</b><small>' + esc(p.city) + '</small>' +
          '<em>' + Math.round((showRot ? rot.shares[a] : fixed.shares[a]) * 100) + '% of load</em></div>' +
          bar(fixed, 'fixed') + (showRot ? bar(rot, 'rot') : '') +
          '<div class="load-meta">' + (late ? late + ' night / pre-dawn ' + (late === 1 ? 'join' : 'joins') : 'No night or pre-dawn joins') +
          (ledger ? ' · carrying ' + fmtPts(ledger) + ' pts from other meetings' : '') + '</div>' +
        '</div></div>';
    }).join('');

    const legendBars = '<div class="bar-legend"><span><i class="sw fixed"></i>Fixed time</span>' +
      (showRot ? '<span><i class="sw rot"></i>Fair rotation</span>' : '') +
      (state.useLedger ? '<span><i class="sw ledger"></i>Ledger</span>' : '') + '</div>';

    const series = activeSeries(plan);
    const changes = new Map(plan.clockChanges.map((c) => [c.index, c.people]));
    const list = series.occurrences.map((occ, i) => {
      const change = changes.get(i);
      const note = change
        ? '<div class="dst-note">🕑 Clocks change for ' + change.map((id) => esc(firstName(PEOPLE[id]))).join(', ') +
          ' relative to you — every time below is re-scored</div>'
        : '';
      const si = showRot ? slotIndex(plan, occ.slot) : 0;
      const tags = occ.per.map((s, a) => '<span class="mini cat-' + s.worst + '" title="' + esc(people[a].name) + ': ' +
        F.formatMinute(s.localMinute) + ' ' + s.abbr + '">' + esc(initials(people[a].name)) + ' ' + F.formatMinute(s.localMinute).replace(':00', '') + '</span>').join('');
      return note + '<button class="occ' + (i === state.preview ? ' active' : '') + '" data-occ="' + i + '">' +
        '<span class="occ-date">' + DAY[occ.date.weekday] + ' ' + MONTH[occ.date.m - 1] + ' ' + occ.date.d + '</span>' +
        '<span class="occ-time">' + (showRot ? '<i class="slot-tag" style="--bc:' + SLOT_COLORS[si] + '">' + SLOT_NAMES[si] + '</i>' : '') +
          F.formatMinute(occ.slot) + '</span>' +
        '<span class="occ-people">' + tags + '</span></button>';
    }).join('');

    $('#insights').innerHTML =
      '<div class="ins-head"><span class="spark">✦</span><div><b>Fairshift insights</b><small>' + plan.dates.length + ' meetings · ' +
        MONTH[plan.dates[0].m - 1] + ' ' + plan.dates[0].d + ' – ' + MONTH[plan.dates[plan.dates.length - 1].m - 1] + ' ' +
        plan.dates[plan.dates.length - 1].d + '</small></div></div>' +
      scores + insightText(plan) +
      '<h4>Who carries the after-hours load <span class="muted">(burden pts)</span></h4>' + legendBars +
      '<div class="loads" id="loads">' + loads + '</div>' +
      '<h4>' + (showRot ? 'Rotating series' : 'Series at a fixed time') + '</h4>' +
      '<div class="series" id="series">' + list + '</div>' +
      '<details class="how"><summary>How burden is scored</summary>' +
        '<p>Each attendee\'s minutes are scored in <b>their</b> local time, per occurrence, with real DST rules:</p>' +
        '<table>' + ['edge', 'evening', 'weekend', 'late', 'sleep'].map((c) =>
          '<tr><td><i class="sw cat-' + c + '"></i>' + F.CATEGORIES[c].label + '</td><td>' + F.CATEGORIES[c].weight + ' pt/hr</td></tr>').join('') + '</table>' +
        '<p>The planner searches every half-hour of the day and every combination of up to three rotating times, ' +
        'protecting the most-burdened person first (minimax), then minimising total after-hours time. ' +
        '<b>Fairness 100</b> = the heaviest load is as low as these time zones physically allow.</p></details>';
  }

  // ---------------------------------------------------------------------------
  // Invite preview
  // ---------------------------------------------------------------------------

  function openInvite() {
    const plan = currentPlan();
    const people = attendees();
    const series = activeSeries(plan);
    const when = rotating()
      ? 'Weekly on Tuesday · rotates between ' + plan.rotation.slots.map((x) => F.formatMinute(x.slot)).join(' / ') + ' PT'
      : 'Weekly on Tuesday · ' + F.formatMinute(state.slot) + ' PT';
    const note = rotating()
      ? '<div class="invite-note"><span class="spark">✦</span><div><b>This series rotates fairly.</b> To share the after-hours load across ' +
        people.map((p) => esc(p.city)).join(', ') + ', the start time alternates. Nobody joins during sleep hours. ' +
        'Each occurrence shows in your calendar at your own local time.</div></div>'
      : '';
    const rows = series.occurrences.slice(0, 6).map((occ) => '<tr><td>' + fmtDate(occ.date) + '</td>' +
      occ.per.map((s) => '<td class="cat-text-' + s.worst + '">' + F.formatMinute(s.localMinute) + ' ' + s.abbr + '</td>').join('') + '</tr>').join('');
    $('#modalBody').innerHTML =
      '<dl class="invite"><dt>To</dt><dd>' + people.slice(1).map((p) => esc(p.name)).join('; ') + '</dd>' +
      '<dt>Subject</dt><dd>' + esc(state.title || 'Untitled event') + '</dd><dt>When</dt><dd>' + when + '</dd></dl>' + note +
      '<table class="invite-table"><thead><tr><th>Next meetings</th>' + people.map((p) => '<th>' + esc(firstName(p)) + '</th>').join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
    $('#modal').hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Guided demo
  // ---------------------------------------------------------------------------

  function tourSteps() {
    const plan = currentPlan();
    const people = attendees();
    const h = heaviest(plan.fixed);
    const hp = people[h];
    const s = plan.fixed.occurrences[0].per[h];
    return [
      { setup: () => { loadScenario('us-uk-in'); state.mode = 'classic'; state.rotate = false; state.useLedger = false; },
        target: '#assistant', text: 'This is Outlook\'s Scheduling Assistant today. Maya in San Francisco books a weekly sync at 9:00 AM. Everyone is free — looks perfect.' },
      { setup: () => { state.mode = 'fairshift'; }, target: '#assistant',
        text: () => 'Fairshift paints every row in that person\'s own local time. 9:00 AM for Maya is ' + F.formatMinute(s.localMinute) + ' for ' + hp.name + ' in ' + hp.city + ' — every week.' },
      { target: '#scoreRow', text: () => 'Across ' + plan.dates.length + ' meetings, ' + firstName(hp) + ' carries ' + Math.round(plan.fixed.shares[h] * 100) + '% of the after-hours load. Fairness score: ' + plan.fixed.fairness + '.' },
      { setup: () => { state.rotate = true; }, target: '#fsCard',
        text: 'One switch: Rotate time fairly. Fairshift searches every half-hour and every rotation of up to three times, protecting the most-burdened person first and keeping everyone out of sleep hours.' },
      { target: '#loads', text: () => { const p = currentPlan(); return firstName(hp) + '\'s load drops ' + Math.round((1 - p.rotation.series[h] / p.fixed.series[h]) * 100) + '%. The organizer shares the early slot. Fairness ' + p.fixed.fairness + ' → ' + p.rotation.fairness + '.'; } },
      { setup: () => { state.useLedger = true; }, target: '#fsCard',
        text: 'Fairness ledger: Fairshift remembers who already takes late calls in other meetings, and leans the rotation to spare them.' },
      { setup: () => { state.useLedger = false; state.chrono = { maya: 'early' }; }, target: '#chips',
        text: 'Preferences count too. Maya is an early bird, so Fairshift leans on her mornings and spares Priya\'s evenings even more.' },
      { target: '#series', text: 'DST-aware: clocks change on different dates in the US, UK and India. Every occurrence is re-scored with real time-zone rules.' },
      { target: '#sendBtn', text: 'Send — the invite explains the rotation, so nobody is surprised when the time moves.', after: openInvite },
    ];
  }

  let tourIndex = -1;
  let steps = [];

  function showTourStep() {
    document.querySelectorAll('.tour-focus').forEach((el) => el.classList.remove('tour-focus'));
    const step = steps[tourIndex];
    if (step.setup) step.setup();
    render();
    const target = $(step.target);
    if (target) { target.classList.add('tour-focus'); target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    $('#tourStep').textContent = 'Step ' + (tourIndex + 1) + ' of ' + steps.length;
    $('#tourText').textContent = typeof step.text === 'function' ? step.text() : step.text;
    $('#tourNext').textContent = tourIndex === steps.length - 1 ? 'Finish' : 'Next';
    $('#tour').hidden = false;
  }

  function startTour(at) {
    $('#modal').hidden = true;
    loadScenario('us-uk-in');
    state.mode = 'classic';
    steps = tourSteps();
    tourIndex = Math.max(0, Math.min(steps.length - 1, at || 0));
    for (let i = 0; i < tourIndex; i++) if (steps[i].setup) steps[i].setup();
    showTourStep();
  }

  function endTour() {
    document.querySelectorAll('.tour-focus').forEach((el) => el.classList.remove('tour-focus'));
    $('#tour').hidden = true;
    tourIndex = -1;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  document.addEventListener('change', (e) => {
    const t = e.target;
    switch (t.id) {
      case 'slot': state.slot = +t.value; break;
      case 'dur': state.dur = +t.value; break;
      case 'occ': state.occurrences = +t.value; break;
      case 'rotate': state.rotate = t.checked; break;
      case 'maxSlots': state.maxSlots = +t.value; break;
      case 'protectSleep': state.protectSleep = t.checked; break;
      case 'useLedger': state.useLedger = t.checked; break;
      case 'scenario': loadScenario(t.value); break;
      case 'addPerson': if (t.value) state.people.push(t.value); break;
      default: return;
    }
    render();
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'title') state.title = e.target.value;
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    const mode = t.closest('[data-mode], [data-mode-switch]');
    if (mode) { state.mode = mode.dataset.mode || mode.dataset.modeSwitch; render(); return; }
    const remove = t.closest('[data-remove]');
    if (remove) { state.people = state.people.filter((id) => id !== remove.dataset.remove); render(); return; }
    const occ = t.closest('[data-occ]');
    if (occ) { state.preview = +occ.dataset.occ; render(); return; }
    const week = t.closest('[data-week]');
    if (week) { state.preview = Math.max(0, state.preview + +week.dataset.week); render(); return; }
    if (t.closest('#ctaRotate')) { state.rotate = true; render(); return; }
    const chrono = t.closest('[data-chrono]');
    if (chrono) {
      const id = chrono.dataset.chrono;
      const next = { undefined: 'early', early: 'late', late: undefined }[String(state.chrono[id])];
      if (next) state.chrono[id] = next; else delete state.chrono[id];
      render();
      return;
    }
    const useSlot = t.closest('[data-use-slot]');
    if (useSlot) { state.slot = +useSlot.dataset.useSlot; render(); return; }
    const track = t.closest('[data-track]');
    if (track && !track.classList.contains('hours')) {
      const rect = track.getBoundingClientRect();
      const frac = Math.max(0, Math.min(0.999, (e.clientX - rect.left) / rect.width));
      state.slot = Math.floor(frac * 48) * 30;
      if (state.rotate) state.rotate = false;
      render();
      return;
    }
    if (t.closest('#sendBtn')) { openInvite(); return; }
    if (t.closest('#modalClose') || t.closest('#modalOk') || t.id === 'modal') { $('#modal').hidden = true; return; }
    if (t.closest('#tourBtn')) { startTour(0); return; }
    if (t.closest('#tourSkip')) { endTour(); return; }
    if (t.closest('#tourNext')) {
      const step = steps[tourIndex];
      if (tourIndex >= steps.length - 1) { endTour(); if (step.after) step.after(); return; }
      if (step.after) step.after();
      tourIndex += 1;
      showTourStep();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('#modal').hidden = true; endTour(); }
  });

  loadScenario('us-uk-in');
  const params = new URLSearchParams(location.search);
  if (params.get('mode') === 'classic') state.mode = 'classic';
  if (params.get('rotate') === '1') state.rotate = true;
  if (params.get('ledger') === '1') state.useLedger = true;
  if (params.get('team') && SCENARIOS[params.get('team')]) loadScenario(params.get('team'));
  render();
  if (params.has('tour')) startTour(Math.max(0, (parseInt(params.get('tour'), 10) || 1) - 1));
  if (params.get('invite') === '1') openInvite();
})();
