/*
 * Anatomía de la Distancia — v638
 *
 * IDEA CENTRAL
 * ------------
 * Ovillo de lana → escultura orgánica 3D (masas metaball, luz satinada).
 * El cuerpo se genera como volumen: no es una silueta coloreada ni un PNG
 * recortado. Corazón y ramificaciones pertenecen al mismo lenguaje formal.
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
const SHOW_DEBUG_PARAMS = false;

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
const BALL_MIN_ALPHA      = 28;
const BALL_ROT_SPEED      = 0.0030;
const BALL_WANDER_AMP     = 2.4;
const BALL_MAX_OFFSET     = 8.0;
// ============ OVILLO DE LANA — HEBRAS ENROLLADAS (esfera) ============
// Un ovillo real NO es un disco de pelitos: son hebras LARGAS enrolladas
// alrededor de una esfera, que se cruzan en todos los ángulos. Cada fibra
// pertenece a un "círculo máximo" (great circle) de una esfera proyectada
// a 2D, definido por dos ángulos: gamma (rotación en el plano de pantalla)
// y phi (inclinación fuera del plano → la hebra se ve como elipse). Al
// dibujar muchas elipses a distintas orientaciones aparece el típico
// criss-cross de un ovillo. La profundidad (z del punto en la esfera) da
// sombreado: las hebras del frente brillan, las de atrás se oscurecen.
const BALL_ARC_SPAN_MIN  = 1.5;   // largo de cada hebra (radianes del círculo)
const BALL_ARC_SPAN_MAX  = 3.2;
const BALL_TILT_MIN      = 0.16;  // phi mínimo (casi de canto → elipse fina)
const BALL_TILT_MAX      = 1.30;  // phi máximo (más circular)
const BALL_ARC_SAMPLES   = 14;    // segmentos por hebra
const BALL_FUZZ          = 1.2;   // pelusa: jitter de pelos sueltos
// Sombreado de profundidad: factor sobre el color/alpha según z (frente
// vs atrás de la esfera). DARK = atrás (se hunde), LIGHT = frente (resalta).
const BALL_DEPTH_DARK    = 0.34;
const BALL_DEPTH_LIGHT   = 1.20;
// Dirección de la luz (espacio pantalla; z+ hacia el observador). Arriba
// a la izquierda y hacia el frente → highlight cálido en esa zona.
const BALL_LIGHT_X       = -0.45;
const BALL_LIGHT_Y       = -0.66;
const BALL_LIGHT_Z       =  0.60;
const BALL_HILIGHT_MAX   = 0.42;  // cuánto se aclara el pico iluminado
// Alpha de cada hebra enrollada. Bajo: las hebras son largas y muchas se
// superponen; con "lighter" hay que evitar que el centro sature en blanco.
const BALL_STRAND_ALPHA_MULT = 0.42;

// Paleta "arena": SOLO para el ovillo (estado inicial).
const WOOL_R = 220;
const WOOL_G = 192;
const WOOL_B = 142;
const WOOL_VARIATION = 12;

function hexToRgbStatic(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

// Paleta principal de la pieza. `electric` es Electric Pop:
// constante fácil de corregir si el hex definitivo cambia.
const ELECTRIC_HEX = "#E21888";
const PALETTE = {
  ocagyu:    "#0C5F66",
  sapphire:  "#1C5FA8",
  emerald:   "#1C8468",
  electric:  ELECTRIC_HEX,
  tangerine: "#FF5A1C"
};
const C = {
  ocagyu:    hexToRgbStatic(PALETTE.ocagyu),
  sapphire:  hexToRgbStatic(PALETTE.sapphire),
  emerald:   hexToRgbStatic(PALETTE.emerald),
  electric:  hexToRgbStatic(PALETTE.electric),
  tangerine: hexToRgbStatic(PALETTE.tangerine)
};
const PALETTE_RGB = [C.sapphire, C.emerald, C.electric, C.ocagyu, C.electric, C.tangerine];

const BG_COLOR = PALETTE.ocagyu;
const BG_R = C.ocagyu.r;
const BG_G = C.ocagyu.g;
const BG_B = C.ocagyu.b;
const BODY_BASE_MAX_ALPHA = 1.0;
const BODY_ASPECT = 0.48;
const VOL_H = 480;
const VOL_W = Math.round(VOL_H * BODY_ASPECT);

const KEY_L = norm3(-0.48, -0.62, 0.62);
const FILL_L = norm3(0.70, 0.18, 0.38);

function norm3(x, y, z) {
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

function lerpRGB(a, b, t) {
  const u = constrain(t, 0, 1);
  return {
    r: a.r + (b.r - a.r) * u,
    g: a.g + (b.g - a.g) * u,
    b: a.b + (b.b - a.b) * u
  };
}

// Acentos del ovillo: se desvanecen al pasar al cuerpo.
const ACCENT_PROBABILITY = 0.04;
const ACCENT_PALETTE = [
  { r: 210, g: 178, b: 128 },
  { r: 195, g: 162, b: 108 },
  { r: 178, g: 142, b:  92 },
];

// Brillo del cuerpo: sólo la paleta de la pieza.
const SHINE_PALETTE = PALETTE_RGB.slice();
const SHINE_PROBABILITY  = 0.22;
const SHINE_RATE_MIN     = 0.010;
const SHINE_RATE_MAX     = 0.022;
const SHINE_SHARP_MIN    = 5;
const SHINE_SHARP_MAX    = 10;
const SHINE_MIX_MAX      = 0.22;
const SHINE_BODY_THRESH  = 0.55;
const SHINE_ALPHA_BOOST  = 0.18;

// Pulso SOLO del corazón. El cuerpo no se escala ni respira.
const BODY_PULSE_AMOUNT  = 0.16;
const HEART_PULSE_SPEED  = 0.04;
const HEART_PULSE_SCALE  = 0.04;
const HEART_GLOW_ALPHA   = 0.20;
const HEART_GLOW_RADIUS  = 16;

// ============ COLOR DIARIO DEL CORAZÓN ============
// Un color estable por fecha local: mismo día = mismo color,
// al día siguiente = el siguiente de la paleta. No usa random,
// frameCount, hora ni refresh.
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
// Centro del corazón en coords locales del cuerpo (0..1).
// Izquierda anatómica = derecha de pantalla, incrustado en el pecho.
const HEART_NX = 0.58;
const HEART_NY = 0.268;
const HEART_RX = 0.11;
const HEART_RY = 0.075;
const HEART_BRANCH_RX = 0.26;
const HEART_BRANCH_RY = 0.16;

function getDayIndex() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  const date = new Date(year, month, day);
  const start = new Date(year, 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  return dayOfYear;
}

function getHeartColorOfTheDay() {
  const dayIndex = getDayIndex();
  return HEART_DAY_COLORS[dayIndex % HEART_DAY_COLORS.length];
}

function getHeartColorName(hex) {
  return HEART_DAY_NAMES[hex] || hex;
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

const heartColorToday = getHeartColorOfTheDay();
const heartColorNameToday = getHeartColorName(heartColorToday);
const heartRGB = hexToRgb(heartColorToday);

// Microanimación de entrada del color del día (no es el pulso).
let heartIntro = 0;
// Ancho del pulso visual (segundos): gaussianas anchas para que lub y
// dub se solapen formando una OLA continua, en lugar de dos golpes
// separados. Antes 0.07/0.08, ahora 0.13/0.13 (suavidad ~2x).
const HEART_LUB_WIDTH    = 0.13;
const HEART_DUB_WIDTH    = 0.13;
const HEART_DUB_STRENGTH = 0.42;
// Suavizado temporal extra: low-pass del propio heartbeatPulseValue,
// para que ningún subjump del audio rebote en lo visual.
const HEART_PULSE_SMOOTH = 0.22;

// ============ MOVIMIENTO GLOBAL DEL CUERPO ============
// Desactivado: sólo pulsa el corazón. Sin sway ni respiración global.
const BODY_SWAY_X_AMP    = 0;
const BODY_SWAY_Y_AMP    = 0;
const BODY_SWAY_SPEED    = 0;
const BODY_BREATH_SCALE_X = 0;
const BODY_BREATH_SCALE_Y = 0;
const BODY_BREATH_SPEED   = 0;

// ============ FIBRAS — DINÁMICA ============
// Movimiento más suave: noise speed más lento y wander más chico, así
// las fibras del cuerpo no tiritan, "respiran" suavemente alrededor de
// su anchor.
const FIBER_NOISE_SPEED  = 0.0022;
const FIBER_WANDER_AMP   = 1.0;
const FIBER_ANCHOR_PULL  = 0.06;
const FIBER_DAMPING      = 0.90;
const FIBER_MAX_OFFSET   = 3.4;
const FIBER_ALPHA_MULT   = 0.90;
const FIBER_WEIGHT_MULT  = 0.82;

// ============ FIBRAS — MUESTREO ============
const FIBERS_PER_BODY    = 1800;
const FIBER_DENSITY_MIN  = 28;
const FIBER_ACCEPT_GAIN  = 1.0;
const FIBER_ALPHA_BASE   = 22;
const FIBER_WEIGHT_MIN   = 0.32;
const FIBER_WEIGHT_MAX   = 0.92;
const FIBER_HISTORY      = 8;

// ============ VIAJE / RASTRO ============
const MORPH_TRAIL_ALPHA       = 42;   // (referencia, ver fondo dinámico)
const MORPH_LINE_WEIGHT       = 0.8;  // (referencia)
const MORPH_TRAVEL_VISIBILITY = 1.6;
const MORPH_LOW_LIMIT         = 0.10;
const MORPH_HIGH_LIMIT        = 0.85;

// ============ AUDIO ============
// Despegue de avión durante 10 segundos, después fundido cruzado al
// latido (lub-dub). El avión está PROGRAMADO: frecuencias y volumen
// suben (engines spooling up), pico, y caída con leve Doppler al final.
// A los AIRPLANE_DURATION segundos el master del avión queda en 0.
// Flyover de avión ANTES de que aparezca el cuerpo: ruido filtrado +
// tono bajo + paneo estéreo. Volumen bajo, más ambiental que agresivo.
const AUDIO_MASTER_VOL  = 0.85;
const HEARTBEAT_BPM     = 68;
const AIRPLANE_DURATION = 7;
const PLANE_VOLUME      = 0.18;
const PLANE_FADE_IN     = 2.0;
const PLANE_FADE_OUT    = 2.5;
let audioCtx               = null;
let audioMasterGain        = null;
let airplaneGain           = null;
let heartbeatGain          = null;
let heartbeatScheduledUntil = 0;
let audioReady             = false;
// Refs a osciladores y gains del avión, para poder programar la secuencia
// de despegue (frecuencias + envelope) cada vez que arranca o reinicia.
let airplane               = {};

// ============ ESTADO ============
let bodies = [];
let cachedBodyVolume = null;
let cachedHeartVolume = null;

/* =========================================================
   BOOTSTRAP
========================================================= */

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  strokeCap(ROUND);
  drawingContext.lineJoin = "round";
  noFill();

  buildScene();
  drawBackdrop(255);

  startMs = millis();
  setupRestartButton();
  setupAudioLifecycle();
  setupHeartDayBadge();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene();
  drawBackdrop(255);
}

