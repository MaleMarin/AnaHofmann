/*
 * Anatomía de la Distancia
 * Versión p5.js basada en microfibras vibrantes
 * Dos cuerpos abstractos construidos con miles de hebras cortas
 * No usa Bezier largas para dibujar el cuerpo.
 */

let bodies = [];
let interference = [];
let bridgeFibers = [];

// =======================
// AJUSTES PRINCIPALES
// =======================
const CLEAR_ALPHA = 18;        // más bajo = más estela
const BODY_GAP_RATIO = 0.22;   // separación entre cuerpos
const INTERFERENCE_COUNT = 900;
const HEART_BRIDGE_COUNT = 220;
const HEAD_BRIDGE_COUNT = 140;
const USE_LIGHTER_BLEND = true;

// si te anda lento, baja primero estos números en las regiones del cuerpo

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  strokeCap(ROUND);
  noFill();
  initScene();
  background(0);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  initScene();
  background(0);
}

function initScene() {
  bodies = [];
  interference = [];
  bridgeFibers = [];

  const gap = min(width * BODY_GAP_RATIO, 290);
  const centerY = height * 0.57;

  // inward = hacia el centro
  bodies.push(new FiberBody(width * 0.5 - gap, centerY,  1, 0.0));
  bodies.push(new FiberBody(width * 0.5 + gap, centerY, -1, PI));

  for (let i = 0; i < INTERFERENCE_COUNT; i++) {
    interference.push(new InterferenceParticle());
  }

  for (let i = 0; i < HEART_BRIDGE_COUNT; i++) {
    bridgeFibers.push(new BridgeFiber("heart", random()));
  }

  for (let i = 0; i < HEAD_BRIDGE_COUNT; i++) {
    bridgeFibers.push(new BridgeFiber("head", random()));
  }
}

function draw() {
  background(0, CLEAR_ALPHA);

  const prevComp = drawingContext.globalCompositeOperation;
  if (USE_LIGHTER_BLEND) drawingContext.globalCompositeOperation = "lighter";

  // cuerpos
  for (const body of bodies) {
    body.update();
    body.display();
  }

  // conexiones suaves entre cuerpos
  for (const b of bridgeFibers) {
    b.update();
    b.display();
  }

  // interferencia emocional / ruido central
  for (const p of interference) {
    p.update();
    p.display();
  }

  drawingContext.globalCompositeOperation = prevComp;

  drawVignette();
}

// =======================
// BODY
// =======================

class FiberBody {
  constructor(cx, cy, inward, phase) {
    this.cx = cx;
    this.cy = cy;
    this.inward = inward; // 1 = hacia derecha, -1 = hacia izquierda
    this.phase = phase;

    // regiones anatómicas difusas
    this.regions = [
      {
        key: "head",
        x: 0, y: -280,
        rx: 40, ry: 58,
        angle: radians(random(-3, 3)),
        color: [255, 95, 160],
        count: 260,
        pull: 0.022,
        alphaMin: 10, alphaMax: 26,
        weightMin: 0.45, weightMax: 1.05
      },
      {
        key: "neck",
        x: 0, y: -205,
        rx: 18, ry: 32,
        angle: 0,
        color: [255, 145, 70],
        count: 90,
        pull: 0.028,
        alphaMin: 8, alphaMax: 18,
        weightMin: 0.35, weightMax: 0.85
      },
      {
        key: "chest",
        x: 0, y: -122,
        rx: 76, ry: 58,
        angle: 0,
        color: [110, 220, 255],
        count: 430,
        pull: 0.020,
        alphaMin: 8, alphaMax: 20,
        weightMin: 0.35, weightMax: 0.90
      },
      {
        key: "heart",
        x: inward * 23, y: -120,
        rx: 22, ry: 22,
        angle: 0,
        color: [255, 70, 105],
        count: 190,
        pull: 0.030,
        alphaMin: 16, alphaMax: 38,
        weightMin: 0.55, weightMax: 1.20
      },
      {
        key: "abdomen",
        x: 0, y: -18,
        rx: 66, ry: 72,
        angle: 0,
        color: [195, 90, 255],
        count: 330,
        pull: 0.019,
        alphaMin: 8, alphaMax: 18,
        weightMin: 0.35, weightMax: 0.90
      },
      {
        key: "pelvis",
        x: 0, y: 88,
        rx: 58, ry: 48,
        angle: 0,
        color: [255, 165, 70],
        count: 190,
        pull: 0.020,
        alphaMin: 8, alphaMax: 16,
        weightMin: 0.35, weightMax: 0.90
      },
      {
        key: "armL",
        x: -88, y: -58,
        rx: 24, ry: 154,
        angle: radians(4),
        color: [120, 205, 255],
        count: 340,
        pull: 0.015,
        alphaMin: 6, alphaMax: 16,
        weightMin: 0.30, weightMax: 0.80
      },
      {
        key: "armR",
        x: 88, y: -58,
        rx: 24, ry: 154,
        angle: radians(-4),
        color: [120, 205, 255],
        count: 340,
        pull: 0.015,
        alphaMin: 6, alphaMax: 16,
        weightMin: 0.30, weightMax: 0.80
      },
      {
        key: "legL",
        x: -30, y: 258,
        rx: 26, ry: 172,
        angle: radians(2),
        color: [245, 245, 255],
        count: 430,
        pull: 0.014,
        alphaMin: 6, alphaMax: 16,
        weightMin: 0.28, weightMax: 0.78
      },
      {
        key: "legR",
        x: 30, y: 258,
        rx: 26, ry: 172,
        angle: radians(-2),
        color: [255, 218, 85],
        count: 430,
        pull: 0.014,
        alphaMin: 6, alphaMax: 16,
        weightMin: 0.28, weightMax: 0.78
      }
    ];

    this.particles = [];
    this.buildParticles();
  }

