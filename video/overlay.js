/* Injected into the page while recording: fake cursor, click ripples, soft spotlight, title/end cards. */
(function () {
  const css = `
  #fc { position: fixed; left: 980px; top: 620px; z-index: 100001; pointer-events: none; margin: -3px 0 0 -5px;
        transition: left 1s cubic-bezier(.45,0,.2,1), top 1s cubic-bezier(.45,0,.2,1); filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
  .fc-ripple { position: fixed; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; border: 2.5px solid #8764b8;
               z-index: 100000; pointer-events: none; animation: fcr .7s ease-out forwards; }
  @keyframes fcr { to { transform: scale(3.4); opacity: 0; } }
  .vfocus { position: relative; z-index: 40; outline: 3px solid rgba(135,100,184,.95) !important; outline-offset: 4px; border-radius: 8px;
            box-shadow: 0 0 0 9999px rgba(20,18,40,.17) !important; }
  .vcard { position: fixed; inset: 0; z-index: 100000; display: grid; place-items: center; color: #fff; text-align: center;
           background: radial-gradient(1100px 680px at 28% 18%, #44357a 0%, #1f1c3a 52%, #0f0e1c 100%); transition: opacity 1s ease; }
  .vcard.hide { opacity: 0; pointer-events: none; }
  .vcard > div > * { opacity: 0; animation: vrise 1s cubic-bezier(.2,.7,.2,1) forwards; }
  .vcard .d1 { animation-delay: .5s; } .vcard .d2 { animation-delay: 1.1s; } .vcard .d3 { animation-delay: 1.9s; } .vcard .d4 { animation-delay: 2.7s; }
  @keyframes vrise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  .vc-badge { display: inline-block; font-size: 15px; letter-spacing: .14em; text-transform: uppercase; color: #c7b8ef; border: 1px solid rgba(199,184,239,.35);
              padding: 6px 14px; border-radius: 20px; }
  .vc-title { font-size: 104px; font-weight: 700; letter-spacing: -.02em; margin: 22px 0 6px; }
  .vc-title span { color: #b69df0; }
  .vc-sub { font-size: 34px; color: #e6defa; font-weight: 400; }
  .vc-clocks { display: flex; gap: 18px; justify-content: center; margin-top: 46px; }
  .vc-clock { min-width: 230px; padding: 16px 22px; border-radius: 14px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); text-align: left; }
  .vc-clock small { display: block; font-size: 15px; color: #b9b2d6; }
  .vc-clock b { font-size: 36px; font-weight: 600; }
  .vc-clock.bad { background: rgba(209,52,56,.18); border-color: rgba(255,120,120,.45); }
  .vc-clock.bad b { color: #ffb4b4; }
  .vc-stats { display: flex; gap: 18px; justify-content: center; margin: 40px 0 34px; }
  .vc-stat { padding: 16px 24px; border-radius: 14px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); min-width: 220px; }
  .vc-stat b { display: block; font-size: 40px; color: #9fe3a0; }
  .vc-stat small { font-size: 16px; color: #cfc8ea; }
  .vc-note { font-size: 19px; color: #d9d2f2; }
  .vc-links { margin-top: 22px; font-size: 18px; color: #b9b2d6; }
  .vc-links b { color: #fff; font-weight: 600; }
  .vc-fine { margin-top: 26px; font-size: 13px; color: #8f88b0; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const cursor = document.createElement('div');
  cursor.id = 'fc';
  cursor.innerHTML = '<svg width="30" height="30" viewBox="0 0 28 28"><path d="M5 3 L5 22 L10 17.5 L13.5 25 L17 23.5 L13.5 16 L20 16 Z" ' +
    'fill="#fff" stroke="#1b1a2e" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(cursor);

  function card(html) {
    let el = document.getElementById('vcard');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'vcard';
    el.className = 'vcard';
    el.innerHTML = '<div>' + html + '</div>';
    document.body.appendChild(el);
    return el;
  }

  window.__d = {
    move(sel, fx, fy) {
      const el = document.querySelector(sel);
      if (!el) throw new Error('missing ' + sel);
      const r = el.getBoundingClientRect();
      cursor.style.left = r.left + r.width * fx + 'px';
      cursor.style.top = r.top + r.height * fy + 'px';
    },
    ripple() {
      const r = document.createElement('div');
      r.className = 'fc-ripple';
      r.style.left = cursor.style.left;
      r.style.top = cursor.style.top;
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 800);
    },
    focus(sel) {
      document.querySelectorAll('.vfocus').forEach((e) => e.classList.remove('vfocus'));
      if (sel) { const el = document.querySelector(sel); if (el) el.classList.add('vfocus'); }
    },
    scrollToSeries() {
      const el = document.querySelector('#series');
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 300, behavior: 'smooth' });
    },
    scrollSeriesToDst() {
      const s = document.querySelector('#series');
      const n = s.querySelector('.dst-note');
      s.scrollTo({ top: n.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop - 70, behavior: 'smooth' });
    },
    heartbeat() {},
    titleCard() {
      card('<div class="vc-badge d1">Hack to the Future · a feature for Outlook Calendar</div>' +
        '<div class="vc-title d2"><span>✦</span> Fairshift</div>' +
        '<div class="vc-sub d2">Who’s always taking the 10:30 PM call?</div>' +
        '<div class="vc-clocks d3">' +
          '<div class="vc-clock"><small>San Francisco</small><b>9:00 AM</b></div>' +
          '<div class="vc-clock"><small>London</small><b>5:00 PM</b></div>' +
          '<div class="vc-clock bad"><small>Bengaluru</small><b>10:30 PM</b></div>' +
        '</div>');
    },
    hideCard() {
      const el = document.getElementById('vcard');
      if (el) { el.classList.add('hide'); setTimeout(() => el.remove(), 1100); }
    },
    endCard() {
      card('<div class="vc-title d1" style="font-size:88px;margin-top:0"><span>✦</span> Fairshift</div>' +
        '<div class="vc-sub d1">Share the late calls.</div>' +
        '<div class="vc-stats d2">' +
          '<div class="vc-stat"><b>37 → 97</b><small>fairness score</small></div>' +
          '<div class="vc-stat"><b>−61%</b><small>load on the most-burdened person</small></div>' +
          '<div class="vc-stat"><b>0</b><small>meetings in anyone’s sleep hours</small></div>' +
        '</div>' +
        '<div class="vc-note d3">Ships on what Outlook already has: working hours · time zones · recurring events with exceptions</div>' +
        '<div class="vc-links d4">Try it: <b>ashank-crazy.github.io/outlook-fairshift</b> &nbsp;·&nbsp; Code: <b>github.com/ashank-crazy/outlook-fairshift</b></div>' +
        '<div class="vc-fine d4">Unofficial concept prototype · not affiliated with or endorsed by Microsoft · all people are fictional</div>');
    },
  };
})();
