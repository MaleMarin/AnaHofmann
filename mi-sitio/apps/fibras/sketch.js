/*
 * Anatomía de la Distancia — v606
 *
 * IDEA CENTRAL
 * ------------
 * El cuerpo no aparece de golpe. Primero existe un OVILLO DE LANA real
 * (ovillo-ref.png), hecho íntegramente de fibras, que se desamarra y
 * viaja hacia la silueta del cuerpo (cuerpo-ref.png). La transformación
 * es un único sistema de fibras con dos anclas: anchorBall (sample del
 * ovillo) y anchorBody (sample del cuerpo). El anchor activo es
 * lerp(ball, body, personalMorph).
 *
 * IMÁGENES BASE
 *   - ovillo-ref.png → muestreo de POSICIÓN y COLOR del estado ovillo.
 *   - cuerpo-ref.png → muestreo de POSICIÓN y COLOR del estado cuerpo.
 *   - El ovillo se renderiza también como capa base con fade out a
 *     medida que las fibras empiezan a viajar.
 *   - El cuerpo se renderiza como capa base con fade in al final.
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
const HOLD_SECONDS  = 3;
const MORPH_SECONDS = 35;

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
const BALL_DIAMETER_MULT  = 2.15;  // tamaño del bounding box del ovillo
const BALL_ALPHA_MULT     = 2.4;
const BALL_WEIGHT_MULT    = 1.35;
const BALL_COLOR_BOOST    = 1.25;
const BALL_MIN_ALPHA      = 110;
const BALL_ROT_SPEED      = 0.0030;
const BALL_WANDER_AMP     = 2.4;
const BALL_MAX_OFFSET     = 8.0;
const BALL_STRAND_MIN_LEN = 18;
const BALL_STRAND_MAX_LEN = 42;
const BALL_STRAND_CURVE   = 10;

// Capa base del ovillo: la imagen ovillo-ref.png se renderiza detrás de
// las fibras y se desvanece a medida que el morph empieza.
const OVILLO_BASE_ALPHA_MAX = 0.85;
const OVILLO_BASE_FADE_IN   = 0.05;
const OVILLO_BASE_FADE_OUT  = 0.45;

// Probabilidad de que una fibra sea "acento" (blanco, cian o magenta)
// para sumar variedad por encima del color real del ovillo.
const ACCENT_PROBABILITY = 0.05;

// ============ MOVIMIENTO GLOBAL DEL CUERPO (solo al final) ============
const BODY_SWAY_X_AMP    = 4.0;
const BODY_SWAY_Y_AMP    = 1.8;
const BODY_SWAY_SPEED    = 0.0055;
const BODY_BREATH_SCALE_X = 0.0060;
const BODY_BREATH_SCALE_Y = 0.0100;
const BODY_BREATH_SPEED   = 0.0120;

// ============ WARP POR SLICES ============
const WARP_SLICE_STEP    = 12;
const WARP_X_AMP         = 3.5;
const WARP_Y_AMP         = 1.0;
const WARP_SPEED         = 0.0045;
const WARP_SPATIAL_SCALE = 0.08;

// ============ FIBRAS — DINÁMICA ============
const FIBER_NOISE_SPEED  = 0.0035;
const FIBER_WANDER_AMP   = 1.4;
const FIBER_ANCHOR_PULL  = 0.06;
const FIBER_DAMPING      = 0.88;
const FIBER_MAX_OFFSET   = 4.0;
const FIBER_ALPHA_MULT   = 0.95;
const FIBER_WEIGHT_MULT  = 0.95;

// ============ FIBRAS — MUESTREO ============
const FIBERS_PER_BODY    = 1800;
const FIBER_DENSITY_MIN  = 32;
const FIBER_ACCEPT_GAIN  = 1.0;
const FIBER_ALPHA_BASE   = 22;
const FIBER_WEIGHT_MIN   = 0.48;
const FIBER_WEIGHT_MAX   = 1.35;
const FIBER_HISTORY      = 8;

// ============ VIAJE / RASTRO ============
const MORPH_TRAIL_ALPHA       = 42;   // (referencia, ver fondo dinámico)
const MORPH_LINE_WEIGHT       = 0.8;  // (referencia)
const MORPH_TRAVEL_VISIBILITY = 1.6;
const MORPH_LOW_LIMIT         = 0.10;
const MORPH_HIGH_LIMIT        = 0.85;

// ============ ESTADO ============
let bodyRefImg;
let ovilloRefImg;
let bodies = [];

/* =========================================================
   BOOTSTRAP
========================================================= */

