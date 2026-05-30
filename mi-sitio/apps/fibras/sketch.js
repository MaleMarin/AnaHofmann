/*
 * Anatomía de la Distancia — versión 8 (calibración)
 *
 * MODO DEBUG_VISUAL:
 *   - Muestra UN solo cuerpo generado a la derecha y la referencia
 *     rotada como miniatura a la izquierda, lado a lado.
 *   - Sin pulso fuerte, sin sonido, sin bridges, sin glow, sin campo.
 *   - El único objetivo es verificar que el cuerpo de partículas
 *     se lea como derivado fiel de cuerpo-ref.png.
 *   - SHOW_REFERENCE_OVERLAY puede activar un fantasma del referente
 *     debajo del cuerpo para chequear alineación.
 *
 * MODO ARTÍSTICO (DEBUG_VISUAL = false):
 *   - Dos cuerpos de pie + pulso + bridges + sonido + foco cardíaco.
 *
 * Muestreo:
 *   - density = brightness * 0.65 + saturation * 0.35
 *     → acepta píxeles oscuros pero saturados (la referencia tiene
 *       fibras oscuras coloridas que igual hacen cuerpo).
 *   - El color de cada fibra se hereda del píxel del referente.
 */

// ============ FLAGS DE CALIBRACIÓN ============
const DEBUG_VISUAL          = true;   // referencia | generado lado a lado
const SHOW_REFERENCE_OVERLAY = false; // fantasma del referente debajo
// ===============================================

let bodies = [];
let bridges = [];
let centerField = [];

let bodyRefImg;

// Anclas relativas DENTRO de la imagen YA ROTADA 90° CW
// (cuerpo de pie: cabeza arriba, pies abajo)
// derivadas del referente horizontal donde:
//   cabeza estaba en (0.13, 0.52) → tras rotación CW: (1-0.52, 0.13) = (0.48, 0.13)
//   corazón estaba en (0.26, 0.43) → tras rotación CW: (1-0.43, 0.26) = (0.57, 0.26)
const HEAD_REL  = { x: 0.48, y: 0.13 };
const HEART_REL = { x: 0.57, y: 0.26 };

const QUALITY = 1.0;
const BG_FADE = DEBUG_VISUAL ? 36 : 28;
// densidad necesaria para que el cuerpo se lea como la referencia
const FIBERS_PER_BODY = DEBUG_VISUAL ? 9000 : 5200;
// en debug NO queremos hebras entre cuerpos ni campo central
const BRIDGE_HEART = DEBUG_VISUAL ? 0 : 70;
const BRIDGE_HEAD  = DEBUG_VISUAL ? 0 : 36;
const FIELD_COUNT  = DEBUG_VISUAL ? 0 : 140;

// umbrales de muestreo (en escala 0..255 sobre brightness+saturation mezclados)
const SAMPLE_MIN_DENSITY = 18;
const SAMPLE_ACCEPT_GAIN = 1.20;

let globalPulse = 0;

let bassOsc, subOsc, filterNode;
let soundOn = false;
let audioReady = false;

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

  // en modo debug, escondemos el botón de sonido para no distraer
  if (DEBUG_VISUAL) {
    const btn = document.getElementById("soundToggle");
    if (btn) btn.style.display = "none";
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene();
  background(0);
}

function buildScene() {
  bodies = [];
  bridges = [];
  centerField = [];

  if (DEBUG_VISUAL) {
    // un solo cuerpo en la mitad derecha. La mitad izquierda
    // se reserva para mostrar el referente (miniatura).
    bodies.push(new FiberBody(width * 0.72, height * 0.52, false, 0.0));
  } else {
    // dos cuerpos de pie, separados con aire entre ellos, espejados
    bodies.push(new FiberBody(width * 0.28, height * 0.52, false, 0.0));
    bodies.push(new FiberBody(width * 0.72, height * 0.52, true,  PI * 0.7));
  }

  for (let i = 0; i < floor(BRIDGE_HEART * QUALITY); i++) {
    bridges.push(new BridgeStrand("heart", random(), random(1000)));
  }
  for (let i = 0; i < floor(BRIDGE_HEAD * QUALITY); i++) {
    bridges.push(new BridgeStrand("head", random(), random(1000)));
  }

  for (let i = 0; i < floor(FIELD_COUNT * QUALITY); i++) {
    centerField.push(new FieldWhisper(random(1000)));
  }
}

