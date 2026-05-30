/*
 * Anatomía de la Distancia — v609
 *
 * IDEA CENTRAL
 * ------------
 * El cuerpo no aparece de golpe. Primero existe un OVILLO DE LANA hecho
 * íntegramente de fibras (espiral + hebras tangenciales con paleta de
 * lana), que se desamarra y viaja hacia la silueta del cuerpo
 * (cuerpo-ref.png). La transformación es un único sistema de fibras con
 * dos anclas: anchorBall (espiral programática) y anchorBody (sample
 * del png del cuerpo). El anchor activo es lerp(ball, body, personalMorph).
 *
 * MORPH ESCALONADO POR FIBRA
 *   - Cada fibra recibe morphStart + morphSpan al construirse.
 *   - Las fibras de la PERIFERIA del ovillo arrancan antes; las del
 *     CENTRO arrancan después. Eso hace que el ovillo se desovillé desde
 *     afuera hacia adentro, como una madeja real.
 *   - Durante el viaje (transit), cada fibra arrastra una hebra hacia
 *     su anchor del ovillo: se ve literalmente que la figura humana
 *     "viene" del ovillo.
 *
 * MORPH GLOBAL
 *   - Línea de tiempo interna (sin audio):
 *       0..HOLD_SECONDS         → ovillo puro (morph = 0).
 *       HOLD_SECONDS..HOLD+MORPH→ transformación continua (0 → 1).
 *       después                  → cuerpo formado (morph = 1).
 *   - smoothstep(0.03, 0.97) para evitar saltos en bordes.
 *   - morphSmoothed = lerp(morphSmoothed, morph, 0.045) para suavizar.
 */

// ============ FLAGS ============
const SHOW_DEBUG_PARAMS = true;

// ============ TIMELINE (sin audio) ============
// Segundos de ovillo puro al principio, y duración de la transformación.
// Después de HOLD_SECONDS + MORPH_SECONDS el cuerpo queda formado.
// HOLD = 4s ovillo arena claro · MORPH = 10s, así la figura humana
// colorida aparece poco después del hold y queda formada en ~14s totales.
const HOLD_SECONDS  = 4;
const MORPH_SECONDS = 10;

// ============ ESCALONADO POR FIBRA ============
// Ventana global donde puede caer el morphStart de cada fibra. La
// periferia del ovillo apunta a 0 (arranca antes); el centro apunta a
// MORPH_STAGGER_RANGE (arranca más tarde). El span de cada fibra (cuán
// rápido completa su propia transición) cae entre MIN y MAX.
const MORPH_STAGGER_RANGE = 0.55;
const MORPH_STAGGER_JITTER = 0.12;
const MORPH_FIBER_SPAN_MIN = 0.28;
const MORPH_FIBER_SPAN_MAX = 0.50;

// Hebra de "ovillo en viaje": cada fibra dibuja una línea que apunta de
// vuelta hacia su anchor del ovillo durante su propia transición. Eso
// hace evidente que la figura humana viene del ovillo.
const TRANSIT_TRAIL_MAX_LEN  = 110;
const TRANSIT_TRAIL_FRACTION = 0.42;
const TRANSIT_ALPHA_MULT     = 0.55;

// ============ MORPH ============
let morph         = 0;
let morphSmoothed = 0;
let startMs       = 0;

// ============ OVILLO ============
const BALL_RADIUS         = 105;
const BALL_ALPHA_MULT     = 1.0;
const BALL_WEIGHT_MULT    = 0.95;
const BALL_COLOR_BOOST    = 1.0;
// IMPORTANTE: alpha bajo en estado ovillo para evitar que el composite
// "lighter" sume hasta saturar la arena en blanco. Con muchas fibras
// concentradas, alphas altos saturan R primero (220 → 255) y todo se ve
// blanco. Con valores chicos la suma queda dentro del rango arena.
const BALL_MIN_ALPHA      = 14;
const BALL_ROT_SPEED      = 0.0030;
const BALL_WANDER_AMP     = 2.4;
const BALL_MAX_OFFSET     = 8.0;
const BALL_TANGENTIAL_AMP = 12;
// Hebras del ovillo: livianas, más cortas que en v608.
const BALL_STRAND_MIN_LEN   = 22;
const BALL_STRAND_MAX_LEN   = 58;
const BALL_STRAND_CURVE     = 14;
const BALL_STRAND_JITTER    = 0.55;
const BALL_STRAND_ALPHA_MULT = 0.30;

// Paleta "arena claro": SOLO para el ovillo (estado inicial). El cuerpo
// usa los colores reales sampleados de cuerpo-ref.png. Cada fibra hereda
// dos colores: ballR/G/B (arena, ovillo) y r/g/b (sample del png, cuerpo),
// y se interpolan durante el morph.
const WOOL_R = 220;
const WOOL_G = 192;
const WOOL_B = 142;
const WOOL_VARIATION = 12;

