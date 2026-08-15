/*
 * Anatomía de la Distancia — v700
 *
 * Cuerpo construido en Three.js con volúmenes reales
 * (cápsulas, elipsoides, tubos). No hay silueta 2D ni máscara.
 *
 * Ovillo de lana 3D → escultura humana. Sólo pulsa el corazón.
 */

const ELECTRIC_HEX = "#E21888"; // Electric Pop — fácil de corregir
const PALETTE = {
  ocagyu:    "#0C5F66",
  sapphire:  "#1C5FA8",
  emerald:   "#1C8468",
  electric:  ELECTRIC_HEX,
  tangerine: "#FF5A1C"
};

const HOLD_SECONDS  = 4;
const MORPH_SECONDS = 10;

const HEART_PULSE_SPEED = 0.04;
const HEART_PULSE_SCALE = 0.035;
const HEART_LUB_WIDTH    = 0.13;
const HEART_DUB_WIDTH    = 0.13;
const HEART_DUB_STRENGTH = 0.42;
const HEART_PULSE_SMOOTH = 0.22;

const BRANCH_DEPTH = 5;
const BRANCH_BASE_RADIUS = 0.018;
const BRANCH_LENGTH_DECAY = 0.72;
const BRANCH_RADIUS_DECAY = 0.68;
const BRANCH_SPLIT_COUNT = 2;

const AUDIO_MASTER_VOL  = 0.85;
const HEARTBEAT_BPM     = 68;
const AIRPLANE_DURATION = 7;
const PLANE_VOLUME      = 0.18;
const PLANE_FADE_IN     = 2.0;
const PLANE_FADE_OUT    = 2.5;

const HEART_DAY_COLORS = [
  PALETTE.electric,
  PALETTE.tangerine,
  PALETTE.emerald,
  PALETTE.sapphire,
  PALETTE.ocagyu
];
const HEART_DAY_NAMES = {
  [PALETTE.electric]:  "electric pop",
  [PALETTE.tangerine]: "tangerina",
  [PALETTE.emerald]:   "esmeralda",
  [PALETTE.sapphire]:  "zafiro",
  [PALETTE.ocagyu]:    "ocagyu"
};

function getDayIndex() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((date - start) / 86400000);
}
function getHeartColorOfTheDay() {
  return HEART_DAY_COLORS[getDayIndex() % HEART_DAY_COLORS.length];
}

const heartColorToday = getHeartColorOfTheDay();
const heartColorNameToday = HEART_DAY_NAMES[heartColorToday] || heartColorToday;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let startMs = 0;
let morph = 0;
let morphSmoothed = 0;

let renderer, scene, camera;
let figureRoot, woolRoot, heartRoot, heartLight;
let bodyMats = [];
let woolMats = [];
let clock = { t: 0 };

let audioCtx = null;
let audioMasterGain = null;
let airplaneGain = null;
let heartbeatGain = null;
let heartbeatScheduledUntil = 0;
let audioReady = false;
let airplane = {};
let heartbeatPulseValue = 0;
let lastHeartMix = 0;

/* =========================================================
   BOOT
========================================================= */

function boot() {
  setupHeartDayBadge();
  setupRestartButton();
  setupAudioLifecycle();
  setupThree();
  startMs = performance.now();
  requestAnimationFrame(tick);
}

function setupThree() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0C5F66, 5.5, 11);

  camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.08, 40);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x0C5F66, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.prepend(renderer.domElement);

  addBackdrop();
  addLights();
  addGround();

  figureRoot = buildFigure();
  figureRoot.rotation.y = 0.38;
  figureRoot.traverse((o) => {
    if (o.isMesh && o.material && o.material.color) bodyMats.push(o.material);
  });
  setGroupOpacity(figureRoot, 0);
  scene.add(figureRoot);

  woolRoot = buildWoolBall();
  woolRoot.traverse((o) => {
    if (o.isMesh && o.material) woolMats.push(o.material);
  });
  scene.add(woolRoot);

  fitCamera();
  window.addEventListener("resize", onResize);
}

function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fitCamera();
}