function draw() {
  background(0, BG_FADE);

  const t = millis() / 1000;
  if (DEBUG_VISUAL) {
    // pulso bajo y constante: el cuerpo respira muy poco
    globalPulse = 0.10;
  } else {
    globalPulse = heartbeatPulse(t);
    applyAudioPulse(globalPulse);
  }

  // fantasma de la referencia debajo del cuerpo (chequeo de alineación)
  if (SHOW_REFERENCE_OVERLAY) {
    drawReferenceOverlay();
  }

  const prev = drawingContext.globalCompositeOperation;
  drawingContext.globalCompositeOperation = "lighter";

  for (const b of bodies) { b.update(); b.display(); }
  for (const b of bridges) { b.update(); b.display(); }
  for (const w of centerField) { w.update(); w.display(); }

  drawingContext.globalCompositeOperation = prev;

  if (DEBUG_VISUAL) {
    drawDebugReferencePanel();
    drawDebugTitle();
  } else {
    drawHeartFocus();
    drawVignette();
    drawTitle();
  }
}

/* =========================================================
   HEARTBEAT
========================================================= */

function heartbeatPulse(t) {
  const period = 0.92;
  const x = (t % period) / period;
  const lub = Math.exp(-Math.pow((x - 0.00) / 0.045, 2));
  const dub = 0.72 * Math.exp(-Math.pow((x - 0.20) / 0.055, 2));
  const base = 0.18;
  return constrain(base + max(lub, dub) * 0.82, 0, 1);
}

function fiberIntensity() {
  return 0.45 + globalPulse * 0.85;
}

/* =========================================================
   AUDIO
========================================================= */