// Capa base del cuerpo: alpha máximo del png original (no teñido) cuando
// la figura humana ya está formada. Alta para que la figura colorida sea
// claramente legible al final.
const BODY_BASE_MAX_ALPHA = 0.85;

// Acentos arena suaves: sólo afectan al estado ovillo y se desvanecen al
// pasar al cuerpo. Tonos medios — evitamos colores muy claros que sumen
// brillo al composite "lighter".
const ACCENT_PROBABILITY = 0.04;
const ACCENT_PALETTE = [
  { r: 210, g: 178, b: 128 }, // arena medio-oscuro
  { r: 195, g: 162, b: 108 }, // arena tostado
  { r: 178, g: 142, b:  92 }, // ocre suave
];

// ============ MOVIMIENTO GLOBAL DEL CUERPO (solo al final) ============
const BODY_SWAY_X_AMP    = 4.0;
const BODY_SWAY_Y_AMP    = 1.8;
const BODY_SWAY_SPEED    = 0.0055;
const BODY_BREATH_SCALE_X = 0.0060;
const BODY_BREATH_SCALE_Y = 0.0100;
const BODY_BREATH_SPEED   = 0.0120;

// ============ FIBRAS — DINÁMICA ============
const FIBER_NOISE_SPEED  = 0.0035;
const FIBER_WANDER_AMP   = 1.4;
const FIBER_ANCHOR_PULL  = 0.06;
const FIBER_DAMPING      = 0.88;
const FIBER_MAX_OFFSET   = 4.0;
const FIBER_ALPHA_MULT   = 0.90;
const FIBER_WEIGHT_MULT  = 0.82;

// ============ FIBRAS — MUESTREO ============
const FIBERS_PER_BODY    = 1100;
const FIBER_DENSITY_MIN  = 32;
const FIBER_ACCEPT_GAIN  = 1.0;
const FIBER_ALPHA_BASE   = 16;
const FIBER_WEIGHT_MIN   = 0.28;
const FIBER_WEIGHT_MAX   = 0.78;
const FIBER_HISTORY      = 8;

// ============ VIAJE / RASTRO ============
const MORPH_TRAIL_ALPHA       = 42;   // (referencia, ver fondo dinámico)
const MORPH_LINE_WEIGHT       = 0.8;  // (referencia)
const MORPH_TRAVEL_VISIBILITY = 1.6;
const MORPH_LOW_LIMIT         = 0.10;
const MORPH_HIGH_LIMIT        = 0.85;

// ============ AUDIO ============
// Despegue de avión durante el ovillo + primera mitad del morph; fundido
// cruzado a latido (lub-dub) cuando aparece la figura humana.
const AUDIO_MASTER_VOL  = 0.85;
const HEARTBEAT_BPM     = 68;
const TAKEOFF_RAMP_SEC  = 3.5;   // segundos para que el avión llegue al pico
let audioCtx               = null;
let audioMasterGain        = null;
let airplaneGain           = null;
let heartbeatGain          = null;
let heartbeatScheduledUntil = 0;
let audioReady             = false;

// ============ ESTADO ============
let bodyRefImg;
let bodies = [];

/* =========================================================
   BOOTSTRAP
========================================================= */

function preload() {
  bodyRefImg = loadImage("/apps/fibras/assets/cuerpo-ref.png");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  strokeCap(ROUND);
  drawingContext.lineJoin = "round";
  noFill();

  buildScene();
  background(0);

  startMs = millis();
  setupRestartButton();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene();
  background(0);
}

function buildScene() {
  bodies = [];
  morph = 0;
  morphSmoothed = 0;
  bodies.push(new AnimatedBody(width * 0.5, height * 0.52, false, 0.0));
}

/* =========================================================
   TIMELINE  —  morph guiado por reloj interno (sin audio).
========================================================= */

function setupRestartButton() {
  const btn = document.getElementById("soundToggle");
  const gate = document.getElementById("audioGate");

  // Overlay "tocá para iniciar": arranca audio + (re)inicia la línea de
  // tiempo y se oculta. Imprescindible: los browsers requieren un gesto
  // de usuario para crear/resumir el AudioContext.
  if (gate) {
    const onGate = () => {
      ensureAudio();
      morph = 0;
      morphSmoothed = 0;
      startMs = millis();
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
    startMs = millis();
    ensureAudio();
    resetAudioOnRestart();
  });
}

/* =========================================================
   AUDIO  —  Despegue de avión que se funde en latido cuando
   aparece la figura humana. Todo generado con Web Audio API,
   sin archivos. Necesita un gesto de usuario para arrancar.
========================================================= */

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
}