function buildScene() {
  bodies = [];
  morph = 0;
  morphSmoothed = 0;
  heartIntro = 0;
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
      heartIntro = 0;
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
    heartIntro = 0;
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

// Garantías de corte total cuando la página se cierra, recarga o pierde
// foco. Sin esto, en algunos navegadores la pestaña queda en background
// con audio activo (sobre todo móviles).
function setupAudioLifecycle() {
  // Pestaña oculta → suspendemos. Vuelve → resumimos.
  document.addEventListener("visibilitychange", () => {
    if (!audioCtx) return;
    if (document.hidden) {
      try { audioCtx.suspend(); } catch (e) { /* ignore */ }
    } else if (audioCtx.state === "suspended") {
      try { audioCtx.resume(); } catch (e) { /* ignore */ }
    }
  });

  // Página se cierra/recarga → cerramos el AudioContext por completo.
  // pagehide cubre iOS/mobile mejor que beforeunload, así que escuchamos
  // los dos por seguridad.
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

  // Programa el despegue desde el momento en que el audio arranca.
  scheduleAirplaneTakeoff(audioCtx.currentTime);
}

function resetAudioOnRestart() {
  if (!audioReady) return;
  const t = audioCtx.currentTime;
  // Re-programa el despegue desde ahora (cancela el envelope anterior).
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

  // Capa 1 — rumble grave: ruido lowpass. El cuerpo del jet a lo lejos.
  const rumble = audioCtx.createBufferSource();
  rumble.buffer = noiseBuf;
  rumble.loop = true;
  const rumbleFilt = audioCtx.createBiquadFilter();
  rumbleFilt.type = "lowpass";
  rumbleFilt.frequency.value = 160;
  rumbleFilt.Q.value = 0.7;
  const rumbleGain = audioCtx.createGain();
  rumbleGain.gain.value = 0.55;
  rumble.connect(rumbleFilt);
  rumbleFilt.connect(rumbleGain);
  rumbleGain.connect(airplaneGain);

  // Capa 2 — núcleo del jet: ruido bandpass medio, continuo, no gritón.
  const jet = audioCtx.createBufferSource();
  jet.buffer = noiseBuf;
  jet.loop = true;
  const jetFilt = audioCtx.createBiquadFilter();
  jetFilt.type = "bandpass";
  jetFilt.frequency.value = 420;
  jetFilt.Q.value = 0.85;
  const jetGain = audioCtx.createGain();
  jetGain.gain.value = 0.42;
  jet.connect(jetFilt);
  jetFilt.connect(jetGain);
  jetGain.connect(airplaneGain);

  // Capa 3 — turbina lejana: bandpass más alto, muy bajo de volumen.
  const turbine = audioCtx.createBufferSource();
  turbine.buffer = noiseBuf;
  turbine.loop = true;
  const turbineFilt = audioCtx.createBiquadFilter();
  turbineFilt.type = "bandpass";
  turbineFilt.frequency.value = 1400;
  turbineFilt.Q.value = 2.2;
  const turbineGain = audioCtx.createGain();
  turbineGain.gain.value = 0.08;
  turbine.connect(turbineFilt);
  turbineFilt.connect(turbineGain);
  turbineGain.connect(airplaneGain);

  // Capa 4 — tono bajo continuo (motor). Sine suave, sin saw agresivo.
  const drone = audioCtx.createOscillator();
  drone.type = "sine";
  drone.frequency.value = 58;
  const droneGain = audioCtx.createGain();
  droneGain.gain.value = 0.12;
  drone.connect(droneGain);
  droneGain.connect(airplaneGain);

  const t = audioCtx.currentTime;
  rumble.start(t);
  jet.start(t);
  turbine.start(t);
  drone.start(t);

  airplane = {
    panner, rumbleFilt, jetFilt, turbineFilt, drone,
    rumbleGain, jetGain, turbineGain, droneGain
  };
}

// Flyover: entra, cruza a volumen moderado, se aleja. Doppler suave.
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

// Estado del pulso visual del corazón. Se recalcula cada frame y lo usan
// las fibras + la capa base para latir en sincronía con el audio.
let heartbeatPulseValue = 0;
let lastHeartMix        = 0;

// El avión ya está programado por scheduleAirplaneTakeoff (envelope +
// frecuencias). Acá sólo manejamos el latido: empieza a entrar a los 10s
// exactos, cuando el avión ya está completamente en silencio. A partir
// de ese momento es SÓLO el latido del corazón.
function updateAudio(morphSm) {
  if (!audioReady) return;
  const t = audioCtx.currentTime;
  const elapsed = getElapsedSeconds();

  const heartFade = smoothstep(AIRPLANE_DURATION, AIRPLANE_DURATION + 1.2, elapsed);
  const heartMix  = Math.sin(heartFade * Math.PI * 0.5);

  heartbeatGain.gain.linearRampToValueAtTime(heartMix * 1.0, t + 0.3);

  // Guardamos el mix actual del latido para que el pulso visual sólo se
  // sienta cuando el audio del corazón realmente está sonando.
  lastHeartMix = heartMix;

  if (heartMix > 0.01) scheduleHeartbeat(t);
}

// Pulso visual del corazón: una OLA continua sincronizada al lub-dub,
// no dos golpes secos. Las gaussianas son anchas (≈130ms) y se solapan,
// formando un pulso redondo que sube y baja con suavidad. Además
// pasamos el resultado por un low-pass temporal para evitar saltos.
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

  // Lub: gaussiana ancha (~130ms) — sin pico filoso.
  const lubPulse = Math.exp(-Math.pow(sinceLub / HEART_LUB_WIDTH, 2));
  // Dub: 160ms después del lub, también ancho. Solapa con la cola del
  // lub, así nunca cae a 0 entre los dos golpes — se siente como un
  // único movimiento ondulado.
  const dubPulse = Math.exp(-Math.pow((sinceLub - 0.16) / HEART_DUB_WIDTH, 2)) * HEART_DUB_STRENGTH;

  const target = Math.max(lubPulse, dubPulse) * lastHeartMix;
  // Low-pass temporal sobre el propio valor del pulso visual.
  heartbeatPulseValue = lerp(heartbeatPulseValue, target, HEART_PULSE_SMOOTH);
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
  return { swayX: 0, swayY: 0, breath: 0, scaleX: 1, scaleY: 1 };
}

