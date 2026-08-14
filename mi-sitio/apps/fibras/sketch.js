/*
 * Anatomía de la Distancia — v631
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
 * TEXTURA DEL CUERPO
 *   - Los colores y la silueta salen del png.
 *   - El cuerpo es PLÁSTICO SATINADO 3D: volúmenes redondos, juntas
 *     limpias de color, brillo suave de estudio, no grano ni pincel.
 *     El ovillo sigue siendo lana.
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
const BALL_MIN_ALPHA      = 8;
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
const BALL_STRAND_ALPHA_MULT = 0.16;

// Paleta "arena claro": SOLO para el ovillo (estado inicial). El cuerpo
// usa los colores reales sampleados de cuerpo-ref.png. Cada fibra hereda
// dos colores: ballR/G/B (arena, ovillo) y r/g/b (sample del png, cuerpo),
// y se interpolan durante el morph.
const WOOL_R = 220;
const WOOL_G = 192;
const WOOL_B = 142;
const WOOL_VARIATION = 12;

// Cuerpo: plástico satinado (referencia de volúmenes lisos).
const BODY_BASE_MAX_ALPHA = 1.0;

// Acentos arena suaves: sólo afectan al estado ovillo y se desvanecen al
// pasar al cuerpo. Tonos medios — evitamos colores muy claros que sumen
// brillo al composite "lighter".
const ACCENT_PROBABILITY = 0.04;
const ACCENT_PALETTE = [
  { r: 210, g: 178, b: 128 }, // arena medio-oscuro
  { r: 195, g: 162, b: 108 }, // arena tostado
  { r: 178, g: 142, b:  92 }, // ocre suave
];

// Paleta de "brillo": colores vivos con los que cada fibra parpadea en el
// estado cuerpo. La idea es que la figura humana brille en colores
// distintos al mismo tiempo (coral, ámbar, menta, celeste, lavanda, rosa…).
const SHINE_PALETTE = [
  { r: 255, g: 110, b:  88 },  // coral
  { r: 255, g: 175, b:  70 },  // ámbar
  { r: 240, g: 230, b: 110 },  // amarillo cálido
  { r: 130, g: 240, b: 150 },  // menta
  { r:  95, g: 200, b: 255 },  // celeste
  { r: 200, g: 140, b: 255 },  // lavanda
  { r: 255, g: 140, b: 215 },  // rosa
  { r: 255, g: 230, b: 200 },  // blanco cálido
];
const SHINE_PROBABILITY  = 0.28;  // barniz húmedo, no neón
const SHINE_RATE_MIN     = 0.010;
const SHINE_RATE_MAX     = 0.022;
const SHINE_SHARP_MIN    = 5;
const SHINE_SHARP_MAX    = 10;
const SHINE_MIX_MAX      = 0.28;  // highlight del propio color, no otra tinta
const SHINE_BODY_THRESH  = 0.55;
const SHINE_ALPHA_BOOST  = 0.22;

// Pulso global del cuerpo siguiendo el latido. Multiplica la presencia
// (alpha) de la capa base y de las fibras del cuerpo en el pico del lub
// y del dub. Suave: la figura late, no patea. Antes 0.45 → ahora 0.18.
const BODY_PULSE_AMOUNT  = 0.18;
// Escala física: el cuerpo se contrae/expande con cada latido. 0.022 =
// ~2% de expansión en el pico del lub. Antes 0.06 (6%) — daba un brinco
// muy marcado, ahora es una respiración apenas perceptible.
const BODY_PULSE_SCALE   = 0.022;
// Ancho del pulso visual (segundos): gaussianas anchas para que lub y
// dub se solapen formando una OLA continua, en lugar de dos golpes
// separados. Antes 0.07/0.08, ahora 0.13/0.13 (suavidad ~2x).
const HEART_LUB_WIDTH    = 0.13;
const HEART_DUB_WIDTH    = 0.13;
const HEART_DUB_STRENGTH = 0.42;
// Suavizado temporal extra: low-pass del propio heartbeatPulseValue,
// para que ningún subjump del audio rebote en lo visual.
const HEART_PULSE_SMOOTH = 0.22;

// ============ MOVIMIENTO GLOBAL DEL CUERPO (solo al final) ============
const BODY_SWAY_X_AMP    = 4.0;
const BODY_SWAY_Y_AMP    = 1.8;
const BODY_SWAY_SPEED    = 0.0055;
const BODY_BREATH_SCALE_X = 0.0060;
const BODY_BREATH_SCALE_Y = 0.0100;
const BODY_BREATH_SPEED   = 0.0120;

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
// Despegue de avión durante 10 segundos, después fundido cruzado al
// latido (lub-dub). El avión está PROGRAMADO: frecuencias y volumen
// suben (engines spooling up), pico, y caída con leve Doppler al final.
// A los AIRPLANE_DURATION segundos el master del avión queda en 0.
const AUDIO_MASTER_VOL  = 0.85;
const HEARTBEAT_BPM     = 68;
const AIRPLANE_DURATION = 7;
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
  setupAudioLifecycle();
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

  // Compresor para mantener todo bajo control cuando todas las capas
  // suben juntas en el pico del despegue.
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 4.5;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  airplaneGain.connect(comp);
  comp.connect(audioMasterGain);

  // CAPA 0 — SUB-BASS DE TRUENOS (sine, ~26-46Hz). Un takeoff real hace
  // VIBRAR las ventanas: este sub-bass aporta esa sensación física en el
  // bajo. Crece dramáticamente con el throttle.
  const sub = audioCtx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 26;
  const subGain = audioCtx.createGain();
  subGain.gain.value = 0;             // arranca en 0, se programa en el schedule
  sub.connect(subGain);
  subGain.connect(airplaneGain);

  // CAPA 1 — RUMBLE GRAVE (saw 50-60Hz, dos osciladores desafinados +
  // lowpass). Es el cuerpo medio-grave del motor. Sin chop: jet smooth.
  const low1 = audioCtx.createOscillator();
  low1.type = "sawtooth";
  low1.frequency.value = 54;
  const low2 = audioCtx.createOscillator();
  low2.type = "sawtooth";
  low2.frequency.value = 62;
  const lowFilt = audioCtx.createBiquadFilter();
  lowFilt.type = "lowpass";
  lowFilt.frequency.value = 280;
  const lowGain = audioCtx.createGain();
  lowGain.gain.value = 0;             // se programa en el schedule
  low1.connect(lowFilt);
  low2.connect(lowFilt);
  lowFilt.connect(lowGain);
  lowGain.connect(airplaneGain);

  // CAPA 2 — RUMBLE MEDIO (saw ~165Hz, lowpass). Suma cuerpo y "growl"
  // sin tapar el sub. También con chop=0 (jet, no prop).
  const mid = audioCtx.createOscillator();
  mid.type = "sawtooth";
  mid.frequency.value = 165;
  const midFilt = audioCtx.createBiquadFilter();
  midFilt.type = "lowpass";
  midFilt.frequency.value = 850;
  midFilt.Q.value = 1.6;
  const midGain = audioCtx.createGain();
  midGain.gain.value = 0.50;
  mid.connect(midFilt);
  midFilt.connect(midGain);
  midGain.connect(airplaneGain);

  // CAPA 3 — TURBINA (saw bandpass). El "WHEEEEEEE" es la firma
  // inconfundible. Aquí gana protagonismo con vibrato sutil.
  const whine = audioCtx.createOscillator();
  whine.type = "sawtooth";
  whine.frequency.value = 950;
  const whineFilt = audioCtx.createBiquadFilter();
  whineFilt.type = "bandpass";
  whineFilt.frequency.value = 1300;
  whineFilt.Q.value = 4.5;
  const whineGain = audioCtx.createGain();
  whineGain.gain.value = 0.55;
  whine.connect(whineFilt);
  whineFilt.connect(whineGain);
  whineGain.connect(airplaneGain);

  // Vibrato muy sutil para que la turbina no suene como un sintetizador
  // estático: simula la fluctuación natural de los compressor stages.
  const whineLfo = audioCtx.createOscillator();
  whineLfo.frequency.value = 0.55;
  const whineLfoAmt = audioCtx.createGain();
  whineLfoAmt.gain.value = 38;
  whineLfo.connect(whineLfoAmt);
  whineLfoAmt.connect(whine.frequency);

  // CAPA 3b — ARMÓNICO DE LA TURBINA (octava arriba). Le da el "sneer"
  // metálico característico de un jet a full thrust.
  const whineHarm = audioCtx.createOscillator();
  whineHarm.type = "sawtooth";
  whineHarm.frequency.value = 1900;
  const whineHarmFilt = audioCtx.createBiquadFilter();
  whineHarmFilt.type = "bandpass";
  whineHarmFilt.frequency.value = 2200;
  whineHarmFilt.Q.value = 5;
  const whineHarmGain = audioCtx.createGain();
  whineHarmGain.gain.value = 0.22;
  whineHarm.connect(whineHarmFilt);
  whineHarmFilt.connect(whineHarmGain);
  whineHarmGain.connect(airplaneGain);

  // Buffer de ruido blanco compartido por las dos capas de aire.
  const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  // CAPA 4 — RUIDO DE MOTOR (bandpass medio, el "GROAR"). Programable:
  // crece dramáticamente con el throttle. Es el roar del motor.
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const noiseFilt = audioCtx.createBiquadFilter();
  noiseFilt.type = "bandpass";
  noiseFilt.frequency.value = 700;
  noiseFilt.Q.value = 0.55;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0;           // se programa en el schedule
  noise.connect(noiseFilt);
  noiseFilt.connect(noiseGain);
  noiseGain.connect(airplaneGain);

  // LFO sutil sobre el filtro de ruido para que el roar no sea estático.
  const noiseLfo = audioCtx.createOscillator();
  noiseLfo.frequency.value = 0.16;
  const noiseLfoAmt = audioCtx.createGain();
  noiseLfoAmt.gain.value = 220;
  noiseLfo.connect(noiseLfoAmt);
  noiseLfoAmt.connect(noiseFilt.frequency);

  // CAPA 5 — VIENTO / AIRE (highpass alto, el "WHOOOSH"). Programable:
  // arranca casi inaudible y crece a una pared de viento al despegar.
  // Es el aire siendo desgarrado por el avión a velocidad de despegue.
  const wind = audioCtx.createBufferSource();
  wind.buffer = noiseBuf;
  wind.loop = true;
  const windFilt = audioCtx.createBiquadFilter();
  windFilt.type = "highpass";
  windFilt.frequency.value = 1900;
  windFilt.Q.value = 0.5;
  const windGain = audioCtx.createGain();
  windGain.gain.value = 0;            // se programa en el schedule
  wind.connect(windFilt);
  windFilt.connect(windGain);
  windGain.connect(airplaneGain);

  const t = audioCtx.currentTime;
  sub.start(t);
  low1.start(t);
  low2.start(t);
  mid.start(t);
  whine.start(t);
  whineHarm.start(t);
  whineLfo.start(t);
  noise.start(t);
  noiseLfo.start(t);
  wind.start(t);

  // Guardamos refs a frecuencias y gains que la secuencia de despegue
  // tiene que modular. Las capas con gain dinámico (sub, low, noise,
  // wind) se programan junto con las frecuencias para crear el spool-up.
  airplane = {
    sub, low1, low2, mid, whine, whineHarm,
    subGain, lowGain, noiseGain, windGain
  };
}

// Programa la secuencia de despegue (7 segundos):
//
//  Anatomía de un takeoff real:
//   0.0–0.4s  Engines start: idle suave, sólo un rumble bajo.
//   0.4–2.0s  THROTTLE UP: en este momento el avión "ruge". Las
//             frecuencias y todas las capas (sub, rumble, ruido,
//             viento) trepan rápido. Es el momento más identificable.
//   2.0–4.5s  Full thrust: la turbina llega a su pico, el sub vibra,
//             el viento es una pared. El avión está despegando.
//   4.5–6.0s  Climb: se mantiene a full mientras "pasa" cerca.
//   6.0–7.0s  Departure / Doppler: frecuencias bajan (avión que se
//             aleja), todas las capas decaen a 0.
//   t > 7s    SILENCIO ABSOLUTO.
function scheduleAirplaneTakeoff(t0) {
  if (!airplane.low1) return;

  // Cancelamos cualquier rampa previa antes de re-programar.
  airplaneGain.gain.cancelScheduledValues(t0);
  airplane.sub.frequency.cancelScheduledValues(t0);
  airplane.low1.frequency.cancelScheduledValues(t0);
  airplane.low2.frequency.cancelScheduledValues(t0);
  airplane.mid.frequency.cancelScheduledValues(t0);
  airplane.whine.frequency.cancelScheduledValues(t0);
  airplane.whineHarm.frequency.cancelScheduledValues(t0);
  airplane.subGain.gain.cancelScheduledValues(t0);
  airplane.lowGain.gain.cancelScheduledValues(t0);
  airplane.noiseGain.gain.cancelScheduledValues(t0);
  airplane.windGain.gain.cancelScheduledValues(t0);

  // === FRECUENCIAS — todas las capas spoolean al mismo tiempo ===

  // Sub-bass de truenos: 26 → 48 Hz (vibración profunda).
  airplane.sub.frequency.setValueAtTime(26, t0);
  airplane.sub.frequency.linearRampToValueAtTime(48, t0 + 3.5);
  airplane.sub.frequency.linearRampToValueAtTime(48, t0 + 5.5);
  airplane.sub.frequency.linearRampToValueAtTime(34, t0 + 7);

  // Rumble grave: 32 → 60 Hz.
  airplane.low1.frequency.setValueAtTime(32, t0);
  airplane.low1.frequency.linearRampToValueAtTime(60, t0 + 3.5);
  airplane.low1.frequency.linearRampToValueAtTime(60, t0 + 5.5);
  airplane.low1.frequency.linearRampToValueAtTime(46, t0 + 7);

  airplane.low2.frequency.setValueAtTime(36, t0);
  airplane.low2.frequency.linearRampToValueAtTime(66, t0 + 3.5);
  airplane.low2.frequency.linearRampToValueAtTime(66, t0 + 5.5);
  airplane.low2.frequency.linearRampToValueAtTime(52, t0 + 7);

  // Rumble medio: 90 → 230 Hz.
  airplane.mid.frequency.setValueAtTime(90, t0);
  airplane.mid.frequency.linearRampToValueAtTime(230, t0 + 3.5);
  airplane.mid.frequency.linearRampToValueAtTime(230, t0 + 5.5);
  airplane.mid.frequency.linearRampToValueAtTime(170, t0 + 7);

  // TURBINA — barrido más amplio (260 → 1700 Hz). Esto es el "WHEEEE"
  // que el oído reconoce inmediatamente como avión despegando.
  airplane.whine.frequency.setValueAtTime(260, t0);
  airplane.whine.frequency.linearRampToValueAtTime(1700, t0 + 3.5);
  airplane.whine.frequency.linearRampToValueAtTime(1700, t0 + 5.5);
  airplane.whine.frequency.linearRampToValueAtTime(1100, t0 + 7);

  // Armónico (octava arriba) — el sneer metálico.
  airplane.whineHarm.frequency.setValueAtTime(520, t0);
  airplane.whineHarm.frequency.linearRampToValueAtTime(3400, t0 + 3.5);
  airplane.whineHarm.frequency.linearRampToValueAtTime(3400, t0 + 5.5);
  airplane.whineHarm.frequency.linearRampToValueAtTime(2200, t0 + 7);

  // === GAINS DE CAPAS — el spool-up dinámico ===
  //
  // Cada capa tiene su propio crecimiento. El sub-bass arranca de cero
  // y sube fuerte (las ventanas vibran sólo a full thrust). El ruido
  // de motor empieza bajo y se vuelve un GROAR. El viento es lo último
  // que aparece (sólo a velocidad de despegue) y es lo primero que
  // se va con el Doppler.

  // Sub-bass: imperceptible al inicio, masivo en el pico.
  airplane.subGain.gain.setValueAtTime(0.0, t0);
  airplane.subGain.gain.linearRampToValueAtTime(0.55, t0 + 3.0);
  airplane.subGain.gain.linearRampToValueAtTime(0.55, t0 + 5.5);
  airplane.subGain.gain.linearRampToValueAtTime(0.0, t0 + 7);

  // Rumble grave: idle bajo (0.18) → roar fuerte (0.85).
  airplane.lowGain.gain.setValueAtTime(0.18, t0);
  airplane.lowGain.gain.linearRampToValueAtTime(0.85, t0 + 2.5);
  airplane.lowGain.gain.linearRampToValueAtTime(0.85, t0 + 5.5);
  airplane.lowGain.gain.linearRampToValueAtTime(0.0, t0 + 7);

  // Ruido de motor (GROAR): el alma del takeoff. Arranca tibio,
  // explota a full thrust.
  airplane.noiseGain.gain.setValueAtTime(0.18, t0);
  airplane.noiseGain.gain.linearRampToValueAtTime(0.95, t0 + 2.8);
  airplane.noiseGain.gain.linearRampToValueAtTime(0.95, t0 + 5.5);
  airplane.noiseGain.gain.linearRampToValueAtTime(0.0, t0 + 7);

  // Viento: tarda más en aparecer (sólo a velocidad de despegue) y se
  // va primero con el Doppler.
  airplane.windGain.gain.setValueAtTime(0.0, t0);
  airplane.windGain.gain.linearRampToValueAtTime(0.55, t0 + 3.5);
  airplane.windGain.gain.linearRampToValueAtTime(0.55, t0 + 5.0);
  airplane.windGain.gain.linearRampToValueAtTime(0.0, t0 + 6.5);

  // === MASTER — envelope general ===
  //  · 0–0.3s:  engines start (gain → 0.25).
  //  · 0.3–2.0s: throttle UP rápido (0.25 → 0.95).
  //  · 2.0–5.5s: full thrust hold.
  //  · 5.5–7.0s: Doppler departure (0.95 → 0).
  //  · t > 7s:   silencio absoluto.
  airplaneGain.gain.setValueAtTime(0, t0);
  airplaneGain.gain.linearRampToValueAtTime(0.25, t0 + 0.3);
  airplaneGain.gain.linearRampToValueAtTime(0.95, t0 + 2.0);
  airplaneGain.gain.linearRampToValueAtTime(0.95, t0 + 5.5);
  airplaneGain.gain.linearRampToValueAtTime(0, t0 + AIRPLANE_DURATION);
  airplaneGain.gain.setValueAtTime(0, t0 + AIRPLANE_DURATION + 0.01);
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

  // Pulso del corazón (sincronizado al audio). Las fibras y la capa base
  // lo leen para latir en simultáneo con el lub-dub.
  updateHeartbeatPulseValue();
  const pulseBoost = 1 + heartbeatPulseValue * BODY_PULSE_AMOUNT;

  // 1) Capa base del cuerpo: pintura acrílica con los colores del png.
  // Empieza a aparecer pronto después del hold y queda formada al final.
  // Modulada por el pulso del latido para que el cuerpo "lata".
  const bodyBaseAlphaBase = smoothstep(0.30, 0.90, morphSmoothed) * BODY_BASE_MAX_ALPHA;
  const bodyBaseAlpha     = constrain(bodyBaseAlphaBase * pulseBoost, 0, 1);
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
   CUERPO = PLÁSTICO SATINADO (volúmenes 3D)
   Como la referencia: formas bulbous lisas, color en bloques, brillo
   de estudio suave, un poco de luz bajo la superficie. Se parte del
   png (silueta + zonas de color) y se reconstruye como un sólido
   redondeado. Cero grano, cero pincel.
========================================================= */

