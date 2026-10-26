// Hero scene: a point-cloud terrain around an illustrated site, one HERMES
// node, a coverage dome and a single simulated drone track, plus the HUD
// readouts (heading tape, pitch ladder, track inspector) driven by it.
//
// This is an illustration. It does not read live data, and the numbers it
// shows come from the animation, not from any sensor.

import * as THREE from 'three';

const BG = 0xe6e6e3;
const INK = 0x111214;
const ACCENT = 0xff5a1f;

const R = 44;                                  // dome radius, scene units
const M_PER_UNIT = 5;                          // readout scale for the HUD
const NODE = new THREE.Vector3(4, 0, -2);      // dome centre on the ground
const MAST_TOP = new THREE.Vector3(4, 13.6, -2);
const LOOP = 28;                               // seconds per drone pass

export function initHero(hero, { reduceMotion, T }) {
  const canvas = hero.querySelector('[data-hero-canvas]');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(BG, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 130, 340);

  const camera = new THREE.PerspectiveCamera(34, 1, 1, 2000);
  const target = new THREE.Vector3(2, 5, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b9b4, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-60, 90, 40);
  scene.add(sun);

  // Phones look at the scene from further away and higher up, so the terrain
  // has to reach further out; dots get coarser to keep the point count sane.
  const small = window.innerWidth < 900;
  scene.add(small ? buildTerrain(1.6, 235) : buildTerrain(0.98, 160));
  scene.add(buildSite());

  const dome = buildDome();
  scene.add(dome.group);

  const rings = buildListeningRings();
  scene.add(rings.group);

  const track = buildTrack();
  scene.add(track.group);

  // ---- HUD ----
  const labels = {
    node: hero.querySelector('[data-hl="node"]'),
    pilot: hero.querySelector('[data-hl="pilot"]'),
    drone: hero.querySelector('[data-hl="drone"]')
  };
  const hlState = hero.querySelector('[data-hl-state]');
  const hlBrg = hero.querySelector('[data-hl-brg]');
  const insp = {
    state: hero.querySelector('[data-insp-state]'),
    brg: hero.querySelector('[data-insp-brg]'),
    alt: hero.querySelector('[data-insp-alt]'),
    dist: hero.querySelector('[data-insp-dist]'),
    spark: hero.querySelector('[data-insp-spark]')
  };
  const tape = buildTape(hero.querySelector('[data-tape]'));
  const tapeRead = hero.querySelector('[data-tape-read]');
  const ladder = buildLadder(hero.querySelector('[data-ladder]'));
  const altHistory = [];
  let lastSample = -1;
  let wasInZone = null;

  // ---- layout ----
  const layout = { w: 1, h: 1, radius: 178, height: 80 };
  function resize() {
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    layout.w = w;
    layout.h = h;
    renderer.setSize(w, h, false);
    if (w >= 900) {
      // shift the scene right, away from the headline
      const s = Math.round(w * 0.17);
      camera.fov = 34;
      camera.aspect = (w + 2 * s) / h;
      camera.setViewOffset(w + 2 * s, h, 0, 0, w, h);
      layout.radius = 178;
      layout.height = 80;
      scene.fog.near = layout.radius * 0.72;
      scene.fog.far = layout.radius * 1.95;
    } else {
      // shift the scene up, above the copy, and back off until the dome fits
      const t = Math.round(h * 0.12);
      camera.fov = 50;
      camera.aspect = w / (h + 2 * t);
      camera.setViewOffset(w, h + 2 * t, 0, 2 * t, w, h);
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      layout.radius = Math.max(200, 58 / (tanHalf * camera.aspect));
      layout.height = layout.radius * 0.62;
      scene.fog.near = layout.radius * 0.72;
      scene.fog.far = layout.radius * 1.75;
    }
    camera.updateProjectionMatrix();
  }

  // ---- pointer parallax ----
  const ptr = { x: 0, y: 0, sx: 0, sy: 0 };
  if (!reduceMotion) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ptr.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    }, { passive: true });
  }

  const v = new THREE.Vector3();
  const dronePos = new THREE.Vector3();
  let time = 0;

  function update(dt) {
    time += dt;
    ptr.sx += (ptr.x - ptr.sx) * Math.min(1, dt * 1.8);
    ptr.sy += (ptr.y - ptr.sy) * Math.min(1, dt * 1.8);

    const th = 0.62 + time * 0.028 + ptr.sx * 0.07;
    camera.position.set(
      target.x + Math.sin(th) * layout.radius,
      layout.height - ptr.sy * 7,
      target.z + Math.cos(th) * layout.radius
    );
    camera.lookAt(target);

    // drone along its path
    const u = ((time + 6) % LOOP) / LOOP;
    track.curve.getPointAt(u, dronePos);
    track.setDrone(dronePos, u);

    const d3 = dronePos.distanceTo(NODE);
    const inZone = d3 < R;
    const near = d3 < R * 1.9;
    track.setBearingVisible(near ? 1 : 0, dt);
    dome.setAlert(inZone, dt);
    rings.update(time);

    // readouts
    const dx = dronePos.x - NODE.x;
    const dz = dronePos.z - NODE.z;
    const brg = (THREE.MathUtils.radToDeg(Math.atan2(dx, -dz)) + 360) % 360;
    const brgTxt = String(Math.round(brg) % 360).padStart(3, '0') + '°';
    const altM = Math.round(dronePos.y * M_PER_UNIT);
    const distM = Math.round(Math.hypot(dx, dz) * M_PER_UNIT / 5) * 5;

    if (inZone !== wasInZone) {
      wasInZone = inZone;
      const txt = inZone ? T.inZone : T.outZone;
      hlState.textContent = txt;
      insp.state.textContent = txt;
      labels.drone.classList.toggle('in-zone', inZone);
      insp.state.classList.toggle('in-zone', inZone);
    }
    hlBrg.textContent = T.bearing + ' ' + brgTxt;
    insp.brg.textContent = brgTxt;
    insp.alt.textContent = altM + ' m';
    insp.dist.textContent = distM + ' m';

    const sampleIdx = Math.floor(time * 2);
    if (sampleIdx !== lastSample) {
      lastSample = sampleIdx;
      altHistory.push(altM);
      if (altHistory.length > 60) altHistory.shift();
      drawSpark(insp.spark, altHistory);
    }

    // heading tape and pitch ladder follow the camera
    v.subVectors(target, camera.position);
    const heading = (THREE.MathUtils.radToDeg(Math.atan2(v.x, -v.z)) + 360) % 360;
    const pitch = THREE.MathUtils.radToDeg(Math.atan2(v.y, Math.hypot(v.x, v.z)));
    tape.set(heading);
    tapeRead.textContent = '↑ ' + String(Math.round(heading) % 360).padStart(3, '0') + '°T';
    ladder.set(pitch);

    // labels
    placeLabel(labels.node, MAST_TOP, 14, -26);
    placeLabel(labels.pilot, track.pilot, 12, -10);
    placeLabel(labels.drone, dronePos, 18, -18, track.visibility(u) > 0.5);
  }

  function placeLabel(el, p, ox, oy, visible = true) {
    v.copy(p).project(camera);
    const on = visible && v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
    el.classList.toggle('is-on', on);
    if (!on) return;
    let x = ((v.x + 1) / 2) * layout.w + ox;
    const y = ((1 - v.y) / 2) * layout.h + oy;
    // flip to the left of the point when the label would run off the right edge
    const lw = el.offsetWidth;
    if (x + lw > layout.w - 8) x -= lw + ox * 2;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  // ---- loop ----
  let running = false;
  let visible = true;
  let last = 0;
  function tick(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  function start() {
    if (running || reduceMotion || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
  function stop() { running = false; }

  function renderStill() {
    // Reduced motion: one composed frame with the drone inside the zone.
    time = LOOP * 0.47 - 6;
    update(0);
    renderer.render(scene, camera);
  }

  resize();
  new ResizeObserver(() => {
    resize();
    if (reduceMotion || !running) renderStill();
  }).observe(hero);

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start(); else stop();
  }).observe(hero);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });

  if (reduceMotion) renderStill(); else start();
}