function drawBackdrop(alpha255) {
  const ctx = drawingContext;
  const a = constrain(alpha255 / 255, 0, 1);
  const grd = ctx.createLinearGradient(0, 0, width * 0.08, height);
  grd.addColorStop(0, `rgba(${C.ocagyu.r},${C.ocagyu.g},${C.ocagyu.b},${a})`);
  grd.addColorStop(1, `rgba(${C.sapphire.r},${C.sapphire.g},${C.sapphire.b},${a})`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);
}

function heartInfluence(lx, ly, bodyW, bodyH) {
  const dx = (lx / bodyW - HEART_NX) / HEART_RX;
  const dy = (ly / bodyH - HEART_NY) / HEART_RY;
  const d = Math.sqrt(dx * dx + dy * dy);
  const core = constrain(1 - d, 0, 1);
  const dxb = (lx / bodyW - HEART_NX) / HEART_BRANCH_RX;
  const dyb = (ly / bodyH - HEART_NY) / HEART_BRANCH_RY;
  const db = Math.sqrt(dxb * dxb + dyb * dyb);
  const branch = constrain(1 - db, 0, 1) * 0.48;
  return Math.max(core, branch);
}

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

/* =========================================================
   DRAW LOOP
========================================================= */

function draw() {
  // Fondo dinámico: durante la transición se borra menos para que se
  // vean los rastros del desamarre.
  const morphing = isMorphingNow();
  const bgAlpha = morphing ? 48 : 102;
  drawBackdrop(bgAlpha);

  // Morph desde la línea de tiempo interna.
  const rawProgress = getRawProgress();
  const morphRaw = constrain(rawProgress, 0, 1);
  morph = smoothstep(0.03, 0.97, morphRaw);
  morphSmoothed = lerp(morphSmoothed, morph, 0.045);

  // Pulso del corazón (sincronizado al audio). Sólo el órgano y las
  // fibras cercanas lo leen; el cuerpo completo no late.
  updateHeartbeatPulseValue();
  if (morphSmoothed > 0.32) {
    heartIntro = min(1, heartIntro + 0.014);
  }

  // 1) Escultura volumétrica. Aparece durante el morph.
  const bodyBaseAlpha = smoothstep(0.22, 0.88, morphSmoothed) * BODY_BASE_MAX_ALPHA;
  for (const body of bodies) body.drawBase(bodyBaseAlpha);

  // 2) Corazón 3D incrustado en el pecho (debajo de las fibras, no sticker).
  for (const body of bodies) body.drawHeart();

  // 3) Ovillo de lana que viaja hacia la anatomía.
  drawingContext.save();
  drawingContext.globalCompositeOperation = "source-over";
  for (const body of bodies) body.drawFibers();
  drawingContext.restore();

  // 4) Sombra de contacto y venas 3D que pulsan con el corazón.
  for (const body of bodies) {
    body.drawMasses(bodyBaseAlpha);
    body.drawCoral(bodyBaseAlpha);
  }

  if (SHOW_DEBUG_PARAMS) drawDebugOverlay(rawProgress, bodyBaseAlpha, isMorphingNow());
  drawTitle();

  updateAudio(morphSmoothed);
}

/* =========================================================
   ESCULTURA 3D — masas metaball, luz satinada, misma lengua
   para cuerpo, corazón y ramificaciones.
========================================================= */

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ellipBlob(x, y, z, rx, ry, rz, kind) {
  return { x, y, z, rx, ry, rz, kind: kind || "flesh" };
}

function capsuleBlobs(ax, ay, az, bx, by, bz, ra, rb, n, kind) {
  const out = [];
  const segs = n == null ? 8 : n;
  const k = kind || "flesh";
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const r = lerp(ra, rb, t);
    out.push(ellipBlob(
      lerp(ax, bx, t), lerp(ay, by, t), lerp(az, bz, t),
      r, r * 1.04, r, k
    ));
  }
  return out;
}