function blurScalar(src, w, h, radius) {
  const n = w * h;
  const tmp = new Float32Array(n);
  const out = new Float32Array(n);
  const k = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      sum += src[row + constrain(i, 0, w - 1)];
    }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / k;
      const drop = src[row + constrain(x - radius, 0, w - 1)];
      const add  = src[row + constrain(x + radius + 1, 0, w - 1)];
      sum += add - drop;
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      sum += tmp[constrain(i, 0, h - 1) * w + x];
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / k;
      const drop = tmp[constrain(y - radius, 0, h - 1) * w + x];
      const add  = tmp[constrain(y + radius + 1, 0, h - 1) * w + x];
      sum += add - drop;
    }
  }
  return out;
}

function dilateFields(cover, colR, colG, colB, w, h, times) {
  let c = cover, r = colR, g = colG, b = colB;
  for (let t = 0; t < times; t++) {
    const nc = new Float32Array(c.length);
    const nr = new Float32Array(r.length);
    const ng = new Float32Array(g.length);
    const nb = new Float32Array(b.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        let best = c[idx];
        let br = r[idx], bg = g[idx], bb = b[idx];
        for (let oy = -1; oy <= 1; oy++) {
          const yy = y + oy;
          if (yy < 0 || yy >= h) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const xx = x + ox;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (c[j] > best) {
              best = c[j];
              br = r[j]; bg = g[j]; bb = b[j];
            }
          }
        }
        nc[idx] = best;
        nr[idx] = br; ng[idx] = bg; nb[idx] = bb;
      }
    }
    c = nc; r = nr; g = ng; b = nb;
  }
  return { cover: c, colR: r, colG: g, colB: b };
}