/* ---------------- terrain ---------------- */

function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const w = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

function fbm(x, y, oct = 5) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// 0 on the flat ground around the site, 1 in the hills.
function plainMask(x, z) {
  const warp = (fbm(x * 0.02 + 40, z * 0.02 - 13, 3) - 0.5) * 46;
  const d = Math.hypot(x * 0.8, z * 1.2) + warp;
  return smoothstep(50, 96, d);
}

function heightAt(x, z) {
  const m = plainMask(x, z);
  const n = fbm(x * 0.016 + 3.1, z * 0.016 - 1.7);
  const ridge = 1 - Math.abs(2 * fbm(x * 0.026 + 9.3, z * 0.026 + 4.1, 4) - 1);
  const hills = Math.max(0, (n - 0.3) * 1.7 + ridge * ridge * 0.62) * 58;
  const ground = (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 1.0;
  return m * hills + ground - 0.4;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(16, 16, 14, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = true;
  return t;
}

function buildTerrain(step, half) {
  const n = Math.floor((half * 2) / step) + 1;
  const H = new Float32Array(n * n);
  const M = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = -half + i * step;
      const z = -half + j * step;
      H[i * n + j] = heightAt(x, z);
      M[i * n + j] = plainMask(x, z);
    }
  }

  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const L = new THREE.Vector3(-0.66, 0.6, 0.45).normalize();
  const lit = new THREE.Color(0xffffff);
  const shade = new THREE.Color(0x5f605c);
  const flat = new THREE.Color(0xd3d4d0);
  const c = new THREE.Color();
  const nrm = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const idx = i * n + j;
      const hx = H[Math.min(n - 1, i + 1) * n + j] - H[Math.max(0, i - 1) * n + j];
      const hz = H[i * n + Math.min(n - 1, j + 1)] - H[i * n + Math.max(0, j - 1)];
      nrm.set(-hx, 2 * step, -hz).normalize();
      const lam = Math.max(0, nrm.dot(L));
      c.copy(shade).lerp(lit, Math.min(1, Math.pow(lam, 1.15) * 1.12));
      // valleys between hills sit a little darker, peaks catch the light
      c.multiplyScalar(0.86 + 0.14 * Math.min(1, H[idx] / 34));
      c.lerp(flat, 1 - Math.min(1, M[idx] * 2.4));
      const jit = 0.94 + hash(i * 7 + 1, j * 13 + 5) * 0.1;
      pos[k] = -half + i * step + (hash(i, j + 77) - 0.5) * step * 0.6;
      pos[k + 1] = H[idx];
      pos[k + 2] = -half + j * step + (hash(j + 999, i) - 0.5) * step * 0.6;
      col[k] = Math.min(1, c.r * jit);
      col[k + 1] = Math.min(1, c.g * jit);
      col[k + 2] = Math.min(1, c.b * jit);
      k += 3;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: step * 0.9,
    vertexColors: true,
    map: dotTexture(),
    alphaTest: 0.45,
    sizeAttenuation: true
  });
  return new THREE.Points(geo, mat);
}