function fitCamera() {
  const aspect = innerWidth / innerHeight;
  const dist = aspect < 0.72 ? 3.55 : aspect < 1.1 ? 3.05 : 2.55;
  camera.position.set(0.22, 0.96, dist);
  camera.lookAt(0.02, 0.90, 0);
}

function addBackdrop() {
  const geo = new THREE.SphereGeometry(14, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    uniforms: {
      cEdge: { value: new THREE.Color(PALETTE.ocagyu) },
      cCore: { value: new THREE.Color(PALETTE.sapphire) }
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 cEdge;
      uniform vec3 cCore;
      void main() {
        float h = smoothstep(-6.0, 8.0, vPos.y);
        float r = length(vPos.xz) / 14.0;
        vec3 col = mix(cCore, cEdge, h);
        col = mix(col, cEdge * 0.62, smoothstep(0.22, 0.95, r));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  scene.add(new THREE.Mesh(geo, mat));
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0x4aa0c8, 0x072c32, 0.48));

  const key = new THREE.DirectionalLight(0xfff4ea, 1.55);
  key.position.set(-2.4, 4.6, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 14;
  key.shadow.camera.left = -2.2;
  key.shadow.camera.right = 2.2;
  key.shadow.camera.top = 3.2;
  key.shadow.camera.bottom = -0.6;
  key.shadow.bias = -0.0007;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(PALETTE.sapphire, 0.55);
  fill.position.set(3.2, 1.4, 2.0);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(PALETTE.tangerine, 0.42);
  rim.position.set(0.6, 2.4, -3.4);
  scene.add(rim);

  heartLight = new THREE.PointLight(heartColorToday, 0.0, 1.6, 1.6);
  heartLight.position.set(0.07, 1.28, 0.22);
  scene.add(heartLight);
}

function addGround() {
  const g = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 48),
    new THREE.MeshStandardMaterial({
      color: 0x07282e,
      roughness: 0.92,
      metalness: 0
    })
  );
  g.rotation.x = -Math.PI / 2;
  g.position.y = 0.0;
  g.receiveShadow = true;
  scene.add(g);
}

function satin(hex, extra) {
  extra = extra || {};
  const mat = new THREE.MeshPhysicalMaterial({
    color: hex,
    roughness: extra.roughness != null ? extra.roughness : 0.42,
    metalness: 0,
    clearcoat: extra.clearcoat != null ? extra.clearcoat : 0.22,
    clearcoatRoughness: extra.clearcoatRoughness != null ? extra.clearcoatRoughness : 0.32,
    sheen: 0.28,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(hex),
    envMapIntensity: 0.9,
    transparent: true,
    opacity: 1,
    depthWrite: true
  });
  return mat;
}

