// Interactive 3D concept model of the HERMES node (Three.js).
// Two variants: ID (Remote ID receivers only) and ID + DF (adds the KrakenSDR
// and the five-antenna direction-finding array). Drag to orbit, preset views,
// opening cover, and a parts list that highlights each part in the model.
//
// Concept model only: simplified geometry, not to scale, not a CAD drawing.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ACCENT = 0xff5a1f;
const GROUND_Y = -62;
const INTERNAL = new Set(['pi', 'esp', 'cc', 'kraken']);
const DF_ONLY = new Set(['kraken', 'array']);

const FRAMES = {
  df: { target: new THREE.Vector3(0, 26, 6), dist: 395 },
  id: { target: new THREE.Vector3(0, -6, 6), dist: 250 }
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function initNode(root, { reduceMotion, T }) {
  const stage = root.querySelector('[data-node-stage]');
  const canvas = stage.querySelector('canvas');
  const tip = stage.querySelector('[data-node-tip]');
  const readout = stage.querySelector('[data-node-readout]');
  const title = root.querySelector('[data-variant-title]');
  const partBtns = [...root.querySelectorAll('[data-part]')];
  const actBtns = Object.fromEntries([...root.querySelectorAll('[data-act]')].map((b) => [b.dataset.act, b]));
  const varBtns = [...root.querySelectorAll('[data-variant]')];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.rotateSpeed = 0.7;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI * 0.6;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.8;

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(160, 260, 220);
  const rim = new THREE.DirectionalLight(0xffe6d8, 1.1);
  rim.position.set(-220, 120, -180);
  scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0xd6d6d2, 0.5));

  // ---------- parts registry ----------
  const parts = {};
  const reg = (k) => (parts[k] ||= { meshes: [], mats: [], heat: 0, goal: 0 });
  const mat = (k, params) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1, ...params });
    if (k) reg(k).mats.push(m);
    return m;
  };
  const mk = (k, geo, material, x, y, z, parent) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.userData.part = k;
    (parent || model).add(m);
    if (k) reg(k).meshes.push(m);
    return m;
  };
  const tube = (k, points, r, material, parent) => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return mk(k, new THREE.TubeGeometry(curve, 48, r, 8, false), material, 0, 0, 0, parent);
  };

  const model = new THREE.Group();
  scene.add(model);
  const dfGroup = new THREE.Group();
  model.add(dfGroup);

  // ---------- mast, foot, clamps ----------
  const steel = mat(null, { color: 0x4a4d55, metalness: 0.7, roughness: 0.38 });
  mk(null, new THREE.CylinderGeometry(2.4, 2.4, 83, 32), steel, 0, GROUND_Y + 41.5, 0);
  mk(null, new THREE.CylinderGeometry(2.7, 2.7, 1.2, 32), steel, 0, 21.6, 0);
  mk(null, new THREE.CylinderGeometry(11, 12, 1.4, 48), mat(null, { color: 0x3a3c42, metalness: 0.5, roughness: 0.5 }), 0, GROUND_Y + 0.7, 0);

  const clampMat = mat('clamps', { color: 0x62656c, roughness: 0.62, metalness: 0.15 });
  for (const y of [-12, 10]) {
    mk('clamps', new THREE.CylinderGeometry(3.5, 3.5, 3.2, 32), clampMat, 0, y, 0);
    mk('clamps', new THREE.BoxGeometry(4.2, 2.8, 3.2), clampMat, 0, y, 3.6);
  }

  // ---------- enclosure ----------
  const shellMat = mat('enclosure', { color: 0x2c2f35, roughness: 0.58, metalness: 0.12 });
  const lidMat = mat('enclosure', { color: 0x34373e, roughness: 0.5, metalness: 0.12 });
  mk('enclosure', new RoundedBoxGeometry(30, 38, 11, 4, 1.4), shellMat, 0, 0, 10.5);
  mk('enclosure', new THREE.BoxGeometry(27, 35, 0.4), mat('enclosure', { color: 0xc9cbcf, roughness: 0.7 }), 0, 0, 16.1);

  const glandMat = mat('enclosure', { color: 0x1d1e21, roughness: 0.8 });
  for (const x of [-8, 0, 8]) mk('enclosure', new THREE.CylinderGeometry(1.3, 1.5, 2.4, 20), glandMat, x, -20.2, 10.5);
  tube(null, [[0, -21.5, 10.5], [0, -27, 8], [1.6, -33, 3.2], [2.8, -45, 2.6], [2.8, GROUND_Y + 2, 2.6]], 0.55, mat(null, { color: 0x18191c, roughness: 0.75 }));

  const lidPivot = new THREE.Group();
  lidPivot.position.set(-15, 0, 16);
  model.add(lidPivot);
  mk('enclosure', new RoundedBoxGeometry(30, 38, 4.6, 4, 1.4), lidMat, 15, 0, 2.3, lidPivot);
  const screwMat = mat('enclosure', { color: 0xb8bcc2, metalness: 0.9, roughness: 0.3 });
  for (const [x, y] of [[2.6, 16.6], [27.4, 16.6], [2.6, -16.6], [27.4, -16.6]]) {
    const s = mk('enclosure', new THREE.CylinderGeometry(0.7, 0.7, 0.4, 16), screwMat, x, y, 4.75, lidPivot);
    s.rotation.x = Math.PI / 2;
  }
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 20),
    new THREE.MeshBasicMaterial({ map: decalTexture(), transparent: true, toneMapped: false })
  );
  decal.position.set(15, 0.5, 4.64);
  lidPivot.add(decal);

  // ---------- Raspberry Pi 5 ----------
  const pcbGreen = mat('pi', { color: 0x2f7a4a, roughness: 0.6 });
  const chipMat = mat('pi', { color: 0x1c1d20, roughness: 0.5 });
  const silverPi = mat('pi', { color: 0xc4c8ce, metalness: 0.85, roughness: 0.3 });
  mk('pi', new THREE.BoxGeometry(17, 11.5, 0.3), pcbGreen, -3, 9.5, 17);
  mk('pi', new THREE.BoxGeometry(5.6, 5.6, 1.2), chipMat, -6, 9.4, 17.75);
  const fan = mk('pi', new THREE.CylinderGeometry(2.2, 2.2, 0.25, 32), mat('pi', { color: 0x0f1012, roughness: 0.4 }), -6, 9.4, 18.45);
  fan.rotation.x = Math.PI / 2;
  mk('pi', new THREE.BoxGeometry(10, 1, 0.9), chipMat, -5.5, 14.6, 17.6);
  mk('pi', new THREE.BoxGeometry(2.6, 2.4, 1.6), silverPi, 4.2, 12.9, 17.95);
  mk('pi', new THREE.BoxGeometry(2.6, 2.4, 1.6), silverPi, 4.2, 10.1, 17.95);
  mk('pi', new THREE.BoxGeometry(2.6, 3.0, 1.9), silverPi, 4.2, 6.6, 18.1);
  mk('pi', new THREE.BoxGeometry(2.2, 2.2, 0.3), chipMat, -0.6, 7.2, 17.3);

  // ---------- ESP32-C5 x2 ----------
  const pcbBlue = mat('esp', { color: 0x2a64a0, roughness: 0.55 });
  const canMat = mat('esp', { color: 0xc9ccd2, metalness: 0.85, roughness: 0.32 });
  for (const x of [-10.6, -5.3]) {
    mk('esp', new THREE.BoxGeometry(4.6, 9.5, 0.25), pcbBlue, x, -6.2, 17);
    mk('esp', new THREE.BoxGeometry(2.6, 2.8, 0.5), canMat, x, -3.4, 17.38);
    mk('esp', new THREE.BoxGeometry(1.1, 0.8, 0.45), canMat, x, -10.6, 17.35);
  }

  // ---------- CC2652P dongle ----------
  const ccMat = mat('cc', { color: 0x6f53a0, roughness: 0.45 });
  mk('cc', new THREE.BoxGeometry(2.6, 8.6, 1.3), ccMat, 0.6, -6.2, 17.5);
  mk('cc', new THREE.CylinderGeometry(0.45, 0.45, 1.4, 16), mat('cc', { color: 0xd4a73c, metalness: 0.9, roughness: 0.3 }), 0.6, -1.2, 17.5);

  // ---------- internal cabling ----------
  const cableMat = mat(null, { color: 0x232427, roughness: 0.7 });
  tube(null, [[4.2, 12.9, 18.6], [6.5, 9, 19.2], [3, 0.5, 18.9], [0.6, -1.8, 18.3]], 0.32, cableMat);
  tube(null, [[4.2, 10.1, 18.6], [-1, 2.5, 19.1], [-8, -0.6, 18.6], [-10.6, -1.8, 17.6]], 0.32, cableMat);

  // ---------- ID antennas ----------
  const nutMat = mat('idant', { color: 0xb7bbc1, metalness: 0.85, roughness: 0.3 });
  const whipMat = mat('idant', { color: 0xe8e4db, roughness: 0.72 });
  for (const x of [-10, 10]) {
    mk('idant', new THREE.CylinderGeometry(1.1, 1.1, 1.4, 6), nutMat, x, 19.7, 10.5);
    mk('idant', new THREE.CylinderGeometry(0.55, 0.7, 14, 20), whipMat, x, 27.4, 10.5);
    mk('idant', new THREE.SphereGeometry(0.58, 16, 10), whipMat, x, 34.4, 10.5);
  }

  // ---------- DF only: KrakenSDR, upper mast, array ----------
  const alu = mat('kraken', { color: 0x9aa0a8, metalness: 0.85, roughness: 0.34 });
  mk('kraken', new THREE.BoxGeometry(9.5, 15, 3), alu, 8.6, -6.4, 18.1, dfGroup);
  const groove = mat('kraken', { color: 0x6c7078, metalness: 0.7, roughness: 0.45 });
  for (const y of [-9, -6.4, -3.8]) mk('kraken', new THREE.BoxGeometry(7.5, 0.35, 0.2), groove, 8.6, y, 19.65, dfGroup);
  const gold = mat('kraken', { color: 0xd4a73c, metalness: 0.9, roughness: 0.28 });
  for (let i = 0; i < 5; i++) mk('kraken', new THREE.CylinderGeometry(0.42, 0.42, 1.3, 14), gold, 5.4 + i * 1.6, 1.75, 18.1, dfGroup);
  const coaxMat = mat(null, { color: 0x1a1b1e, roughness: 0.6 });
  tube(null, [[8.6, 2.4, 18.1], [8.8, 8, 18.6], [8.4, 16, 15], [8, 19, 11.5], [8, 20.6, 10.5]], 0.5, coaxMat, dfGroup);
  mk(null, new THREE.CylinderGeometry(1.3, 1.5, 2.2, 20), glandMat, 8, 20.1, 10.5, dfGroup);
  tube(null, [[8, 21, 10.5], [7, 24, 7], [3.4, 28, 2.6], [2.6, 40, 2.2], [2.6, 66, 2.2], [1.5, 69.5, 1.5]], 0.5, coaxMat, dfGroup);

  mk(null, new THREE.CylinderGeometry(1.9, 1.9, 50, 24), steel, 0, 47, 0, dfGroup);
  mk(null, new THREE.CylinderGeometry(2.9, 2.9, 4, 24), steel, 0, 23.5, 0, dfGroup);

  const array = new THREE.Group();
  array.position.set(0, 72, 0);
  dfGroup.add(array);
  const planeMat = mat('array', { color: 0x3a3d44, metalness: 0.6, roughness: 0.42 });
  mk('array', new THREE.CylinderGeometry(27, 27, 0.6, 96), planeMat, 0, 0, 0, array);
  mk('array', new THREE.CylinderGeometry(4.6, 4.6, 3, 32), mat('array', { color: 0x24262b, roughness: 0.5 }), 0, -1.6, 0, array);
  const antMat = mat('array', { color: ACCENT, roughness: 0.45, metalness: 0.05 });
  const baseMat = mat('array', { color: 0xb7bbc1, metalness: 0.85, roughness: 0.3 });
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 * Math.PI) / 180;
    const x = 21 * Math.sin(a);
    const z = 21 * Math.cos(a);
    mk('array', new THREE.CylinderGeometry(1.1, 1.1, 1.6, 16), baseMat, x, 1.1, z, array);
    mk('array', new THREE.CylinderGeometry(0.5, 0.62, 30, 16), antMat, x, 16.9, z, array);
    mk('array', new THREE.SphereGeometry(0.55, 14, 10), antMat, x, 32, z, array);
  }

  // ---------- floor ----------
  const grid = new THREE.PolarGridHelper(120, 12, 6, 96, 0xbdbdb8, 0xd2d2ce);
  grid.position.y = GROUND_Y;
  scene.add(grid);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = GROUND_Y + 0.05;
  scene.add(shadow);

  // ---------- listening rings (contract toward the antennas) ----------
  const ringGeo = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 97 }, (_, i) => {
      const a = (i / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    })
  );
  const rings = [0, 1, 2].map((i) => {
    const m = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthWrite: false });
    const l = new THREE.Line(ringGeo, m);
    scene.add(l);
    return { l, m, off: i / 3 };
  });

  // ---------- state ----------
  const state = { variant: 'df', open: false, view: '', pinned: null, hover: null };
  let lidTween = null;
  let camTween = null;
  let arrayPop = null;

  function setVariant(v, animate = true) {
    state.variant = v;
    const df = v === 'df';
    dfGroup.visible = df;
    varBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.variant === v)));
    partBtns.forEach((b) => { b.dataset.off = String(!df && b.hasAttribute('data-df')); });
    if (title) title.textContent = df ? T.titleDf : T.titleId;
    if (df && animate && !reduceMotion) arrayPop = { t0: performance.now(), dur: 700 };
    frameTo(state.view || 'default', animate);
  }

  function setCover(open) {
    state.open = open;
    actBtns.cover?.setAttribute('aria-pressed', String(open));
    if (actBtns.cover) actBtns.cover.textContent = open ? T.closeCover : T.openCover;
    const to = open ? -1.95 : 0;
    if (reduceMotion) { lidPivot.rotation.y = to; return; }
    lidTween = { from: lidPivot.rotation.y, to, t0: performance.now(), dur: 900 };
  }

  function setSpin(on) {
    controls.autoRotate = on;
    actBtns.spin?.setAttribute('aria-pressed', String(on));
    if (actBtns.spin) actBtns.spin.textContent = on ? T.pause : T.spin;
  }

  const sph = new THREE.Spherical();
  function viewAngles(view) {
    switch (view) {
      case 'front': return { theta: 0, phi: THREE.MathUtils.degToRad(84) };
      case 'side': return { theta: Math.PI / 2, phi: THREE.MathUtils.degToRad(84) };
      case 'top': return { theta: 0, phi: THREE.MathUtils.degToRad(9) };
      default: return null;
    }
  }

  function frameTo(view, animate = true) {
    const f = FRAMES[state.variant];
    const aspect = Math.max(0.5, stage.clientWidth / Math.max(1, stage.clientHeight));
    const dist = f.dist * (aspect < 1 ? Math.pow(1 / aspect, 0.55) : 1) * (view === 'top' ? 0.82 : 1);
    sph.setFromVector3(camera.position.clone().sub(controls.target));
    const angles = viewAngles(view) || { theta: sph.theta, phi: sph.phi };
    const goal = { target: f.target.clone(), r: dist, theta: angles.theta, phi: angles.phi };
    if (!animate || reduceMotion) {
      applyCam(goal.target, goal.r, goal.theta, goal.phi);
      return;
    }
    let dTheta = goal.theta - sph.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    camTween = {
      t0: performance.now(),
      dur: 950,
      from: { target: controls.target.clone(), r: sph.radius, theta: sph.theta, phi: sph.phi },
      to: { target: goal.target, r: goal.r, theta: sph.theta + dTheta, phi: goal.phi }
    };
    controls.enableDamping = false;
  }

  function applyCam(target, r, theta, phi) {
    controls.target.copy(target);
    sph.set(r, phi, theta);
    camera.position.setFromSpherical(sph).add(target);
    camera.lookAt(target);
  }

  // ---------- highlight ----------
  const accentColor = new THREE.Color(ACCENT);
  function setHot(k) {
    for (const [name, p] of Object.entries(parts)) p.goal = name === k ? 1 : 0;
    partBtns.forEach((b) => b.classList.toggle('is-hot', b.dataset.part === k));
  }
  function refreshHot() { setHot(state.hover || state.pinned); }

  partBtns.forEach((b) => {
    const k = b.dataset.part;
    b.addEventListener('mouseenter', () => { state.hover = k; refreshHot(); });
    b.addEventListener('mouseleave', () => { state.hover = null; refreshHot(); });
    b.addEventListener('focus', () => { state.hover = k; refreshHot(); });
    b.addEventListener('blur', () => { state.hover = null; refreshHot(); });
    b.addEventListener('click', () => {
      state.pinned = state.pinned === k ? null : k;
      if (state.pinned) {
        if (DF_ONLY.has(k) && state.variant !== 'df') setVariant('df');
        if (INTERNAL.has(k) && !state.open) setCover(true);
      }
      refreshHot();
    });
  });

  // ---------- controls wiring ----------
  actBtns.spin?.addEventListener('click', () => {
    const on = !controls.autoRotate;
    state.view = '';
    setSpin(on);
    ['front', 'side', 'top'].forEach((v) => actBtns[v]?.setAttribute('aria-pressed', 'false'));
    if (on) frameTo('default');
  });
  for (const v of ['front', 'side', 'top']) {
    actBtns[v]?.addEventListener('click', () => {
      state.view = v;
      setSpin(false);
      ['front', 'side', 'top'].forEach((x) => actBtns[x]?.setAttribute('aria-pressed', String(x === v)));
      frameTo(v);
    });
  }
  actBtns.cover?.addEventListener('click', () => setCover(!state.open));
  varBtns.forEach((b) => b.addEventListener('click', () => setVariant(b.dataset.variant)));

  controls.addEventListener('start', () => {
    stage.classList.add('was-dragged');
    camTween = null;
    controls.enableDamping = true;
    if (controls.autoRotate) setSpin(false);
    state.view = '';
    ['front', 'side', 'top'].forEach((x) => actBtns[x]?.setAttribute('aria-pressed', 'false'));
  });

  // ---------- hover picking ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dragging = false;
  canvas.addEventListener('pointerdown', () => { dragging = true; });
  window.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging || e.pointerType === 'touch') return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(model, true).find((h) => h.object.visible && h.object.userData.part);
    const k = hit ? hit.object.userData.part : null;
    if (k !== state.hover) { state.hover = k; refreshHot(); }
    if (k && T.parts[k]) {
      tip.textContent = T.parts[k];
      tip.style.transform = `translate3d(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px, 0)`;
      tip.classList.add('is-on');
    } else {
      tip.classList.remove('is-on');
    }
  });
  canvas.addEventListener('pointerleave', () => {
    tip.classList.remove('is-on');
    state.hover = null;
    refreshHot();
  });

  // ---------- size ----------
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(() => { resize(); frameTo(state.view || 'default', false); }).observe(stage);

  // initial pose
  applyCam(FRAMES.df.target, FRAMES.df.dist, 0.62, THREE.MathUtils.degToRad(76));
  setVariant('df', false);
  setSpin(!reduceMotion);
  controls.update();

  // ---------- loop ----------
  const clock = new THREE.Clock();
  let running = false;
  let lastReadout = '';

  function frame() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;

    if (camTween) {
      const k = Math.min(1, (now - camTween.t0) / camTween.dur);
      const e = ease(k);
      const a = camTween.from;
      const b = camTween.to;
      const tgt = a.target.clone().lerp(b.target, e);
      applyCam(tgt, a.r + (b.r - a.r) * e, a.theta + (b.theta - a.theta) * e, a.phi + (b.phi - a.phi) * e);
      if (k >= 1) { camTween = null; controls.enableDamping = true; }
    }
    controls.update();

    if (lidTween) {
      const k = Math.min(1, (now - lidTween.t0) / lidTween.dur);
      lidPivot.rotation.y = lidTween.from + (lidTween.to - lidTween.from) * ease(k);
      if (k >= 1) lidTween = null;
    }

    if (arrayPop) {
      const k = Math.min(1, (now - arrayPop.t0) / arrayPop.dur);
      const s = 0.6 + 0.4 * (1 - Math.pow(1 - k, 3));
      array.scale.setScalar(s);
      if (k >= 1) { arrayPop = null; array.scale.setScalar(1); }
    }

    for (const p of Object.values(parts)) {
      p.heat += (p.goal - p.heat) * Math.min(1, dt * 10);
      for (const m of p.mats) {
        m.emissive.copy(accentColor);
        m.emissiveIntensity = p.heat * 0.55;
      }
    }

    // listening rings around whichever antennas the variant has
    const df = state.variant === 'df';
    const cy = df ? 103 : 34;
    const maxR = df ? 70 : 42;
    for (const r of rings) {
      if (reduceMotion) { r.m.opacity = 0; continue; }
      const ph = ((t / 3.2) + r.off) % 1;
      const s = maxR * (1 - ph) + (df ? 22 : 11);
      r.l.position.set(0, cy - ph * (df ? 14 : 6), df ? 0 : 10.5);
      r.l.scale.set(s, 1, s);
      r.m.opacity = Math.sin(ph * Math.PI) * 0.5;
    }

    const yaw = Math.round((THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()) + 360) % 360);
    const pitch = Math.round(90 - THREE.MathUtils.radToDeg(controls.getPolarAngle()));
    const txt = 'YAW ' + String(yaw).padStart(3, '0') + '° · PITCH ' + pitch + '°' + (state.open ? ' · ' + T.coverOpen : '');
    if (txt !== lastReadout) { readout.textContent = txt; lastReadout = txt; }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || document.hidden) return;
    running = true;
    clock.getDelta();
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  let inView = false;
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    if (inView) start(); else stop();
  }, { rootMargin: '120px 0px' }).observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else if (inView) start();
  });

  renderer.render(scene, camera);
  stage.classList.add('is-ready');
}