  buildParticles() {
    this.particles = [];
    for (const region of this.regions) {
      for (let i = 0; i < region.count; i++) {
        this.particles.push(new FiberParticle(this, region));
      }
    }
  }

  motion() {
    return {
      swayX: sin(frameCount * 0.011 + this.phase) * 6.5,
      swayY: sin(frameCount * 0.017 + this.phase) * 2.0,
      breath: sin(frameCount * 0.032 + this.phase),
      pulse: 1 + sin(frameCount * 0.055 + this.phase) * 0.10
    };
  }

  regionCenter(key) {
    const r = this.regions.find(reg => reg.key === key);
    const m = this.motion();

    let extraX = 0;
    let extraY = 0;

    if (key === "heart") {
      extraX = this.inward * 4 * (m.pulse - 1);
      extraY = -2 * (m.pulse - 1);
    }

    return {
      x: this.cx + m.swayX + r.x + extraX,
      y: this.cy + m.swayY + r.y + extraY
    };
  }

  heartCenter() {
    return this.regionCenter("heart");
  }

  headCenter() {
    return this.regionCenter("head");
  }

  update() {
    for (const p of this.particles) p.update();
  }

  display() {
    for (const p of this.particles) p.display();
  }
}

// =======================
// BODY PARTICLE
// =======================

class FiberParticle {
  constructor(body, region) {
    this.body = body;
    this.region = region;

    const base = sampleEllipse(region.rx, region.ry, 0.30);

    // algunos se salen un poco para efecto pelusa/lana
    const fuzzMult = random() < 0.22 ? random(1.02, 1.28) : 1.0;

    this.anchorX = base.x * fuzzMult;
    this.anchorY = base.y * fuzzMult;

    this.seed = random(1000);
    this.speed = random(0.35, 1.25);
    this.pull = region.pull * random(0.82, 1.18);
    this.jitter = random(0.15, 0.65);
    this.alpha = random(region.alphaMin, region.alphaMax);
    this.weight = random(region.weightMin, region.weightMax);

    const cJ = 18;
    this.r = constrain(region.color[0] + random(-cJ, cJ), 0, 255);
    this.g = constrain(region.color[1] + random(-cJ, cJ), 0, 255);
    this.b = constrain(region.color[2] + random(-cJ, cJ), 0, 255);

    const t = this.target();
    this.x = t.x + random(-2, 2);
    this.y = t.y + random(-2, 2);
    this.px = this.x;
    this.py = this.y;

    this.maxDist = max(region.rx, region.ry) * random(1.7, 2.3);
  }

