/*
 * Anatomía de la Distancia — versión 4
 * Cuerpos construidos desde una máscara invisible
 * p5.js
 */

let leftBody, rightBody;
let bridgeStrands = [];
let fieldNoise = [];

const BODY_SEPARATION = 230;
const BG_ALPHA = 34;      // menor = más estela
const BODY_PARTICLES = 2600;
const BRIDGE_COUNT = 180;
const FIELD_COUNT = 420;
const USE_LIGHTER = true;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noFill();
  strokeCap(ROUND);
  strokeJoin(ROUND);
  buildScene();
  background(0);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene();
  background(0);
}

function buildScene() {
  const cy = height * 0.56;

  leftBody = new MaskBody(width * 0.5 - BODY_SEPARATION, cy, 1, 0.0);
  rightBody = new MaskBody(width * 0.5 + BODY_SEPARATION, cy, -1, PI * 0.8);

  bridgeStrands = [];
  for (let i = 0; i < BRIDGE_COUNT; i++) {
    bridgeStrands.push(new BridgeFiber(random(), random(1000), random() < 0.7 ? "heart" : "head"));
  }

  fieldNoise = [];
  for (let i = 0; i < FIELD_COUNT; i++) {
    fieldNoise.push(new FieldFiber(random(1000)));
  }
}

function draw() {
  background(0, BG_ALPHA);

  const prevComp = drawingContext.globalCompositeOperation;
  if (USE_LIGHTER) drawingContext.globalCompositeOperation = "lighter";

  leftBody.update();
  rightBody.update();

  leftBody.display();
  rightBody.display();

  for (const b of bridgeStrands) {
    b.update();
    b.display();
  }

  for (const f of fieldNoise) {
    f.update();
    f.display();
  }

  drawingContext.globalCompositeOperation = prevComp;

  drawVignette();
  drawTitle();
}

/* =========================================================
   MASK BODY
========================================================= */

class MaskBody {
  constructor(cx, cy, facing, phase) {
    this.cx = cx;
    this.cy = cy;
    this.facing = facing;   // 1 izquierda mirando al centro, -1 derecha mirando al centro
    this.phase = phase;

    this.scale = min(width, height) / 900;
    this.maskG = createGraphics(320 * this.scale, 760 * this.scale);
    this.maskG.pixelDensity(1);

    this.buildMask();

    this.particles = [];
    this.createParticles();
  }

  buildMask() {
    const g = this.maskG;
    g.clear();
    g.noStroke();
    g.fill(255);

    const w = g.width;
    const h = g.height;
    const cx = w * 0.5;

    // cabeza
    g.ellipse(cx, h * 0.12, w * 0.20, h * 0.11);

    // cuello
    g.ellipse(cx, h * 0.20, w * 0.08, h * 0.05);

    // pecho / torso superior
    g.ellipse(cx, h * 0.31, w * 0.42, h * 0.16);

    // abdomen
    g.ellipse(cx, h * 0.45, w * 0.34, h * 0.20);

    // pelvis
    g.ellipse(cx, h * 0.58, w * 0.26, h * 0.10);

    // brazo externo
    g.push();
    g.translate(cx - this.facing * w * 0.22, h * 0.38);
    g.rotate(radians(-7 * this.facing));
    g.ellipse(0, 0, w * 0.12, h * 0.34);
    g.pop();

    // brazo interno
    g.push();
    g.translate(cx + this.facing * w * 0.16, h * 0.37);
    g.rotate(radians(10 * this.facing));
    g.ellipse(0, 0, w * 0.09, h * 0.26);
    g.pop();

    // piernas
    g.push();
    g.translate(cx - w * 0.055, h * 0.80);
    g.rotate(radians(-2));
    g.ellipse(0, 0, w * 0.10, h * 0.32);
    g.pop();

    g.push();
    g.translate(cx + w * 0.055, h * 0.80);
    g.rotate(radians(2));
    g.ellipse(0, 0, w * 0.10, h * 0.32);
    g.pop();

    // fusionar un poco con shapes intermedias
    g.ellipse(cx, h * 0.67, w * 0.18, h * 0.12);
  }