function shadeSculpt(ndotl, spec, wrap, fresnel, nz, kind, heartAmt, coralAmt, heartPigment) {
  const oc = C.ocagyu, sa = C.sapphire, em = C.emerald, el = heartPigment || C.electric, ta = C.tangerine;
  const deep = { r: oc.r * 0.38, g: oc.g * 0.38, b: oc.b * 0.42 };
  let pigment;
  if (wrap < 0.32) pigment = lerpRGB(deep, sa, wrap / 0.32);
  else if (wrap < 0.58) pigment = lerpRGB(sa, em, (wrap - 0.32) / 0.26);
  else pigment = lerpRGB(em, ta, Math.min(1, (wrap - 0.58) / 0.42));

  if (kind === "heart" || heartAmt > 0.28) {
    pigment = lerpRGB(pigment, el, constrain(0.58 + heartAmt * 0.42, 0, 1));
    pigment = lerpRGB(pigment, ta, spec * 0.50);
  } else if (kind === "coral" || coralAmt > 0.22) {
    pigment = lerpRGB(pigment, el, 0.32 + coralAmt * 0.28);
    pigment = lerpRGB(pigment, ta, 0.26 + spec * 0.50);
  }

  const s = 0.22 + wrap * 0.88;
  let r = pigment.r * s, g = pigment.g * s, b = pigment.b * s;
  const fr = lerpRGB({ r, g, b }, sa, fresnel * 0.16);
  r = fr.r + spec * 255;
  g = fr.g + spec * 220;
  b = fr.b + spec * 175;
  const rim = Math.max(0, 1 - Math.max(nz, 0)) * 0.12;
  const rimC = lerpRGB({ r, g, b }, ta, rim);
  return {
    r: constrain(rimC.r, 0, 255),
    g: constrain(rimC.g, 0, 255),
    b: constrain(rimC.b, 0, 255)
  };
}

function renderOrganicVolume(g, blobs, heartPigment, opts) {
  opts = opts || {};
  const W = g.width;
  const H = g.height;
  const aspect = W / H;
  const centered = !!opts.centered;
  const z0 = opts.z0 != null ? opts.z0 : 0.26;
  const dz = opts.dz != null ? opts.dz : 0.022;
  const zCount = opts.zCount != null ? opts.zCount : 16;
  g.clear();
  g.loadPixels();
  const px = g.pixels;
  const n = blobs.length;
  const bx = new Float32Array(n);
  const by = new Float32Array(n);
  const bz = new Float32Array(n);
  const irx2 = new Float32Array(n);
  const iry2 = new Float32Array(n);
  const irz2 = new Float32Array(n);
  const rmax = new Float32Array(n);
  const kinds = new Array(n);
  for (let i = 0; i < n; i++) {
    const u = blobs[i];
    bx[i] = u.x; by[i] = u.y; bz[i] = u.z;
    irx2[i] = 1 / (u.rx * u.rx);
    iry2[i] = 1 / (u.ry * u.ry);
    irz2[i] = 1 / (u.rz * u.rz);
    rmax[i] = Math.max(u.rx, u.ry, u.rz);
    kinds[i] = u.kind;
  }

  const THRESH = 1.08;
  const kx = KEY_L.x, ky = KEY_L.y, kz = KEY_L.z;
  const fx = FILL_L.x, fy = FILL_L.y, fz = FILL_L.z;

  const fieldAt = (px, py, pz, ids) => {
    let f = 0, best = ids[0], bestf = 0, heartF = 0, coralF = 0;
    for (let k = 0; k < ids.length; k++) {
      const i = ids[k];
      const dx = px - bx[i], dy = py - by[i], dzv = pz - bz[i];
      const q = dx * dx * irx2[i] + dy * dy * iry2[i] + dzv * dzv * irz2[i];
      const v = 1 / (q + 0.00022);
      f += v;
      if (kinds[i] === "heart") heartF += v;
      else if (kinds[i] === "coral") coralF += v;
      if (v > bestf) { bestf = v; best = i; }
    }
    return { f, best, heartF, coralF };
  };

  for (let j = 0; j < H; j++) {
    const yRow = centered ? (j / (H - 1) - 0.5) * 2 : j / (H - 1);
    const ids = [];
    for (let i = 0; i < n; i++) {
      if (Math.abs(by[i] - yRow) < rmax[i] * 2.6) ids.push(i);
    }
    for (let i = 0; i < W; i++) {
      const o = (j * W + i) * 4;
      px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = 0;
      if (!ids.length) continue;
      const x = centered ? (i / (W - 1) - 0.5) * 2 : (i / (W - 1) - 0.5) * aspect;
      let minq = 99;
      for (let k = 0; k < ids.length; k++) {
        const ii = ids[k];
        const dx = x - bx[ii], dy = yRow - by[ii];
        const q = dx * dx * irx2[ii] + dy * dy * iry2[ii];
        if (q < minq) minq = q;
      }
      if (minq > 2.4) continue;

      let hitZ = null, hitI = -1;
      for (let s = 0; s < zCount; s++) {
        const z = z0 - s * dz;
        const hit = fieldAt(x, yRow, z, ids);
        if (hit.f >= THRESH) { hitZ = z; hitI = s; break; }
      }
      if (hitZ === null) continue;

      let zNear = hitI > 0 ? z0 - (hitI - 1) * dz : hitZ + dz;
      let zFar = hitZ;
      for (let b = 0; b < 4; b++) {
        const zm = 0.5 * (zNear + zFar);
        const hit = fieldAt(x, yRow, zm, ids);
        if (hit.f >= THRESH) zFar = zm;
        else zNear = zm;
      }
      hitZ = zFar;
      const e = 0.008;
      const nxv = fieldAt(x - e, yRow, hitZ, ids).f - fieldAt(x + e, yRow, hitZ, ids).f;
      const nyv = fieldAt(x, yRow - e, hitZ, ids).f - fieldAt(x, yRow + e, hitZ, ids).f;
      const nzv = fieldAt(x, yRow, hitZ - e, ids).f - fieldAt(x, yRow, hitZ + e, ids).f;
      const nlen = Math.sqrt(nxv * nxv + nyv * nyv + nzv * nzv) || 1;
      const nnx = nxv / nlen, nny = nyv / nlen, nnz = nzv / nlen;
      const ndotl = Math.max(0, nnx * kx + nny * ky + nnz * kz);
      const fillv = Math.max(0, nnx * fx + nny * fy + nnz * fz) * 0.34;
      const wrap = ndotl * 0.55 + fillv + 0.26;
      const spec = Math.pow(ndotl, 7) * 1.05;
      const fresnel = Math.pow(1 - Math.max(0, nnz), 1.45);
      const res = fieldAt(x, yRow, hitZ - 0.006, ids);
      const col = shadeSculpt(
        ndotl, spec, wrap, fresnel, nnz, kinds[res.best],
        res.heartF / Math.max(res.f, 0.001),
        res.coralF / Math.max(res.f, 0.001),
        heartPigment
      );
      px[o] = col.r;
      px[o + 1] = col.g;
      px[o + 2] = col.b;
      px[o + 3] = 255;
    }
  }
  g.updatePixels();
  return g;
}

