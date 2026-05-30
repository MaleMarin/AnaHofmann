/*
 * Anatomía de la Distancia — v401
 *
 * NUEVA ESTRATEGIA
 * ----------------
 * La reconstrucción del cuerpo con partículas sueltas se abandona como
 * método principal. En su lugar usamos cuerpo-ref.png como CUERPO BASE
 * REAL y la animamos directamente, agregando una capa ligera de fibras
 * vivas encima.
 *
 * v401: la animación pasa a ser claramente visible. Se introduce un
 * modo DEBUG_MOTION_EXAGGERATED que sube las amplitudes de warp /
 * respiración / movimiento de fibras para CALIBRAR a ojo desde la web.
 * Luego se baja para la versión final.
 *
 *   CAPA 1 — CUERPO BASE
 *     cuerpo-ref.png rotada 90° CW (de pie), escalada y dibujada en el
 *     canvas conservando colores y textura originales.
 *
 *   CAPA 2 — ANIMACIÓN DEL CUERPO
 *     Movimiento orgánico y muy sutil:
 *       - warp horizontal por slices basado en ruido (lento + rápido)
 *       - respiración leve (escala que crece y baja)
 *       - sway corporal mínimo
 *       - tilt mínimo
 *     La forma original NO se rompe. La imagen se sigue reconociendo.
 *
 *   CAPA 3 — FIBRAS VIVAS
 *     Una capa fina de fibras nace de píxeles del propio cuerpo y se
 *     mueve cerca de su origen heredando su color. Refuerzan la idea
 *     de "cuerpo vivo" sin reemplazar la imagen.
 *
 *   CAPA 4 — PULSO
 *     Pulso corporal global que afecta:
 *       - brillo del cuerpo (filter brightness)
 *       - saturación del cuerpo (filter saturate)
 *       - alpha y peso de la capa de fibras
 *       - leve escala del cuerpo
 *       - microintensidad en la zona cardíaca (NO una bola dominante,
 *         NO un glow rosa gigante)
 *
 * FASE 1 (este archivo): UN solo cuerpo. Sin segundo cuerpo, sin
 *   bridges, sin distancia central, sin sonido.
 * FASE 2 (siguiente paso): duplicar el cuerpo (espejado), distancia
 *   sutil entre ambos, sonido.
 *
 * DEBUG_VISUAL = true
 *   Muestra la referencia original y el cuerpo animado lado a lado
 *   para comparar fidelidad.
 */

// ============ FASES Y FLAGS ============
const PHASE                    = 1;     // 1: un cuerpo. 2: dos cuerpos (no implementado todavía).
const DEBUG_VISUAL             = true;  // panel comparativo referencia ↔ animado
const DEBUG_MOTION_EXAGGERATED = true;  // exagera el movimiento para calibrar a ojo

// ============ ANIMACIÓN — MODO CALIBRACIÓN (v401) ============
// Estos valores se sienten "demasiado", a propósito. Sirven para
// confirmar que el cuerpo de la derecha está realmente vivo. Luego
// se baja DEBUG_MOTION_EXAGGERATED y volvemos a los valores suaves.
const WARP_SLICE_STEP    = 3;       // grosor en px de cada franja de warp
const WARP_X_AMP_DEBUG   = 16;      // amplitud horizontal del warp exagerado
const WARP_Y_AMP_DEBUG   = 4;       // amplitud vertical del warp exagerado
const WARP_SPEED_DEBUG   = 0.025;   // velocidad temporal del warp exagerado
const BREATH_SCALE_DEBUG = 0.018;   // amplitud de respiración exagerada
const FIBER_MOTION_DEBUG = 1.8;     // factor de amplificación de las fibras

// ============ ANIMACIÓN — MODO SUAVE (versión final) ============
const SLICE_HEIGHT      = 4;       // altura px de cada slice de warp
const WARP_AMP_SLOW     = 2.4;     // amplitud horizontal del warp lento (orgánico)
const WARP_AMP_FAST     = 0.6;     // amplitud horizontal del warp rápido (microvibración)
const WARP_NOISE_FREQ_Y = 3.2;     // densidad espacial del warp lento
const WARP_NOISE_FREQ_T = 0.0042;  // velocidad temporal del warp lento

