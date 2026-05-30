/*
 * Anatomía de la Distancia — v402
 *
 * REEMPLAZO DE MOVIMIENTO
 * -----------------------
 * v401 tenía movimiento fragmentado: slices de 3px, amplitudes altas,
 * fibras con jitter rápido y random por frame. Resultado: el cuerpo
 * se veía nervioso y roto en franjas.
 *
 * v402 reemplaza ese sistema por uno de:
 *   - baja frecuencia temporal (todas las velocidades <= 0.012)
 *   - baja amplitud (warp <= 4 px en X, <= 1.5 px en Y)
 *   - alta continuidad espacial (slices anchos + noise espacial,
 *     slices vecinos con desplazamientos parecidos)
 *   - sin random() por frame en las fibras
 *   - sin jitter por frame
 *
 * CAPAS
 *   1. CUERPO BASE — cuerpo-ref.png rotada 90° CW, pre-renderizada al
 *      tamaño final en un graphics buffer (this.master).
 *   2. MOVIMIENTO GLOBAL — sway lento + respiración leve. Aplicados
 *      como translate + scale al ctx antes del warp.
 *   3. WARP POR SLICES — el master se redibuja por franjas
 *      horizontales (WARP_SLICE_STEP=12 px). Cada slice tiene un dx
 *      por noise espacial+temporal y un dy por onda senoidal lenta.
 *   4. FIBRAS — capa secundaria. Cada fibra tiene anchor en el cuerpo
 *      animado y se mueve dentro de un radio pequeño con noise lento
 *      y damping. Heredan color del píxel original.
 *
 * FASE 1: un solo cuerpo. Sin segundo cuerpo, sin bridges, sin glow
 * grande, sin pulso final, sin sonido.
 *
 * DEBUG_VISUAL = true → referencia a la izquierda, animado a la derecha.
 */

// ============ FLAGS ============
const PHASE                = 1;
const DEBUG_VISUAL         = true;
const SHOW_DEBUG_PARAMS    = true;
const SHOW_DEBUG_PULSE_DOT = true;

// ============ MOVIMIENTO GLOBAL DEL CUERPO ============
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

// ============ FIBRAS ============
const FIBER_NOISE_SPEED  = 0.0035;
const FIBER_WANDER_AMP   = 1.4;
const FIBER_ANCHOR_PULL  = 0.06;
const FIBER_DAMPING      = 0.88;
const FIBER_MAX_OFFSET   = 4.0;

const FIBER_ALPHA_MULT   = 0.85;
const FIBER_WEIGHT_MULT  = 0.95;

// ============ MUESTREO DE FIBRAS ============
const FIBERS_PER_BODY    = 1100;
const FIBER_DENSITY_MIN  = 32;
const FIBER_ACCEPT_GAIN  = 1.0;
const FIBER_ALPHA_BASE   = 16;
const FIBER_WEIGHT_MIN   = 0.32;
const FIBER_WEIGHT_MAX   = 1.05;
const FIBER_HISTORY      = 6;

// ============ ANCLAS DENTRO DE LA IMAGEN YA ROTADA ============
const HEAD_REL  = { x: 0.48, y: 0.13 };
const HEART_REL = { x: 0.57, y: 0.26 };

// ============ ESTADO ============
let bodyRefImg;
let bodies = [];

// audio (FASE 2 — apagado en FASE 1)
let bassOsc, subOsc, filterNode;
let soundOn = false;
let audioReady = false;

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

  setupSoundUI();

  const btn = document.getElementById("soundToggle");
  if (btn) btn.style.display = (PHASE < 2 || DEBUG_VISUAL) ? "none" : "block";
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene();
  background(0);
}

function buildScene() {
  bodies = [];

  if (DEBUG_VISUAL) {
    bodies.push(new AnimatedBody(width * 0.72, height * 0.52, false, 0.0));
  } else if (PHASE < 2) {
    bodies.push(new AnimatedBody(width * 0.50, height * 0.52, false, 0.0));
  } else {
    bodies.push(new AnimatedBody(width * 0.28, height * 0.52, false, 0.0));
    bodies.push(new AnimatedBody(width * 0.72, height * 0.52, true,  PI * 0.7));
  }
}