  motion() {
    return {
      swayX: sin(frameCount * 0.010 + this.phase) * 4.5,
      swayY: cos(frameCount * 0.014 + this.phase) * 1.6,
      breath: sin(frameCount * 0.028 + this.phase),
      pulse: 1 + sin(frameCount * 0.060 + this.phase) * 0.13
    };
  }

  localToWorld(lx, ly) {
    const m = this.motion();
    return {
      x: this.cx + m.swayX + lx,
      y: this.cy + m.swayY + ly
    };
  }

  worldHeart() {
    const m = this.motion();
    return {
      x: this.cx + m.swayX + this.facing * 14 * this.scale + this.facing * 3 * (m.pulse - 1),
      y: this.cy + m.swayY - 142 * this.scale - 2 * (m.pulse - 1)
    };
  }

  worldHead() {
    const m = this.motion();
    return {
      x: this.cx + m.swayX,
      y: this.cy + m.swayY - 265 * this.scale
    };
  }

  createParticles() {
    this.particles = [];

    const w = this.maskG.width;
    const h = this.maskG.height;
    const cx = w * 0.5;
    const cy = h * 0.48;

    let attempts = 0;
    while (this.particles.length < BODY_PARTICLES && attempts < BODY_PARTICLES * 30) {
      attempts++;

      const px = random(w);
      const py = random(h);

      const a = this.maskG.get(floor(px), floor(py))[3];
      if (a < 10) continue;

      const lx = px - cx;
      const ly = py - cy;

      const col = this.colorForLocal(lx, ly);

      this.particles.push(new BodyFiber(this, lx, ly, col, random(1000)));
    }
  }

  colorForLocal(lx, ly) {
    // mapeo vertical por zonas internas
    if (ly < -185 * this.scale) {
      return random([
        [255, 75, 150],
        [255, 110, 80],
        [220, 50, 130]
      ]);
    }

    // corazón
    const hx = this.facing * 14 * this.scale;
    const hy = -142 * this.scale;
    const dHeart = dist(lx, ly, hx, hy);
    if (dHeart < 24 * this.scale) {
      return random([
        [255, 55, 95],
        [255, 110, 145],
        [255, 180, 190]
      ]);
    }

    // pecho
    if (ly < -70 * this.scale) {
      return random([
        [95, 220, 245],
        [85, 255, 185],
        [145, 210, 255]
      ]);
    }

    // abdomen
    if (ly < 95 * this.scale) {
      return random([
        [180, 85, 250],
        [155, 70, 220],
        [255, 135, 70]
      ]);
    }

    // piernas / zona baja
    return random([
      [245, 245, 255],
      [255, 220, 80],
      [105, 175, 255]
    ]);
  }

  update() {
    for (const p of this.particles) p.update();
  }

  display() {
    for (const p of this.particles) p.display();
  }
}

/* =========================================================
   BODY FIBER
========================================================= */

class BodyFiber {
  constructor(body, ax, ay, col, seed) {
    this.body = body;
    this.ax = ax;
    this.ay = ay;
    this.seed = seed;

    this.r = constrain(col[0] + random(-16, 16), 0, 255);
    this.g = constrain(col[1] + random(-16, 16), 0, 255);
    this.b = constrain(col[2] + random(-16, 16), 0, 255);

    this.alpha = random(7, 26);
    this.weight = random(0.22, 0.90);
    this.pull = random(0.016, 0.040);
    this.speed = random(0.18, 0.70);
    this.maxDist = random(18, 42) * this.body.scale;

    const start = this.anchorWorld();
    this.x = start.x + random(-2, 2);
    this.y = start.y + random(-2, 2);
    this.vx = 0;
    this.vy = 0;

    this.history = [];
    for (let i = 0; i < 6; i++) {
      this.history.push({ x: this.x, y: this.y });
    }
  }