const BREATH_SPEED      = 0.022;   // velocidad de respiración
const BREATH_AMP        = 0.012;   // expansión por respiración
const SWAY_AMP_X        = 1.4;     // sway lateral
const SWAY_AMP_Y        = 0.7;     // sway vertical

// ============ CAPA DE FIBRAS VIVAS ============
const FIBERS_PER_BODY   = 1100;
const FIBER_DENSITY_MIN = 32;      // umbral de muestreo en el cuerpo
const FIBER_ACCEPT_GAIN = 1.0;
const FIBER_ALPHA_BASE  = 16;
const FIBER_WEIGHT_MIN  = 0.32;
const FIBER_WEIGHT_MAX  = 1.05;
const FIBER_MAX_DIST    = 14;      // las fibras NO se alejan del cuerpo
const FIBER_HISTORY     = 7;

// ============ ANCLAS DENTRO DE LA IMAGEN YA ROTADA ============
// Referencia original es horizontal (cabeza a la izquierda).
// Tras rotar 90° CW para ponerla de pie:
//   cabeza   → (0.48, 0.13)
//   corazón  → (0.57, 0.26)
const HEAD_REL  = { x: 0.48, y: 0.13 };
const HEART_REL = { x: 0.57, y: 0.26 };

// ============ ESTADO ============
let bodyRefImg;
let bodies = [];
let globalPulse = 0;

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

  // FASE 1 / DEBUG: ocultamos el botón de sonido (no se usa todavía).
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
    // FASE DEBUG: cuerpo a la derecha, referencia a la izquierda.
    bodies.push(new AnimatedBody(width * 0.72, height * 0.52, false, 0.0));
  } else if (PHASE < 2) {
    // FASE 1: un único cuerpo, centrado.
    bodies.push(new AnimatedBody(width * 0.50, height * 0.52, false, 0.0));
  } else {
    // FASE 2: dos cuerpos espejados con aire entre ellos.
    bodies.push(new AnimatedBody(width * 0.28, height * 0.52, false, 0.0));
    bodies.push(new AnimatedBody(width * 0.72, height * 0.52, true,  PI * 0.7));
  }
}

function draw() {
  // Fade suave: barre los rastros de las fibras sin oscurecer el cuerpo
  // (que se redibuja entero cada frame).
  background(0, DEBUG_VISUAL ? 38 : 30);

  const t = millis() / 1000;
  globalPulse = computePulse(t);

  // CAPAS 1 + 2 — cuerpo base con warp animado
  for (const body of bodies) body.drawBase();

  // CAPA 3 — fibras vivas encima, modo aditivo
  drawingContext.save();
  drawingContext.globalCompositeOperation = "lighter";
  for (const body of bodies) body.drawFibers();
  drawingContext.restore();

  if (DEBUG_VISUAL) {
    drawDebugReferencePanel();
    drawDebugTitle();
  } else {
    drawTitle();
  }
}

/* =========================================================
   PULSO
   FASE 1: pulso bajo y suave (el cuerpo respira sin dramatismo).
   FASE 2: heartbeat con lub-dub.
========================================================= */

function computePulse(t) {
  if (PHASE < 2) {
    return 0.16 + (Math.sin(t * 1.1) * 0.5 + 0.5) * 0.10;
  }
  const period = 0.92;
  const x = (t % period) / period;
  const lub = Math.exp(-Math.pow((x - 0.00) / 0.045, 2));
  const dub = 0.72 * Math.exp(-Math.pow((x - 0.20) / 0.055, 2));
  return constrain(0.18 + Math.max(lub, dub) * 0.82, 0, 1);
}

/* =========================================================
   AUDIO  —  scaffold para FASE 2; en FASE 1 no se usa.
========================================================= */