/* ---------------- site ---------------- */

function buildSite() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf8f8f6 });
  const edgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.55 });

  const add = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, white);
    m.position.set(x, y, z);
    g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat);
    e.position.copy(m.position);
    g.add(e);
  };
  add(new THREE.BoxGeometry(24, 6, 12), 0, 3, -2);
  add(new THREE.BoxGeometry(14, 4.4, 9), 21, 2.2, 13);
  add(new THREE.BoxGeometry(8, 3, 6), -21, 1.5, 13);
  add(new THREE.BoxGeometry(5, 2.4, 10), -24, 1.2, -14);
  for (const [x, z] of [[18, -17], [26, -17], [22, -24.5]]) {
    add(new THREE.CylinderGeometry(3.2, 3.2, 6, 32), x, 3, z);
  }

  // site zone on the ground
  const pts = [[-36, -28], [6, -36], [40, -24], [44, 12], [12, 30], [-32, 24]];
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.07, depthWrite: false })
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.15;
  g.add(fill);
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, 0.25, z))),
    new THREE.LineDashedMaterial({ color: ACCENT, dashSize: 1.8, gapSize: 1.2 })
  );
  outline.computeLineDistances();
  g.add(outline);

  // node on the roof of the main building
  const inkMat = new THREE.MeshBasicMaterial({ color: INK });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 7.6, 10), inkMat);
  mast.position.set(NODE.x, 6 + 3.8, NODE.z);
  g.add(mast);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.18, 24), inkMat);
  plate.position.set(NODE.x, MAST_TOP.y - 0.6, NODE.z);
  g.add(plate);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), new THREE.MeshBasicMaterial({ color: ACCENT }));
  tip.position.copy(MAST_TOP);
  g.add(tip);

  return g;
}

/* ---------------- dome ---------------- */