function resetAudioOnRestart() {
  if (!audioReady) return;
  const t = audioCtx.currentTime;
  airplaneGain.gain.cancelScheduledValues(t);
  airplaneGain.gain.setValueAtTime(0, t);
  heartbeatGain.gain.cancelScheduledValues(t);
  heartbeatGain.gain.setValueAtTime(0, t);
  heartbeatScheduledUntil = t;
}

function buildAirplaneSound() {
  airplaneGain = audioCtx.createGain();
  airplaneGain.gain.value = 0;

  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 4;
  airplaneGain.connect(comp);
  comp.connect(audioMasterGain);

  // Capa 1: rumble grave (~56-60Hz, dos saws desafinadas).
  const low1 = audioCtx.createOscillator();
  low1.type = "sawtooth";
  low1.frequency.value = 56;
  const low2 = audioCtx.createOscillator();
  low2.type = "sawtooth";
  low2.frequency.value = 60;
  const lowFilt = audioCtx.createBiquadFilter();
  lowFilt.type = "lowpass";
  lowFilt.frequency.value = 240;
  const lowGain = audioCtx.createGain();
  lowGain.gain.value = 0.55;
  low1.connect(lowFilt);
  low2.connect(lowFilt);
  lowFilt.connect(lowGain);
  lowGain.connect(airplaneGain);

  // Capa 2: rumble medio (~165Hz) filtrado.
  const mid = audioCtx.createOscillator();
  mid.type = "sawtooth";
  mid.frequency.value = 165;
  const midFilt = audioCtx.createBiquadFilter();
  midFilt.type = "lowpass";
  midFilt.frequency.value = 700;
  midFilt.Q.value = 2;
  const midGain = audioCtx.createGain();
  midGain.gain.value = 0.30;
  mid.connect(midFilt);
  midFilt.connect(midGain);
  midGain.connect(airplaneGain);

  // Capa 3: turbina (~900Hz con vibrato lento por LFO).
  const whine = audioCtx.createOscillator();
  whine.type = "sawtooth";
  whine.frequency.value = 900;
  const whineFilt = audioCtx.createBiquadFilter();
  whineFilt.type = "bandpass";
  whineFilt.frequency.value = 1200;
  whineFilt.Q.value = 5;
  const whineGain = audioCtx.createGain();
  whineGain.gain.value = 0.20;
  whine.connect(whineFilt);
  whineFilt.connect(whineGain);
  whineGain.connect(airplaneGain);

  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = 0.35;
  const lfoAmt = audioCtx.createGain();
  lfoAmt.gain.value = 30;
  lfo.connect(lfoAmt);
  lfoAmt.connect(whine.frequency);

  // Capa 4: ruido blanco filtrado (aire / motor).
  const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const noiseFilt = audioCtx.createBiquadFilter();
  noiseFilt.type = "bandpass";
  noiseFilt.frequency.value = 700;
  noiseFilt.Q.value = 0.8;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0.45;
  noise.connect(noiseFilt);
  noiseFilt.connect(noiseGain);
  noiseGain.connect(airplaneGain);

  const noiseLfo = audioCtx.createOscillator();
  noiseLfo.frequency.value = 0.18;
  const noiseLfoAmt = audioCtx.createGain();
  noiseLfoAmt.gain.value = 200;
  noiseLfo.connect(noiseLfoAmt);
  noiseLfoAmt.connect(noiseFilt.frequency);

  const t = audioCtx.currentTime;
  low1.start(t);
  low2.start(t);
  mid.start(t);
  whine.start(t);
  lfo.start(t);
  noise.start(t);
  noiseLfo.start(t);
}

function buildHeartbeatSound() {
  heartbeatGain = audioCtx.createGain();
  heartbeatGain.gain.value = 0;

  // Compresor para que el "thump" se sienta.
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.1;

  // Lowpass para calidez (latido orgánico, no clic).
  const filt = audioCtx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 220;
  filt.Q.value = 1.2;

  heartbeatGain.connect(filt);
  filt.connect(comp);
  comp.connect(audioMasterGain);

  heartbeatScheduledUntil = audioCtx.currentTime;
}

// Un pulso individual del corazón (caída rápida de pitch + envelope corto).
function triggerHeartPulse(time, strength) {
  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(85, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.06);

  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.95 * strength, time + 0.012);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.20);

  osc.connect(env);
  env.connect(heartbeatGain);
  osc.start(time);
  osc.stop(time + 0.22);

  // Capa sub para que el latido tenga cuerpo.
  const sub = audioCtx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(45, time);
  sub.frequency.exponentialRampToValueAtTime(28, time + 0.10);
  const subEnv = audioCtx.createGain();
  subEnv.gain.setValueAtTime(0, time);
  subEnv.gain.linearRampToValueAtTime(0.65 * strength, time + 0.018);
  subEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
  sub.connect(subEnv);
  subEnv.connect(heartbeatGain);
  sub.start(time);
  sub.stop(time + 0.27);
}