function addEllipsoid(parent, mat, x, y, z, rx, ry, rz, rxz) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), mat);
  mesh.scale.set(rx, ry, rz);
  mesh.position.set(x, y, z);
  if (rxz) mesh.rotation.z = rxz;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCapsule(parent, mat, x1, y1, z1, x2, y2, z2, r) {
  const a = new THREE.Vector3(x1, y1, z1);
  const b = new THREE.Vector3(x2, y2, z2);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(r, Math.max(0.001, len), 8, 16),
    mat
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/* =========================================================
   FIGURE — overlapping volumes, not a flat cutout
========================================================= */

function buildFigure() {
  const root = new THREE.Group();
  const matCore = satin(PALETTE.emerald, { roughness: 0.40, clearcoat: 0.26 });
  const matLimb = satin(PALETTE.sapphire, { roughness: 0.46, clearcoat: 0.16 });
  const matAccent = satin(PALETTE.electric, { roughness: 0.36, clearcoat: 0.32 });
  const matHead = satin(PALETTE.sapphire, { roughness: 0.38, clearcoat: 0.28 });

  // HEAD
  addEllipsoid(root, matHead, 0.00, 1.58, 0.02, 0.105, 0.122, 0.100);
  addEllipsoid(root, matHead, 0.012, 1.545, 0.055, 0.078, 0.070, 0.082); // face
  addEllipsoid(root, matHead, 0.00, 1.505, 0.02, 0.062, 0.042, 0.058); // jaw
  addEllipsoid(root, matAccent, 0.00, 1.655, 0.00, 0.070, 0.028, 0.068); // crown accent

  // NECK
  addCapsule(root, matCore, 0.00, 1.48, 0.01, 0.00, 1.40, 0.01, 0.038);

  // SHOULDERS / DELTOIDS
  addEllipsoid(root, matCore, -0.20, 1.385, 0.01, 0.078, 0.062, 0.070);
  addEllipsoid(root, matCore,  0.20, 1.385, 0.01, 0.078, 0.062, 0.070);
  addCapsule(root, matCore, -0.04, 1.40, 0.02, -0.20, 1.385, 0.01, 0.055);
  addCapsule(root, matCore,  0.04, 1.40, 0.02,  0.20, 1.385, 0.01, 0.055);

  // TORSO / CHEST
  addEllipsoid(root, matCore, 0.00, 1.30, 0.03, 0.155, 0.125, 0.100);
  addEllipsoid(root, matCore, -0.055, 1.32, 0.075, 0.085, 0.078, 0.070); // pec L
  addEllipsoid(root, matCore,  0.055, 1.32, 0.075, 0.085, 0.078, 0.070); // pec R
  addEllipsoid(root, matAccent, 0.00, 1.335, 0.09, 0.040, 0.028, 0.030); // sternum accent

  // ABDOMEN
  addEllipsoid(root, matCore, 0.00, 1.16, 0.045, 0.118, 0.095, 0.088);
  addEllipsoid(root, matCore, 0.00, 1.08, 0.055, 0.100, 0.070, 0.078);
  addEllipsoid(root, matCore, 0.00, 1.12, 0.085, 0.062, 0.055, 0.048); // belly mass

  // PELVIS
  addEllipsoid(root, matCore, 0.00, 0.96, 0.02, 0.145, 0.090, 0.095);
  addEllipsoid(root, matCore, -0.09, 0.94, 0.01, 0.080, 0.072, 0.075);
  addEllipsoid(root, matCore,  0.09, 0.94, 0.01, 0.080, 0.072, 0.075);
  addEllipsoid(root, matCore, 0.00, 0.93, -0.04, 0.100, 0.055, 0.060); // glutes

  // ARMS
  addCapsule(root, matLimb, -0.22, 1.34, 0.01, -0.28, 1.08, 0.03, 0.042);
  addCapsule(root, matLimb, -0.28, 1.08, 0.03, -0.30, 0.82, 0.05, 0.032);
  addEllipsoid(root, matLimb, -0.305, 0.755, 0.06, 0.038, 0.050, 0.026); // hand
  addEllipsoid(root, matAccent, -0.312, 0.720, 0.075, 0.022, 0.022, 0.018);

  addCapsule(root, matLimb,  0.22, 1.34, 0.01,  0.28, 1.08, 0.03, 0.042);
  addCapsule(root, matLimb,  0.28, 1.08, 0.03,  0.30, 0.82, 0.05, 0.032);
  addEllipsoid(root, matLimb,  0.305, 0.755, 0.06, 0.038, 0.050, 0.026);
  addEllipsoid(root, matAccent,  0.312, 0.720, 0.075, 0.022, 0.022, 0.018);

  // LEGS
  addCapsule(root, matLimb, -0.085, 0.90, 0.02, -0.095, 0.55, 0.02, 0.072);
  addEllipsoid(root, matLimb, -0.095, 0.50, 0.03, 0.050, 0.048, 0.048); // knee
  addCapsule(root, matLimb, -0.095, 0.48, 0.02, -0.085, 0.16, 0.01, 0.048);
  addEllipsoid(root, matLimb, -0.082, 0.08, 0.055, 0.048, 0.028, 0.090); // foot
  addEllipsoid(root, matLimb, -0.082, 0.055, 0.11, 0.038, 0.020, 0.055);

  addCapsule(root, matLimb,  0.085, 0.90, 0.02,  0.095, 0.55, 0.02, 0.072);
  addEllipsoid(root, matLimb,  0.095, 0.50, 0.03, 0.050, 0.048, 0.048);
  addCapsule(root, matLimb,  0.095, 0.48, 0.02,  0.085, 0.16, 0.01, 0.048);
  addEllipsoid(root, matLimb,  0.082, 0.08, 0.055, 0.048, 0.028, 0.090);
  addEllipsoid(root, matLimb,  0.082, 0.055, 0.11, 0.038, 0.020, 0.055);

  // HEART — nested in the chest, anatomical left (+x while facing camera)
  heartRoot = buildHeart();
  heartRoot.position.set(0.062, 1.285, 0.125);
  heartRoot.rotation.set(-0.18, 0.35, 0.12);
  heartRoot.scale.setScalar(1);
  root.add(heartRoot);

  addBranches(root);

  return root;
}

function buildHeart() {
  const g = new THREE.Group();
  const mat = satin(heartColorToday, {
    roughness: 0.28,
    clearcoat: 0.58,
    clearcoatRoughness: 0.18
  });
  mat.emissive = new THREE.Color(heartColorToday);
  mat.emissiveIntensity = 0.16;
  g.userData.mat = mat;

  addEllipsoid(g, mat, -0.028, 0.018, 0.012, 0.052, 0.048, 0.046);
  addEllipsoid(g, mat,  0.026, 0.016, 0.014, 0.048, 0.045, 0.044);
  addEllipsoid(g, mat,  0.000, -0.032, 0.008, 0.042, 0.050, 0.038);
  addEllipsoid(g, mat,  0.004, 0.000, 0.030, 0.032, 0.030, 0.028);
  addCapsule(g, mat, -0.008, 0.040, 0.010, -0.018, 0.108, -0.012, 0.011);
  addCapsule(g, mat,  0.012, 0.038, 0.010,  0.028, 0.100, -0.010, 0.010);
  addCapsule(g, mat, -0.030, 0.028, 0.016, -0.072, 0.078, 0.008, 0.009);
  addCapsule(g, mat,  0.032, 0.024, 0.014,  0.070, 0.072, 0.006, 0.009);
  return g;
}

function addBranches(root) {
  const rng = mulberry32(19);
  const matMain = satin(PALETTE.electric, { roughness: 0.40, clearcoat: 0.20 });
  const matSec  = satin(PALETTE.sapphire, { roughness: 0.48, clearcoat: 0.12 });
  const matTip  = satin(heartColorToday, { roughness: 0.34, clearcoat: 0.30 });

  const seeds = [
    { p: [0.00, 1.68, 0.04], d: [0.05, 1.0, 0.35], len: 0.16, r: 0.016, depth: BRANCH_DEPTH },
    { p: [-0.06, 1.66, 0.02], d: [-0.55, 0.7, 0.25], len: 0.12, r: 0.013, depth: 4 },
    { p: [ 0.06, 1.66, 0.02], d: [ 0.55, 0.7, 0.25], len: 0.12, r: 0.013, depth: 4 },
    { p: [-0.22, 1.40, 0.04], d: [-1.0, 0.15, 0.45], len: 0.14, r: BRANCH_BASE_RADIUS, depth: BRANCH_DEPTH },
    { p: [ 0.22, 1.40, 0.04], d: [ 1.0, 0.15, 0.45], len: 0.14, r: BRANCH_BASE_RADIUS, depth: BRANCH_DEPTH },
    { p: [-0.14, 1.22, 0.08], d: [-0.85, -0.1, 0.55], len: 0.12, r: 0.014, depth: 4 },
    { p: [ 0.14, 1.22, 0.08], d: [ 0.85, -0.1, 0.55], len: 0.12, r: 0.014, depth: 4 },
    { p: [-0.12, 0.94, 0.04], d: [-0.8, -0.25, 0.4], len: 0.11, r: 0.014, depth: 4 },
    { p: [ 0.12, 0.94, 0.04], d: [ 0.8, -0.25, 0.4], len: 0.11, r: 0.014, depth: 4 },
    { p: [-0.10, 0.50, 0.04], d: [-0.7, -0.2, 0.35], len: 0.10, r: 0.012, depth: 4 },
    { p: [ 0.10, 0.50, 0.04], d: [ 0.7, -0.2, 0.35], len: 0.10, r: 0.012, depth: 4 },
    { p: [-0.09, 0.18, 0.04], d: [-0.45, -0.5, 0.4], len: 0.08, r: 0.010, depth: 3 },
    { p: [ 0.09, 0.18, 0.04], d: [ 0.45, -0.5, 0.4], len: 0.08, r: 0.010, depth: 3 }
  ];

  function grow(origin, dir, length, radius, depth) {
    if (depth <= 0 || radius < 0.0022 || length < 0.02) return;
    const pts = [];
    let p = origin.clone();
    pts.push(p.clone());
    const segs = depth > 3 ? 6 : 4;
    const d = dir.clone().normalize();
    for (let i = 0; i < segs; i++) {
      d.x += (rng() - 0.5) * 0.42;
      d.y += (rng() - 0.5) * 0.32;
      d.z += (rng() - 0.5) * 0.38;
      d.normalize();
      p = p.clone().addScaledVector(d, length / segs);
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const mat = depth >= 4 ? matMain : (depth >= 2 ? matSec : matTip);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, segs * 3, radius, 7, false),
      mat
    );
    tube.castShadow = true;
    tube.receiveShadow = true;
    root.add(tube);

    const end = pts[pts.length - 1];
    for (let k = 0; k < BRANCH_SPLIT_COUNT; k++) {
      const nd = d.clone();
      nd.x += (k === 0 ? -1 : 1) * (0.35 + rng() * 0.45);
      nd.y += (rng() - 0.5) * 0.5;
      nd.z += (rng() - 0.4) * 0.45;
      grow(end, nd, length * BRANCH_LENGTH_DECAY, radius * BRANCH_RADIUS_DECAY, depth - 1);
    }
  }

  for (const s of seeds) {
    grow(
      new THREE.Vector3(s.p[0], s.p[1], s.p[2]),
      new THREE.Vector3(s.d[0], s.d[1], s.d[2]),
      s.len, s.r, s.depth
    );
  }
}