function buildDome() {
  const p = [];
  const seg = 120;
  for (const e of [9, 22, 37, 54, 72]) {
    const er = THREE.MathUtils.degToRad(e);
    const r = R * Math.cos(er);
    const y = R * Math.sin(er);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      p.push(r * Math.cos(a0), y, r * Math.sin(a0), r * Math.cos(a1), y, r * Math.sin(a1));
    }
  }
  for (let m = 0; m < 16; m++) {
    const a = (m / 16) * Math.PI * 2;
    for (let i = 0; i < 28; i++) {
      const e0 = (i / 28) * (Math.PI / 2);
      const e1 = ((i + 1) / 28) * (Math.PI / 2);
      p.push(
        R * Math.cos(e0) * Math.cos(a), R * Math.sin(e0), R * Math.cos(e0) * Math.sin(a),
        R * Math.cos(e1) * Math.cos(a), R * Math.sin(e1), R * Math.cos(e1) * Math.sin(a)
      );
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const mat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.12, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);

  const ringPts = [];
  for (let i = 0; i <= 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(R * Math.cos(a), 0.3, R * Math.sin(a)));
  }
  const ring = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineDashedMaterial({ color: INK, dashSize: 2.2, gapSize: 1.6, transparent: true, opacity: 0.45 })
  );
  ring.computeLineDistances();

  const group = new THREE.Group();
  group.position.copy(NODE);
  group.add(lines, ring);

  const ink = new THREE.Color(INK);
  const acc = new THREE.Color(ACCENT);
  let k = 0;
  return {
    group,
    setAlert(on, dt) {
      const goal = on ? 1 : 0;
      k += (goal - k) * Math.min(1, dt * 3 || 1);
      if (dt === 0) k = goal;
      mat.color.copy(ink).lerp(acc, k);
      mat.opacity = 0.12 + k * 0.16;
    }
  };
}

/* Rings that contract toward the node: the node listens, it does not emit. */
function buildListeningRings() {
  const group = new THREE.Group();
  group.position.set(NODE.x, 0.35, NODE.z);
  const circle = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    circle.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(circle);
  const items = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthWrite: false });
    const l = new THREE.Line(geo, mat);
    group.add(l);
    items.push({ l, mat, off: i / 3 });
  }
  return {
    group,
    update(t) {
      for (const it of items) {
        const ph = ((t / 4.2) + it.off) % 1;
        const s = R * (1 - ph) + 1.5;
        it.l.scale.set(s, 1, s);
        it.mat.opacity = Math.sin(ph * Math.PI) * 0.55;
      }
    }
  };
}

/* ---------------- drone track ---------------- */

function spriteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#ff5a1f';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(64, 64, 24, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ff5a1f';
  g.beginPath();
  g.arc(64, 64, 17, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildTrack() {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(170, 34, -120),
    new THREE.Vector3(112, 30, -84),
    new THREE.Vector3(62, 25, -46),
    new THREE.Vector3(26, 21, -16),
    new THREE.Vector3(-6, 19, 8),
    new THREE.Vector3(-36, 21, 34),
    new THREE.Vector3(-88, 26, 72),
    new THREE.Vector3(-160, 32, 112)
  ], false, 'centripetal');

  const spriteMat = new THREE.SpriteMaterial({ map: spriteTexture(), transparent: true, depthTest: false });
  const drone = new THREE.Sprite(spriteMat);
  drone.scale.set(5.2, 5.2, 1);
  drone.renderOrder = 10;
  group.add(drone);

  // dotted wake
  const N = 80;
  const trailPos = new Float32Array(N * 3);
  const trailCol = new Float32Array(N * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ size: 0.95, vertexColors: true, map: dotTexture(), alphaTest: 0.45 }));
  group.add(trail);
  const history = [];
  const acc = new THREE.Color(ACCENT);
  const bg = new THREE.Color(BG);
  const tmpC = new THREE.Color();

  const line = (color, opacity, dash, gap) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: gap, transparent: true, opacity, depthWrite: false });
    const l = new THREE.Line(geo, mat);
    group.add(l);
    return l;
  };
  const drop = line(INK, 0.5, 0.8, 0.8);
  const bearing = line(ACCENT, 0, 1.6, 1.0);
  const pilotLink = line(INK, 0.28, 1.2, 1.4);

  const pilot = new THREE.Vector3(150, 0.4, -108);
  const sq = 1.8;
  const pilotSq = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(pilot.x - sq, pilot.y, pilot.z - sq),
      new THREE.Vector3(pilot.x + sq, pilot.y, pilot.z - sq),
      new THREE.Vector3(pilot.x + sq, pilot.y, pilot.z + sq),
      new THREE.Vector3(pilot.x - sq, pilot.y, pilot.z + sq)
    ]),
    new THREE.LineBasicMaterial({ color: INK })
  );
  group.add(pilotSq);

  const ground = new THREE.Vector3();
  const setLine = (l, a, b) => {
    const p = l.geometry.attributes.position;
    p.setXYZ(0, a.x, a.y, a.z);
    p.setXYZ(1, b.x, b.y, b.z);
    p.needsUpdate = true;
    l.computeLineDistances();
  };

  const visibility = (u) => Math.min(1, u / 0.04, (1 - u) / 0.04);
  let bearingK = 0;
  let lastU = 0;

  return {
    group,
    curve,
    pilot,
    visibility,
    setDrone(p, u) {
      if (u < lastU) history.length = 0;   // new pass
      lastU = u;
      const vis = visibility(u);
      drone.position.copy(p);
      spriteMat.opacity = vis;

      const lastP = history[history.length - 1];
      if (!lastP || lastP.distanceTo(p) > 1.1) {
        history.push(p.clone());
        if (history.length > N) history.shift();
      }
      for (let i = 0; i < N; i++) {
        const h = history[i];
        const age = history.length - 1 - i;
        if (h) {
          trailPos[i * 3] = h.x;
          trailPos[i * 3 + 1] = h.y;
          trailPos[i * 3 + 2] = h.z;
          tmpC.copy(acc).lerp(bg, Math.min(1, age / N + (1 - vis)));
        } else {
          trailPos[i * 3] = trailPos[i * 3 + 1] = trailPos[i * 3 + 2] = 0;
          tmpC.copy(bg);
        }
        trailCol[i * 3] = tmpC.r;
        trailCol[i * 3 + 1] = tmpC.g;
        trailCol[i * 3 + 2] = tmpC.b;
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate = true;
      trailGeo.setDrawRange(0, history.length);

      ground.set(p.x, 0.2, p.z);
      setLine(drop, p, ground);
      drop.material.opacity = 0.5 * vis;
      setLine(bearing, MAST_TOP, p);
      setLine(pilotLink, pilot, p);
      pilotLink.material.opacity = 0.28 * vis;
    },
    setBearingVisible(goal, dt) {
      bearingK += (goal - bearingK) * Math.min(1, dt * 2.5 || 1);
      if (dt === 0) bearingK = goal;
      bearing.material.opacity = 0.85 * bearingK * visibility(lastU);
    }
  };
}

/* ---------------- HUD tape and ladder ---------------- */

const PX_PER_DEG = 6;

function buildTape(track) {
  if (!track) return { set() {} };
  const frag = document.createDocumentFragment();
  for (let d = 0; d <= 720; d += 5) {
    const s = document.createElement('span');
    const major = d % 10 === 0;
    if (major) {
      s.className = 'maj';
      const b = document.createElement('b');
      b.textContent = String(Math.round((d % 360) / 10)).padStart(2, '0');
      s.appendChild(b);
    }
    s.style.left = d * PX_PER_DEG + 'px';
    frag.appendChild(s);
  }
  track.appendChild(frag);
  return {
    set(h) { track.style.transform = `translateX(${(-(h + 360) * PX_PER_DEG).toFixed(1)}px)`; }
  };
}

function buildLadder(track) {
  if (!track) return { set() {} };
  const frag = document.createDocumentFragment();
  for (let d = -60; d <= 30; d += 5) {
    const s = document.createElement('span');
    if (d % 10 === 0) {
      s.className = 'maj';
      const b = document.createElement('b');
      const n = Math.round(Math.abs(d) / 10);
      b.textContent = (d < 0 ? '-' : '') + String(n).padStart(2, '0');
      s.appendChild(b);
    }
    s.style.top = (-d * PX_PER_DEG) + 'px';
    frag.appendChild(s);
  }
  track.appendChild(frag);
  return {
    set(p) { track.style.transform = `translateY(${(p * PX_PER_DEG).toFixed(1)}px)`; }
  };
}

function drawSpark(el, values) {
  if (!el || values.length < 2) return;
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const w = 268;
  const h = 20;
  const step = w / 59;
  const off = 60 - values.length;
  el.setAttribute('points', values.map((val, i) => {
    const x = (off + i) * step;
    const y = h - ((val - min) / (max - min)) * h;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' '));
}