function draw() {
  background(0, DEBUG_VISUAL ? 38 : 30);

  for (const body of bodies) body.drawBase();

  drawingContext.save();
  drawingContext.globalCompositeOperation = "lighter";
  for (const body of bodies) body.drawFibers();
  drawingContext.restore();

  if (DEBUG_VISUAL) {
    drawDebugReferencePanel();
    drawDebugTitle();
    if (SHOW_DEBUG_PARAMS)   drawDebugParams();
    if (SHOW_DEBUG_PULSE_DOT) drawDebugPulseDot();
  } else {
    drawTitle();
  }
}

/* =========================================================
   MOVIMIENTO GLOBAL DEL CUERPO
   Centralizado: sway lento + respiración leve. Esto es lo único que
   afecta al cuerpo entero (translate + scale). NO se aplican otras
   oscilaciones rápidas (ni tilt, ni pulso, ni jitter).
========================================================= */

function getBodyMotion(frame) {
  const swayX = Math.sin(frame * BODY_SWAY_SPEED) * BODY_SWAY_X_AMP;
  const swayY = Math.cos(frame * BODY_SWAY_SPEED * 0.85) * BODY_SWAY_Y_AMP;

  const breath = Math.sin(frame * BODY_BREATH_SPEED);
  const scaleX = 1 + breath * BODY_BREATH_SCALE_X;
  const scaleY = 1 + breath * BODY_BREATH_SCALE_Y;

  return { swayX, swayY, breath, scaleX, scaleY };
}

/* =========================================================
   AUDIO  —  scaffold para FASE 2; en FASE 1 no se usa.
========================================================= */

function setupSoundUI() {
  const btn = document.getElementById("soundToggle");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (PHASE < 2) return;
    try { await userStartAudio(); } catch (e) { console.warn(e); }
    if (!audioReady) buildAudio();
    soundOn = !soundOn;
    btn.textContent = soundOn ? "silenciar" : "activar sonido";
    if (!soundOn) {
      bassOsc.amp(0, 0.1);
      subOsc.amp(0, 0.1);
    }
  });
}

function buildAudio() {
  filterNode = new p5.LowPass();
  filterNode.freq(380);
  filterNode.res(4);

  bassOsc = new p5.Oscillator("sine");
  bassOsc.freq(55);
  bassOsc.amp(0);
  bassOsc.disconnect();
  bassOsc.connect(filterNode);
  bassOsc.start();

  subOsc = new p5.Oscillator("triangle");
  subOsc.freq(110);
  subOsc.amp(0);
  subOsc.disconnect();
  subOsc.connect(filterNode);
  subOsc.start();

  audioReady = true;
}

/* =========================================================
   ANIMATED BODY
   - Pre-renderiza la imagen rotada como master.
   - Cada frame redibuja el master por slices horizontales con warp.
   - Mantiene una capa de fibras vivas ancladas al cuerpo en movimiento.
========================================================= */

class AnimatedBody {
  constructor(cx, cy, mirror, phase) {
    this.cx = cx;
    this.cy = cy;
    this.mirror = mirror;
    this.phase = phase;

    const aspect = bodyRefImg.height / bodyRefImg.width;

    let h = min(height * (DEBUG_VISUAL ? 0.78 : 0.86), 900);
    let w = h * aspect;
    const maxW = width * (DEBUG_VISUAL ? 0.40 : (PHASE < 2 ? 0.50 : 0.40));
    if (w > maxW) { w = maxW; h = w / aspect; }

    this.bodyW = w;
    this.bodyH = h;

    this.buildMaster();

    const hx  = mirror ? 1 - HEAD_REL.x  : HEAD_REL.x;
    const hrx = mirror ? 1 - HEART_REL.x : HEART_REL.x;
    this.localHead  = { x: hx  * this.bodyW, y: HEAD_REL.y  * this.bodyH };
    this.localHeart = { x: hrx * this.bodyW, y: HEART_REL.y * this.bodyH };

    this.buildFibers();
  }

  // Pre-render: imagen rotada 90° CW y escalada al tamaño final del cuerpo.
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