function buildWoolBall() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xdcc08e,
    roughness: 0.82,
    metalness: 0,
    transparent: true,
    opacity: 1
  });
  const R = 0.23;
  const core = new THREE.Mesh(new THREE.SphereGeometry(R * 0.62, 20, 14), mat);
  core.castShadow = true;
  g.add(core);

  for (let i = 0; i < 56; i++) {
    const pts = [];
    const gamma = Math.random() * Math.PI * 2;
    const phi = 0.18 + Math.random() * 1.22;
    const span = 1.5 + Math.random() * 1.7;
    const theta0 = Math.random() * Math.PI * 2;
    const rad = R * (0.92 + Math.random() * 0.12);
    for (let s = 0; s <= 16; s++) {
      const t = theta0 + (s / 16 - 0.5) * span;
      const x1 = Math.cos(t);
      const y1 = Math.sin(t) * Math.cos(phi);
      const z1 = Math.sin(t) * Math.sin(phi);
      const cg = Math.cos(gamma), sg = Math.sin(gamma);
      pts.push(new THREE.Vector3(
        (x1 * cg - y1 * sg) * rad,
        (x1 * sg + y1 * cg) * rad,
        z1 * rad
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 16, 0.007 + Math.random() * 0.006, 5, false),
      mat
    );
    tube.castShadow = true;
    g.add(tube);
  }
  g.position.set(0, 0.92, 0);
  return g;
}