function growCoralBlobs(blobs, ox, oy, oz, ang, pitch, length, rad, gen, spread, rng, kind) {
  let x = ox, y = oy, z = oz, a = ang, p = pitch;
  const knd = kind || "coral";
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    a += (rng() - 0.5) * 0.42 * spread;
    p += (rng() - 0.5) * 0.28 * spread;
    const step = length / segs;
    const nx = x + Math.cos(a) * Math.cos(p) * step;
    const ny = y + Math.sin(a) * Math.cos(p) * step;
    const nz = z + Math.sin(p) * step;
    const t = (i + 0.5) / segs;
    const r = lerp(rad, rad * 0.40, t);
    blobs.push(ellipBlob(nx, ny, nz, r, r, r, knd));
    x = nx; y = ny; z = nz;
  }
  if (gen > 0) {
    for (const sign of [-1, 1]) {
      const da = sign * (0.38 + rng() * 0.40) * spread;
      growCoralBlobs(blobs, x, y, z, a + da, p + sign * 0.16, length * 0.66, rad * 0.60, gen - 1, spread, rng, knd);
    }
  }
}

function buildBodyBlobs() {
  const b = [];
  b.push(ellipBlob(0.00, 0.070, 0.018, 0.064, 0.068, 0.062));
  b.push(ellipBlob(0.010, 0.092, 0.040, 0.048, 0.044, 0.050));
  b.push(ellipBlob(0.00, 0.118, 0.014, 0.040, 0.028, 0.038));
  b.push(ellipBlob(0.00, 0.040, 0.000, 0.054, 0.028, 0.052));
  b.push(...capsuleBlobs(0.00, 0.122, 0.012, 0.00, 0.172, 0.010, 0.028, 0.032, 6));
  b.push(ellipBlob(-0.110, 0.208, 0.012, 0.054, 0.046, 0.050));
  b.push(ellipBlob( 0.110, 0.208, 0.012, 0.054, 0.046, 0.050));
  b.push(...capsuleBlobs(-0.02, 0.196, 0.014, -0.110, 0.208, 0.012, 0.044, 0.052, 5));
  b.push(...capsuleBlobs( 0.02, 0.196, 0.014,  0.110, 0.208, 0.012, 0.044, 0.052, 5));
  b.push(ellipBlob(0.00, 0.238, 0.024, 0.102, 0.074, 0.074));
  b.push(ellipBlob(-0.042, 0.258, 0.050, 0.056, 0.052, 0.050));
  b.push(ellipBlob( 0.042, 0.258, 0.050, 0.056, 0.052, 0.050));
  b.push(ellipBlob(0.00, 0.315, 0.030, 0.090, 0.066, 0.066));
  b.push(ellipBlob(0.00, 0.372, 0.038, 0.076, 0.060, 0.060));
  b.push(ellipBlob(0.00, 0.392, 0.058, 0.052, 0.044, 0.042));
  b.push(ellipBlob(0.00, 0.428, 0.026, 0.082, 0.052, 0.056));
  b.push(ellipBlob(0.00, 0.478, 0.016, 0.098, 0.060, 0.064));
  b.push(ellipBlob(-0.062, 0.500, 0.008, 0.056, 0.052, 0.052));
  b.push(ellipBlob( 0.062, 0.500, 0.008, 0.056, 0.052, 0.052));
  b.push(ellipBlob(0.00, 0.508, -0.016, 0.072, 0.042, 0.042));
  b.push(...capsuleBlobs(-0.128, 0.230, 0.008, -0.168, 0.368, 0.012, 0.038, 0.028, 9));
  b.push(...capsuleBlobs(-0.168, 0.368, 0.012, -0.188, 0.512, 0.024, 0.028, 0.020, 9));
  b.push(ellipBlob(-0.192, 0.544, 0.032, 0.028, 0.036, 0.018));
  b.push(ellipBlob(-0.196, 0.568, 0.044, 0.018, 0.016, 0.014));
  b.push(...capsuleBlobs( 0.128, 0.230, 0.008,  0.168, 0.368, 0.012, 0.038, 0.028, 9));
  b.push(...capsuleBlobs( 0.168, 0.368, 0.012,  0.188, 0.512, 0.024, 0.028, 0.020, 9));
  b.push(ellipBlob( 0.192, 0.544, 0.032, 0.028, 0.036, 0.018));
  b.push(ellipBlob( 0.196, 0.568, 0.044, 0.018, 0.016, 0.014));
  b.push(...capsuleBlobs(-0.052, 0.532, 0.012, -0.060, 0.708, 0.006, 0.054, 0.038, 10));
  b.push(ellipBlob(-0.060, 0.724, 0.020, 0.038, 0.034, 0.036));
  b.push(...capsuleBlobs(-0.060, 0.738, 0.008, -0.054, 0.890, 0.002, 0.036, 0.024, 10));
  b.push(ellipBlob(-0.052, 0.938, 0.040, 0.034, 0.018, 0.062));
  b.push(ellipBlob(-0.050, 0.956, 0.074, 0.026, 0.014, 0.042));
  b.push(...capsuleBlobs( 0.052, 0.532, 0.012,  0.060, 0.708, 0.006, 0.054, 0.038, 10));
  b.push(ellipBlob( 0.060, 0.724, 0.020, 0.038, 0.034, 0.036));
  b.push(...capsuleBlobs( 0.060, 0.738, 0.008,  0.054, 0.890, 0.002, 0.036, 0.024, 10));
  b.push(ellipBlob( 0.054, 0.938, 0.040, 0.034, 0.018, 0.062));
  b.push(ellipBlob( 0.052, 0.956, 0.074, 0.026, 0.014, 0.042));

  const rng = mulberry32(11);
  const seeds = [
    [ 0.00, 0.018, 0.048, -Math.PI / 2, 0.70, 0.088, 0.018, 2, 0.82],
    [-0.036, 0.032, 0.028, -2.15, 0.50, 0.062, 0.016, 2, 0.72],
    [ 0.036, 0.030, 0.028, -1.00, 0.50, 0.062, 0.016, 2, 0.72],
    [-0.055, 0.148, 0.022, -2.50, 0.48, 0.060, 0.016, 2, 0.68],
    [ 0.055, 0.148, 0.022, -0.65, 0.48, 0.060, 0.016, 2, 0.68],
    [-0.132, 0.208, 0.034, -2.95, 0.62, 0.080, 0.018, 2, 0.72],
    [ 0.132, 0.208, 0.034, -0.20, 0.62, 0.080, 0.018, 2, 0.72],
    [-0.098, 0.326, 0.048,  2.75, 0.55, 0.070, 0.017, 2, 0.60],
    [ 0.098, 0.326, 0.048,  0.40, 0.55, 0.070, 0.017, 2, 0.60],
    [-0.080, 0.496, 0.024,  2.55, 0.45, 0.064, 0.016, 2, 0.54],
    [ 0.080, 0.496, 0.024,  0.60, 0.45, 0.064, 0.016, 2, 0.54],
    [-0.064, 0.723, 0.022,  2.45, 0.38, 0.054, 0.015, 2, 0.50],
    [ 0.064, 0.723, 0.022,  0.70, 0.38, 0.054, 0.015, 2, 0.50],
    [-0.054, 0.883, 0.020,  2.25, 0.32, 0.042, 0.013, 1, 0.42],
    [ 0.054, 0.883, 0.020,  0.90, 0.32, 0.042, 0.013, 1, 0.42]
  ];
  for (const s of seeds) growCoralBlobs(b, s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], rng, "coral");
  return b;
}