function preload() {
  bodyRefImg = loadImage("/apps/fibras/assets/cuerpo-ref.png");
  ovilloRefImg = loadImage("/apps/fibras/assets/ovillo-ref.png");
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
  if (!btn) return;

  btn.style.display = "block";
  btn.textContent = "reiniciar";

  btn.addEventListener("click", () => {
    morph = 0;
    morphSmoothed = 0;
    startMs = millis();
  });
}

/* =========================================================
   HELPERS
========================================================= */

function smoothstep(edge0, edge1, x) {
  const t = constrain((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Reloj interno: 5 s de ovillo, después la transformación avanza
// linealmente durante MORPH_SECONDS y se queda en 1.
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

  // Capa 1: ovillo base (imagen real), con fade out que arranca apenas
  // empieza el morph para ceder protagonismo a las fibras.
  const ovilloBaseAlpha = (1 - smoothstep(OVILLO_BASE_FADE_IN, OVILLO_BASE_FADE_OUT, morphSmoothed))
                          * OVILLO_BASE_ALPHA_MAX;
  for (const body of bodies) body.drawBallBase(ovilloBaseAlpha);

  // Capa 2: cuerpo base con fade gradual (smoothstep), nunca al 100%.
  const bodyBaseAlpha = smoothstep(0.35, 0.95, morphSmoothed) * 0.65;
  for (const body of bodies) body.drawBase(bodyBaseAlpha);

  // Capa 3: fibras (composite "lighter" para que sumen sobre el negro).
  drawingContext.save();
  drawingContext.globalCompositeOperation = "lighter";
  for (const body of bodies) body.drawFibers();
  drawingContext.restore();

  if (SHOW_DEBUG_PARAMS) drawDebugOverlay(rawProgress, bodyBaseAlpha, ovilloBaseAlpha, isMorphingNow());
  drawTitle();
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

    // Bounding box del ovillo, centrado en (cx, cy). Se calcula a partir
    // del aspecto real de ovillo-ref.png para no deformar la imagen.
    const ovAspect = ovilloRefImg.height / ovilloRefImg.width;
    const targetDiameter = BALL_RADIUS * BALL_DIAMETER_MULT;
    if (ovAspect >= 1) {
      this.ballH = targetDiameter;
      this.ballW = this.ballH / ovAspect;
    } else {
      this.ballW = targetDiameter;
      this.ballH = this.ballW * ovAspect;
    }

    this.buildMaster();
    this.buildBallMaster();
    this.buildFibers();
  }

  // Pre-render: imagen rotada 90° CW. Se usa para muestrear posiciones
  // y colores y para revelar el cuerpo cuando morph avanza.
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

  // Pre-render del ovillo. Se usa para muestrear posiciones+colores
  // de las fibras en estado ovillo y para dibujar la capa base con
  // fade out durante el inicio.
  buildBallMaster() {
    const g = createGraphics(floor(this.ballW), floor(this.ballH));
    g.pixelDensity(1);
    g.clear();
    g.imageMode(CORNER);
    g.image(ovilloRefImg, 0, 0, g.width, g.height);
    g.loadPixels();
    this.ballMaster = g;
  }

  // Sample en el master del ovillo. Devuelve { lx, ly, r, g, b } en
  // coordenadas locales del ballMaster (esquina sup. izq.).
  sampleBallAnchor() {
    const px = this.ballMaster.pixels;
    const bw = this.ballMaster.width;
    const bh = this.ballMaster.height;
    for (let attempt = 0; attempt < 80; attempt++) {
      const lx = floor(random(bw));
      const ly = floor(random(bh));
      const idx = (ly * bw + lx) * 4;
      const r = px[idx];
      const g = px[idx + 1];
      const b = px[idx + 2];
      const a = px[idx + 3];
      if (a < 8) continue;
      const bright = (r + g + b) / 3;
      if (bright < 18) continue;
      return { lx, ly, r, g, b };
    }
    return { lx: bw * 0.5, ly: bh * 0.5, r: 220, g: 200, b: 170 };
  }

  // Muestra puntos del cuerpo y los empareja, por índice, con anclas
  // del ovillo sampleadas de ovillo-ref.png. Cada fibra tiene
  // OBLIGATORIAMENTE anchorBall + anchorBody (mismo objeto).
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
      const ballSample = this.sampleBallAnchor();
      this.fibers.push(new Fiber(this, i, total, s, ballSample));
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

  // Cuerpo base: fade continuo. Sin umbral duro.
  drawBase(bodyBaseAlpha) {
    if (bodyBaseAlpha <= 0.001) return;

    const motionStrength = bodyMotionStrength();
    const m = getBodyMotion(frameCount + this.phase * 60);

    const drawW = this.bodyW * lerp(1, m.scaleX, motionStrength);
    const drawH = this.bodyH * lerp(1, m.scaleY, motionStrength);

    const ctx = drawingContext;
    ctx.save();
    ctx.globalAlpha = bodyBaseAlpha;

    ctx.translate(this.cx + m.swayX * motionStrength,
                  this.cy + m.swayY * motionStrength);
    ctx.translate(-drawW * 0.5, -drawH * 0.5);

    const masterEl = this.master.elt || this.master.canvas;
    const mw = this.master.width;
    const mh = this.master.height;

    const slices = max(1, floor(drawH / WARP_SLICE_STEP));
    const sliceSrcH = mh / slices;
    const sliceDstStep = drawH / slices;
    const sliceDstH = sliceDstStep + 1.0;

    const warpAmpX = WARP_X_AMP * motionStrength;
    const warpAmpY = WARP_Y_AMP * motionStrength;

    for (let i = 0; i < slices; i++) {
      const sy = i * sliceSrcH;
      const dy = i * sliceDstStep;

      const n = noise(i * WARP_SPATIAL_SCALE,
                      frameCount * WARP_SPEED + this.phase * 0.5);
      const dx = map(n, 0, 1, -warpAmpX, warpAmpX);

      const wave = Math.sin(frameCount * WARP_SPEED * 1.3 + i * 0.12 + this.phase);
      const dyOff = wave * warpAmpY;

      ctx.drawImage(
        masterEl,
        0, sy, mw, sliceSrcH,
        dx, dy + dyOff, drawW, sliceDstH
      );
    }

    ctx.restore();
  }

  // Capa base del ovillo: dibuja la imagen del ovillo centrada en
  // (cx, cy). Se desvanece a medida que el morph empieza para que las
  // fibras tomen el protagonismo.
  drawBallBase(ovilloBaseAlpha) {
    if (ovilloBaseAlpha <= 0.001) return;
    const ctx = drawingContext;
    ctx.save();
    ctx.globalAlpha = ovilloBaseAlpha;
    ctx.translate(this.cx - this.ballW * 0.5, this.cy - this.ballH * 0.5);
    const ballEl = this.ballMaster.elt || this.ballMaster.canvas;
    ctx.drawImage(
      ballEl,
      0, 0, this.ballMaster.width, this.ballMaster.height,
      0, 0, this.ballW, this.ballH
    );
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
  constructor(body, index, total, bodySample, ballSample) {
    this.body = body;
    this.index = index;
    this.density = bodySample.density;

    // Anchor cuerpo (sample del png del cuerpo).
    this.anchorBodyX = bodySample.lx;
    this.anchorBodyY = bodySample.ly;

    // Color del cuerpo (sampleado del png).
    this.r = bodySample.r;
    this.g = bodySample.g;
    this.b = bodySample.b;

    // Anchor ovillo: sample del png del ovillo, traducido para que el
    // bounding box del ballMaster quede centrado en (bodyW/2, bodyH/2).
    const cx = body.bodyW * 0.5;
    const cy = body.bodyH * 0.5;
    const ballOffsetX = cx - body.ballW * 0.5;
    const ballOffsetY = cy - body.ballH * 0.5;
    this.anchorBallX = ballOffsetX + ballSample.lx;
    this.anchorBallY = ballOffsetY + ballSample.ly;

    // Color del ovillo (sampleado del png) — punto de partida de cada
    // fibra cuando el ovillo todavía está intacto.
    this.ballR = ballSample.r;
    this.ballG = ballSample.g;
    this.ballB = ballSample.b;

    // Parámetros radiales: distancia y ángulo respecto al centro del
    // ovillo, derivados del sample. Sirven para el drift rotacional y
    // para el escalonado del morph.
    const dx = this.anchorBallX - cx;
    const dy = this.anchorBallY - cy;
    this.spiralR     = Math.sqrt(dx * dx + dy * dy);
    this.spiralAngle = Math.atan2(dy, dx);

    // Acento opcional para variedad encima del color real del ovillo.
    this.accent = null;
    if (random() < ACCENT_PROBABILITY) {
      const choice = floor(random(3));
      if      (choice === 0) this.accent = { r: 255, g: 255, b: 255 };
      else if (choice === 1) this.accent = { r: 130, g: 220, b: 255 };
      else                   this.accent = { r: 255, g: 130, b: 220 };
    }

    this.seed   = random(10000);
    this.weight = random(FIBER_WEIGHT_MIN, FIBER_WEIGHT_MAX);
    this.alpha  = FIBER_ALPHA_BASE * map(this.density, 30, 255, 0.6, 1.0);
    this.strandLength = random(BALL_STRAND_MIN_LEN, BALL_STRAND_MAX_LEN);
    this.strandCurve  = random(-BALL_STRAND_CURVE, BALL_STRAND_CURVE);
    this.strandJitter = random(-0.35, 0.35);

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

    // Color: ovillo (sample del png) → cuerpo (sample del png).
    // Termina antes para no saltar de tono cuando aparece el cuerpo
    // base. Usa el morph personal para que cada fibra cambie su tono al
    // ritmo de su propio viaje.
    const colorMix = constrain(map(pm, 0.0, 0.7, 0, 1), 0, 1);
    let baseR = lerp(this.ballR, this.r, colorMix);
    let baseG = lerp(this.ballG, this.g, colorMix);
    let baseB = lerp(this.ballB, this.b, colorMix);

    if (this.accent && bf > 0.001) {
      const m = bf * 0.7;
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
      const strandAlpha = constrain(alpha * (0.55 + bf * 0.55), 0, 255);
      const strandWeight = max(this.weight * weightMul * 0.82, MORPH_LINE_WEIGHT);
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

function drawDebugOverlay(rawProgress, bodyBaseAlpha, ovilloBaseAlpha, morphing) {
  push();
  drawingContext.globalCompositeOperation = "source-over";

  noStroke();
  fill(0, 0, 0, 140);
  rect(12, 12, 240, 138, 6);

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
  text(`ballAlpha: ${ovilloBaseAlpha.toFixed(3)}`,   x, y); y += 14;
  text(`bodyAlpha: ${bodyBaseAlpha.toFixed(3)}`,     x, y); y += 14;
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