/* ---------- textures ---------- */

function decalTexture() {
  const W = 512;
  const H = 640;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const cx = W / 2;
  const draw = () => {
    g.clearRect(0, 0, W, H);
    // HERMES, the product name on the device
    spaced(g, 'HERMES', cx, 300, '600 60px "Space Grotesk", "Inter Tight", sans-serif', '#eceae4', 16);
    // accent rule
    g.fillStyle = '#ff5a1f';
    g.fillRect(cx - 66, 332, 132, 4);
    // SKARVIS maker wordmark
    spaced(g, 'SKARVIS', cx, 384, '500 26px "Space Grotesk", sans-serif', '#9a978f', 14);
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  // Redraw once the web fonts are in, so the lettering is not a fallback face.
  document.fonts?.ready.then(() => { draw(); t.needsUpdate = true; });
  return t;
}

function spaced(g, text, cx, y, font, color, spacing) {
  g.font = font;
  g.fillStyle = color;
  g.textBaseline = 'alphabetic';
  const widths = [...text].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = cx - total / 2;
  [...text].forEach((ch, i) => {
    g.fillText(ch, x, y);
    x += widths[i] + spacing;
  });
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(17,18,20,0.32)');
  grad.addColorStop(0.35, 'rgba(17,18,20,0.12)');
  grad.addColorStop(1, 'rgba(17,18,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