function buildHeartBlobs() {
  const b = [];
  b.push(ellipBlob( 0.00,  0.04,  0.04, 0.40, 0.36, 0.38, "heart"));
  b.push(ellipBlob(-0.22, -0.08,  0.12, 0.32, 0.30, 0.32, "heart"));
  b.push(ellipBlob( 0.20, -0.06,  0.10, 0.30, 0.28, 0.30, "heart"));
  b.push(ellipBlob(-0.04,  0.18,  0.06, 0.28, 0.26, 0.26, "heart"));
  b.push(ellipBlob( 0.04, -0.22,  0.16, 0.22, 0.20, 0.22, "heart"));
  b.push(ellipBlob(-0.08,  0.02,  0.22, 0.20, 0.18, 0.20, "heart"));
  b.push(...capsuleBlobs(-0.06, 0.28, 0.06, -0.14, 0.58, -0.04, 0.12, 0.055, 8, "heart"));
  b.push(...capsuleBlobs( 0.10, 0.26, 0.05,  0.18, 0.54, -0.03, 0.11, 0.050, 8, "heart"));
  b.push(...capsuleBlobs(-0.16,-0.16, 0.12, -0.34,-0.42,  0.02, 0.10, 0.048, 7, "heart"));
  b.push(...capsuleBlobs( 0.18,-0.12, 0.10,  0.36,-0.38,  0.00, 0.095, 0.046, 7, "heart"));
  b.push(...capsuleBlobs(-0.24, 0.06, 0.08, -0.52, 0.22, -0.02, 0.088, 0.042, 6, "heart"));
  b.push(...capsuleBlobs( 0.26, 0.04, 0.06,  0.50, 0.18, -0.02, 0.084, 0.040, 6, "heart"));
  return b;
}

/* =========================================================
   CUERPO = escultura volumétrica 3D
========================================================= */

class AnimatedBody {
  constructor(cx, cy, mirror, phase) {
    this.cx = cx;
    this.cy = cy;
    this.mirror = mirror;
    this.phase = phase;

    let h = min(height * 0.92, 1100);
    let w = h * BODY_ASPECT;
    const maxW = width * 0.62;
    if (w > maxW) { w = maxW; h = w / BODY_ASPECT; }

    this.bodyW = w;
    this.bodyH = h;

    this.buildMaster();
    this.buildFibers();
    this.buildHeartVolume();
    this.buildCoral();
  }

  buildMaster() {
    if (cachedBodyVolume) {
      this.master = cachedBodyVolume;
      this.acrylic = cachedBodyVolume;
      return;
    }
    const g = createGraphics(VOL_W, VOL_H);
    g.pixelDensity(1);
    renderOrganicVolume(g, buildBodyBlobs(), heartRGB);
    cachedBodyVolume = g;
    this.master = g;
    this.acrylic = g;
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

      const sx = this.bodyW / mw;
      const sy = this.bodyH / mh;
      samples.push({
        lx: lx * sx,
        ly: ly * sy,
        density, r, g, b
      });
    }