  target() {
    const m = this.body.motion();

    let scaleX = 1 + m.breath * 0.028;
    let scaleY = 1 + m.breath * 0.016;

    if (this.region.key === "heart") {
      scaleX *= m.pulse;
      scaleY *= m.pulse;
    }

    const lx = this.anchorX * scaleX;
    const ly = this.anchorY * scaleY;

    const a = this.region.angle + sin(frameCount * 0.012 + this.seed) * 0.018;

    const rx = lx * cos(a) - ly * sin(a);
    const ry = lx * sin(a) + ly * cos(a);

    let tx = this.body.cx + m.swayX + this.region.x + rx;
    let ty = this.body.cy + m.swayY + this.region.y + ry;

    if (this.region.key === "heart") {
      tx += this.body.inward * 4 * (m.pulse - 1);
      ty -= 2 * (m.pulse - 1);
    }

    return { x: tx, y: ty };
  }

  update() {
    this.px = this.x;
    this.py = this.y;

    const t = this.target();

    const ang = noise(
      this.x * 0.0026,
      this.y * 0.0026,
      frameCount * 0.006 + this.seed
    ) * TWO_PI * 3.0;

    const flowX = cos(ang) * this.speed;
    const flowY = sin(ang) * this.speed;

    const pullX = (t.x - this.x) * this.pull;
    const pullY = (t.y - this.y) * this.pull;

    const jitterX = (noise(this.seed + 50, frameCount * 0.02) - 0.5) * this.jitter;
    const jitterY = (noise(this.seed + 150, frameCount * 0.02) - 0.5) * this.jitter;

    this.x += flowX + pullX + jitterX;
    this.y += flowY + pullY + jitterY;

    const d = dist(this.x, this.y, t.x, t.y);
    if (d > this.maxDist) {
      this.x = t.x + random(-3, 3);
      this.y = t.y + random(-3, 3);
      this.px = this.x;
      this.py = this.y;
    }
  }

  display() {
    const flicker = 0.85 + sin(frameCount * 0.03 + this.seed * 7.0) * 0.15;
    stroke(this.r, this.g, this.b, this.alpha * flicker);
    strokeWeight(this.weight);
    line(this.px, this.py, this.x, this.y);
  }
}

// =======================
// BRIDGES ENTRE CUERPOS
// =======================

class BridgeFiber {
  constructor(kind, t) {
    this.kind = kind;     // "heart" o "head"
    this.t = t;
    this.seed = random(1000);

    this.offX = random(-10, 10);
    this.offY = random(-10, 10);

    this.x = width * 0.5;
    this.y = height * 0.5;
    this.px = this.x;
    this.py = this.y;

    this.speed = random(0.2, 0.9);
    this.pull = random(0.025, 0.055);

    if (kind === "heart") {
      this.col = [255, 55, 130];
      this.alpha = random(8, 18);
      this.weight = random(0.30, 0.85);
    } else {
      this.col = [145, 90, 190];
      this.alpha = random(3, 10);
      this.weight = random(0.25, 0.70);
    }

    const t0 = this.target();
    this.x = t0.x;
    this.y = t0.y;
    this.px = this.x;
    this.py = this.y;
  }

  curvePoints() {
    const left = bodies[0];
    const right = bodies[1];

    let p0, p3, lift;

    if (this.kind === "heart") {
      p0 = left.heartCenter();
      p3 = right.heartCenter();
      lift = 14;
    } else {
      p0 = left.headCenter();
      p3 = right.headCenter();
      lift = -85;
    }

    const midX = (p0.x + p3.x) * 0.5;
    const midY = (p0.y + p3.y) * 0.5;

    const spread = abs(p3.x - p0.x) * 0.20;

    const p1 = {
      x: lerp(p0.x, midX, 0.55) - spread * 0.15,
      y: midY + lift + sin(frameCount * 0.013 + this.seed) * 9
    };

    const p2 = {
      x: lerp(p3.x, midX, 0.55) + spread * 0.15,
      y: midY + lift + cos(frameCount * 0.012 + this.seed) * 9
    };

    return { p0, p1, p2, p3 };
  }