function setupSoundUI() {
  const btn = document.getElementById("soundToggle");
  if (!btn) return;

  btn.addEventListener("click", async () => {
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

function applyAudioPulse(p) {
  if (!soundOn || !audioReady) return;
  const env = pow(p, 1.6);
  bassOsc.amp(env * 0.42, 0.02);
  subOsc.amp(env * 0.18, 0.02);
  filterNode.freq(280 + p * 520);
}

/* =========================================================
   FIBER BODY  —  imagen como mapa de densidad y color
========================================================= */

class FiberBody {
  constructor(cx, cy, mirror, phase) {
    this.cx = cx;
    this.cy = cy;
    this.mirror = mirror;
    this.phase = phase;

    // El referente es horizontal (W > H). Al rotarlo 90° CW para ponerlo
    // de pie, su nuevo aspect (W/H) pasa a ser H_ref / W_ref.
    const aspect = bodyRefImg.height / bodyRefImg.width;

    // priorizamos altura: queremos cuerpos verticales bien legibles
    let h = min(height * 0.86, 900);
    let w = h * aspect;
    const maxW = width * 0.40;
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }

    this.bodyW = w;
    this.bodyH = h;

    this.buildMask();
    this.buildFibers();
  }

  buildMask() {
    const g = createGraphics(floor(this.bodyW), floor(this.bodyH));
    g.pixelDensity(1);
    g.clear();

    // Rotación 90° CW del referente para que el cuerpo quede de pie:
    //   referente original: cabeza a la izquierda → tras CW, cabeza arriba.
    // En el frame rotado, el ancho de la imagen original (W_ref) extiende
    // VERTICALMENTE en g (→ g.height), y la altura (H_ref) extiende
    // HORIZONTALMENTE (→ g.width). Por eso al dibujar pasamos (g.height, g.width).
    g.push();
    g.imageMode(CENTER);
    g.translate(g.width / 2, g.height / 2);
    g.rotate(HALF_PI); // CW en coords con y hacia abajo
    if (this.mirror) {
      // tras la rotación, local-y mapea a global -x → flip local-y = flip global-x
      g.scale(1, -1);
    }
    g.image(bodyRefImg, 0, 0, g.height, g.width);
    g.pop();

    g.loadPixels();
    this.mask = g;

    // Anclas en el frame rotado, espejadas si corresponde
    const hx  = this.mirror ? 1 - HEAD_REL.x  : HEAD_REL.x;
    const hrx = this.mirror ? 1 - HEART_REL.x : HEART_REL.x;
    this.localHead  = { x: hx  * this.bodyW, y: HEAD_REL.y  * this.bodyH };
    this.localHeart = { x: hrx * this.bodyW, y: HEART_REL.y * this.bodyH };
  }

  buildFibers() {
    this.fibers = [];
    const target = floor(FIBERS_PER_BODY * QUALITY);
    const w = this.mask.width;
    const h = this.mask.height;
    const px = this.mask.pixels;

    let attempts = 0;
    const maxAttempts = target * 80;

    while (this.fibers.length < target && attempts < maxAttempts) {
      attempts++;
      const lx = random(w);
      const ly = random(h);
      const idx = (floor(ly) * w + floor(lx)) * 4;
      const r = px[idx];
      const g = px[idx + 1];
      const b = px[idx + 2];

      // brightness y saturation, ambos en escala 0..255
      const brightness = (r + g + b) / 3;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      // chroma simple, escalado a 0..255 → un rojo profundo (80,10,10)
      // tiene saturación alta aunque sea oscuro
      const saturation = maxC > 0 ? ((maxC - minC) / maxC) * 255 : 0;

      // densidad combinada: brillo manda, pero la saturación rescata
      // píxeles oscuros pero coloridos (las hebras de la referencia).
      const density = brightness * 0.65 + saturation * 0.35;
      if (density < SAMPLE_MIN_DENSITY) continue;
      if (random(255) > density * SAMPLE_ACCEPT_GAIN) continue;

      this.fibers.push(new Fiber(this, lx, ly, density, r, g, b));
    }
  }

  motion() {
    const pulse = globalPulse;
    return {
      // sway sutil, vertical predomina (respiración)
      swayX: sin(frameCount * 0.0080 + this.phase) * 3.0,
      swayY: cos(frameCount * 0.0110 + this.phase) * 1.6,
      breath: sin(frameCount * 0.026 + this.phase),
      // expansión muy leve del cuerpo entero con cada latido
      pulseScale: 1 + pulse * 0.038,
      // tilt mínimo, para que la figura siga claramente de pie
      tilt: sin(frameCount * 0.0065 + this.phase) * 0.012,
    };
  }

  toWorld(lx, ly) {
    const m = this.motion();
    // respiración: el cuerpo se ensancha levemente
    const breathX = 1 + m.breath * 0.018;
    const breathY = 1 + m.breath * 0.024;
    const ps = m.pulseScale;

    const ox = (lx - this.bodyW * 0.5) * breathX * ps;
    const oy = (ly - this.bodyH * 0.5) * breathY * ps;

    const a = m.tilt;
    const rx = ox * cos(a) - oy * sin(a);
    const ry = ox * sin(a) + oy * cos(a);

    return {
      x: this.cx + m.swayX + rx,
      y: this.cy + m.swayY + ry,
    };
  }

  heartCenter() { return this.toWorld(this.localHeart.x, this.localHeart.y); }
  headCenter()  { return this.toWorld(this.localHead.x,  this.localHead.y);  }

  update()  { for (const f of this.fibers) f.update(); }
  display() { for (const f of this.fibers) f.display(); }
}

/* =========================================================
   FIBER  —  color heredado del referente
========================================================= */

class Fiber {
  constructor(body, lx, ly, density, pr, pg, pb) {
    this.body = body;
    this.lx = lx;
    this.ly = ly;
    this.seed = random(10000);

    // Color del píxel del referente.
    // En debug: SIN boost, jitter mínimo → fidelidad cromática absoluta.
    // En modo artístico: leve boost para que la imagen "viva" un poco más.
    const boost = DEBUG_VISUAL ? 1.00 : 1.22;
    const jitter = DEBUG_VISUAL ? 6 : 12;
    this.r = constrain(pr * boost + random(-jitter, jitter), 0, 255);
    this.g = constrain(pg * boost + random(-jitter, jitter), 0, 255);
    this.b = constrain(pb * boost + random(-jitter, jitter), 0, 255);

    // Foco cardíaco — solo se usa fuera de debug.
    const dHeart = dist(lx, ly, body.localHeart.x, body.localHeart.y);
    const heartR = min(body.bodyW, body.bodyH) * 0.07;
    this.isHeart = dHeart < heartR;
    this.heartFalloff = DEBUG_VISUAL ? 0 : (this.isHeart ? (1 - dHeart / heartR) : 0);
    this.alphaBoost = 1.0 + this.heartFalloff * 0.18;

    // Física y trazo: en debug los trazos son MÁS PEQUEÑOS y la alpha
    // más baja (compensamos los 9000 fibers para no quemar pantalla).
    if (DEBUG_VISUAL) {
      this.speed = random(0.18, 0.65);
      this.pull = random(0.024, 0.048);
      this.wander = random(0.18, 0.55);
      this.weight = random(0.22, 0.65);
      this.alpha = random(6, 18) * map(density, 30, 255, 0.55, 1.0);
      this.maxDist = random(40, 95);
    } else {
      this.speed = random(0.22, 0.85);
      this.pull = random(0.022, 0.046);
      this.wander = random(0.25, 0.85);
      this.weight = random(0.26, 0.95);
      this.alpha = random(10, 30) * map(density, 30, 255, 0.55, 1.0);
      this.maxDist = random(50, 115);
    }

    const w = body.toWorld(lx, ly);
    this.x = w.x + random(-2, 2);
    this.y = w.y + random(-2, 2);
    this.vx = 0;
    this.vy = 0;

    // historial → trazo de hebra
    this.history = [];
    this.maxHistory = floor(DEBUG_VISUAL ? random(7, 11) : random(9, 14));
    for (let i = 0; i < this.maxHistory; i++) {
      this.history.push({ x: this.x, y: this.y });
    }
  }

  update() {
    const t = this.body.toWorld(this.lx, this.ly);

    const ang =
      noise(this.x * 0.0028, this.y * 0.0028, frameCount * 0.0050 + this.seed) *
      TWO_PI * 2.2;

    const flowX = cos(ang) * this.speed * 0.28;
    const flowY = sin(ang) * this.speed * 0.28;

    const jitterX = (noise(this.seed + 10, frameCount * 0.020) - 0.5) * this.wander;
    const jitterY = (noise(this.seed + 30, frameCount * 0.020) - 0.5) * this.wander;

    this.vx = this.vx * 0.86 + flowX + (t.x - this.x) * this.pull + jitterX;
    this.vy = this.vy * 0.86 + flowY + (t.y - this.y) * this.pull + jitterY;

    this.x += this.vx;
    this.y += this.vy;

    const d = dist(this.x, this.y, t.x, t.y);
    if (d > this.maxDist) {
      this.x = lerp(this.x, t.x, 0.55);
      this.y = lerp(this.y, t.y, 0.55);
      this.vx *= 0.4;
      this.vy *= 0.4;
    }

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  display() {
    if (this.history.length < 4) return;

    const flicker = 0.82 + noise(this.seed, frameCount * 0.026) * 0.32;
    // intensidad GLOBAL: todo el cuerpo se enciende con el latido
    const intensity = fiberIntensity();
    // saturación: durante el peak, los colores se sienten más vivos
    const satBoost = 1 + globalPulse * 0.22;
    // empuje sutil de corazón, no dominante
    const heartBoost = 1 + this.heartFalloff * globalPulse * 0.35;

    const r = constrain(this.r * satBoost, 0, 255);
    const g = constrain(this.g * satBoost, 0, 255);
    const b = constrain(this.b * satBoost, 0, 255);

    stroke(
      r, g, b,
      this.alpha * this.alphaBoost * flicker * intensity * heartBoost
    );
    // grosor: respira con TODO el cuerpo; corazón aporta apenas un poco más
    strokeWeight(this.weight * (1 + globalPulse * 0.18 + this.heartFalloff * globalPulse * 0.12));
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
   BRIDGE STRANDS
========================================================= */

class BridgeStrand {
  constructor(kind, t, seed) {
    this.kind = kind;
    this.t = t;
    this.seed = seed;
    this.vx = 0;
    this.vy = 0;
    this.history = [];

    const heartish = kind === "heart";
    // paleta variada (no solo rosa) para que las hebras sutiles
    // entre cuerpos respeten la riqueza cromática
    this.col = heartish
      ? random([[210,80,180],[180,90,210],[120,160,230],[230,150,90]])
      : random([[120,140,210],[160,120,220],[200,180,140],[120,200,210]]);

    this.alpha = heartish ? random(3, 10) : random(2, 7);
    this.weight = heartish ? random(0.22, 0.55) : random(0.18, 0.42);
    this.speed = random(0.18, 0.55);
    this.pull = random(0.028, 0.055);

    const p = this.target();
    this.x = p.x;
    this.y = p.y;
    for (let i = 0; i < 6; i++) this.history.push({ x: this.x, y: this.y });
  }

  target() {
    const left = bodies[0];
    const right = bodies[1];
    const a = this.kind === "heart" ? left.heartCenter()  : left.headCenter();
    const b = this.kind === "heart" ? right.heartCenter() : right.headCenter();

    const lift = this.kind === "heart" ? 14 : -68;
    const bow  = this.kind === "heart" ? 28 :  54;

    const c1 = {
      x: lerp(a.x, b.x, 0.32),
      y: lerp(a.y, b.y, 0.32) + lift + sin(frameCount * 0.012 + this.seed) * bow,
    };
    const c2 = {
      x: lerp(a.x, b.x, 0.68),
      y: lerp(a.y, b.y, 0.68) + lift + cos(frameCount * 0.012 + this.seed) * bow,
    };

    const bx = bezierPoint(a.x, c1.x, c2.x, b.x, this.t);
    const by = bezierPoint(a.y, c1.y, c2.y, b.y, this.t);

    return {
      x: bx + (noise(this.seed + 40, frameCount * 0.010) - 0.5) * 16,
      y: by + (noise(this.seed + 80, frameCount * 0.010) - 0.5) * 16,
    };
  }

  update() {
    const t = this.target();
    const ang =
      noise(this.x * 0.003, this.y * 0.003, frameCount * 0.007 + this.seed) *
      TWO_PI * 2.2;

    const flowX = cos(ang) * this.speed * 0.28;
    const flowY = sin(ang) * this.speed * 0.28;

    this.vx = this.vx * 0.82 + flowX + (t.x - this.x) * this.pull;
    this.vy = this.vy * 0.82 + flowY + (t.y - this.y) * this.pull;

    this.x += this.vx;
    this.y += this.vy;

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > 6) this.history.shift();
  }

  display() {
    if (this.history.length < 4) return;
    const flick = 0.80 + noise(this.seed, frameCount * 0.022) * 0.30;
    // las hebras entre cuerpos pulsan, pero sin acumular brillo
    const heartBoost = this.kind === "heart"
      ? 1 + globalPulse * 0.35
      : 1 + globalPulse * 0.15;

    stroke(
      this.col[0], this.col[1], this.col[2],
      this.alpha * flick * fiberIntensity() * heartBoost
    );
    strokeWeight(this.weight);
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
   FIELD
========================================================= */

class FieldWhisper {
  constructor(seed) {
    this.seed = seed;
    const p = sampleSoftEllipse(
      min(width * 0.10, 120),
      min(height * 0.14, 130),
      0.45
    );
    this.ax = width * 0.5 + p.x;
    this.ay = height * 0.50 + p.y;

    this.x = this.ax;
    this.y = this.ay;
    this.vx = 0;
    this.vy = 0;

    this.history = [];
    for (let i = 0; i < 5; i++) this.history.push({ x: this.x, y: this.y });

    // paleta múltiple para no uniformizar el centro a rosa
    this.col = random([
      [200, 120, 200],
      [150, 130, 220],
      [120, 180, 220],
      [220, 180, 130],
      [200, 200, 200],
    ]);

    this.alpha = random(2, 7);
    this.weight = random(0.18, 0.45);
    this.speed = random(0.25, 0.80);
    this.pull = random(0.010, 0.024);
    this.maxDist = random(55, 130);
  }

  target() {
    const leftH = bodies[0].heartCenter();
    const rightH = bodies[1].heartCenter();

    const pulse =
      (sin(frameCount * 0.027 + bodies[0].phase) +
        sin(frameCount * 0.027 + bodies[1].phase)) * 0.5;

    return {
      x: width * 0.5 + (this.ax - width * 0.5) * (1 + pulse * 0.06),
      y:
        height * 0.50 +
        (this.ay - height * 0.50) * (1 + pulse * 0.08) +
        sin(frameCount * 0.010 + this.seed) * 6 +
        map(abs(leftH.x - rightH.x), 0, width, 0, 8),
    };
  }

  update() {
    const t = this.target();
    const ang =
      noise(this.x * 0.0034, this.y * 0.0034, frameCount * 0.010 + this.seed) *
      TWO_PI * 3.0;

    const flowX = cos(ang) * this.speed * 0.32;
    const flowY = sin(ang) * this.speed * 0.32;

    const jitX = (noise(this.seed + 9, frameCount * 0.03) - 0.5) * 0.55;
    const jitY = (noise(this.seed + 19, frameCount * 0.03) - 0.5) * 0.55;

    this.vx = this.vx * 0.82 + flowX + (t.x - this.x) * this.pull + jitX;
    this.vy = this.vy * 0.82 + flowY + (t.y - this.y) * this.pull + jitY;

    this.x += this.vx;
    this.y += this.vy;

    const d = dist(this.x, this.y, t.x, t.y);
    if (d > this.maxDist) {
      this.x = lerp(this.x, t.x, 0.55);
      this.y = lerp(this.y, t.y, 0.55);
      this.vx *= 0.4;
      this.vy *= 0.4;
    }

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > 5) this.history.shift();
  }

  display() {
    if (this.history.length < 4) return;
    stroke(
      this.col[0], this.col[1], this.col[2],
      this.alpha * (0.6 + globalPulse * 0.8)
    );
    strokeWeight(this.weight);
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
   HEART FOCUS  —  apenas un foco íntimo, NO una nube
   Reemplaza al antiguo drawHeartFlash (la mancha rosa gigante).
========================================================= */

function drawHeartFocus() {
  if (globalPulse < 0.45) return;

  drawingContext.save();
  drawingContext.globalCompositeOperation = "lighter";

  for (const body of bodies) {
    const h = body.heartCenter();
    // radio en proporción al cuerpo, no a la pantalla → siempre íntimo
    const baseR = min(body.bodyW, body.bodyH) * 0.045;
    const radius = baseR + globalPulse * baseR * 0.6;
    const grad = drawingContext.createRadialGradient(h.x, h.y, 0, h.x, h.y, radius);
    const a = (globalPulse - 0.45) * 0.22; // muy bajo
    grad.addColorStop(0.00, `rgba(255, 200, 220, ${a})`);
    grad.addColorStop(0.45, `rgba(220, 140, 200, ${a * 0.45})`);
    grad.addColorStop(1.00, "rgba(0,0,0,0)");
    drawingContext.fillStyle = grad;
    drawingContext.fillRect(h.x - radius, h.y - radius, radius * 2, radius * 2);
  }

  drawingContext.restore();
}

/* =========================================================
   HELPERS
========================================================= */

function sampleSoftEllipse(rx, ry, fuzz = 0.35) {
  const a = random(TWO_PI);
  let r = sqrt(random());
  if (random() < fuzz) r = random(0.72, 1.16);
  return { x: cos(a) * r * rx, y: sin(a) * r * ry };
}

function drawVignette() {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const inner = min(width, height) * 0.20;
  const outer = max(width, height) * 0.82;

  const grad = drawingContext.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0.00, "rgba(0,0,0,0)");
  grad.addColorStop(0.60, "rgba(0,0,0,0.10)");
  grad.addColorStop(0.82, "rgba(0,0,0,0.48)");
  grad.addColorStop(1.00, "rgba(0,0,0,0.88)");

  drawingContext.fillStyle = grad;
  drawingContext.fillRect(0, 0, width, height);
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

/* =========================================================
   DEBUG / CALIBRACIÓN
   - drawDebugReferencePanel: miniatura del referente (rotada
     90° CW para ser comparable con el cuerpo generado).
   - drawReferenceOverlay: fantasma del referente debajo del
     cuerpo para chequear alineación exacta.
   - drawDebugTitle: barra superior con etiquetas.
========================================================= */

function drawDebugReferencePanel() {
  if (!bodies.length) return;
  const body = bodies[0];

  // misma altura y ancho que el cuerpo generado, posicionada en la
  // mitad izquierda. Eje vertical de pie, igual que el cuerpo.
  const cx = width * 0.25;
  const cy = height * 0.52;
  const tW = body.bodyW;
  const tH = body.bodyH;

  push();
  drawingContext.globalCompositeOperation = "source-over";

  // marco sutil para encuadrar la miniatura
  noFill();
  stroke(255, 22);
  strokeWeight(1);
  rect(cx - tW / 2 - 4, cy - tH / 2 - 4, tW + 8, tH + 8, 4);

  // referente rotado 90° CW para que la cabeza quede arriba
  push();
  imageMode(CENTER);
  translate(cx, cy);
  rotate(HALF_PI);
  image(bodyRefImg, 0, 0, tH, tW);
  pop();

  // etiquetas
  noStroke();
  fill(210, 205, 195, 150);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  textSize(11);
  text("REFERENCIA", cx, cy - tH / 2 - 20);
  text("GENERADO",  width * 0.72, cy - tH / 2 - 20);

  // anclas de cabeza y corazón en la referencia (para debug)
  const hx = HEAD_REL.x  * tW - tW / 2;
  const hy = HEAD_REL.y  * tH - tH / 2;
  const rx = HEART_REL.x * tW - tW / 2;
  const ry = HEART_REL.y * tH - tH / 2;
  fill(255, 255, 255, 80);
  noStroke();
  circle(cx + hx, cy + hy, 5);
  fill(255, 120, 160, 110);
  circle(cx + rx, cy + ry, 5);

  pop();
}

function drawReferenceOverlay() {
  // fantasma de la referencia debajo del cuerpo generado, alineado
  // al sistema de coordenadas REAL del cuerpo (con su respiración).
  push();
  drawingContext.globalCompositeOperation = "source-over";
  imageMode(CENTER);
  for (const body of bodies) {
    push();
    // alineamos al centro local (sin respiración) para no introducir
    // ruido al chequeo de calibración.
    translate(body.cx, body.cy);
    rotate(HALF_PI);
    if (body.mirror) scale(1, -1);
    tint(255, 38); // muy tenue
    image(bodyRefImg, 0, 0, body.bodyH, body.bodyW);
    noTint();
    pop();
  }
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
    "MODO DEBUG · CALIBRACIÓN DE FORMA · referencia ←→ cuerpo generado",
    width * 0.5,
    24
  );
  pop();
}
