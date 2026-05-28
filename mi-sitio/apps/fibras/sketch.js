/*
 * Anatomía de la Distancia — versión 4
 * Técnica: máscara invisible + muestreo por densidad.
 *
 * 1. Cada cuerpo dibuja una silueta humana en un p5.Graphics oculto (bodyMask)
 *    usando elipses superpuestas + drawingContext.filter blur, para que las
 *    partes se fusionen y no se vean como bloques separados.
 * 2. Las partículas se generan SOLAMENTE en píxeles donde la máscara tiene
 *    opacidad (rejection sampling ponderado por intensidad).
 * 3. Cada partícula tiene ancla local dentro de la silueta, velocidad,
 *    historial y color asignado por zona (mapeo vertical + foco cardíaco).
 * 4. Movimiento orgánico con noise() y atracción suave al ancla para
 *    preservar la forma humana sin congelarla.
 * 5. Trazo: curveVertex sobre el historial → fibras suaves, nunca rectas.
 *
 * Resultado: dos presencias humanas hechas de fibras vibrantes,
 * con bordes difusos y textura orgánica sobre fondo negro.
 */

let bodies = [];
let bridges = [];
let centerField = [];

const QUALITY = 1.0;       // bajar a 0.7 si va lento
const BG_FADE = 36;        // menor = más estela, mayor = más limpio
const FIBERS_PER_BODY = 3000;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  strokeCap(ROUND);
  drawingContext.lineJoin = "round";
  noFill();
  buildScene();
  background(0);
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

  const sep = min(width * 0.22, 280);
  const cy = height * 0.54;

  bodies.push(new FiberBody(width * 0.5 - sep, cy,  1, 0.0));
  bodies.push(new FiberBody(width * 0.5 + sep, cy, -1, PI * 0.7));

  for (let i = 0; i < floor(140 * QUALITY); i++) {
    bridges.push(new BridgeStrand("heart", random(), random(1000)));
  }
  for (let i = 0; i < floor(70 * QUALITY); i++) {
    bridges.push(new BridgeStrand("head", random(), random(1000)));
  }

  for (let i = 0; i < floor(380 * QUALITY); i++) {
    centerField.push(new FieldWhisper(random(1000)));
  }
}

function draw() {
  background(0, BG_FADE);

  const prev = drawingContext.globalCompositeOperation;
  drawingContext.globalCompositeOperation = "lighter";

  for (const b of bodies) {
    b.update();
    b.display();
  }
  for (const b of bridges) {
    b.update();
    b.display();
  }
  for (const w of centerField) {
    w.update();
    w.display();
  }

  drawingContext.globalCompositeOperation = prev;

  drawVignette();
  drawTitle();
}

/* =========================================================
   BODY  —  silhouette mask + fiber sampling
========================================================= */

class FiberBody {
  constructor(cx, cy, facing, phase) {
    this.cx = cx;
    this.cy = cy;
    this.facing = facing;
    this.phase = phase;

    // tamaño de la máscara, escalada al viewport
    this.bodyH = min(height * 0.88, 760);
    this.bodyW = this.bodyH * 0.52;

    this.buildMask();
    this.buildFibers();
  }

