(() => {
  'use strict';
  const body = document.body;
  const byId = id => document.getElementById(id);
  const front = byId('front-view');
  const scene = byId('scene-view');
  const arrival = byId('arrival');
  const header = byId('night-header');
  const artworkViewer = byId('artwork-viewer');
  const paintings = [...front.querySelectorAll('.painting-selection')];
  let currentPainting = 0;
  let artworksLoaded = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let returnFocus = byId('explore-btn');
  let chosenStill = null;

  function setView(view, trigger) {
    if (trigger) returnFocus = trigger;
    body.dataset.view = view;
    const vending = view === 'vending';
    if (vending) loadPaintings();
    else if (artworkViewer.open) artworkViewer.close();
    front.inert = !vending;
    front.setAttribute('aria-hidden', String(!vending));
    front.classList.toggle('visible', vending);
    scene.inert = view !== 'street';
    arrival.inert = view !== 'street';
    header.inert = false;   // the navbar stays reachable inside the machine view
    byId('machine-cue').inert = view !== 'street';
    byId('street-footnote').setAttribute('aria-hidden', String(view !== 'street'));
    // focus the view itself, not the first painting: focusing a button paints a
    // focus ring on entry for mouse users, and the container carries the label
    if (vending) front.focus({ preventScroll: true });
    else returnFocus.focus({ preventScroll: true });
    byId('nav-street').setAttribute('aria-current', vending ? 'false' : 'page');
    byId('nav-machine').setAttribute('aria-current', vending ? 'page' : 'false');
    document.dispatchEvent(new Event('night-motion-change'));
  }
  [byId('vm-hit'), byId('explore-btn'), byId('machine-cue')].forEach(el => {
    el.addEventListener('click', () => setView('vending', el.id === 'machine-cue' ? byId('explore-btn') : el));
  });
  byId('vm-hit').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView('vending', e.currentTarget); }
  });
  byId('nav-street').addEventListener('click', e => setView('street', e.currentTarget));
  byId('nav-machine').addEventListener('click', e => setView('vending', e.currentTarget));
  document.addEventListener('keydown', e => {
    if (artworkViewer.open) {
      if (e.key === 'ArrowRight') { e.preventDefault(); showPainting(currentPainting + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); showPainting(currentPainting - 1); }
      return; // The native painting dialog owns Escape and focus while open.
    }
    if (e.key === 'Escape' && body.dataset.view === 'vending') setView('street');
    // No Tab trap here any more: the navbar is outside this view and is now the
    // only way back to the street, so cycling focus inside the cabinet would
    // strand keyboard users. The street scene stays inert, so natural tab order
    // is just the navbar plus the paintings.
  });
  byId('night-header').querySelector('a').addEventListener('click', e => {
    e.preventDefault(); returnFocus = byId('explore-btn'); setView('street');
  });

  function positionScene() {
    const scale = Math.max(innerWidth / 1200, innerHeight / 675);
    const x = (innerWidth - 1200 * scale) / 2 + 570 * scale;
    const y = (innerHeight - 675 * scale) / 2 + 326 * scale;
    body.style.setProperty('--machine-x', x + 'px');
    body.style.setProperty('--machine-y', y + 'px');
    // Keep the title on the physical billboard even when the street is cropped.
    const billboard = byId('billboard');
    if (innerWidth <= 640) {
      const size = Math.min(.72, (innerWidth - 48) / scale / 430);
      const left = (1200 - innerWidth / scale) / 2 + 24 / scale;
      billboard.setAttribute('transform', `translate(${left - 42 * size} ${318 - 502 * size}) scale(${size})`);
    } else billboard.removeAttribute('transform');
  }
  positionScene();
  addEventListener('resize', positionScene, { passive: true });

  function loadPaintings() {
    if (artworksLoaded) return;
    artworksLoaded = true;
    front.querySelectorAll('img[data-src]').forEach(img => { img.src = img.dataset.src; });
  }
  function showPainting(index) {
    currentPainting = (index + paintings.length) % paintings.length;
    const painting = paintings[currentPainting];
    byId('artwork-title').textContent = painting.dataset.title;
    byId('artwork-number').textContent = `${painting.dataset.artId} / ${String(paintings.length).padStart(2, '0')}`;
    const fullImage = byId('artwork-image');
    fullImage.src = painting.dataset.image;
    fullImage.alt = `${painting.dataset.title}, demo painting`;
    byId('lcd-code').textContent = painting.dataset.artId;
  }
  paintings.forEach((painting, index) => painting.addEventListener('click', () => {
    showPainting(index);
    remember(painting);
    artworkViewer.showModal();
  }));
  byId('close-artwork').addEventListener('click', () => artworkViewer.close());
  byId('previous-artwork').addEventListener('click', () => showPainting(currentPainting - 1));
  byId('next-artwork').addEventListener('click', () => showPainting(currentPainting + 1));
  artworkViewer.addEventListener('close', () => paintings[currentPainting].focus({ preventScroll: true }));
  [byId('vm-hit'), byId('explore-btn'), byId('nav-machine')].forEach(control => {
    control.addEventListener('pointerenter', loadPaintings, { once: true });
    control.addEventListener('focus', loadPaintings, { once: true });
  });

  function syncMotion() {
    const still = reduced.matches || chosenStill === true;
    body.dataset.still = String(still);
    byId('motion-btn').textContent = still ? 'Motion off' : 'Motion on';
    byId('motion-btn').setAttribute('aria-pressed', String(!still));
    byId('motion-btn').disabled = reduced.matches;
    byId('motion-btn').title = reduced.matches ? 'Follows your reduced motion setting' : 'Pause or resume the night';
    document.dispatchEvent(new Event('night-motion-change'));
  }
  byId('motion-btn').addEventListener('click', () => { chosenStill = body.dataset.still !== 'true'; syncMotion(); });
  reduced.addEventListener('change', syncMotion);
  syncMotion();

  // A quiet, locally synthesized soundscape. No audio request until a click.
  let audio, master;
  let soundOn = false;
  let soundBusy = false;
  function buildSound() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Audio is unavailable');
    audio = new Audio();
    master = audio.createGain();
    master.gain.value = 0;
    master.connect(audio.destination);
    [110, 164.81, 220.4, 277.18].forEach((hz, i) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.type = 'sine'; tone.frequency.value = hz; gain.gain.value = .05 / (i + 1);
      tone.connect(gain).connect(master); tone.start();
    });
    const noise = audio.createBuffer(1, audio.sampleRate * 4, audio.sampleRate);
    const data = noise.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i++) { previous = (previous + (Math.random() * 2 - 1) * .02) / 1.02; data[i] = previous * 3.5; }
    const breeze = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    breeze.buffer = noise; breeze.loop = true;
    filter.type = 'lowpass'; filter.frequency.value = 450; gain.gain.value = .14;
    breeze.connect(filter).connect(gain).connect(master); breeze.start();
  }
  byId('sound-btn').addEventListener('click', async () => {
    if (soundBusy) return;
    soundBusy = true;
    try {
      if (!audio) buildSound();
      soundOn = !soundOn;
      if (soundOn) {
        await audio.resume();
        master.gain.setTargetAtTime(.55, audio.currentTime, .6);
      } else {
        master.gain.setValueAtTime(0, audio.currentTime);
        await audio.suspend();
      }
      byId('sound-btn').setAttribute('aria-pressed', String(soundOn));
      byId('sound-label').textContent = soundOn ? 'Sound on' : 'Sound off';
    } catch {
      soundOn = false;
      byId('sound-btn').setAttribute('aria-pressed', 'false');
      byId('sound-label').textContent = 'Sound unavailable';
      if (audio) await audio.close().catch(() => {});
      audio = null;
    } finally { soundBusy = false; }
  });
  // ── custom cursor ──
  // One rAF drives both layers and writes transform only: setting left/top per
  // mousemove would relayout the page on every pointer event. The ring lerps
  // toward the dot so it trails; the loop parks itself when nothing is moving.
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const cur = byId('cursor');
    const dot = cur.querySelector('.cursor-dot');
    const follow = cur.querySelector('.cursor-follow');
    const HOT = 'a, button, [role="button"], #vm-hit, input, select, textarea';
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, running = false;
    body.classList.add('has-cursor');

    function tick() {
      const k = body.dataset.still === 'true' ? 1 : 0.18;   // no trail when motion is off
      rx += (mx - rx) * k;
      ry += (my - ry) * k;
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      follow.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      // keep going only while the ring is still catching up
      if (Math.abs(mx - rx) > 0.1 || Math.abs(my - ry) > 0.1) requestAnimationFrame(tick);
      else running = false;
    }
    function wake() { if (!running) { running = true; requestAnimationFrame(tick); } }

    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX; my = e.clientY;
      cur.classList.add('awake');
      cur.classList.toggle('hot', !!(e.target.closest && e.target.closest(HOT)));
      wake();
    }, { passive: true });
    addEventListener('pointerleave',() => cur.classList.remove('awake'), { passive: true });
    addEventListener('blur',        () => cur.classList.remove('awake'));
  }

  // ── the place remembers ──
  // localStorage only: no account, no analytics, nothing leaves the machine.
  // Every access is guarded — private windows and blocked site data throw.
  const MEM_KEY = 'afterhours.v1';
  const readMemory = () => { try { return JSON.parse(localStorage.getItem(MEM_KEY)) || {}; }
                             catch { return {}; } };
  const writeMemory = (m) => { try { localStorage.setItem(MEM_KEY, JSON.stringify(m)); } catch {} };

  const mem = readMemory();
  const lastSeen = Number(mem.lastSeen) || 0;
  const sinceHours = lastSeen ? (Date.now() - lastSeen) / 36e5 : Infinity;
  const visits = (Number(mem.visits) || 0) + 1;
  const seen = Array.isArray(mem.seen) ? mem.seen : [];
  writeMemory({ visits, seen, lastSeen: Date.now(), lastCode: mem.lastCode || null });

  // the eyebrow is the one line that knows you
  (function greet() {
    const line = visits === 1            ? 'SOMEWHERE AFTER MIDNIGHT'
               : sinceHours < 6          ? "YOU DIDN'T GET FAR"
               : visits < 5              ? 'BACK AGAIN, THEN'
               : visits < 10             ? 'THE USUAL'
               :                           'YOU KNOW THE WAY';
    const el = document.querySelector('.eyebrow');
    if (el) el.lastChild.textContent = ' ' + line;
  })();

  // the machine remembers what you looked at last
  if (mem.lastCode) { const lcd = byId('lcd-code'); if (lcd) lcd.textContent = mem.lastCode; }
  seen.forEach(id => {
    const el = front.querySelector(`.painting-selection[data-art-id="${id}"]`);
    if (el) el.dataset.seen = 'true';
  });
  function remember(painting) {
    const m = readMemory();
    const list = Array.isArray(m.seen) ? m.seen : [];
    if (!list.includes(painting.dataset.artId)) list.push(painting.dataset.artId);
    m.seen = list; m.lastCode = painting.dataset.artId;
    writeMemory(m);
    painting.dataset.seen = 'true';
  }

  // ── ambient night events ──
  // setTimeout, not a render loop: each event just sets a class and the
  // compositor runs the animation. Nothing is scheduled while motion is off
  // or the tab is hidden.
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const quiet = () => body.dataset.still === 'true' || document.hidden;

  // Each event reschedules itself after its animation ends, so the gaps are
  // between events rather than between starts, and a paused night never queues
  // a backlog.
  function schedule(el, gap, firstDelay) {
    if (!el) return;
    const run = () => {
      if (quiet()) return void setTimeout(run, 4000);
      el.classList.add('run');
      el.addEventListener('animationend', () => {
        el.classList.remove('run');
        setTimeout(run, gap());
      }, { once: true });
    };
    setTimeout(run, firstDelay);
  }
  const shoots = [...document.querySelectorAll('.ev-shoot')];
  // frequent on purpose: a star every 12-26s from each of two tracks
  schedule(shoots[0], () => rand(12000, 26000), 2500);
  schedule(shoots[1], () => rand(12000, 26000), 9000);
  schedule(document.querySelector('.ev-sat'), () => rand(30000, 55000), rand(9000, 16000));

  // windows going out and coming back, every few seconds
  (function windows() {
    const next = () => setTimeout(windows, rand(3000, 8000));
    if (quiet()) return next();
    const wins = document.querySelectorAll('#city-windows .city-win');
    if (!wins.length) return next();
    for (let i = 0, n = 1 + ((Math.random() * 3) | 0); i < n; i++) {
      const w = wins[(Math.random() * wins.length) | 0];
      w.classList.toggle('win-out');
    }
    next();
  })();

  document.addEventListener('visibilitychange', () => {
    body.dataset.pageHidden = String(document.hidden);
    if (!audio || !soundOn) return;
    (document.hidden ? audio.suspend() : audio.resume()).catch(() => {});
  });
})();