// Programa pulsos de corazón con anticipación (lub-dub a HEARTBEAT_BPM).
function scheduleHeartbeat(now) {
  const beatInterval = 60 / HEARTBEAT_BPM;
  while (heartbeatScheduledUntil < now + 0.6) {
    const t = Math.max(heartbeatScheduledUntil, now + 0.05);
    triggerHeartPulse(t, 1.0);              // lub
    triggerHeartPulse(t + 0.16, 0.62);      // dub
    heartbeatScheduledUntil = t + beatInterval;
  }
}

// Crossfade avión → latido en función del morph.
function updateAudio(morphSm) {
  if (!audioReady) return;
  const t = audioCtx.currentTime;
  const elapsed = getElapsedSeconds();

  // Sensación de despegue: el avión arranca bajo y crece en TAKEOFF_RAMP_SEC.
  const takeoffRamp = smoothstep(0, TAKEOFF_RAMP_SEC, elapsed);
  // Avión domina al inicio, baja cuando aparece la figura humana.
  const planeMix = (1 - smoothstep(0.40, 0.85, morphSm)) * takeoffRamp;
  // Latido entra cuando aparece la figura y queda dominante al final.
  const heartMix = smoothstep(0.45, 0.95, morphSm);

  airplaneGain.gain.linearRampToValueAtTime(planeMix * 0.95, t + 0.1);
  heartbeatGain.gain.linearRampToValueAtTime(heartMix * 1.0, t + 0.1);

  if (heartMix > 0.01) scheduleHeartbeat(t);
}

/* =========================================================
   HELPERS
========================================================= */