  buildMask() {
    const g = createGraphics(floor(this.bodyW), floor(this.bodyH));
    g.pixelDensity(1);
    g.background(0);
    g.noStroke();
    g.fill(255);

    const s = this.bodyH / 760;
    const cx = this.bodyW * 0.5;

    // blur global: hace que todas las elipses se fusionen en una
    // silueta blanda sin bordes anatómicos definidos
    g.drawingContext.filter = "blur(16px)";

    // cabeza
    g.ellipse(cx, 70 * s, 95 * s, 115 * s);
    // cuello
    g.ellipse(cx, 145 * s, 45 * s, 55 * s);
    // hombros / parte alta del torso
    g.ellipse(cx, 195 * s, 195 * s, 90 * s);
    // pecho
    g.ellipse(cx, 245 * s, 185 * s, 130 * s);
    // abdomen
    g.ellipse(cx, 365 * s, 165 * s, 165 * s);
    // pelvis
    g.ellipse(cx, 480 * s, 155 * s, 120 * s);

    // brazos: cadena de elipses para que fluyan como un solo trazo
    const armX = 105 * s;
    g.ellipse(cx - armX, 215 * s, 60 * s, 80 * s);
    g.ellipse(cx + armX, 215 * s, 60 * s, 80 * s);
    g.ellipse(cx - armX - 8 * s, 285 * s, 55 * s, 110 * s);
    g.ellipse(cx + armX + 8 * s, 285 * s, 55 * s, 110 * s);
    g.ellipse(cx - armX - 4 * s, 380 * s, 50 * s, 110 * s);
    g.ellipse(cx + armX + 4 * s, 380 * s, 50 * s, 110 * s);
    g.ellipse(cx - armX + 6 * s, 470 * s, 42 * s, 60 * s);
    g.ellipse(cx + armX - 6 * s, 470 * s, 42 * s, 60 * s);

    // piernas: cadena de elipses, también fusionadas con la pelvis
    const legX = 42 * s;
    g.ellipse(cx - legX, 555 * s, 80 * s, 130 * s);
    g.ellipse(cx + legX, 555 * s, 80 * s, 130 * s);
    g.ellipse(cx - legX - 4 * s, 640 * s, 65 * s, 110 * s);
    g.ellipse(cx + legX + 4 * s, 640 * s, 65 * s, 110 * s);
    g.ellipse(cx - legX, 720 * s, 55 * s, 70 * s);
    g.ellipse(cx + legX, 720 * s, 55 * s, 70 * s);

    g.drawingContext.filter = "none";

    g.loadPixels();
    this.mask = g;

    // referencias internas para colorear y para anclajes (heart / head)
    this.scale = s;
    this.localHeart = {
      x: cx + this.facing * 30 * s,
      y: 245 * s,
    };
    this.localHead = { x: cx, y: 70 * s };
  }

  buildFibers() {
    this.fibers = [];
    const target = floor(FIBERS_PER_BODY * QUALITY);
    const w = this.mask.width;
    const h = this.mask.height;
    const px = this.mask.pixels;

    let attempts = 0;
    const maxAttempts = target * 40;

    while (this.fibers.length < target && attempts < maxAttempts) {
      attempts++;
      const lx = random(w);
      const ly = random(h);
      const idx = (floor(ly) * w + floor(lx)) * 4;
      const a = px[idx]; // canal R (fill blanco)
      if (a < 20) continue;
      // probabilidad proporcional a densidad: más fibras en zonas densas
      if (random(255) > a) continue;

      this.fibers.push(new Fiber(this, lx, ly, a));
    }
  }

  motion() {
    return {
      swayX: sin(frameCount * 0.0095 + this.phase) * 5.5,
      swayY: cos(frameCount * 0.0125 + this.phase) * 2.2,
      breath: sin(frameCount * 0.028 + this.phase),
      pulse: 1 + sin(frameCount * 0.060 + this.phase) * 0.10,
      tilt: sin(frameCount * 0.008 + this.phase) * 0.035,
    };
  }

  // Convierte coordenadas locales (dentro de la máscara) a coordenadas de mundo
  toWorld(lx, ly) {
    const m = this.motion();
    const breath = 1 + m.breath * 0.022;

    const ox = (lx - this.bodyW * 0.5) * breath;
    const oy = (ly - this.bodyH * 0.5) * (1 + m.breath * 0.028);

    const a = m.tilt;
    const rx = ox * cos(a) - oy * sin(a);
    const ry = ox * sin(a) + oy * cos(a);

    return {
      x: this.cx + m.swayX + rx,
      y: this.cy + m.swayY + ry,
    };
  }

  heartCenter() {
    return this.toWorld(this.localHeart.x, this.localHeart.y);
  }

  headCenter() {
    return this.toWorld(this.localHead.x, this.localHead.y);
  }