  target() {
    const { p0, p1, p2, p3 } = this.curvePoints();

    const bx = bezierPoint(p0.x, p1.x, p2.x, p3.x, this.t);
    const by = bezierPoint(p0.y, p1.y, p2.y, p3.y, this.t);

    const nX = (noise(this.seed + 12, frameCount * 0.01) - 0.5) * 18;
    const nY = (noise(this.seed + 89, frameCount * 0.01) - 0.5) * 18;

    return {
      x: bx + this.offX + nX,
      y: by + this.offY + nY
    };
  }

  update() {
    this.px = this.x;
    this.py = this.y;

    const t = this.target();

    const ang = noise(
      this.x * 0.003,
      this.y * 0.003,
      frameCount * 0.008 + this.seed
    ) * TWO_PI * 2.0;

    const flowX = cos(ang) * this.speed;
    const flowY = sin(ang) * this.speed;

    this.x += flowX + (t.x - this.x) * this.pull;
    this.y += flowY + (t.y - this.y) * this.pull;
  }

  display() {
    const flick = 0.85 + sin(frameCount * 0.03 + this.seed * 5.0) * 0.15;
    stroke(this.col[0], this.col[1], this.col[2], this.alpha * flick);
    strokeWeight(this.weight);
    line(this.px, this.py, this.x, this.y);
  }
}

// =======================
// INTERFERENCIA CENTRAL
// =======================

class InterferenceParticle {
  constructor() {
    this.seed = random(1000);

    const base = sampleEllipse(min(width * 0.08, 120), min(height * 0.12, 120), 0.25);

    this.anchorX = base.x;
    this.anchorY = base.y;

    this.x = width * 0.5 + base.x;
    this.y = height * 0.54 + base.y;
    this.px = this.x;
    this.py = this.y;

    const palette = [
      [255, 50, 120],
      [190, 100, 255],
      [130, 200, 255],
      [255, 140, 190]
    ];
    this.col = random(palette);

    this.alpha = random(4, 14);
    this.weight = random(0.25, 0.75);
    this.speed = random(0.3, 1.0);
    this.pull = random(0.010, 0.024);
  }

  target() {
    const breathMix =
      (sin(frameCount * 0.025 + bodies[0].phase) +
       sin(frameCount * 0.025 + bodies[1].phase)) * 0.5;

    return {
      x: width * 0.5 + this.anchorX * (1 + breathMix * 0.08),
      y: height * 0.54 + this.anchorY * (1 + breathMix * 0.05)
    };
  }

  update() {
    this.px = this.x;
    this.py = this.y;

    const t = this.target();

    const ang = noise(
      this.x * 0.0032,
      this.y * 0.0032,
      frameCount * 0.010 + this.seed
    ) * TWO_PI * 3.0;

    const flowX = cos(ang) * this.speed;
    const flowY = sin(ang) * this.speed;

    const jitterX = (noise(this.seed + 10, frameCount * 0.03) - 0.5) * 0.7;
    const jitterY = (noise(this.seed + 20, frameCount * 0.03) - 0.5) * 0.7;

    this.x += flowX + (t.x - this.x) * this.pull + jitterX;
    this.y += flowY + (t.y - this.y) * this.pull + jitterY;
  }

  display() {
    stroke(this.col[0], this.col[1], this.col[2], this.alpha);
    strokeWeight(this.weight);
    line(this.px, this.py, this.x, this.y);
  }
}

// =======================
// HELPERS
// =======================

function sampleEllipse(rx, ry, edgeBias = 0.25) {
  let a = random(TWO_PI);
  let r = sqrt(random());

  if (random() < edgeBias) {
    r = lerp(r, 1.0, random(0.35, 0.92));
  }

  return {
    x: cos(a) * r * rx,
    y: sin(a) * r * ry
  };
}

function drawVignette() {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rMin = min(width, height) * 0.18;
  const rMax = max(width, height) * 0.80;

  const grad = drawingContext.createRadialGradient(cx, cy, rMin, cx, cy, rMax);
  grad.addColorStop(0.00, "rgba(0,0,0,0)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.18)");
  grad.addColorStop(0.82, "rgba(0,0,0,0.58)");
  grad.addColorStop(1.00, "rgba(0,0,0,0.90)");

  drawingContext.fillStyle = grad;
  drawingContext.fillRect(0, 0, width, height);
}