  // Puntos de origen para las fibras: muestreo por densidad (brillo + saturación)
  // sobre el master. Se hace UNA vez en build; el random() aquí no corre por frame.
  buildFibers() {
    this.fibers = [];
    const px = this.master.pixels;
    const mw = this.master.width;
    const mh = this.master.height;
    const target = FIBERS_PER_BODY;

    let attempts = 0;
    const maxAttempts = target * 60;

    while (this.fibers.length < target && attempts < maxAttempts) {
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

      this.fibers.push(new Fiber(this, lx, ly, density, r, g, b));
    }
  }

  // Mapea coordenadas locales del master al canvas, aplicando el mismo
  // movimiento global que el ctx en drawBase(). Las fibras usan esto
  // como anchor móvil cada frame.
  toWorld(lx, ly) {
    const m = getBodyMotion(frameCount + this.phase * 60);
    const ox = (lx - this.bodyW * 0.5) * m.scaleX;
    const oy = (ly - this.bodyH * 0.5) * m.scaleY;
    return { x: this.cx + m.swayX + ox, y: this.cy + m.swayY + oy };
  }

  heartCenter() { return this.toWorld(this.localHeart.x, this.localHeart.y); }
  headCenter()  { return this.toWorld(this.localHead.x,  this.localHead.y);  }