function setGroupOpacity(root, a) {
  root.visible = a > 0.01;
  root.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material.opacity = a;
      o.material.transparent = a < 0.98;
      o.material.depthWrite = a > 0.6;
    }
  });
}

/* =========================================================
   LOOP
========================================================= */

function getElapsedSeconds() {
  return (performance.now() - startMs) / 1000;
}

function getRawProgress() {
  const elapsed = getElapsedSeconds();
  if (elapsed < HOLD_SECONDS) return 0;
  return clamp((elapsed - HOLD_SECONDS) / MORPH_SECONDS, 0, 1);
}

function tick() {
  const elapsed = getElapsedSeconds();
  const raw = getRawProgress();
  morph = smoothstep(0.03, 0.97, raw);
  morphSmoothed = lerp(morphSmoothed, morph, 0.045);

  updateHeartbeatPulseValue();
  updateAudio(morphSmoothed);

  const bodyA = smoothstep(0.18, 0.88, morphSmoothed);
  const woolA = 1 - smoothstep(0.08, 0.62, morphSmoothed);
  setGroupOpacity(figureRoot, bodyA);
  setGroupOpacity(woolRoot, woolA);
  woolRoot.visible = woolA > 0.02;
  woolRoot.rotation.y = elapsed * 0.35;
  woolRoot.rotation.x = Math.sin(elapsed * 0.22) * 0.12;

  const pulse = heartbeatPulseValue > 0.002
    ? heartbeatPulseValue
    : (bodyA > 0.5 ? (Math.sin(elapsed * HEART_PULSE_SPEED * 60) * 0.5 + 0.5) * 0.15 * bodyA : 0);

  if (heartRoot) {
    heartRoot.scale.setScalar(1 + pulse * HEART_PULSE_SCALE);
    if (heartRoot.userData.mat) {
      heartRoot.userData.mat.emissiveIntensity = 0.12 + pulse * 0.28;
    }
  }
  if (heartLight) {
    heartLight.intensity = bodyA * (0.35 + pulse * 0.85);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* =========================================================
   UI + AUDIO  (mismo sistema de la pieza)
========================================================= */

function setupHeartDayBadge() {
  const swatch = document.getElementById("heartDaySwatch");
  const nameEl = document.getElementById("heartDayName");
  const hexEl  = document.getElementById("heartDayHex");
  const dateEl = document.getElementById("heartDayDate");
  const badge  = document.getElementById("heartDayBadge");
  if (!badge) return;
  if (swatch) swatch.style.background = heartColorToday;
  if (nameEl) nameEl.textContent = heartColorNameToday;
  if (hexEl)  hexEl.textContent = heartColorToday;
  badge.style.setProperty("--heart-day", heartColorToday);
  if (dateEl) {
    const now = new Date();
    const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    dateEl.textContent = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }
}

function setupRestartButton() {
  const btn = document.getElementById("soundToggle");
  const gate = document.getElementById("audioGate");

  if (gate) {
    const onGate = () => {
      ensureAudio();
      morph = 0;
      morphSmoothed = 0;
      startMs = performance.now();
      resetAudioOnRestart();
      gate.classList.add("hidden");
      gate.removeEventListener("click", onGate);
      gate.removeEventListener("touchstart", onGate);
    };
    gate.addEventListener("click", onGate);
    gate.addEventListener("touchstart", onGate, { passive: true });
  }

  if (!btn) return;
  btn.style.display = "block";
  btn.textContent = "reiniciar";
  btn.addEventListener("click", () => {
    morph = 0;
    morphSmoothed = 0;
    startMs = performance.now();
    ensureAudio();
    resetAudioOnRestart();
  });
}

function setupAudioLifecycle() {
  document.addEventListener("visibilitychange", () => {
    if (!audioCtx) return;
    if (document.hidden) {
      try { audioCtx.suspend(); } catch (e) { /* ignore */ }
    } else if (audioCtx.state === "suspended") {
      try { audioCtx.resume(); } catch (e) { /* ignore */ }
    }
  });
  const closeAudio = () => {
    if (!audioCtx) return;
    try { airplaneGain && airplaneGain.gain.setValueAtTime(0, audioCtx.currentTime); } catch (e) { /* ignore */ }
    try { heartbeatGain && heartbeatGain.gain.setValueAtTime(0, audioCtx.currentTime); } catch (e) { /* ignore */ }
    try { audioCtx.close(); } catch (e) { /* ignore */ }
  };
  window.addEventListener("pagehide", closeAudio);
  window.addEventListener("beforeunload", closeAudio);
}

function ensureAudio() {
  if (audioReady) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
  audioMasterGain = audioCtx.createGain();
  audioMasterGain.gain.value = AUDIO_MASTER_VOL;
  audioMasterGain.connect(audioCtx.destination);
  buildAirplaneSound();
  buildHeartbeatSound();
  audioReady = true;
  if (audioCtx.state === "suspended") audioCtx.resume();
  scheduleAirplaneTakeoff(audioCtx.currentTime);
}

function resetAudioOnRestart() {
  if (!audioReady) return;
  const t = audioCtx.currentTime;
  scheduleAirplaneTakeoff(t);
  heartbeatGain.gain.cancelScheduledValues(t);
  heartbeatGain.gain.setValueAtTime(0, t);
  heartbeatScheduledUntil = t;
  heartbeatPulseValue = 0;
  lastHeartMix = 0;
}

function buildAirplaneSound() {
  airplaneGain = audioCtx.createGain();
  airplaneGain.gain.value = 0;
  let panner = null;
  if (audioCtx.createStereoPanner) {
    panner = audioCtx.createStereoPanner();
    panner.pan.value = -0.85;
    airplaneGain.connect(panner);
    panner.connect(audioMasterGain);
  } else {
    airplaneGain.connect(audioMasterGain);
  }

  const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const rumble = audioCtx.createBufferSource();
  rumble.buffer = noiseBuf; rumble.loop = true;
  const rumbleFilt = audioCtx.createBiquadFilter();
  rumbleFilt.type = "lowpass"; rumbleFilt.frequency.value = 160; rumbleFilt.Q.value = 0.7;
  const rumbleGain = audioCtx.createGain(); rumbleGain.gain.value = 0.55;
  rumble.connect(rumbleFilt); rumbleFilt.connect(rumbleGain); rumbleGain.connect(airplaneGain);

  const jet = audioCtx.createBufferSource();
  jet.buffer = noiseBuf; jet.loop = true;
  const jetFilt = audioCtx.createBiquadFilter();
  jetFilt.type = "bandpass"; jetFilt.frequency.value = 420; jetFilt.Q.value = 0.85;
  const jetGain = audioCtx.createGain(); jetGain.gain.value = 0.42;
  jet.connect(jetFilt); jetFilt.connect(jetGain); jetGain.connect(airplaneGain);

  const turbine = audioCtx.createBufferSource();
  turbine.buffer = noiseBuf; turbine.loop = true;
  const turbineFilt = audioCtx.createBiquadFilter();
  turbineFilt.type = "bandpass"; turbineFilt.frequency.value = 1400; turbineFilt.Q.value = 2.2;
  const turbineGain = audioCtx.createGain(); turbineGain.gain.value = 0.08;
  turbine.connect(turbineFilt); turbineFilt.connect(turbineGain); turbineGain.connect(airplaneGain);

  const drone = audioCtx.createOscillator();
  drone.type = "sine"; drone.frequency.value = 58;
  const droneGain = audioCtx.createGain(); droneGain.gain.value = 0.12;
  drone.connect(droneGain); droneGain.connect(airplaneGain);

  const t = audioCtx.currentTime;
  rumble.start(t); jet.start(t); turbine.start(t); drone.start(t);
  airplane = { panner, rumbleFilt, jetFilt, turbineFilt, drone, rumbleGain, jetGain, turbineGain, droneGain };
}

function scheduleAirplaneTakeoff(t0) {
  if (!airplane.drone) return;
  airplaneGain.gain.cancelScheduledValues(t0);
  if (airplane.panner) airplane.panner.pan.cancelScheduledValues(t0);
  airplane.drone.frequency.cancelScheduledValues(t0);
  airplane.jetFilt.frequency.cancelScheduledValues(t0);
  airplane.turbineFilt.frequency.cancelScheduledValues(t0);

  const dur = AIRPLANE_DURATION;
  const peakEnd = Math.max(PLANE_FADE_IN + 0.4, dur - PLANE_FADE_OUT);
  airplaneGain.gain.setValueAtTime(0, t0);
  airplaneGain.gain.linearRampToValueAtTime(PLANE_VOLUME, t0 + PLANE_FADE_IN);
  airplaneGain.gain.linearRampToValueAtTime(PLANE_VOLUME * 0.92, t0 + peakEnd);
  airplaneGain.gain.linearRampToValueAtTime(0, t0 + dur);
  airplaneGain.gain.setValueAtTime(0, t0 + dur + 0.02);

  if (airplane.panner) {
    airplane.panner.pan.setValueAtTime(-0.88, t0);
    airplane.panner.pan.linearRampToValueAtTime(0.88, t0 + dur);
  }
  airplane.drone.frequency.setValueAtTime(52, t0);
  airplane.drone.frequency.linearRampToValueAtTime(64, t0 + PLANE_FADE_IN + 0.8);
  airplane.drone.frequency.linearRampToValueAtTime(44, t0 + dur);
  airplane.jetFilt.frequency.setValueAtTime(320, t0);
  airplane.jetFilt.frequency.linearRampToValueAtTime(560, t0 + PLANE_FADE_IN + 0.6);
  airplane.jetFilt.frequency.linearRampToValueAtTime(260, t0 + dur);
  airplane.turbineFilt.frequency.setValueAtTime(1100, t0);
  airplane.turbineFilt.frequency.linearRampToValueAtTime(1650, t0 + PLANE_FADE_IN + 0.5);
  airplane.turbineFilt.frequency.linearRampToValueAtTime(900, t0 + dur);
}

function buildHeartbeatSound() {
  heartbeatGain = audioCtx.createGain();
  heartbeatGain.gain.value = 0;
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.ratio.value = 6;
  comp.attack.value = 0.003; comp.release.value = 0.1;
  const filt = audioCtx.createBiquadFilter();
  filt.type = "lowpass"; filt.frequency.value = 220; filt.Q.value = 1.2;
  heartbeatGain.connect(filt); filt.connect(comp); comp.connect(audioMasterGain);
  heartbeatScheduledUntil = audioCtx.currentTime;
}

function triggerHeartPulse(time, strength) {
  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(85, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.06);
  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.95 * strength, time + 0.012);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.20);
  osc.connect(env); env.connect(heartbeatGain);
  osc.start(time); osc.stop(time + 0.22);

  const sub = audioCtx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(45, time);
  sub.frequency.exponentialRampToValueAtTime(28, time + 0.10);
  const subEnv = audioCtx.createGain();
  subEnv.gain.setValueAtTime(0, time);
  subEnv.gain.linearRampToValueAtTime(0.65 * strength, time + 0.018);
  subEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
  sub.connect(subEnv); subEnv.connect(heartbeatGain);
  sub.start(time); sub.stop(time + 0.27);
}