    const total = samples.length;
    for (let i = 0; i < total; i++) {
      const s = samples[i];
      this.fibers.push(new Fiber(this, i, total, s));
    }
  }

  // Local→world. motionStrength escala cuánto sway/breath se aplica.
  // El pulso del latido NO escala el cuerpo: sólo el corazón (drawHeart)
  // y las fibras con heartAmt > 0.
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

  // Capa base: cuerpo de plástico satinado. Sin pulso global.
  drawBase(bodyBaseAlpha) {
    if (bodyBaseAlpha <= 0.001) return;
    const ctx = drawingContext;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = bodyBaseAlpha;
    ctx.translate(this.cx, this.cy);
    ctx.translate(-this.bodyW * 0.5, -this.bodyH * 0.5);
    const paint = this.acrylic || this.master;
    const el = paint.elt || paint.canvas;
    ctx.drawImage(el, 0, 0, this.bodyW, this.bodyH);
    ctx.restore();
  }

  drawFibers() {
    this.heartWorld = this.toWorld(
      this.bodyW * HEART_NX, this.bodyH * HEART_NY, 0
    );
    for (const f of this.fibers) {
      f.update();
      f.display();
    }
  }

  buildCoral() {
    // El coral del cuerpo ya está horneado en el volumen 3D.
    // Acá sólo las venas que nacen del corazón, para que pulsen con él.
    this.coral = [];
    const rng = mulberry32(23);
    const grow = (x, y, ang, len, rad, depth, maxD) => {
      if (depth >= maxD || len < 4) return;
      const pts = [{ x, y, r: rad }];
      let px = x, py = y, a = ang;
      const segs = 5;
      for (let i = 0; i < segs; i++) {
        a += (rng() - 0.5) * 0.55;
        px += Math.cos(a) * (len / segs);
        py += Math.sin(a) * (len / segs);
        pts.push({ x: px, y: py, r: lerp(rad, rad * 0.42, (i + 1) / segs) });
      }
      this.coral.push({ pts, fromHeart: true, depth });
      if (depth < maxD - 1) {
        grow(px, py, a - 0.52, len * 0.62, rad * 0.58, depth + 1, maxD);
        grow(px, py, a + 0.52, len * 0.62, rad * 0.58, depth + 1, maxD);
      }
    };
    const hx = this.bodyW * HEART_NX;
    const hy = this.bodyH * HEART_NY;
    grow(hx, hy, 2.35, this.bodyH * 0.07, this.bodyH * 0.013, 0, 3);
    grow(hx, hy, 0.85, this.bodyH * 0.07, this.bodyH * 0.013, 0, 3);
    grow(hx, hy + this.bodyH * 0.02, 1.55, this.bodyH * 0.08, this.bodyH * 0.012, 0, 3);
    grow(hx - this.bodyW * 0.03, hy, -2.55, this.bodyH * 0.055, this.bodyH * 0.011, 0, 3);
    grow(hx + this.bodyW * 0.03, hy, -0.55, this.bodyH * 0.055, this.bodyH * 0.011, 0, 3);
  }

  drawMasses(alpha) {
    if (alpha < 0.02) return;
    const ctx = drawingContext;
    const feet = this.toWorld(this.bodyW * 0.5, this.bodyH * 0.97, 0);
    const rx = this.bodyW * 0.20;
    const ry = this.bodyH * 0.028;
    ctx.save();
    const grd = ctx.createRadialGradient(feet.x, feet.y, 0, feet.x, feet.y, rx);
    grd.addColorStop(0, `rgba(8, 24, 48, ${0.40 * alpha})`);
    grd.addColorStop(1, "rgba(8, 24, 48, 0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(feet.x, feet.y + this.bodyH * 0.012, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCoral(alpha) {
    if (alpha < 0.02 || !this.coral) return;
    const ctx = drawingContext;
    ctx.save();
    const pulse = 1 + heartbeatPulseValue * 0.22;
    for (const br of this.coral) {
      for (const p of br.pts) {
        const w = this.toWorld(p.x, p.y, 0);
        const r = Math.max(1.2, p.r * pulse);
        const hx = w.x - r * 0.38;
        const hy = w.y - r * 0.48;
        const grd = ctx.createRadialGradient(hx, hy, 0, w.x, w.y, r);
        const a = alpha * (0.58 + heartbeatPulseValue * 0.28);
        grd.addColorStop(0, `rgba(${Math.min(255, heartRGB.r + 48)},${Math.min(255, heartRGB.g + 18)},${Math.min(255, heartRGB.b + 8)},${a})`);
        grd.addColorStop(0.42, `rgba(${heartRGB.r},${heartRGB.g},${heartRGB.b},${a * 0.88})`);
        grd.addColorStop(1, `rgba(${C.ocagyu.r},${C.ocagyu.g},${C.ocagyu.b},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawHeart() {
    if (!this.heartGfx) return;
    const appear = smoothstep(0.28, 0.82, morphSmoothed);
    if (appear < 0.01) return;

    const intro = heartIntro * heartIntro * (3 - 2 * heartIntro);
    const origin = this.toWorld(this.bodyW * HEART_NX, this.bodyH * HEART_NY, 0);
    const pulse = 1 + heartbeatPulseValue * HEART_PULSE_SCALE;
    const introScale = lerp(0.94, 1, intro);
    const size = this.bodyH * 0.155 * pulse * introScale;
    const pulseGlow = appear * HEART_GLOW_ALPHA * (0.35 + heartbeatPulseValue * 0.45);

    const ctx = drawingContext;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "source-over";
    ctx.translate(origin.x, origin.y + this.bodyH * 0.004);

    if (pulseGlow > 0.01) {
      const gR = HEART_GLOW_RADIUS * (1.2 + heartbeatPulseValue * 0.45);
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, gR);
      grd.addColorStop(0, `rgba(${heartRGB.r},${heartRGB.g},${heartRGB.b},${pulseGlow})`);
      grd.addColorStop(1, `rgba(${heartRGB.r},${heartRGB.g},${heartRGB.b},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(0, 0, gR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = appear * (0.88 + intro * 0.12);
    const el = this.heartGfx.elt || this.heartGfx.canvas;
    ctx.drawImage(el, -size * 0.50, -size * 0.48, size, size);
    ctx.restore();
  }

  buildHeartVolume() {
    if (cachedHeartVolume) {
      this.heartGfx = cachedHeartVolume;
      return;
    }
    const S = 200;
    const g = createGraphics(S, S);
    g.pixelDensity(1);
    renderOrganicVolume(g, buildHeartBlobs(), heartRGB, {
      centered: true,
      z0: 0.58,
      dz: 0.038,
      zCount: 18
    });
    cachedHeartVolume = g;
    this.heartGfx = g;
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
    this.heartAmt = heartInfluence(
      this.anchorBodyX, this.anchorBodyY, body.bodyW, body.bodyH
    );

    // Color del cuerpo: USAMOS los samples reales del png (cuerpo-ref.png).
    // La figura humana mantiene su propia paleta colorida.
    this.r = bodySample.r;
    this.g = bodySample.g;
    this.b = bodySample.b;

    // Anchor ovillo: la fibra pertenece a un CÍRCULO MÁXIMO de una esfera
    // (la madeja). El círculo se define por gamma (rotación en pantalla) y
    // phi (inclinación → elipse). La fibra se ubica en un ángulo wrapTheta
    // sobre ese círculo y dibuja un arco largo alrededor: eso es la hebra
    // de lana enrollada. Muchas hebras a orientaciones distintas se cruzan
    // como en un ovillo real.
    const cx = body.bodyW * 0.5;
    const cy = body.bodyH * 0.5;

    // Radio con leve variación para que la superficie no sea perfecta y
    // haya algo de "pelusa" hacia afuera.
    this.ballRadius = BALL_RADIUS * random(0.92, 1.06);
    this.wrapGamma  = random(TWO_PI);
    this.wrapPhi    = random(BALL_TILT_MIN, BALL_TILT_MAX);
    this.wrapTheta  = random(TWO_PI);
    this.arcSpan    = random(BALL_ARC_SPAN_MIN, BALL_ARC_SPAN_MAX);

    // Punto del ancla sobre la esfera (centro del arco que dibuja).
    const p = this.ballLocalPoint(this.wrapTheta, this.wrapGamma, this.wrapPhi);
    this.anchorBallX = cx + p.x * this.ballRadius;
    this.anchorBallY = cy + p.y * this.ballRadius;
    this.ballZ       = p.z;

    // Radio 2D proyectado: las hebras de la PERIFERIA (silueta) se
    // desenrollan antes; el morph escalonado usa esto más abajo.
    this.spiralR     = Math.sqrt(p.x * p.x + p.y * p.y) * this.ballRadius;
    this.spiralAngle = Math.atan2(p.y, p.x);

    // Sombreado de profundidad (frente vs atrás de la esfera).
    this.depthShade = constrain(
      map(p.z, -1, 1, BALL_DEPTH_DARK, BALL_DEPTH_LIGHT),
      BALL_DEPTH_DARK,
      BALL_DEPTH_LIGHT
    );

    // Highlight direccional: producto punto de la normal (= posición en la
    // esfera unitaria) con la dirección de la luz. Da el brillo cálido.
    const lLen = Math.sqrt(
      BALL_LIGHT_X * BALL_LIGHT_X +
      BALL_LIGHT_Y * BALL_LIGHT_Y +
      BALL_LIGHT_Z * BALL_LIGHT_Z
    );
    const dot = (p.x * BALL_LIGHT_X + p.y * BALL_LIGHT_Y + p.z * BALL_LIGHT_Z) / lLen;
    this.ballHi = Math.pow(constrain(dot, 0, 1), 1.6);

    // Pelusa: pequeño desvío del arco para que no sea una elipse perfecta.
    this.fuzz = random(-BALL_FUZZ, BALL_FUZZ);

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

    // Brillo de colores en el estado cuerpo: cada fibra tiene su propio
    // color de brillo, ritmo y fase. Eso hace que la figura humana
    // parpadee en distintos colores a la vez (no a coro).
    this.shine = null;
    if (random() < SHINE_PROBABILITY) {
      this.shine = SHINE_PALETTE[floor(random(SHINE_PALETTE.length))];
      this.shineRate = random(SHINE_RATE_MIN, SHINE_RATE_MAX);
      this.shinePhase = random(TWO_PI);
      this.shineSharp = random(SHINE_SHARP_MIN, SHINE_SHARP_MAX);
    }

    this.seed   = random(10000);
    this.weight = random(FIBER_WEIGHT_MIN, FIBER_WEIGHT_MAX);
    this.alpha  = FIBER_ALPHA_BASE * map(this.density, 30, 255, 0.6, 1.0);
    this.strandCurve = random(-10, 10);

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

  // Punto sobre la esfera unitaria para un círculo máximo (great circle)
  // definido por gamma (rotación en el plano de pantalla) y phi
  // (inclinación fuera del plano). theta recorre el círculo. Devuelve
  // coordenadas en la esfera unitaria: x,y para proyectar a pantalla, z
  // para sombreado (z+ = hacia el observador, frente del ovillo).
  ballLocalPoint(theta, gamma, phi) {
    const a = Math.cos(theta);
    const b = Math.sin(theta);
    // Inclinación del círculo alrededor del eje X de pantalla.
    const x1 = a;
    const y1 = b * Math.cos(phi);
    const z1 = b * Math.sin(phi);
    // Rotación dentro del plano de pantalla.
    const cg = Math.cos(gamma);
    const sg = Math.sin(gamma);
    return {
      x: x1 * cg - y1 * sg,
      y: x1 * sg + y1 * cg,
      z: z1,
    };
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
      // La esfera entera RUEDA lentamente: animamos gamma (rotación en el
      // plano) con el tiempo. El ovillo gira como una madeja, no como un
      // disco plano.
      const spin = frameCount * BALL_ROT_SPEED * ballAmt;
      const p = this.ballLocalPoint(this.wrapTheta, this.wrapGamma + spin, this.wrapPhi);
      const driftedX = this.body.bodyW * 0.5 + p.x * this.ballRadius;
      const driftedY = this.body.bodyH * 0.5 + p.y * this.ballRadius;
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

    // Color del día: teñir el pecho y las ramificaciones cercanas.
    if (this.heartAmt > 0.02 && colorMix > 0.01) {
      const tint = this.heartAmt * colorMix * (0.55 + heartIntro * 0.40);
      baseR = lerp(baseR, heartRGB.r, tint);
      baseG = lerp(baseG, heartRGB.g, tint);
      baseB = lerp(baseB, heartRGB.b, tint);
    }

    // Barniz húmedo: aclara el propio color del png, no cambia de tinta.
    let shineMix = 0;
    if (this.shine && pm > SHINE_BODY_THRESH && this.heartAmt < 0.35) {
      const phase = frameCount * this.shineRate + this.shinePhase;
      const wave  = Math.sin(phase) * 0.5 + 0.5;
      const gate  = Math.pow(wave, this.shineSharp);
      const bodyFactor = constrain(
        (pm - SHINE_BODY_THRESH) / (1 - SHINE_BODY_THRESH),
        0,
        1
      );
      shineMix = gate * SHINE_MIX_MAX * bodyFactor;
      baseR = lerp(baseR, min(255, this.r * 0.45 + 175), shineMix);
      baseG = lerp(baseG, min(255, this.g * 0.45 + 168), shineMix);
      baseB = lerp(baseB, min(255, this.b * 0.45 + 150), shineMix);
    }

    const r = constrain(baseR * colorBoost, 0, 255);
    const g = constrain(baseG * colorBoost, 0, 255);
    const b = constrain(baseB * colorBoost, 0, 255);

    // Visibilidad del viaje: durante la transición personal la fibra se
    // realza para que se lea el desamarre.
    const travelMult = 1.0 + transit * (MORPH_TRAVEL_VISIBILITY - 1.0);
    const minA       = BALL_MIN_ALPHA * bf;
    // Boost de alpha en el pico del brillo, para que el destello se sienta.
    const shineAlphaMul = 1 + shineMix * SHINE_ALPHA_BOOST;
    // Pulso: sólo fibras del corazón / pecho (heartAmt), ya formadas.
    const bodyFactorPulse = constrain((pm - 0.5) * 2.5, 0, 1);
    const heartPulseMul   = 1 + heartbeatPulseValue * BODY_PULSE_AMOUNT * bodyFactorPulse * this.heartAmt;
    let alpha        = max(this.alpha * alphaMul * travelMult * shineAlphaMul * heartPulseMul, minA);
    alpha = constrain(alpha, 0, 255);

    // La hebra permanece visible al posarse: el cuerpo es PNG satinado
    // MÁS un velo de fibras, como la referencia escultórica.
    const bodyTrailAlpha = constrain(alpha * (1 - bf * 0.55), 0, 255);
    const paintAmt = smoothstep(0.22, 0.88, pm);
    const settle = 1 - paintAmt * 0.35;

    if (bodyTrailAlpha > 0.5) {
      stroke(r, g, b, bodyTrailAlpha * settle);
      strokeWeight(this.weight * weightMul * lerp(1, 0.85, paintAmt));
      noFill();
      beginShape();
      curveVertex(this.history[0].x, this.history[0].y);
      for (const p of this.history) curveVertex(p.x, p.y);
      const last = this.history[this.history.length - 1];
      curveVertex(last.x, last.y);
      endShape();
    }

    // HEBRA DE LANA ENROLLADA: el corazón del ovillo. Cada fibra dibuja un
    // ARCO LARGO siguiendo su círculo máximo en la esfera. Muchos arcos a
    // orientaciones distintas se cruzan = el criss-cross de un ovillo real.
    // El color lleva sombreado de profundidad (frente claro, atrás oscuro)
    // y un highlight cálido en la zona iluminada → la madeja tiene volumen.
    if (bf > 0.02) {
      // Color arena con sombreado de esfera (se aplica con peso bf, así se
      // disuelve al volverse cuerpo).
      const hi = this.ballHi * bf;
      let sr = lerp(this.ballR, 255, hi * BALL_HILIGHT_MAX);
      let sg = lerp(this.ballG, 246, hi * BALL_HILIGHT_MAX);
      let sb = lerp(this.ballB, 220, hi * BALL_HILIGHT_MAX);
      const shade = lerp(1, this.depthShade, bf);
      sr = constrain(sr * shade, 0, 255);
      sg = constrain(sg * shade, 0, 255);
      sb = constrain(sb * shade, 0, 255);

      // Alpha de la hebra: con sombreado de profundidad (atrás más tenue).
      const strandAlpha = constrain(
        this.alpha * BALL_STRAND_ALPHA_MULT * this.depthShade * bf * travelMult,
        BALL_MIN_ALPHA * this.depthShade * bf,
        255
      );
      const strandWeight = max(this.weight * weightMul * 0.9, MORPH_LINE_WEIGHT);

      // Offset de la pelusa/wander: el arco sigue a la fibra física.
      const anchorWorld = this.body.toWorld(this.anchorBallX, this.anchorBallY, 0);
      const offX = this.x - anchorWorld.x;
      const offY = this.y - anchorWorld.y;

      // Spin de la esfera (mismo que el drift del anchor) para coherencia.
      const ballAmt = constrain(1 - pm * 1.4, 0, 1);
      const spin = frameCount * BALL_ROT_SPEED * ballAmt;
      const cxB = this.body.bodyW * 0.5;
      const cyB = this.body.bodyH * 0.5;
      const arcLen = this.arcSpan * bf;
      const steps = max(4, floor(BALL_ARC_SAMPLES * bf));
      const fuzzPhi = this.fuzz * 0.01;

      stroke(sr, sg, sb, strandAlpha);
      strokeWeight(strandWeight);
      noFill();
      beginShape();
      for (let s = 0; s <= steps; s++) {
        const frac = s / steps;
        const theta = this.wrapTheta + (frac - 0.5) * arcLen;
        const p = this.ballLocalPoint(theta, this.wrapGamma + spin, this.wrapPhi + fuzzPhi);
        const w = this.body.toWorld(
          cxB + p.x * this.ballRadius,
          cyB + p.y * this.ballRadius,
          0
        );
        const vx = w.x + offX;
        const vy = w.y + offY;
        if (s === 0) curveVertex(vx, vy);
        curveVertex(vx, vy);
        if (s === steps) curveVertex(vx, vy);
      }
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
  fill(255, 196, 150, 110);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  textSize(13);
  text("A N A T O M Í A   D E   L A   D I S T A N C I A", width * 0.5, height - 42);
  pop();
}