function setupSoundUI() {
  const btn = document.getElementById("soundToggle");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (PHASE < 2) return; // todavía no
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
   - Cada frame redibuja el master por slices con warp.
   - Mantiene una capa de fibras vivas que nacen del propio cuerpo.
========================================================= */

class AnimatedBody {
  constructor(cx, cy, mirror, phase) {
    this.cx = cx;
    this.cy = cy;
    this.mirror = mirror;
    this.phase = phase;

    // El referente es horizontal (W > H). Al rotarlo 90° CW:
    //   nuevo_aspect = H_ref / W_ref  →  cuerpo de pie.
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

  // Pre-render: imagen rotada y escalada al tamaño final del cuerpo.
  // Esto permite usar drawImage con rect de origen para el slicing.
  buildMaster() {
    const g = createGraphics(floor(this.bodyW), floor(this.bodyH));
    g.pixelDensity(1);
    g.clear();

    // Rotación 90° CW. En el frame rotado, el ancho del referente
    // (W_ref) se extiende verticalmente en g (→ g.height) y la altura
    // (H_ref) horizontalmente (→ g.width). Por eso pasamos (g.height, g.width).
    g.push();
    g.imageMode(CENTER);
    g.translate(g.width / 2, g.height / 2);
    g.rotate(HALF_PI);
    if (this.mirror) g.scale(1, -1); // tras la rotación, flip local-y = flip global-x
    g.image(bodyRefImg, 0, 0, g.height, g.width);
    g.pop();

    g.loadPixels();
    this.master = g;
  }

  // Genera puntos de origen para las fibras a partir de píxeles del cuerpo.
  // Densidad combinada brillo+saturación (rescata zonas oscuras pero coloridas).
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

  motion() {
    const t = frameCount;

    if (DEBUG_MOTION_EXAGGERATED) {
      // Respiración mucho más perceptible: el torso se expande ~2% y la
      // altura ~2.5%. Suficiente para verlo a ojo sin caricaturizar.
      const breath = Math.sin(t * 0.035 + this.phase);
      return {
        breath,
        swayX:    Math.sin(t * 0.012 + this.phase) * 3.2,
        swayY:    Math.cos(t * 0.017 + this.phase) * 1.8,
        breathSx: 1 + breath * BREATH_SCALE_DEBUG,
        breathSy: 1 + breath * BREATH_SCALE_DEBUG * 1.4,
        pulseScale: 1 + globalPulse * 0.020,
        tilt: Math.sin(t * 0.008 + this.phase) * 0.010,
      };
    }

    const breath = Math.sin(t * BREATH_SPEED + this.phase);
    return {
      breath,
      swayX:    Math.sin(t * 0.0055 + this.phase) * SWAY_AMP_X,
      swayY:    Math.cos(t * 0.0080 + this.phase) * SWAY_AMP_Y,
      breathSx: 1 + breath * BREATH_AMP,
      breathSy: 1 + breath * BREATH_AMP * 0.7,
      pulseScale: 1 + globalPulse * 0.012,
      tilt: Math.sin(t * 0.0048 + this.phase) * 0.004,
    };
  }

  // Mapea coordenadas locales del master al canvas, aplicando el mismo
  // movimiento corporal que la CAPA 2. Las fibras lo usan como objetivo.
  toWorld(lx, ly) {
    const m = this.motion();
    const ox = (lx - this.bodyW * 0.5) * m.breathSx * m.pulseScale;
    const oy = (ly - this.bodyH * 0.5) * m.breathSy * m.pulseScale;
    const a = m.tilt;
    const rx = ox * Math.cos(a) - oy * Math.sin(a);
    const ry = ox * Math.sin(a) + oy * Math.cos(a);
    return { x: this.cx + m.swayX + rx, y: this.cy + m.swayY + ry };
  }

  heartCenter() { return this.toWorld(this.localHeart.x, this.localHeart.y); }
  headCenter()  { return this.toWorld(this.localHead.x,  this.localHead.y);  }

  // CAPA 1 + CAPA 2 + brillo/saturación de CAPA 4.
  drawBase() {
    const m = this.motion();
    const t = frameCount;
    const drawW = this.bodyW * m.breathSx * m.pulseScale;
    const drawH = this.bodyH * m.breathSy * m.pulseScale;

    const ctx = drawingContext;
    ctx.save();

    // CAPA 4 (parte 1) — pulso modula brillo + saturación globales del cuerpo.
    const bright = 1.00 + globalPulse * 0.18;
    const sat    = 1.00 + globalPulse * 0.30;
    ctx.filter = `brightness(${bright.toFixed(3)}) saturate(${sat.toFixed(3)})`;

    ctx.translate(this.cx + m.swayX, this.cy + m.swayY);
    ctx.rotate(m.tilt);
    ctx.translate(-drawW * 0.5, -drawH * 0.5);

    const masterEl = this.master.elt || this.master.canvas;
    const mw = this.master.width;
    const mh = this.master.height;

    // En modo calibración, slices de 3px (WARP_SLICE_STEP) — más densos.
    // En modo suave, slices de 4px (SLICE_HEIGHT).
    const step = DEBUG_MOTION_EXAGGERATED ? WARP_SLICE_STEP : SLICE_HEIGHT;
    const slices = max(1, floor(drawH / step));
    const sliceSrcH = mh / slices;
    const sliceDstStep = drawH / slices;
    const sliceDstH = sliceDstStep + 1.0; // overlap, evita costuras visibles

    for (let i = 0; i < slices; i++) {
      const sy = i * sliceSrcH;
      const dy = i * sliceDstStep;

      let dx, dyOff;

      if (DEBUG_MOTION_EXAGGERATED) {
        // Warp visible: ruido para X, onda senoidal para Y.
        // dx ∈ [-WARP_X_AMP_DEBUG/2, +WARP_X_AMP_DEBUG/2]
        // dyOff = sin(...) * WARP_Y_AMP_DEBUG
        const nX = noise(i * 0.08, t * WARP_SPEED_DEBUG + this.phase * 0.5);
        dx    = nX * WARP_X_AMP_DEBUG - WARP_X_AMP_DEBUG / 2;
        dyOff = Math.sin(t * 0.03 + i * 0.06 + this.phase) * WARP_Y_AMP_DEBUG;
      } else {
        const ny = i / slices;
        const nSlow = noise(ny * WARP_NOISE_FREQ_Y, t * WARP_NOISE_FREQ_T + this.phase * 0.5);
        const nFast = noise(ny * 8.0 + 100, t * 0.025 + this.phase);
        dx = (nSlow - 0.5) * 2 * WARP_AMP_SLOW
           + (nFast - 0.5) * 2 * WARP_AMP_FAST;
        dyOff = 0;
      }

      ctx.drawImage(
        masterEl,
        0, sy, mw, sliceSrcH,
        dx, dy + dyOff, drawW, sliceDstH
      );
    }

    ctx.filter = "none";
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
   FIBER  —  capa ligera de fibras vivas que ACOMPAÑAN el cuerpo.
   No lo reemplazan: se mueven cerca de su píxel de origen, heredan
   color del cuerpo y respiran con él.
========================================================= */

class Fiber {
  constructor(body, lx, ly, density, pr, pg, pb) {
    this.body = body;
    this.lx = lx;
    this.ly = ly;
    this.seed = random(10000);

    // Color del píxel del referente (sin tunear: queremos fidelidad).
    this.r = pr;
    this.g = pg;
    this.b = pb;
    this.density = density;

    // Microintensidad en zona cardíaca: ligero refuerzo, NO una bola.
    const dHeart = dist(lx, ly, body.localHeart.x, body.localHeart.y);
    const heartR = min(body.bodyW, body.bodyH) * 0.08;
    this.heartFalloff = dHeart < heartR ? (1 - dHeart / heartR) : 0;

    this.speed   = random(0.10, 0.30);
    this.pull    = random(0.045, 0.085);
    this.wander  = random(0.06, 0.20);
    this.weight  = random(FIBER_WEIGHT_MIN, FIBER_WEIGHT_MAX);
    this.alpha   = FIBER_ALPHA_BASE * map(density, 30, 255, 0.5, 1.0);
    this.maxDist = random(FIBER_MAX_DIST * 0.7, FIBER_MAX_DIST);

    const w = body.toWorld(lx, ly);
    this.x = w.x + random(-1.2, 1.2);
    this.y = w.y + random(-1.2, 1.2);
    this.vx = 0;
    this.vy = 0;

    this.history = [];
    for (let i = 0; i < FIBER_HISTORY; i++) {
      this.history.push({ x: this.x, y: this.y });
    }
  }

  update() {
    const t = this.body.toWorld(this.lx, this.ly);

    // En modo calibración, las fibras vibran mucho más visiblemente
    // (más wander, más flow, más jitter), pero siguen ancladas al cuerpo.
    const k = DEBUG_MOTION_EXAGGERATED ? FIBER_MOTION_DEBUG : 1.0;
    const noiseSpeed = DEBUG_MOTION_EXAGGERATED ? 0.018 : 0.005;
    const jitterSpeed = DEBUG_MOTION_EXAGGERATED ? 0.060 : 0.020;
    const reach = DEBUG_MOTION_EXAGGERATED ? this.maxDist * 1.7 : this.maxDist;

    const ang = noise(this.x * 0.003, this.y * 0.003, frameCount * noiseSpeed + this.seed) * TWO_PI * 2.0;
    const flowX = Math.cos(ang) * this.speed * 0.3 * k;
    const flowY = Math.sin(ang) * this.speed * 0.3 * k;

    const jitterX = (noise(this.seed + 10, frameCount * jitterSpeed) - 0.5) * this.wander * k;
    const jitterY = (noise(this.seed + 30, frameCount * jitterSpeed) - 0.5) * this.wander * k;

    this.vx = this.vx * 0.84 + flowX + (t.x - this.x) * this.pull + jitterX;
    this.vy = this.vy * 0.84 + flowY + (t.y - this.y) * this.pull + jitterY;

    this.x += this.vx;
    this.y += this.vy;

    const d = dist(this.x, this.y, t.x, t.y);
    if (d > reach) {
      this.x = lerp(this.x, t.x, 0.55);
      this.y = lerp(this.y, t.y, 0.55);
      this.vx *= 0.4;
      this.vy *= 0.4;
    }

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > FIBER_HISTORY) this.history.shift();
  }

  display() {
    if (this.history.length < 4) return;
    const flicker = 0.85 + noise(this.seed, frameCount * 0.025) * 0.30;
    // CAPA 4 (parte 2) — alpha y peso de las fibras escalan con el pulso.
    const alphaScale = 0.72 + globalPulse * 0.55;
    const heartBoost = 1 + this.heartFalloff * globalPulse * 0.40;

    stroke(this.r, this.g, this.b, this.alpha * flicker * alphaScale * heartBoost);
    strokeWeight(this.weight * (1 + globalPulse * 0.15));
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
   DEBUG  —  comparación referencia ↔ resultado animado.
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

  const tag = DEBUG_MOTION_EXAGGERATED ? "MOTION_EXAGGERATED" : "MOTION_SOFT";
  text(
    `MODO DEBUG · cuerpo base animado + fibras vivas · v401 · ${tag}`,
    width * 0.5,
    24
  );

  // Heartbeat de draw(): texto + punto pulsante. Confirma que draw()
  // efectivamente corre frame a frame. Se quita en la versión final.
  textAlign(LEFT, CENTER);
  textSize(10);
  fill(210, 205, 195, 140);
  text(`frame ${frameCount}`, 16, 24);

  const pulseR = 3 + (Math.sin(frameCount * 0.18) * 0.5 + 0.5) * 4;
  noStroke();
  fill(220, 90, 90, 220);
  circle(120, 24, pulseR * 2);

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