  update() {
    for (const f of this.fibers) f.update();
  }

  display() {
    for (const f of this.fibers) f.display();
  }
}

/* =========================================================
   FIBER  —  partícula con ancla, historial y color por zona
========================================================= */

class Fiber {
  constructor(body, lx, ly, density) {
    this.body = body;
    this.lx = lx;
    this.ly = ly;
    this.seed = random(10000);

    this.assignColor();

    this.speed = random(0.25, 0.95);
    this.pull = random(0.020, 0.045);
    this.wander = random(0.35, 1.30);
    this.weight = random(0.22, 0.85);
    this.alpha = random(7, 26) * map(density, 30, 255, 0.55, 1.0);
    this.maxDist = random(55, 130);

    const w = body.toWorld(lx, ly);
    this.x = w.x + random(-2, 2);
    this.y = w.y + random(-2, 2);
    this.vx = 0;
    this.vy = 0;

    this.history = [];
    const hc = floor(random(5, 8));
    for (let i = 0; i < hc; i++) {
      this.history.push({ x: this.x, y: this.y });
    }
  }

  assignColor() {
    const t = this.ly / this.body.bodyH; // 0 arriba, 1 abajo
    const heart = this.body.localHeart;
    const dHeart = dist(this.lx, this.ly, heart.x, heart.y);
    const heartGlow = constrain(map(dHeart, 0, 80 * this.body.scale, 1, 0), 0, 1);

    let palette;
    if (heartGlow > 0.35 && random() < heartGlow * 0.95) {
      // brasa cardíaca
      palette = [
        [255, 55, 90],
        [255, 110, 140],
        [255, 170, 180],
      ];
      this.alphaBoost = 1.0 + heartGlow * 0.9;
    } else if (t < 0.14) {
      // cabeza: rosados / naranjas cálidos
      palette = [
        [255, 90, 160],
        [255, 130, 90],
        [220, 70, 145],
      ];
      this.alphaBoost = 1.05;
    } else if (t < 0.22) {
      // cuello
      palette = [
        [255, 110, 120],
        [230, 100, 160],
        [255, 140, 100],
      ];
      this.alphaBoost = 1.0;
    } else if (t < 0.45) {
      // pecho: cian / agua
      palette = [
        [90, 220, 245],
        [80, 255, 200],
        [140, 220, 255],
        [95, 190, 230],
      ];
      this.alphaBoost = 1.0;
    } else if (t < 0.65) {
      // abdomen: violeta + cálido
      palette = [
        [180, 90, 250],
        [150, 70, 215],
        [220, 100, 255],
        [255, 130, 80],
      ];
      this.alphaBoost = 1.0;
    } else if (t < 0.80) {
      // pelvis
      palette = [
        [255, 150, 80],
        [210, 90, 220],
        [245, 180, 95],
      ];
      this.alphaBoost = 0.95;
    } else {
      // piernas: blancos, dorados y azules fríos
      palette = [
        [240, 240, 255],
        [255, 215, 90],
        [120, 175, 255],
      ];
      this.alphaBoost = 0.9;
    }

    const c = random(palette);
    this.r = constrain(c[0] + random(-15, 15), 0, 255);
    this.g = constrain(c[1] + random(-15, 15), 0, 255);
    this.b = constrain(c[2] + random(-15, 15), 0, 255);
  }

  update() {
    const t = this.body.toWorld(this.lx, this.ly);

    const ang =
      noise(this.x * 0.0030, this.y * 0.0030, frameCount * 0.0060 + this.seed) *
      TWO_PI *
      2.4;

    const flowX = cos(ang) * this.speed * 0.30;
    const flowY = sin(ang) * this.speed * 0.30;

    const jitterX =
      (noise(this.seed + 10, frameCount * 0.022) - 0.5) * this.wander;
    const jitterY =
      (noise(this.seed + 30, frameCount * 0.022) - 0.5) * this.wander;

    this.vx = this.vx * 0.84 + flowX + (t.x - this.x) * this.pull + jitterX;
    this.vy = this.vy * 0.84 + flowY + (t.y - this.y) * this.pull + jitterY;

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
    if (this.history.length > 8) this.history.shift();
  }

