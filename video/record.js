/*
 * Records the demo video: drives the real app in headless Chrome over the
 * DevTools protocol (visible cursor, title/end cards), captures a screencast,
 * then muxes it with the Kokoro voiceover using ffmpeg.
 *
 * usage: node video/record.js <appUrl> <voDir> <outDir>
 *   voDir holds s01.wav … s11.wav + durations.json from tts.py
 */
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const [, , APP, VO, OUT] = process.argv;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9339;
const W = 1536, H = 864, DSF = 1.25; // renders 1920×1080
const durations = JSON.parse(fs.readFileSync(path.join(VO, 'durations.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(path.join(OUT, 'frames'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile'),
  '--hide-scrollbars', '--window-size=' + W + ',' + H, '--force-device-scale-factor=' + DSF, 'about:blank',
], { stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

(async () => {
  const ws = new WebSocket(await connect());
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let nextId = 0;
  const pending = new Map();
  const frames = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    } else if (msg.method === 'Page.screencastFrame') {
      const { data, metadata, sessionId } = msg.params;
      const file = path.join(OUT, 'frames', 'f' + String(frames.length).padStart(6, '0') + '.jpg');
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      frames.push({ file, t: metadata.timestamp || Date.now() / 1000 });
      send('Page.screencastFrameAck', { sessionId });
    }
  });
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  async function js(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(expr.slice(0, 80) + ' → ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
    return r.result.value;
  }
  const q = JSON.stringify;
  const move = (sel, fx, fy) => js('__d.move(' + q(sel) + ',' + (fx == null ? 0.5 : fx) + ',' + (fy == null ? 0.5 : fy) + ')');
  async function click(sel, fx, fy) {
    await move(sel, fx, fy);
    await sleep(1100);
    await js('__d.ripple(); document.querySelector(' + q(sel) + ').click()');
    await sleep(350);
  }
  async function choose(sel, value) {
    await move(sel, 0.5, 0.5);
    await sleep(1100);
    await js('__d.ripple(); (function(){const s=document.querySelector(' + q(sel) + '); s.value=' + q(value) +
      '; s.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await sleep(350);
  }
  const focus = (sel) => js('__d.focus(' + q(sel || '') + ')');

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
  await send('Page.navigate', { url: APP + '?mode=classic' });
  await sleep(2500);
  await js(fs.readFileSync(path.join(__dirname, 'overlay.js'), 'utf8'));
  await js('__d.titleCard()');
  await sleep(600);

  await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  // keep frames flowing even when the page is static
  await js('__d.heartbeat()');
  await sleep(400);

  const scenes = [];
  async function scene(id, action, pad) {
    const start = Date.now() / 1000;
    scenes.push({ id, start });
    const length = (durations[id] + 0.35 + (pad == null ? 0.9 : pad)) * 1000;
    const t0 = Date.now();
    await action();
    const left = length - (Date.now() - t0);
    if (left > 0) await sleep(left);
  }

  await scene('s01', async () => {
    await sleep(durations.s01 * 1000 - 300);
    await js('__d.hideCard()');
  }, 1.4);

  await scene('s02', async () => {
    await sleep(800);
    await move('.g-row:nth-child(2) .band');
    await sleep(3200);
    await move('.g-row:nth-child(4) .band');
    await sleep(2600);
    await move('.today-card h3', 0.3, 0.5);
  });

  await scene('s03', async () => {
    await click('.seg-btn[data-mode="fairshift"]');
    await sleep(2200);
    await move('.g-row:nth-child(2) .g-track', 0.2, 0.5);
    await sleep(2600);
    await move('.g-row:nth-child(4) .g-local', 0.4, 0.4);
    await focus('.g-row:nth-child(4)');
    await sleep(5200);
    await move('.g-row:nth-child(4) .g-track', 0.62, 0.5);
  });

  await scene('s04', async () => {
    await focus('#insights');
    await move('#insights .headline', 0.5, 0.6);
    await sleep(4300);
    await move('#scoreRow .score', 0.2, 0.5);
  });

  await scene('s05', async () => {
    await focus('');
    await sleep(1400);
    await click('#rotate');
    await focus('#fsCard');
    await sleep(3500);
    await move('#assistant .rot-key', 0.4, 0.5);
    await focus('#assistant');
  });

  await scene('s06', async () => {
    await focus('#assistant .trend');
    await move('#assistant .trend svg', 0.85, 0.55);
    await sleep(4200);
    await focus('#loads');
    await move('#loads .load:nth-child(3) .bar.rot', 0.4, 0.5);
    await sleep(5200);
    await focus('#scoreRow');
    await move('#scoreRow .score:last-of-type', 0.25, 0.5);
    await sleep(3800);
    await focus('#insights .good-text');
  });

  await scene('s07', async () => {
    await focus('');
    await js('__d.scrollToSeries()');
    await sleep(1600);
    await js('__d.scrollSeriesToDst()');
    await sleep(1500);
    await focus('#series');
    await click('#series .dst-note + .occ');
    await focus('#series');
    await sleep(2200);
    await js('window.scrollTo({top:0,behavior:"smooth"})');
    await sleep(1200);
    await focus('#assistant');
  });

  await scene('s08', async () => {
    await focus('');
    await click('[data-chrono="maya"]');
    await focus('#chips');
    await sleep(3200);
    await move('#scoreRow .score:last-of-type', 0.25, 0.5);
    await focus('#insights .good-text');
  });

  await scene('s09', async () => {
    await focus('');
    await js('document.querySelector("#scenario").scrollIntoView({block:"center",behavior:"smooth"})');
    await sleep(900);
    await choose('#scenario', 'follow-sun');
    await js('window.scrollTo({top:0,behavior:"smooth"})');
    await sleep(1800);
    await focus('#assistant');
    await move('.g-row:nth-child(5) .g-local', 0.4, 0.4);
    await sleep(2400);
    await js('document.querySelector("#useLedger").scrollIntoView({block:"center",behavior:"smooth"})');
    await sleep(900);
    await click('#useLedger');
    await focus('#fsCard');
    await sleep(2600);
    await js('window.scrollTo({top:0,behavior:"smooth"})');
    await sleep(900);
    await focus('#scoreRow');
    await move('#scoreRow .score:last-of-type', 0.25, 0.5);
  });

  await scene('s10', async () => {
    await focus('');
    await click('#sendBtn');
    await sleep(1200);
    await move('.invite-note', 0.5, 0.5);
    await sleep(2400);
    await move('.invite-table', 0.6, 0.6);
  }, 0.6);

  await scene('s11', async () => {
    await click('#modalOk');
    await sleep(500);
    await js('__d.endCard()');
  }, 2.6);

  const end = Date.now() / 1000;
  await send('Page.stopScreencast');
  await sleep(300);
  ws.close();
  chrome.kill();

  // ---- assemble ----
  const t0 = frames[0].t;
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : f.t + Math.max(0.04, end - f.t);
    lines.push('file ' + q(path.basename(f.file)).replace(/"/g, "'"), 'duration ' + Math.max(0.001, next - f.t).toFixed(4));
  });
  lines.push('file ' + q(path.basename(frames[frames.length - 1].file)).replace(/"/g, "'"));
  fs.writeFileSync(path.join(OUT, 'frames', 'list.ffconcat'), lines.join('\n'));
  const offsets = scenes.map((s) => ({ id: s.id, at: Math.max(0, s.start - t0 + 0.35) }));
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ frames: frames.length, length: end - t0, offsets }, null, 2));
  console.log('frames', frames.length, 'length', (end - t0).toFixed(1) + 's');

  const silent = path.join(OUT, 'silent.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames', 'list.ffconcat'),
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', silent]);

  const args = ['-y', '-loglevel', 'error', '-i', silent];
  offsets.forEach((o) => args.push('-i', path.join(VO, o.id + '.wav')));
  const chains = offsets.map((o, i) => '[' + (i + 1) + ':a]aresample=48000,adelay=' + Math.round(o.at * 1000) + ':all=1[a' + i + ']');
  const mix = offsets.map((_, i) => '[a' + i + ']').join('') + 'amix=inputs=' + offsets.length + ':normalize=0,' +
    'loudnorm=I=-16:TP=-1.5:LRA=11,apad[vo]';
  args.push('-filter_complex', chains.concat(mix).join(';'), '-map', '0:v', '-map', '[vo]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', path.join(OUT, 'fairshift-demo.mp4'));
  execFileSync('ffmpeg', args);
  console.log('wrote', path.join(OUT, 'fairshift-demo.mp4'));
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
