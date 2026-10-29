// SKARVIS Trener: plays back a simulator run (czapla.sim, schema skarvis.simrun/1)
// as an operator console. The operator acknowledges each alarm, may ask for a
// visual check, and records a decision; the debrief compares those decisions
// with the simulator's ground truth.
//
// Playback only: every detection, classification and alarm on this page was
// computed by the Python pipeline (software/czapla) when the run was generated.
// Nothing here models sensors, and the page never presents a run as a
// measurement. Plain script, no modules, so it also opens from file://.

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const LABEL_PL = {
    human: 'OSOBA', animal: 'ZWIERZĘ', vehicle: 'POJAZD', unknown: 'NIEZNANY',
    drone_like: 'DRON?', other: 'INNE'
  };
  const SENSOR_PL = {
    thermal: 'termowizja', radar_mmwave: 'radar', pir: 'PIR', camera_ai: 'kamera',
    remote_id: 'Remote ID', rf_df: 'namiar RF'
  };
  const KIND_PL = { drone: 'dron', human: 'osoba', animal: 'zwierzę', vehicle: 'pojazd' };
  const OUTCOME_PL = {
    true_alarm: ['Alarm prawdziwy', 'ok'],
    missed: ['Nie wykryto', 'bad'],
    false_alarm: ['Fałszywy alarm', 'warn'],
    correctly_quiet: ['Bez alarmu, słusznie', 'mute']
  };
  const DECISION_PL = {
    threat: 'Zagrożenie: procedura uruchomiona',
    authorised: 'Uprawnione',
    false: 'Fałszywy alarm'
  };
  const ZOOM_M = { obiekt: 230, strefa: 560, okolica: 2100 };
  const GRID_M = { obiekt: 50, strefa: 100, okolica: 500 };
  const VERIFY_DELAY_S = 8;

  const fmtT = (t) => {
    const s = Math.max(0, Math.floor(t));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  const num = (x, d) => (x == null ? '—' : Number(x).toFixed(d).replace('.', ','));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const canvas = $('map');
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let run = null;
  let byActor = {};
  let byEmitter = {};
  let step = 1;
  let duration = 0;
  let colors = {};

  const S = {
    t: 0, playing: false, speed: 4, mode: 'drill', zoom: 'obiekt', autoPause: true,
    ops: {}, seen: new Set(), ended: false, queueSig: '', logCount: -1, last: 0
  };

  // --- theme colours for the canvas ------------------------------------------------

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name) => cs.getPropertyValue(name).trim();
    colors = {
      map: v('--map'), ink: v('--ink'), ink2: v('--ink-2'), mute: v('--mute'),
      line: v('--line'), line2: v('--line-2'), grid: v('--grid'), site: v('--site'),
      fov: v('--fov'), accent: v('--accent'), accentSoft: v('--accent-soft'),
      alarm: v('--alarm'), alarmSoft: v('--alarm-soft'), ok: v('--ok'),
      truth: v('--truth'), panel: v('--panel'), mono: v('--mono')
    };
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
  new MutationObserver(() => { readColors(); draw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // --- loading ----------------------------------------------------------------------

  function showError(msg) {
    const el = $('error');
    el.textContent = msg;
    el.hidden = false;
  }

  function load(r) {
    if (!r || r.schema !== 'skarvis.simrun/1') {
      showError('Ten plik nie jest przebiegiem symulatora SKARVIS (oczekiwany schemat skarvis.simrun/1). ' +
        'Wygeneruj go poleceniem: python -m czapla.sim --out run.json');
      return;
    }
    $('error').hidden = true;
    run = r;
    step = r.scenario.step_s || 1;
    duration = r.scenario.duration_s;
    run.events.sort((a, b) => a.t - b.t);
    byActor = Object.fromEntries(r.scenario.actors.map((a) => [a.id, a]));
    byEmitter = Object.fromEntries((r.scenario.emitters || []).map((e) => [e.id, e]));
    $('sc-name').textContent = r.scenario.name;
    $('sc-desc').textContent = r.scenario.description_pl || '';
    $('scrub').max = String(duration);
    reset();
  }

  function reset() {
    S.t = 0; S.playing = false; S.ops = {}; S.seen = new Set(); S.ended = false;
    S.queueSig = ''; S.logCount = -1;
    $('debrief').hidden = true;
    $('flash').hidden = true;
    render();
  }

  $('run-file').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let text = String(reader.result).trim();
        const m = text.match(/^window\.SKARVIS_RUN\s*=\s*([\s\S]*?);?\s*$/);
        if (m) text = m[1];
        load(JSON.parse(text));
      } catch (e) {
        showError('Nie udało się odczytać pliku: ' + e.message);
      }
    };
    reader.readAsText(file);
  });

  // --- state helpers ------------------------------------------------------------------

  const frameAt = (t) => run.frames[Math.max(0, Math.min(run.frames.length - 1, Math.floor(t / step + 1e-6)))];
  const visibleIncidents = () => run.incidents.filter((i) => i.t_open <= S.t);
  const truthName = (id) => (byActor[id] || byEmitter[id] || {}).label_pl || id || 'nieznany';

  function op(id) {
    if (!S.ops[id]) S.ops[id] = { ack: null, verifyAt: null, decision: null, decisionAt: null };
    return S.ops[id];
  }

  function verifyText(inc) {
    const a = byActor[inc.truth];
    if (!a) return 'Weryfikacja: na miejscu nic nie widać.';
    if (a.kind === 'drone') return 'Obserwacja: widoczny dron. ' + (a.label_pl || '');
    return 'Kamera / patrol: ' + KIND_PL[a.kind] + '. ' + (a.label_pl || '');
  }

  // --- main loop ----------------------------------------------------------------------

  function tick(now) {
    const dt = S.last ? Math.min(0.25, (now - S.last) / 1000) : 0;
    S.last = now;
    if (S.playing && run) {
      const before = S.t;
      S.t = Math.min(duration, S.t + dt * S.speed);
      const fresh = run.incidents.filter((i) => i.t_open > before && i.t_open <= S.t && !S.seen.has(i.id));
      if (fresh.length) {
        fresh.forEach((i) => S.seen.add(i.id));
        flash('Nowy alarm: ' + fresh[0].title_pl);
        if (S.autoPause && S.mode === 'drill') setPlaying(false);
      }
      if (S.t >= duration) {
        setPlaying(false);
        S.ended = true;
        showDebrief();
      }
      render();
    } else if (run && hasPendingVerify()) {
      render();
    }
    requestAnimationFrame(tick);
  }

  function hasPendingVerify() {
    return Object.values(S.ops).some((o) => o.verifyAt != null && o.decision == null);
  }

  let flashTimer = null;
  function flash(text) {
    const el = $('flash');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  function setPlaying(on) {
    S.playing = on;
    $('play').textContent = on ? 'Pauza' : (S.t > 0 && S.t < duration ? 'Wznów' : 'Start');
  }

  function render() {
    if (!run) return;
    $('clock').textContent = fmtT(S.t) + ' / ' + fmtT(duration);
    $('scrub').value = String(Math.floor(S.t));
    draw();
    renderQueue();
    renderLog();
  }

  // --- map --------------------------------------------------------------------------

  function resize() {
    const box = $('mapbox');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(box.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(box.clientHeight * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  new ResizeObserver(resize).observe($('mapbox'));

  function draw() {
    if (!run || !colors.map) return;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const half = ZOOM_M[S.zoom];
    const k = Math.min(W, H) / (2 * half);
    const P = (e, n) => [W / 2 + e * k, H / 2 - n * k];
    const sc = run.scenario;
    const site = sc.site;
    const mono = (size) => `${size}px ${colors.mono || 'monospace'}`;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colors.map;
    ctx.fillRect(0, 0, W, H);

    // grid
    const g = GRID_M[S.zoom];
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const spanE = W / 2 / k;
    const spanN = H / 2 / k;
    for (let e = -Math.ceil(spanE / g) * g; e <= spanE; e += g) {
      const [x] = P(e, 0); ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (let n = -Math.ceil(spanN / g) * g; n <= spanN; n += g) {
      const [, y] = P(0, n); ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();

    // protected airspace ring
    const [cx, cy] = P(0, 0);
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = colors.line2;
    ctx.beginPath();
    ctx.arc(cx, cy, (site.airspace_radius_m || 400) * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.mute;
    ctx.font = mono(11);
    ctx.fillText(`strefa ochronna ${site.airspace_radius_m || 400} m`, cx + 6, cy - (site.airspace_radius_m || 400) * k - 6);

    // perimeter
    ctx.beginPath();
    site.perimeter.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.fillStyle = colors.site;
    ctx.fill();
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
    if (S.zoom !== 'okolica') {
      ctx.fillStyle = colors.mute;
      ctx.font = mono(11);
      (site.labels_pl || []).forEach((l) => { const [x, y] = P(l.e, l.n); ctx.fillText(l.text, x - ctx.measureText(l.text).width / 2, y); });
    }

    // sensors
    sc.sensors.forEach((s) => {
      const [x, y] = P(s.east, s.north);
      if (s.fov_deg && s.fov_deg < 360 && S.zoom !== 'okolica') {
        const h = (s.heading_deg - 90) * Math.PI / 180;
        const w = s.fov_deg / 2 * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, s.range_m * k, h - w, h + w);
        ctx.closePath();
        ctx.fillStyle = colors.fov;
        ctx.fill();
      }
      if (s.type === 'rf_df' || s.type === 'remote_id') {
        ctx.strokeStyle = colors.accent;
        ctx.fillStyle = colors.panel;
        ctx.fillRect(x - 5, y - 5, 10, 10);
        ctx.strokeRect(x - 5, y - 5, 10, 10);
        if (s.type === 'rf_df') {
          ctx.fillStyle = colors.ink;
          ctx.font = mono(11);
          ctx.fillText((s.node || s.id).toUpperCase(), x + 8, y - 8);
        }
      } else {
        ctx.fillStyle = colors.ok;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    const recent = (type, span) => run.events.filter((e) => e.type === type && e.t <= S.t && e.t > S.t - span);

    // RF bearings
    recent('rf', 4).forEach((e) => {
      if (e.persistent) return;
      const age = (S.t - e.t) / 4;
      const [x, y] = P(e.e, e.n);
      const a = (e.bearing - 90) * Math.PI / 180;
      const len = 4000 * k;
      const s = (e.sigma || 8) * Math.PI / 180;
      const droneLike = e.label === 'drone_like';
      if (droneLike) {
        ctx.globalAlpha = 0.12 * (1 - age);
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, len, a - s, a + s);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = (droneLike ? 1 : 0.45) * (1 - age * 0.7);
      ctx.strokeStyle = e.alarm ? colors.alarm : (e.label === 'drone_like' ? colors.accent : colors.mute);
      ctx.lineWidth = e.alarm ? 2 : 1.2;
      if (e.label !== 'drone_like') ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    });

    // position fixes
    recent('fix', 6).forEach((f) => {
      const [x, y] = P(f.e, f.n);
      ctx.globalAlpha = 1 - (S.t - f.t) / 6 * 0.7;
      ctx.strokeStyle = colors.ink;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, (f.cep || 20) * k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // Remote ID positions
    const lastRid = {};
    recent('rid', 1.5).forEach((r) => { lastRid[r.serial] = r; });
    Object.values(lastRid).forEach((r) => {
      const [x, y] = P(r.e, r.n);
      const c = r.whitelisted ? colors.ok : colors.alarm;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y);
      ctx.closePath();
      ctx.fill();
      ctx.font = mono(11);
      ctx.fillText(`${r.serial} · ${Math.round(r.alt)} m`, x + 10, y + 4);
    });

    // ground tracks (what the system believes)
    const frame = frameAt(S.t);
    frame.tracks.forEach((tr) => {
      const [x, y] = P(tr.e, tr.n);
      const alarming = (tr.label === 'human' || tr.label === 'vehicle') && tr.inside;
      const c = alarming ? colors.alarm : tr.label === 'animal' ? colors.ok : colors.ink2;
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 7, y - 7, 14, 14);
      ctx.lineWidth = 1;
      ctx.fillStyle = c;
      ctx.font = mono(11);
      const text = `${LABEL_PL[tr.label] || tr.label} ${num(tr.conf, 2)}`;
      ctx.fillText(text, x + 10, y - 4);
      ctx.fillStyle = colors.mute;
      ctx.fillText(tr.sensors.map((s) => SENSOR_PL[s] || s).join('+'), x + 10, y + 9);
    });

    // open incidents: ring on the object's latest known position
    visibleIncidents().forEach((inc) => {
      const o = S.ops[inc.id];
      if ((o && o.decision) || inc.e == null) return;
      let at = [inc.e, inc.n];
      const track = frame.tracks.find((tr) => tr.id === inc.ref);
      if (track) at = [track.e, track.n];
      else if (lastRid[inc.ref]) at = [lastRid[inc.ref].e, lastRid[inc.ref].n];
      else if (inc.domain === 'ground') return;
      const [x, y] = P(at[0], at[1]);
      const pulse = reduceMotion ? 0.5 : (Math.sin(performance.now() / 250) + 1) / 2;
      ctx.strokeStyle = colors.alarm;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4 + 0.6 * pulse;
      ctx.beginPath();
      ctx.arc(x, y, 14 + 4 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    });

    // ground truth for the instructor
    if (S.mode === 'instructor') {
      const fi = Math.floor(S.t / step + 1e-6);
      frame.actors.forEach((a) => {
        const spec = byActor[a.id] || {};
        ctx.strokeStyle = colors.truth;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        let started = false;
        for (let i = Math.max(0, fi - 40); i <= fi && i < run.frames.length; i++) {
          const p = run.frames[i].actors.find((x) => x.id === a.id);
          if (!p) continue;
          const [x, y] = P(p.e, p.n);
          started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          started = true;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        const [x, y] = P(a.e, a.n);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = colors.truth;
        ctx.font = mono(10.5);
        let label = (KIND_PL[spec.kind] || '') + ' · ' + a.id;
        if (spec.fibre_optic) label += ' · światłowód, niewidoczny dla RF';
        if (spec.kind === 'drone') label += ` · ${Math.round(a.alt)} m`;
        ctx.fillText(label, x + 8, y + 16);
      });
    }

    // north arrow and scale bar
    ctx.fillStyle = colors.ink;
    ctx.font = mono(12);
    ctx.fillText('N ↑', 12, 22);
    const bar = GRID_M[S.zoom] * 2;
    const bx = 12;
    const by = H - 14;
    ctx.strokeStyle = colors.ink;
    ctx.beginPath();
    ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by); ctx.lineTo(bx + bar * k, by); ctx.lineTo(bx + bar * k, by - 4);
    ctx.stroke();
    ctx.font = mono(11);
    ctx.fillText(`${bar} m`, bx + bar * k + 6, by);
  }

  // --- incident queue -----------------------------------------------------------------

  function renderQueue() {
    const list = visibleIncidents();
    const sig = S.mode + '|' + list.map((i) => {
      const o = S.ops[i.id] || {};
      const ready = o.verifyAt != null && S.t >= o.verifyAt + VERIFY_DELAY_S;
      return [i.id, o.ack != null, o.verifyAt != null, ready, o.decision].join(':');
    }).join('|');
    if (sig === S.queueSig) return;
    S.queueSig = sig;

    const open = list.filter((i) => !(S.ops[i.id] && S.ops[i.id].decision)).length;
    $('queue-count').textContent = list.length ? `${open} otwarte / ${list.length}` : '0';
    const q = $('queue');
    if (!list.length) {
      q.innerHTML = '<p class="empty">Brak alarmów. Uruchom symulację.</p>';
      return;
    }
    q.innerHTML = list.slice().reverse().map((inc) => {
      const o = S.ops[inc.id] || {};
      const state = o.decision ? 'done' : (o.ack != null ? 'ack' : 'new');
      const stateText = o.decision ? 'zamknięty' : (o.ack != null ? 'potwierdzony' : 'nowy');
      const domain = inc.domain === 'air'
        ? '<span class="chip air">powietrze</span>'
        : '<span class="chip ground">teren</span>';
      let acts = '';
      if (!o.decision) {
        if (o.ack == null) {
          acts = `<button type="button" class="btn primary" data-act="ack" data-id="${inc.id}">Potwierdź odbiór</button>`;
        } else {
          acts = (o.verifyAt == null
            ? `<button type="button" class="btn" data-act="verify" data-id="${inc.id}">Weryfikuj (kamera / obserwacja)</button>`
            : '') +
            `<button type="button" class="btn" data-act="threat" data-id="${inc.id}">Zagrożenie: procedura</button>` +
            `<button type="button" class="btn" data-act="authorised" data-id="${inc.id}">Uprawnione</button>` +
            `<button type="button" class="btn" data-act="false" data-id="${inc.id}">Fałszywy alarm</button>`;
        }
      }
      let verify = '';
      if (o.verifyAt != null) {
        verify = S.t >= o.verifyAt + VERIFY_DELAY_S
          ? `<p class="verify">${esc(verifyText(inc))}</p>`
          : `<p class="verify">Weryfikacja w toku (ok. ${VERIFY_DELAY_S} s czasu symulacji)…</p>`;
      }
      const decided = o.decision
        ? `<p><b>Decyzja:</b> ${esc(DECISION_PL[o.decision])} (${fmtT(o.decisionAt)})</p>`
        : '';
      const truth = S.mode === 'instructor'
        ? `<p class="truth">Prawda symulacji: ${esc(truthName(inc.truth))}. ${inc.truth_expected_alarm ? 'Prawdziwe zagrożenie.' : 'Fałszywy alarm.'}</p>`
        : '';
      return `<article class="inc" data-state="${state}">
        <header>${domain}<b>${inc.id}</b><span>${fmtT(inc.t_open)}</span><span class="chip state">${stateText}</span></header>
        <h3>${esc(inc.title_pl)}</h3>
        <p>${esc(inc.evidence_pl || '')}</p>
        ${verify}${decided}${truth}
        <div class="acts">${acts}</div>
      </article>`;
    }).join('');
  }

  $('queue').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const o = op(btn.dataset.id);
    const act = btn.dataset.act;
    if (act === 'ack') o.ack = S.t;
    else if (act === 'verify') o.verifyAt = S.t;
    else { o.decision = act; o.decisionAt = S.t; }
    S.queueSig = '';
    render();
  });

  // --- event log ----------------------------------------------------------------------

  function logLine(e) {
    const alarm = e.alarm ? ' · ALARM' : '';
    if (e.type === 'rf') {
      return `${e.node} · ${num(e.freq_mhz, 1)} MHz · SNR ${num(e.snr, 0)} dB · namiar ${num(e.bearing, 0)}° · ${LABEL_PL[e.label] || e.label}${alarm}`;
    }
    if (e.type === 'rid') {
      return `${e.node} · Remote ID ${e.serial} · ${Math.round(e.alt)} m${e.whitelisted ? ' · lot uzgodniony (biała lista)' : ''}${alarm}`;
    }
    if (e.type === 'fix') {
      return `pozycja z węzłów ${e.sources.join(' + ')} · ±${num(e.cep, 0)} m (szacunek)`;
    }
    const sensors = e.sensors.map((s) => SENSOR_PL[s] || s).join(', ');
    return `${e.track} · ${LABEL_PL[e.label] || e.label} ${num(e.conf, 2)} · ${sensors} · ${e.inside ? 'w ogrodzeniu' : 'poza ogrodzeniem'}${alarm}`;
  }

  function renderLog() {
    const shown = run.events.filter((e) => e.t <= S.t && !(e.type === 'rf' && e.persistent));
    if (shown.length === S.logCount) return;
    S.logCount = shown.length;
    $('log-count').textContent = String(shown.length);
    $('log').innerHTML = shown.slice(-80).reverse().map((e) => {
      const cls = e.alarm ? 'alarm' : (e.type === 'rf' && e.label !== 'drone_like' ? 'quiet' : '');
      return `<li class="${cls}"><span>${fmtT(e.t)}</span><span>${esc(logLine(e))}</span></li>`;
    }).join('');
  }

  // --- debrief ------------------------------------------------------------------------

  function correctDecision(inc) {
    return inc.truth_expected_alarm ? 'threat' : 'false';
  }

  function debriefData() {
    const list = run.incidents;
    const rows = list.map((inc) => {
      const o = S.ops[inc.id] || {};
      const right = o.decision
        ? (o.decision === correctDecision(inc) || (!inc.truth_expected_alarm && o.decision === 'authorised'))
        : null;
      return {
        inc, o, right,
        ackDelay: o.ack != null ? o.ack - inc.t_open : null,
        verified: o.verifyAt != null && o.decisionAt != null && o.decisionAt >= o.verifyAt + VERIFY_DELAY_S
      };
    });
    const acked = rows.filter((r) => r.ackDelay != null);
    return {
      rows,
      handled: rows.filter((r) => r.o.decision).length,
      correct: rows.filter((r) => r.right).length,
      verified: rows.filter((r) => r.verified).length,
      meanAck: acked.length ? acked.reduce((s, r) => s + r.ackDelay, 0) / acked.length : null
    };
  }

  function showDebrief() {
    const d = debriefData();
    const sc = run.scorecard;
    const el = $('debrief');
    const incRows = d.rows.map((r) => `<tr>
      <td class="num">${r.inc.id}</td>
      <td>${esc(r.inc.title_pl)}</td>
      <td class="num">${fmtT(r.inc.t_open)}</td>
      <td class="num">${r.ackDelay == null ? '—' : num(r.ackDelay, 0) + ' s'}</td>
      <td>${r.verified ? 'tak' : 'nie'}</td>
      <td>${r.o.decision ? esc(DECISION_PL[r.o.decision]) : '<span class="pill bad">brak decyzji</span>'}</td>
      <td>${r.right == null ? '—' : (r.right ? '<span class="pill ok">trafna</span>' : '<span class="pill bad">błędna</span>')}</td>
      <td>${esc(truthName(r.inc.truth))}</td>
    </tr>`).join('');
    const actorRows = sc.actors.map((a) => {
      const [txt, cls] = OUTCOME_PL[a.outcome] || [a.outcome, 'mute'];
      return `<tr><td>${esc(a.label_pl)}</td><td><span class="pill ${cls}">${txt}</span></td><td>${esc(a.why_pl)}</td></tr>`;
    }).concat((sc.emitters || []).map((e) => {
      const [txt, cls] = OUTCOME_PL[e.outcome] || [e.outcome, 'mute'];
      return `<tr><td>${esc(e.label_pl)}</td><td><span class="pill ${cls}">${txt}</span></td><td>Stały nadajnik obiektu, poznany przy instalacji (baseline).</td></tr>`;
    })).join('');
    const assumptions = (run.scenario.assumptions_pl || []).map((a) => `<li>${esc(a)}</li>`).join('');

    el.innerHTML = `
      <header>
        <h2 id="debrief-title">Podsumowanie ćwiczenia</h2>
        <span class="synthetic">Symulacja · dane syntetyczne</span>
        <span class="spacer"></span>
        <button type="button" class="btn" id="copy-report">Kopiuj raport z ćwiczenia</button>
        <span class="copied" id="copied" hidden>Skopiowano do schowka.</span>
      </header>
      <div class="stats">
        <div><b>${d.handled}/${d.rows.length}</b><span>alarmy zamknięte decyzją</span></div>
        <div><b>${d.correct}/${d.rows.length}</b><span>decyzje trafne</span></div>
        <div><b>${d.verified}</b><span>decyzje po weryfikacji</span></div>
        <div><b>${d.meanAck == null ? '—' : num(d.meanAck, 0) + ' s'}</b><span>średni czas potwierdzenia (czas symulacji)</span></div>
      </div>
      <div>
        <h3>Twoje decyzje</h3>
        <div class="tbl"><table>
          <thead><tr><th>Alarm</th><th>Opis</th><th>Otwarty</th><th>Potwierdzenie</th><th>Weryfikacja</th><th>Decyzja</th><th>Ocena</th><th>Co to było</th></tr></thead>
          <tbody>${incRows}</tbody>
        </table></div>
      </div>
      <div>
        <h3>Co zobaczył system</h3>
        <p>Pełna lista obiektów w scenariuszu, także tych, których system nie wykrył. Zagrożenie bez alarmu wymaga innych środków (obserwacja, patrol); system go nie zgłosi.</p>
        <div class="tbl"><table>
          <thead><tr><th>Obiekt</th><th>Wynik</th><th>Dlaczego</th></tr></thead>
          <tbody>${actorRows}</tbody>
        </table></div>
      </div>
      <div>
        <h3>Założenia symulacji</h3>
        <ul class="assume">${assumptions}</ul>
        <p class="note">${esc(run.disclaimer_pl)}</p>
      </div>`;
    el.hidden = false;
    $('copy-report').addEventListener('click', copyReport);
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function reportText() {
    const d = debriefData();
    const lines = [
      'RAPORT Z ĆWICZENIA — SKARVIS Trener',
      'SYMULACJA, dane syntetyczne. Wyniki opisują założenia scenariusza, nie skuteczność systemu.',
      `Scenariusz: ${run.scenario.name}`,
      `Alarmy zamknięte decyzją: ${d.handled}/${d.rows.length}; decyzje trafne: ${d.correct}/${d.rows.length}; po weryfikacji: ${d.verified}`,
      `Średni czas potwierdzenia: ${d.meanAck == null ? '—' : num(d.meanAck, 0) + ' s'}`,
      ''
    ];
    d.rows.forEach((r) => {
      lines.push(`${r.inc.id} ${fmtT(r.inc.t_open)} ${r.inc.title_pl}`);
      lines.push(`  potwierdzenie: ${r.ackDelay == null ? 'brak' : num(r.ackDelay, 0) + ' s'}; weryfikacja: ${r.verified ? 'tak' : 'nie'}; decyzja: ${r.o.decision ? DECISION_PL[r.o.decision] : 'brak'}; ocena: ${r.right == null ? '—' : (r.right ? 'trafna' : 'błędna')}; było to: ${truthName(r.inc.truth)}`);
    });
    lines.push('', 'Obiekty niewykryte przez system:');
    run.scorecard.actors.filter((a) => a.outcome === 'missed').forEach((a) => lines.push(`  ${a.label_pl}: ${a.why_pl}`));
    lines.push('', 'Prowadzący ćwiczenie (imię, nazwisko, podpis): ______________________');
    return lines.join('\n');
  }

  function copyReport() {
    const text = reportText();
    const done = () => { $('copied').hidden = false; setTimeout(() => { $('copied').hidden = true; }, 2500); };
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.rows = 12;
      ta.style.width = '100%';
      ta.setAttribute('aria-label', 'Raport z ćwiczenia');
      $('debrief').appendChild(ta);
      ta.focus();
      ta.select();
    };
    try {
      navigator.clipboard.writeText(text).then(done, fallback);
    } catch (e) {
      fallback();
    }
  }

  // --- controls -----------------------------------------------------------------------

  $('play').addEventListener('click', () => {
    if (!run) return;
    if (S.t >= duration) reset();
    setPlaying(!S.playing);
  });
  $('restart').addEventListener('click', () => { reset(); setPlaying(false); });
  $('scrub').addEventListener('input', (ev) => {
    S.t = Number(ev.target.value);
    run.incidents.forEach((i) => { if (i.t_open <= S.t) S.seen.add(i.id); });
    S.queueSig = '';
    S.logCount = -1;
    setPlaying(S.playing);
    render();
  });
  $('speed').addEventListener('change', (ev) => { S.speed = Number(ev.target.value); });
  $('autopause').addEventListener('change', (ev) => { S.autoPause = ev.target.checked; });
  $('show-debrief').addEventListener('click', () => { if (run) showDebrief(); });

  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    S.mode = b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    S.queueSig = '';
    render();
  }));
  document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    S.zoom = b.dataset.zoom;
    document.querySelectorAll('[data-zoom]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  }));
  document.addEventListener('keydown', (ev) => {
    if (ev.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) {
      ev.preventDefault();
      $('play').click();
    }
  });

  // --- boot -------------------------------------------------------------------------

  readColors();
  if (window.SKARVIS_RUN) load(window.SKARVIS_RUN);
  else showError('Brak pliku runs/podstacja.js. Wygeneruj przebieg: cd software && python -m czapla.sim --no-store --out ../web/site/trener/runs/podstacja.js');
  resize();
  requestAnimationFrame(tick);
})();