function scheduleHeartbeat(now) {
  const beatInterval = 60 / HEARTBEAT_BPM;
  while (heartbeatScheduledUntil < now + 0.6) {
    const t = Math.max(heartbeatScheduledUntil, now + 0.05);
    triggerHeartPulse(t, 1.0);
    triggerHeartPulse(t + 0.16, 0.62);
    heartbeatScheduledUntil = t + beatInterval;
  }
}

function updateAudio() {
  if (!audioReady) return;
  const t = audioCtx.currentTime;
  const elapsed = getElapsedSeconds();
  const heartFade = smoothstep(AIRPLANE_DURATION, AIRPLANE_DURATION + 1.2, elapsed);
  const heartMix  = Math.sin(heartFade * Math.PI * 0.5);
  heartbeatGain.gain.linearRampToValueAtTime(heartMix * 1.0, t + 0.3);
  lastHeartMix = heartMix;
  if (heartMix > 0.01) scheduleHeartbeat(t);
}

function updateHeartbeatPulseValue() {
  if (!audioReady || heartbeatScheduledUntil <= 0 || lastHeartMix < 0.02) {
    heartbeatPulseValue = lerp(heartbeatPulseValue, 0, HEART_PULSE_SMOOTH);
    return;
  }
  const now = audioCtx.currentTime;
  const beatInterval = 60 / HEARTBEAT_BPM;
  let lastLub = heartbeatScheduledUntil - beatInterval;
  while (lastLub > now) lastLub -= beatInterval;
  const sinceLub = Math.max(0, now - lastLub);
  const lubPulse = Math.exp(-Math.pow(sinceLub / HEART_LUB_WIDTH, 2));
  const dubPulse = Math.exp(-Math.pow((sinceLub - 0.16) / HEART_DUB_WIDTH, 2)) * HEART_DUB_STRENGTH;
  heartbeatPulseValue = lerp(heartbeatPulseValue, Math.max(lubPulse, dubPulse) * lastHeartMix, HEART_PULSE_SMOOTH);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