  anchorWorld() {
    const m = this.body.motion();

    let lx = this.ax * (1 + m.breath * 0.018);
    let ly = this.ay * (1 + m.breath * 0.028);

    // pulso más evidente cerca del corazón
    const heartLX = this.body.facing * 14 * this.body.scale;
    const heartLY = -142 * this.body.scale;
    const dHeart = dist(this.ax, this.ay, heartLX, heartLY);

    if (dHeart < 46 * this.body.scale) {
      const pulseInfluence = map(dHeart, 0, 46 * this.body.scale, 1.18, 1.0);
      lx *= 1 + (m.pulse - 1) * pulseInfluence;
      ly *= 1 + (m.pulse - 1) * pulseInfluence;
    }

    return {
      x: this.body.cx + m.swayX + lx,
      y: this.body.cy + m.swayY + ly
    };
  }

  update() {
    const t = this.anchorWorld();

    const ang =
      noise(this.x * 0.003, this.y * 0.003, frameCount * 0.006 + this.seed) *
      TWO_PI *
      2.3;

    const flowX = cos(ang) * this.speed * 0.35;
    const flowY = sin(ang) * this.speed * 0.35;

    const jitterX = (noise(this.seed + 10, frameCount * 0.020) - 0.5) * 0.8;
    const jitterY = (noise(this.seed + 30, frameCount * 0.020) - 0.5) * 0.8;

    const attractX = (t.x - this.x) * this.pull;
    const attractY = (t.y - this.y) * this.pull;

    this.vx = this.vx * 0.82 + flowX + attractX + jitterX;
    this.vy = this.vy * 0.82 + flowY + attractY + jitterY;

    this.x += this.vx;
    this.y += this.vy;

    const d = dist(this.x, this.y, t.x, t.y);
    if (d > this.maxDist) {
      this.x = lerp(this.x, t.x, 0.35);
      this.y = lerp(this.y, t.y, 0.35);
      this.vx *= 0.5;
      this.vy *= 0.5;
    }

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > 7) this.history.shift();
  }

  display() {
    const flick = 0.78 + noise(this.seed, frameCount * 0.03) * 0.40;

    stroke(this.r, this.g, this.b, this.alpha * flick);
    strokeWeight(this.weight);

    beginShape();
    curveVertex(this.history[0].x, this.history[0].y);
    for (const p of this.history) curveVertex(p.x, p.y);
    const last = this.history[this.history.length - 1];
    curveVertex(last.x, last.y);
    endShape();
  }
}

/* =========================================================
   BRIDGE FIBERS
========================================================= */

class BridgeFiber {
  constructor(t, seed, kind) {
    this.t = t;
    this.seed = seed;
    this.kind = kind;

    this.col = kind === "heart"
      ? random([
          [255, 45, 100],
          [255, 95, 155],
          [210, 90, 255]
        ])
      : random([
          [120, 80, 210],
          [95, 155, 255],
          [180, 95, 255]
        ]);

    this.alpha = kind === "heart" ? random(5, 15) : random(2, 8);
    this.weight = kind === "heart" ? random(0.20, 0.60) : random(0.16, 0.45);
    this.pull = random(0.025, 0.050);

    const p = this.target();
    this.x = p.x;
    this.y = p.y;
    this.vx = 0;
    this.vy = 0;

    this.history = [];
    for (let i = 0; i < 6; i++) this.history.push({ x: this.x, y: this.y });
  }

  target() {
    const a = this.kind === "heart" ? leftBody.worldHeart() : leftBody.worldHead();
    const b = this.kind === "heart" ? rightBody.worldHeart() : rightBody.worldHead();

    const bow = this.kind === "heart" ? 26 : 60;
    const lift = this.kind === "heart" ? 10 : -70;

    const c1 = {
      x: lerp(a.x, b.x, 0.32),
      y: lerp(a.y, b.y, 0.32) + lift + sin(frameCount * 0.012 + this.seed) * bow
    };

    const c2 = {
      x: lerp(a.x, b.x, 0.68),
      y: lerp(a.y, b.y, 0.68) + lift + cos(frameCount * 0.012 + this.seed) * bow
    };

    return {
      x: bezierPoint(a.x, c1.x, c2.x, b.x, this.t) + (noise(this.seed + 10, frameCount * 0.01) - 0.5) * 18,
      y: bezierPoint(a.y, c1.y, c2.y, b.y, this.t) + (noise(this.seed + 20, frameCount * 0.01) - 0.5) * 18
    };
  }