  display() {
    if (this.history.length < 4) return;

    const flicker = 0.80 + noise(this.seed, frameCount * 0.028) * 0.35;

    stroke(this.r, this.g, this.b, this.alpha * this.alphaBoost * flicker);
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
   BRIDGE STRANDS  —  fibras que conectan corazones y cabezas
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

    this.col = heartish
      ? random([
          [255, 45, 100],
          [255, 90, 160],
          [210, 80, 255],
        ])
      : random([
          [120, 80, 210],
          [90, 140, 255],
          [185, 95, 255],
        ]);

    this.alpha = heartish ? random(5, 16) : random(3, 9);
    this.weight = heartish ? random(0.25, 0.78) : random(0.20, 0.55);
    this.speed = random(0.20, 0.65);
    this.pull = random(0.030, 0.060);

    const p = this.target();
    this.x = p.x;
    this.y = p.y;
    for (let i = 0; i < 6; i++) this.history.push({ x: this.x, y: this.y });
  }

  target() {
    const left = bodies[0];
    const right = bodies[1];

    const a = this.kind === "heart" ? left.heartCenter() : left.headCenter();
    const b = this.kind === "heart" ? right.heartCenter() : right.headCenter();

    const lift = this.kind === "heart" ? 14 : -68;
    const bow = this.kind === "heart" ? 28 : 54;

    const c1 = {
      x: lerp(a.x, b.x, 0.32),
      y:
        lerp(a.y, b.y, 0.32) + lift + sin(frameCount * 0.012 + this.seed) * bow,
    };
    const c2 = {
      x: lerp(a.x, b.x, 0.68),
      y:
        lerp(a.y, b.y, 0.68) + lift + cos(frameCount * 0.012 + this.seed) * bow,
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
      TWO_PI *
      2.2;

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
    const flick = 0.85 + noise(this.seed, frameCount * 0.025) * 0.30;
    stroke(this.col[0], this.col[1], this.col[2], this.alpha * flick);
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
   FIELD  —  campo de interferencia entre los cuerpos
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
    this.ay = height * 0.53 + p.y;

    this.x = this.ax;
    this.y = this.ay;
    this.vx = 0;
    this.vy = 0;

    this.history = [];
    for (let i = 0; i < 5; i++) this.history.push({ x: this.x, y: this.y });

    this.col = random([
      [255, 40, 120],
      [185, 95, 255],
      [120, 185, 255],
      [255, 130, 190],
    ]);

    this.alpha = random(3, 11);
    this.weight = random(0.18, 0.52);
    this.speed = random(0.25, 0.80);
    this.pull = random(0.010, 0.024);
    this.maxDist = random(55, 130);
  }

  target() {
    const leftH = bodies[0].heartCenter();
    const rightH = bodies[1].heartCenter();

    const pulse =
      (sin(frameCount * 0.027 + bodies[0].phase) +
        sin(frameCount * 0.027 + bodies[1].phase)) *
      0.5;

    return {
      x: width * 0.5 + (this.ax - width * 0.5) * (1 + pulse * 0.06),
      y:
        height * 0.53 +
        (this.ay - height * 0.53) * (1 + pulse * 0.08) +
        sin(frameCount * 0.010 + this.seed) * 6 +
        map(abs(leftH.x - rightH.x), 0, width, 0, 8),
    };
  }

  update() {
    const t = this.target();
    const ang =
      noise(this.x * 0.0034, this.y * 0.0034, frameCount * 0.010 + this.seed) *
      TWO_PI *
      3.0;

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
    stroke(this.col[0], this.col[1], this.col[2], this.alpha);
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

  const grad = drawingContext.createRadialGradient(
    cx, cy, inner,
    cx, cy, outer
  );
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