  // CAPA 1 + 2 + 3 — cuerpo base con movimiento global + warp por slices.
  drawBase() {
    const m = getBodyMotion(frameCount + this.phase * 60);
    const drawW = this.bodyW * m.scaleX;
    const drawH = this.bodyH * m.scaleY;

    const ctx = drawingContext;
    ctx.save();

    ctx.translate(this.cx + m.swayX, this.cy + m.swayY);
    ctx.translate(-drawW * 0.5, -drawH * 0.5);

    const masterEl = this.master.elt || this.master.canvas;
    const mw = this.master.width;
    const mh = this.master.height;

    const slices = max(1, floor(drawH / WARP_SLICE_STEP));
    const sliceSrcH = mh / slices;
    const sliceDstStep = drawH / slices;
    const sliceDstH = sliceDstStep + 1.0;

    for (let i = 0; i < slices; i++) {
      const sy = i * sliceSrcH;
      const dy = i * sliceDstStep;

      const n = noise(i * WARP_SPATIAL_SCALE, frameCount * WARP_SPEED + this.phase * 0.5);
      const dx = map(n, 0, 1, -WARP_X_AMP, WARP_X_AMP);

      const wave = Math.sin(frameCount * WARP_SPEED * 1.3 + i * 0.12 + this.phase);
      const dyOff = wave * WARP_Y_AMP;

      ctx.drawImage(
        masterEl,
        0, sy, mw, sliceSrcH,
        dx, dy + dyOff, drawW, sliceDstH
      );
    }

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
   FIBER  —  capa secundaria. Anchor móvil + noise lento + damping.
   Sin jitter por frame. Sin random() por frame.
========================================================= */

class Fiber {
  constructor(body, lx, ly, density, pr, pg, pb) {
    this.body = body;
    this.lx = lx;
    this.ly = ly;
    this.seed = random(10000);

    this.r = pr;
    this.g = pg;
    this.b = pb;
    this.density = density;

    this.weight = random(FIBER_WEIGHT_MIN, FIBER_WEIGHT_MAX);
    this.alpha  = FIBER_ALPHA_BASE * map(density, 30, 255, 0.5, 1.0);

    const w = body.toWorld(lx, ly);
    this.x  = w.x;
    this.y  = w.y;
    this.vx = 0;
    this.vy = 0;

    this.history = [];
    for (let i = 0; i < FIBER_HISTORY; i++) {
      this.history.push({ x: this.x, y: this.y });
    }
  }

  update() {
    const anchor = this.body.toWorld(this.lx, this.ly);
    const anchorX = anchor.x;
    const anchorY = anchor.y;

    const targetX = anchorX + map(
      noise(this.seed, frameCount * FIBER_NOISE_SPEED),
      0, 1,
      -FIBER_WANDER_AMP, FIBER_WANDER_AMP
    );
    const targetY = anchorY + map(
      noise(this.seed + 100, frameCount * FIBER_NOISE_SPEED),
      0, 1,
      -FIBER_WANDER_AMP, FIBER_WANDER_AMP
    );

    const ax = (targetX - this.x) * FIBER_ANCHOR_PULL;
    const ay = (targetY - this.y) * FIBER_ANCHOR_PULL;

    this.vx = (this.vx + ax) * FIBER_DAMPING;
    this.vy = (this.vy + ay) * FIBER_DAMPING;

    this.x += this.vx;
    this.y += this.vy;

    const offX = this.x - anchorX;
    const offY = this.y - anchorY;
    const offD = Math.sqrt(offX * offX + offY * offY);

    if (offD > FIBER_MAX_OFFSET) {
      this.x = lerp(this.x, anchorX, 0.15);
      this.y = lerp(this.y, anchorY, 0.15);
    }

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > FIBER_HISTORY) this.history.shift();
  }

  display() {
    if (this.history.length < 4) return;

    stroke(this.r, this.g, this.b, this.alpha * FIBER_ALPHA_MULT);
    strokeWeight(this.weight * FIBER_WEIGHT_MULT);
    noFill();

    beginShape();
    curveVertex(this.history[0].x, this.history[0].y);
    for (const p of this.history) curveVertex(p.x, p.y);
    const last = this.history[this.history.length - 1];
    curveVertex(last.x, last.y);
    endShape();
  }
}

/* =========================================================
   DEBUG  —  comparación referencia ↔ animado + parámetros activos.
========================================================= */

function drawDebugReferencePanel() {
  if (!bodies.length) return;
  const body = bodies[0];

  const cx = width * 0.25;
  const cy = height * 0.52;
  const tW = body.bodyW;
  const tH = body.bodyH;

  push();
  drawingContext.globalCompositeOperation = "source-over";

  noFill();
  stroke(255, 22);
  strokeWeight(1);
  rect(cx - tW / 2 - 4, cy - tH / 2 - 4, tW + 8, tH + 8, 4);

  push();
  imageMode(CENTER);
  translate(cx, cy);
  rotate(HALF_PI);
  image(bodyRefImg, 0, 0, tH, tW);
  pop();

  noStroke();
  fill(210, 205, 195, 150);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  textSize(11);
  text("REFERENCIA", cx, cy - tH / 2 - 20);
  text("ANIMADO",    width * 0.72, cy - tH / 2 - 20);

  pop();
}

function drawDebugTitle() {
  push();
  drawingContext.globalCompositeOperation = "source-over";
  noStroke();
  fill(210, 205, 195, 110);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  textSize(12);
  text(
    "MODO DEBUG · cuerpo base + warp continuo + fibras ancladas · v402",
    width * 0.5,
    24
  );

  textAlign(LEFT, CENTER);
  textSize(10);
  fill(210, 205, 195, 140);
  text(`frame ${frameCount}`, 16, 24);
  pop();
}

function drawDebugParams() {
  push();
  drawingContext.globalCompositeOperation = "source-over";
  noStroke();
  fill(210, 205, 195, 120);
  textAlign(LEFT, TOP);
  textFont("monospace");
  textSize(10);

  const lines = [
    `WARP_SLICE_STEP   ${WARP_SLICE_STEP}`,
    `WARP_X_AMP        ${WARP_X_AMP}`,
    `WARP_Y_AMP        ${WARP_Y_AMP}`,
    `WARP_SPEED        ${WARP_SPEED}`,
    `BODY_SWAY_SPEED   ${BODY_SWAY_SPEED}`,
    `BODY_BREATH_SPEED ${BODY_BREATH_SPEED}`,
    `FIBER_NOISE_SPEED ${FIBER_NOISE_SPEED}`,
  ];
  const x = 16;
  let y = 44;
  for (const line of lines) {
    text(line, x, y);
    y += 13;
  }
  pop();
}

// Punto pulsante con la frecuencia de respiración. Sirve solo para
// confirmar visualmente que draw() está corriendo a la velocidad esperada.
function drawDebugPulseDot() {
  push();
  drawingContext.globalCompositeOperation = "source-over";
  const phase = Math.sin(frameCount * BODY_BREATH_SPEED);
  const r = 3 + (phase * 0.5 + 0.5) * 4;
  noStroke();
  fill(220, 90, 90, 220);
  circle(width - 24, 24, r * 2);
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