function smoothstep(edge0, edge1, x) {
  const t = constrain((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Reloj interno: HOLD_SECONDS de ovillo, después la transformación
// avanza linealmente durante MORPH_SECONDS y se queda en 1.
function getElapsedSeconds() {
  return (millis() - startMs) / 1000;
}

function getRawProgress() {
  const elapsed = getElapsedSeconds();
  if (elapsed < HOLD_SECONDS) return 0;
  const t = (elapsed - HOLD_SECONDS) / MORPH_SECONDS;
  return constrain(t, 0, 1);
}

function isMorphingNow() {
  return morphSmoothed > MORPH_LOW_LIMIT && morphSmoothed < MORPH_HIGH_LIMIT;
}

// 0 hasta morph ~0.9, 1 al final. Sólo entonces se activan respiración
// y sway globales del cuerpo.
function bodyMotionStrength() {
  return constrain((morphSmoothed - 0.9) / 0.1, 0, 1);
}

function getBodyMotion(frame) {
  const swayX = Math.sin(frame * BODY_SWAY_SPEED) * BODY_SWAY_X_AMP;
  const swayY = Math.cos(frame * BODY_SWAY_SPEED * 0.85) * BODY_SWAY_Y_AMP;
  const breath = Math.sin(frame * BODY_BREATH_SPEED);
  const scaleX = 1 + breath * BODY_BREATH_SCALE_X;
  const scaleY = 1 + breath * BODY_BREATH_SCALE_Y;
  return { swayX, swayY, breath, scaleX, scaleY };
}

/* =========================================================
   DRAW LOOP
========================================================= */

function draw() {
  // Fondo dinámico: durante la transición se borra menos para que se
  // vean los rastros del desamarre.
  const morphing = isMorphingNow();
  const bgAlpha = morphing ? 28 : 45;
  background(0, bgAlpha);

  // Morph desde la línea de tiempo interna.
  const rawProgress = getRawProgress();
  const morphRaw = constrain(rawProgress, 0, 1);
  morph = smoothstep(0.03, 0.97, morphRaw);
  morphSmoothed = lerp(morphSmoothed, morph, 0.045);

  // 1) Capa base del cuerpo: png original con sus colores reales. Empieza a
  // aparecer pronto después del hold (morph 0.30) y queda totalmente
  // visible cerca del final, así la figura humana colorida es legible.
  const bodyBaseAlpha = smoothstep(0.30, 0.90, morphSmoothed) * BODY_BASE_MAX_ALPHA;
  for (const body of bodies) body.drawBase(bodyBaseAlpha);

  // 2) Fibras encima en composite "lighter": el ovillo arena claro se
  // transforma en la figura humana, sumando luz sobre la silueta del png.
  drawingContext.save();
  drawingContext.globalCompositeOperation = "lighter";
  for (const body of bodies) body.drawFibers();
  drawingContext.restore();

  if (SHOW_DEBUG_PARAMS) drawDebugOverlay(rawProgress, bodyBaseAlpha, isMorphingNow());
  drawTitle();

  updateAudio(morphSmoothed);
}

/* =========================================================
   ANIMATED BODY
========================================================= */

class AnimatedBody {
  constructor(cx, cy, mirror, phase) {
    this.cx = cx;
    this.cy = cy;
    this.mirror = mirror;
    this.phase = phase;

    const aspect = bodyRefImg.height / bodyRefImg.width;
    let h = min(height * 0.86, 1200);
    let w = h * aspect;
    const maxW = width * 0.50;
    if (w > maxW) { w = maxW; h = w / aspect; }

    this.bodyW = w;
    this.bodyH = h;

    this.buildMaster();
    this.buildFibers();
  }

  // Pre-render: imagen rotada 90° CW. Se usa para muestrear posiciones
  // de las fibras (los colores se ignoran).
  buildMaster() {
    const g = createGraphics(floor(this.bodyW), floor(this.bodyH));
    g.pixelDensity(1);
    g.clear();

    g.push();
    g.imageMode(CENTER);
    g.translate(g.width / 2, g.height / 2);
    g.rotate(HALF_PI);
    if (this.mirror) g.scale(1, -1);
    g.image(bodyRefImg, 0, 0, g.height, g.width);
    g.pop();

    g.loadPixels();
    this.master = g;
  }

  // Muestra puntos del cuerpo. Cada fibra resultante construye su
  // ancla del ovillo programáticamente (espiral) en su constructor.
  buildFibers() {
    this.fibers = [];
    const px = this.master.pixels;
    const mw = this.master.width;
    const mh = this.master.height;
    const target = FIBERS_PER_BODY;

    const samples = [];
    let attempts = 0;
    const maxAttempts = target * 60;

    while (samples.length < target && attempts < maxAttempts) {
      attempts++;
      const lx = floor(random(mw));
      const ly = floor(random(mh));
      const idx = (ly * mw + lx) * 4;
      const r = px[idx];
      const g = px[idx + 1];
      const b = px[idx + 2];
      const a = px[idx + 3];
      if (a < 8) continue;

      const bright = (r + g + b) / 3;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 0 ? ((maxC - minC) / maxC) * 255 : 0;
      const density = bright * 0.55 + sat * 0.45;
      if (density < FIBER_DENSITY_MIN) continue;
      if (random(255) > density * FIBER_ACCEPT_GAIN) continue;

      samples.push({ lx, ly, density, r, g, b });
    }

    const total = samples.length;
    for (let i = 0; i < total; i++) {
      const s = samples[i];
      this.fibers.push(new Fiber(this, i, total, s));
    }
  }

  // Local→world. motionStrength escala cuánto sway/breath se aplica.
  toWorld(lx, ly, motionStrength = 1) {
    const m = getBodyMotion(frameCount + this.phase * 60);
    const sx = lerp(1, m.scaleX, motionStrength);
    const sy = lerp(1, m.scaleY, motionStrength);
    const swayX = m.swayX * motionStrength;
    const swayY = m.swayY * motionStrength;
    const ox = (lx - this.bodyW * 0.5) * sx;
    const oy = (ly - this.bodyH * 0.5) * sy;
    return { x: this.cx + swayX + ox, y: this.cy + swayY + oy };
  }

  // Capa base del cuerpo: el png original (con sus colores reales) dibujado
  // con alpha bajo. Sólo aparece cerca del final del morph, así la figura
  // humana se lee con su paleta original. NO se tiñe — usamos los pixels
  // del png tal cual, manteniendo la transparencia del fondo, así no hay
  // ningún rectángulo de color: sólo la silueta colorida.
  drawBase(bodyBaseAlpha) {
    if (bodyBaseAlpha <= 0.001) return;
    const ctx = drawingContext;
    ctx.save();
    ctx.globalAlpha = bodyBaseAlpha;
    ctx.translate(this.cx - this.bodyW * 0.5, this.cy - this.bodyH * 0.5);
    const masterEl = this.master.elt || this.master.canvas;
    ctx.drawImage(masterEl, 0, 0, this.bodyW, this.bodyH);
    ctx.restore();
  }

  drawFibers() {
    for (const f of this.fibers) {
      f.update();
      f.display();
    }
  }
}

/* =========================================================
   FIBER
========================================================= */

class Fiber {
  constructor(body, index, total, bodySample) {
    this.body = body;
    this.index = index;
    this.density = bodySample.density;

    // Anchor cuerpo (sample del png del cuerpo).
    this.anchorBodyX = bodySample.lx;
    this.anchorBodyY = bodySample.ly;

    // Color del cuerpo: USAMOS los samples reales del png (cuerpo-ref.png).
    // La figura humana mantiene su propia paleta colorida.
    this.r = bodySample.r;
    this.g = bodySample.g;
    this.b = bodySample.b;

    // Anchor ovillo: espiral programática centrada en (bodyW/2, bodyH/2).
    // El radio crece con el índice (sqrt para distribución uniforme en el
    // disco) y el ángulo avanza en pasos pequeños para sumar capas.
    const totalForSpiral = max(total, 1);
    const baseAngle = index * 0.18 + random(-0.25, 0.25);
    const baseR = BALL_RADIUS * sqrt(index / totalForSpiral) * random(0.75, 1.12);
    const cx = body.bodyW * 0.5;
    const cy = body.bodyH * 0.5;

    const tang = random(-0.5, 0.5);
    const tangX = -Math.sin(baseAngle) * BALL_TANGENTIAL_AMP * tang;
    const tangY =  Math.cos(baseAngle) * BALL_TANGENTIAL_AMP * tang;

    this.anchorBallX = cx + Math.cos(baseAngle) * baseR + tangX;
    this.anchorBallY = cy + Math.sin(baseAngle) * baseR + tangY;
    this.spiralAngle = baseAngle;
    this.spiralR     = baseR;

    // Variación adicional para el estado ovillo: paleta arena con jitter
    // independiente. El lerp entre ballR/G/B (arena) y r/g/b (sample del png)
    // produce la transición de color "arena → cuerpo colorido".
    this.ballR = constrain(WOOL_R + random(-WOOL_VARIATION, WOOL_VARIATION), 130, 245);
    this.ballG = constrain(WOOL_G + random(-WOOL_VARIATION, WOOL_VARIATION), 110, 225);
    this.ballB = constrain(WOOL_B + random(-WOOL_VARIATION, WOOL_VARIATION),  60, 200);

    // Acento arena opcional: sólo se aplica con peso en el estado ovillo
    // (desaparece al pasar al cuerpo, así no contamina los colores reales).
    this.accent = null;
    if (random() < ACCENT_PROBABILITY) {
      this.accent = ACCENT_PALETTE[floor(random(ACCENT_PALETTE.length))];
    }

    this.seed   = random(10000);
    this.weight = random(FIBER_WEIGHT_MIN, FIBER_WEIGHT_MAX);
    this.alpha  = FIBER_ALPHA_BASE * map(this.density, 30, 255, 0.6, 1.0);
    this.strandLength = random(BALL_STRAND_MIN_LEN, BALL_STRAND_MAX_LEN);
    this.strandCurve  = random(-BALL_STRAND_CURVE, BALL_STRAND_CURVE);
    this.strandJitter = random(-BALL_STRAND_JITTER, BALL_STRAND_JITTER);

    // Ventana personal del morph. Las fibras de la PERIFERIA del ovillo
    // (radius alto) arrancan antes y las del CENTRO arrancan después,
    // como una madeja desovillándose desde afuera.
    const radiusNorm = constrain(this.spiralR / BALL_RADIUS, 0, 1);
    const stagger = constrain(
      (1 - radiusNorm) * MORPH_STAGGER_RANGE +
      random(-MORPH_STAGGER_JITTER, MORPH_STAGGER_JITTER),
      0,
      MORPH_STAGGER_RANGE + MORPH_STAGGER_JITTER
    );
    this.morphStart = stagger;
    this.morphSpan  = random(MORPH_FIBER_SPAN_MIN, MORPH_FIBER_SPAN_MAX);
    this.morphEnd   = constrain(this.morphStart + this.morphSpan, 0, 1);

    // Posición inicial = anchor ovillo en mundo.
    const w = body.toWorld(this.anchorBallX, this.anchorBallY, 0);
    this.x  = w.x;
    this.y  = w.y;
    this.vx = 0;
    this.vy = 0;

    this.history = [];
    for (let j = 0; j < FIBER_HISTORY; j++) {
      this.history.push({ x: this.x, y: this.y });
    }
  }

  // Morph propio de la fibra (0..1) en función del morph global.
  // Antes de morphStart la fibra está en el ovillo. Entre morphStart y
  // morphEnd transita. Después está en el cuerpo.
  personalMorph() {
    if (morphSmoothed <= this.morphStart) return 0;
    if (morphSmoothed >= this.morphEnd)   return 1;
    const t = (morphSmoothed - this.morphStart) /
              max(this.morphEnd - this.morphStart, 0.0001);
    return t * t * (3 - 2 * t);
  }

  // Lerp continuo entre anchorBall y anchorBody usando el morph personal
  // de la fibra. El drift rotacional del ovillo se apaga conforme cada
  // fibra empieza su propia transición.
  currentLocalAnchor() {
    const pm = this.personalMorph();
    const ballAmt = constrain(1 - pm * 1.4, 0, 1);

    let ballX = this.anchorBallX;
    let ballY = this.anchorBallY;

    if (ballAmt > 0.001) {
      const a = this.spiralAngle + frameCount * BALL_ROT_SPEED * ballAmt;
      const driftedX = this.body.bodyW * 0.5 + Math.cos(a) * this.spiralR;
      const driftedY = this.body.bodyH * 0.5 + Math.sin(a) * this.spiralR;
      ballX = lerp(this.anchorBallX, driftedX, ballAmt);
      ballY = lerp(this.anchorBallY, driftedY, ballAmt);
    }

    const ax = lerp(ballX, this.anchorBodyX, pm);
    const ay = lerp(ballY, this.anchorBodyY, pm);
    return { ax, ay, pm };
  }

  update() {
    const { ax: localAX, ay: localAY, pm } = this.currentLocalAnchor();

    const motionStrength = bodyMotionStrength();
    const anchor = this.body.toWorld(localAX, localAY, motionStrength);

    const wanderAmp = lerp(BALL_WANDER_AMP, FIBER_WANDER_AMP, pm);
    const targetX = anchor.x + map(
      noise(this.seed, frameCount * FIBER_NOISE_SPEED),
      0, 1, -wanderAmp, wanderAmp
    );
    const targetY = anchor.y + map(
      noise(this.seed + 100, frameCount * FIBER_NOISE_SPEED),
      0, 1, -wanderAmp, wanderAmp
    );

    const fx = (targetX - this.x) * FIBER_ANCHOR_PULL;
    const fy = (targetY - this.y) * FIBER_ANCHOR_PULL;
    this.vx = (this.vx + fx) * FIBER_DAMPING;
    this.vy = (this.vy + fy) * FIBER_DAMPING;

    this.x += this.vx;
    this.y += this.vy;

    const offX = this.x - anchor.x;
    const offY = this.y - anchor.y;
    const offD = Math.sqrt(offX * offX + offY * offY);
    const maxOffset = lerp(BALL_MAX_OFFSET, FIBER_MAX_OFFSET, pm);

    if (offD > maxOffset) {
      this.x = lerp(this.x, anchor.x, 0.15);
      this.y = lerp(this.y, anchor.y, 0.15);
    }

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > FIBER_HISTORY) this.history.shift();
  }

  display() {
    if (this.history.length < 4) return;

    // Morph propio de la fibra: define cuán "ovillo" o "cuerpo" se ve.
    const pm = this.personalMorph();
    const bf = 1 - smoothstep(0.0, 0.5, pm);
    // transit: 0 fuera de viaje, 1 en el medio del viaje. Curva campana.
    const transit = 4 * pm * (1 - pm) * (pm > 0 && pm < 1 ? 1 : 0);

    const alphaMul   = lerp(FIBER_ALPHA_MULT, BALL_ALPHA_MULT, bf);
    const weightMul  = lerp(FIBER_WEIGHT_MULT, BALL_WEIGHT_MULT, bf);
    const colorBoost = lerp(1.0, BALL_COLOR_BOOST, bf);

    // Color: ovillo arena claro (ballR/G/B) → cuerpo con sus colores
    // reales sampleados del png (r/g/b). Cada fibra cambia de tono al
    // ritmo de su propio viaje (personal morph).
    const colorMix = constrain(map(pm, 0.05, 0.85, 0, 1), 0, 1);
    let baseR = lerp(this.ballR, this.r, colorMix);
    let baseG = lerp(this.ballG, this.g, colorMix);
    let baseB = lerp(this.ballB, this.b, colorMix);

    if (this.accent && bf > 0.001) {
      const m = bf * 0.35;
      baseR = lerp(baseR, this.accent.r, m);
      baseG = lerp(baseG, this.accent.g, m);
      baseB = lerp(baseB, this.accent.b, m);
    }

    const r = constrain(baseR * colorBoost, 0, 255);
    const g = constrain(baseG * colorBoost, 0, 255);
    const b = constrain(baseB * colorBoost, 0, 255);

    // Visibilidad del viaje: durante la transición personal la fibra se
    // realza para que se lea el desamarre.
    const travelMult = 1.0 + transit * (MORPH_TRAVEL_VISIBILITY - 1.0);
    const minA       = BALL_MIN_ALPHA * bf;
    let alpha        = max(this.alpha * alphaMul * travelMult, minA);
    alpha = constrain(alpha, 0, 255);

    stroke(r, g, b, alpha);
    strokeWeight(this.weight * weightMul);
    noFill();

    beginShape();
    curveVertex(this.history[0].x, this.history[0].y);
    for (const p of this.history) curveVertex(p.x, p.y);
    const last = this.history[this.history.length - 1];
    curveVertex(last.x, last.y);
    endShape();

    // En morph bajo, la historia física todavía es corta: dibujar una
    // hebra tangencial explícita evita que el ovillo se lea como puntos.
    if (bf > 0.03) {
      const strandAlpha = constrain(alpha * (BALL_STRAND_ALPHA_MULT + bf * 0.30), 0, 255);
      const strandWeight = max(this.weight * weightMul * 0.78, MORPH_LINE_WEIGHT);
      const wobble = Math.sin(frameCount * 0.018 + this.seed) * 0.28;
      const angle = this.spiralAngle + HALF_PI + this.strandJitter + wobble;
      const len = this.strandLength * bf;
      const dx = Math.cos(angle) * len * 0.5;
      const dy = Math.sin(angle) * len * 0.5;
      const cx = Math.cos(angle + HALF_PI) * this.strandCurve * bf;
      const cy = Math.sin(angle + HALF_PI) * this.strandCurve * bf;

      stroke(r, g, b, strandAlpha);
      strokeWeight(strandWeight);
      noFill();
      beginShape();
      curveVertex(this.x - dx, this.y - dy);
      curveVertex(this.x - dx, this.y - dy);
      curveVertex(this.x + cx, this.y + cy);
      curveVertex(this.x + dx, this.y + dy);
      curveVertex(this.x + dx, this.y + dy);
      endShape();
    }

    // HEBRA DE VIAJE
    // Mientras la fibra está en su transición personal, dibuja una
    // línea desde su posición actual hacia un punto que apunta de
    // vuelta a su anchor del ovillo. Es la marca visible de que la
    // fibra "viene" del ovillo: literalmente la hebra que aún la une.
    if (transit > 0.04) {
      const ballWorld = this.body.toWorld(this.anchorBallX, this.anchorBallY, 0);
      const dx = ballWorld.x - this.x;
      const dy = ballWorld.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1.5) {
        const tailLen = min(dist * TRANSIT_TRAIL_FRACTION, TRANSIT_TRAIL_MAX_LEN);
        const ux = dx / dist;
        const uy = dy / dist;
        // Curvatura: doblamos un poco la hebra para que no sea recta.
        const curveAmt = (this.strandCurve * 0.5) * transit;
        const midX = this.x + ux * tailLen * 0.5 + (-uy) * curveAmt;
        const midY = this.y + uy * tailLen * 0.5 + ( ux) * curveAmt;
        const tailX = this.x + ux * tailLen;
        const tailY = this.y + uy * tailLen;

        const trailAlpha = constrain(alpha * TRANSIT_ALPHA_MULT * transit, 0, 255);
        stroke(r, g, b, trailAlpha);
        strokeWeight(max(this.weight * weightMul * 0.7, MORPH_LINE_WEIGHT));
        noFill();
        beginShape();
        curveVertex(tailX, tailY);
        curveVertex(tailX, tailY);
        curveVertex(midX,  midY);
        curveVertex(this.x, this.y);
        curveVertex(this.x, this.y);
        endShape();
      }
    }
  }
}

/* =========================================================
   DEBUG / TÍTULO
========================================================= */

function drawDebugOverlay(rawProgress, bodyBaseAlpha, morphing) {
  push();
  drawingContext.globalCompositeOperation = "source-over";

  noStroke();
  fill(0, 0, 0, 140);
  rect(12, 12, 230, 124, 6);

  textAlign(LEFT, TOP);
  textFont("monospace");
  textSize(11);

  fill(220, 215, 205, 230);
  const x = 22;
  let y = 22;
  const elapsed = getElapsedSeconds();
  const phaseLabel = elapsed < HOLD_SECONDS
    ? "ovillo (hold)"
    : (rawProgress >= 1 ? "cuerpo formado" : "transformando");

  text(`elapsed:   ${elapsed.toFixed(2)} s`,         x, y); y += 14;
  text(`raw:       ${rawProgress.toFixed(3)}`,       x, y); y += 14;
  text(`morph:     ${morph.toFixed(3)}`,             x, y); y += 14;
  text(`smooth:    ${morphSmoothed.toFixed(3)}`,     x, y); y += 14;
  text(`bodyBase:  ${bodyBaseAlpha.toFixed(3)}`,     x, y); y += 14;
  text(`morphing:  ${morphing ? "true" : "false"}`,  x, y); y += 14;

  fill(150, 200, 255, 200);
  text(`fase:      ${phaseLabel}`, x, y);

  pop();
}

function drawTitle() {
  push();
  drawingContext.globalCompositeOperation = "source-over";
  noStroke();
  fill(215, 210, 200, 60);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  textSize(13);
  text("A N A T O M Í A   D E   L A   D I S T A N C I A", width * 0.5, height - 42);
  pop();
}