function chamferInside(mask, w, h) {
  const INF = 1e6;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) v = Math.min(v, d[i - w] + 1);
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + 1.414);
      if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + 1.414);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) v = Math.min(v, d[i + w] + 1);
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + 1.414);
      if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + 1.414);
      d[i] = v;
    }
  }
  return d;
}

function renderPlasticBody(src) {
  const w = src.width;
  const h = src.height;
  const spx = src.pixels;
  const n = w * h;

  let cover = new Float32Array(n);
  let colR = new Float32Array(n);
  let colG = new Float32Array(n);
  let colB = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const a = spx[p + 3];
    const r = spx[p], g = spx[p + 1], b = spx[p + 2];
    const lum = (r + g + b) / 3;
    if (a < 16 || lum < 14) continue;
    cover[i] = 1;
    colR[i] = r; colG[i] = g; colB[i] = b;
  }

  // Dilatar: las fibras se vuelven una masa sólida (órganos de plástico).
  ({ cover, colR, colG, colB } = dilateFields(cover, colR, colG, colB, w, h, 10));

  // Premultiplicar para que el blur no meta negro en el plástico.
  for (let i = 0; i < n; i++) {
    colR[i] *= cover[i];
    colG[i] *= cover[i];
    colB[i] *= cover[i];
  }

  cover = blurScalar(cover, w, h, 3);
  cover = blurScalar(cover, w, h, 3);
  colR = blurScalar(colR, w, h, 4);
  colG = blurScalar(colG, w, h, 4);
  colB = blurScalar(colB, w, h, 4);
  for (let i = 0; i < n; i++) {
    if (cover[i] > 0.001) {
      const inv = 1 / cover[i];
      colR[i] *= inv;
      colG[i] *= inv;
      colB[i] *= inv;
    }
  }

  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = cover[i] > 0.28 ? 1 : 0;

  const dist = chamferInside(mask, w, h);

  // Altura = perfil de esfera (volumen bulbous). Un poco de lóbulo lento
  // para que no sea un tubo uniforme, sin romper la lisura.
  let height = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const t = Math.min(dist[i] / 28, 1);
      const dome = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
      const lobe = 0.82 + 0.22 * noise(x * 0.011, y * 0.011);
      height[i] = dome * lobe;
    }
  }
  height = blurScalar(height, w, h, 3);
  height = blurScalar(height, w, h, 2);

  // Key (arriba-derecha, como la foto) + fill izquierdo.
  const norm3 = (x, y, z) => {
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / l, y / l, z / l];
  };
  const [lx, ly, lz] = norm3(0.48, -0.52, 0.70);
  const [fx, fy, fz] = norm3(-0.55, 0.10, 0.55);
  const [hx, hy, hz] = norm3(lx, ly, lz + 1);

  const gbuf = createGraphics(w, h);
  gbuf.pixelDensity(1);
  gbuf.clear();
  const ctx = gbuf.drawingContext;
  const img = ctx.createImageData(w, h);
  const out = img.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (!mask[i]) {
        out[o + 3] = 0;
        continue;
      }

      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(h - 1, y + 1);
      // Bump bajo: curvatura amplia, no grano.
      const dHx = (height[y * w + x1] - height[y * w + x0]) * 1.15;
      const dHy = (height[y1 * w + x] - height[y0 * w + x]) * 1.15;
      let nx = -dHx, ny = -dHy, nz = 1;
      const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nlen; ny /= nlen; nz /= nlen;

      const ndotl = nx * lx + ny * ly + nz * lz;
      const ndotf = nx * fx + ny * fy + nz * fz;
      const ndoth = Math.max(0, nx * hx + ny * hy + nz * hz);
      const ndotv = Math.max(0, nz);

      // Wrap lighting: volúmenes redondos, no facetas duras.
      const wrap = 0.45;
      const key  = constrain((ndotl + wrap) / (1 + wrap), 0, 1);
      const fill = constrain(ndotf, 0, 1) * 0.28;
      const amb  = 0.22;

      // AO en pliegues (valle de altura) y cerca del borde.
      const lap =
        height[i] * 4 -
        height[y * w + x0] - height[y * w + x1] -
        height[y0 * w + x] - height[y1 * w + x];
      const crease = constrain(-lap * 2.2, 0, 1);
      const rimAO  = constrain(dist[i] / 7, 0, 1);
      const ao = (1 - crease * 0.55) * (0.55 + 0.45 * rimAO);

      let ar = colR[i], ag = colG[i], ab = colB[i];
      // Leche de plástico: un poco de blanco, saturación intacta.
      ar = ar * 0.88 + 255 * 0.12;
      ag = ag * 0.88 + 255 * 0.12;
      ab = ab * 0.88 + 255 * 0.12;

      const lit = (amb + key * 0.72 + fill) * ao;
      // SSS: el color se filtra en la sombra (plástico suave, no goma mate).
      const sss = constrain(0.35 - ndotl, 0, 1) * 0.22 * ao;
      // Especulares satinados (estudio), no destello de vidrio.
      const specSoft  = Math.pow(ndoth, 14) * 0.38;
      const specGlint = Math.pow(ndoth, 42) * 0.16;
      const fresnel   = Math.pow(1 - ndotv, 2.2) * 0.10;
      const spec = (specSoft + specGlint + fresnel) * ao;

      out[o]     = constrain(ar * (lit + sss) + spec * 245, 0, 255) | 0;
      out[o + 1] = constrain(ag * (lit + sss) + spec * 248, 0, 255) | 0;
      out[o + 2] = constrain(ab * (lit + sss) + spec * 255, 0, 255) | 0;
      const edge = constrain((cover[i] - 0.18) / 0.22, 0, 1);
      out[o + 3] = (edge * edge * (3 - 2 * edge) * 255) | 0;
    }
  }

  ctx.putImageData(img, 0, 0);
  return gbuf;
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
    this.buildPlastic();
    this.buildFibers();
  }

  // Pre-render: imagen rotada 90° CW. Se usa para muestrear posiciones
  // y colores de las fibras / de la pintura.
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

  // Plástico satinado: silueta y colores del png, materia de la referencia.
  buildPlastic() {
    this.acrylic = renderPlasticBody(this.master);
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
  // El pulso del corazón (heartbeatPulseValue) suma una expansión radial
  // alrededor del centro del cuerpo: cada lub-dub el cuerpo "late".
  toWorld(lx, ly, motionStrength = 1) {
    const m = getBodyMotion(frameCount + this.phase * 60);
    const heartScale = 1 + heartbeatPulseValue * BODY_PULSE_SCALE;
    const sx = lerp(1, m.scaleX, motionStrength) * heartScale;
    const sy = lerp(1, m.scaleY, motionStrength) * heartScale;
    const swayX = m.swayX * motionStrength;
    const swayY = m.swayY * motionStrength;
    const ox = (lx - this.bodyW * 0.5) * sx;
    const oy = (ly - this.bodyH * 0.5) * sy;
    return { x: this.cx + swayX + ox, y: this.cy + swayY + oy };
  }

  // Capa base: cuerpo de plástico satinado.
  drawBase(bodyBaseAlpha) {
    if (bodyBaseAlpha <= 0.001) return;
    const ctx = drawingContext;
    const heartScale = 1 + heartbeatPulseValue * BODY_PULSE_SCALE;
    ctx.save();
    ctx.globalAlpha = bodyBaseAlpha;
    ctx.translate(this.cx, this.cy);
    ctx.scale(heartScale, heartScale);
    ctx.translate(-this.bodyW * 0.5, -this.bodyH * 0.5);
    const paint = this.acrylic || this.master;
    const el = paint.elt || paint.canvas;
    ctx.drawImage(el, 0, 0, this.bodyW, this.bodyH);
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

    // Barniz húmedo: aclara el propio color del png, no cambia de tinta.
    let shineMix = 0;
    if (this.shine && pm > SHINE_BODY_THRESH) {
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
    // Pulso del corazón: sólo aplica a fibras que ya son cuerpo (pm alto).
    // bodyFactor = 1 cuando la fibra está formada, 0 cuando todavía es ovillo.
    const bodyFactorPulse = constrain((pm - 0.5) * 2.5, 0, 1);
    const heartPulseMul   = 1 + heartbeatPulseValue * BODY_PULSE_AMOUNT * bodyFactorPulse;
    let alpha        = max(this.alpha * alphaMul * travelMult * shineAlphaMul * heartPulseMul, minA);
    alpha = constrain(alpha, 0, 255);

    // La hebra viaja hasta el cuerpo. Al posarse se apaga: la materia
    // del cuerpo es la película plástica de la capa base, no más hilos.
    const bodyTrailAlpha = constrain(alpha * (1 - bf * 0.92), 0, 255);
    const paintAmt = smoothstep(0.22, 0.88, pm);

    if (bodyTrailAlpha > 0.5 && paintAmt < 0.72) {
      stroke(r, g, b, bodyTrailAlpha * (1 - paintAmt));
      strokeWeight(this.weight * weightMul);
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
  fill(215, 210, 200, 60);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  textSize(13);
  text("A N A T O M Í A   D E   L A   D I S T A N C I A", width * 0.5, height - 42);
  pop();
}