  update() {
    const t = this.target();

    const ang =
      noise(this.x * 0.003, this.y * 0.003, frameCount * 0.007 + this.seed) *
      TWO_PI *
      2.0;

    const flowX = cos(ang) * 0.22;
    const flowY = sin(ang) * 0.22;

    this.vx = this.vx * 0.80 + flowX + (t.x - this.x) * this.pull;
    this.vy = this.vy * 0.80 + flowY + (t.y - this.y) * this.pull;

    this.x += this.vx;
    this.y += this.vy;

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > 6) this.history.shift();
  }

  display() {
    stroke(this.col[0], this.col[1], this.col[2], this.alpha);
    strokeWeight(this.weight);

    beginShape();
    curveVertex(this.history[0].x, this.history[0].y);
    for (const p of this.history) curveVertex(p.x, p.y);
    const last = this.history[this.history.length - 1];
    curveVertex(last.x, last.y);
    endShape();
  }
}

/* =========================================================
   CENTRAL INTERFERENCE
========================================================= */

class FieldFiber {
  constructor(seed) {
    this.seed = seed;

    const a = random(TWO_PI);
    const r = sqrt(random());
    this.ax = width * 0.5 + cos(a) * r * min(width * 0.09, 110);
    this.ay = height * 0.53 + sin(a) * r * min(height * 0.13, 120);

    this.x = this.ax;
    this.y = this.ay;
    this.vx = 0;
    this.vy = 0;

    this.col = random([
      [255, 40, 120],
      [185, 95, 255],
      [120, 185, 255],
      [255, 130, 180]
    ]);

    this.alpha = random(2, 10);
    this.weight = random(0.14, 0.42);
    this.pull = random(0.010, 0.022);

    this.history = [];
    for (let i = 0; i < 5; i++) this.history.push({ x: this.x, y: this.y });
  }

  target() {
    return {
      x: this.ax + sin(frameCount * 0.012 + this.seed) * 8,
      y: this.ay + cos(frameCount * 0.013 + this.seed) * 8
    };
  }

  update() {
    const t = this.target();

    const ang =
      noise(this.x * 0.0033, this.y * 0.0033, frameCount * 0.010 + this.seed) *
      TWO_PI *
      3.0;

    const flowX = cos(ang) * 0.25;
    const flowY = sin(ang) * 0.25;

    this.vx = this.vx * 0.82 + flowX + (t.x - this.x) * this.pull;
    this.vy = this.vy * 0.82 + flowY + (t.y - this.y) * this.pull;

    this.x += this.vx;
    this.y += this.vy;

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > 5) this.history.shift();
  }

  display() {
    stroke(this.col[0], this.col[1], this.col[2], this.alpha);
    strokeWeight(this.weight);

    beginShape();
    curveVertex(this.history[0].x, this.history[0].y);
    for (const p of this.history) curveVertex(p.x, p.y);
    const last = this.history[this.history.length - 1];
    curveVertex(last.x, last.y);
    endShape();
  }
}

/* =========================================================
   UI
========================================================= */

function drawVignette() {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const inner = min(width, height) * 0.18;
  const outer = max(width, height) * 0.82;

  const grad = drawingContext.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0.00, "rgba(0,0,0,0)");
  grad.addColorStop(0.62, "rgba(0,0,0,0.10)");
  grad.addColorStop(0.82, "rgba(0,0,0,0.45)");
  grad.addColorStop(1.00, "rgba(0,0,0,0.88)");

  drawingContext.fillStyle = grad;
  drawingContext.fillRect(0, 0, width, height);
}

function drawTitle() {
  push();
  drawingContext.globalCompositeOperation = "source-over";
  noStroke();
  fill(220, 215, 205, 58);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  textSize(13);
  text("A N A T O M Í A   D E   L A   D I S T A N C I A", width * 0.5, height - 40);
  pop();
}