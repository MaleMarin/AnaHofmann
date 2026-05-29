/*
 * Anatomía de la Distancia — versión 6
 * Densidad y color tomados de una imagen de referencia.
 *
 *  - preload() carga apps/fibras/assets/cuerpo-ref.png
 *  - Cada FiberBody dibuja la imagen en un p5.Graphics oculto (mask),
 *    el derecho espejado horizontalmente.
 *  - Las partículas se muestrean por rejection sampling ponderado por
 *    el BRILLO del píxel (ignora el fondo negro).
 *  - El COLOR de cada fibra se hereda del píxel donde nació →
 *    la composición cromática del referente se preserva.
 *  - Pulso cardíaco (lub-dub) modula intensidad, escala del cuerpo,
 *    brillo del foco cardíaco y la amplitud del oscilador.
 *  - Sonido: sub-bass + armónico con LowPass, activado por #soundToggle.
 */

let bodies = [];
let bridges = [];
let centerField = [];

let bodyRefImg;

// configurable: posición relativa de cabeza/corazón dentro de la imagen
// la imagen original tiene cabeza rosa abajo-izquierda
const HEAD_REL  = { x: 0.13, y: 0.52 };
const HEART_REL = { x: 0.26, y: 0.43 };

const QUALITY = 1.0;
const BG_FADE = 30;
const FIBERS_PER_BODY = 4200;
const BRIDGE_HEART = 220;
const BRIDGE_HEAD = 100;
const FIELD_COUNT = 520;

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

  // dos cuerpos enfrentados, espejados
  bodies.push(new FiberBody(width * 0.27, height * 0.50, false, 0.0));
  bodies.push(new FiberBody(width * 0.73, height * 0.50, true,  PI * 0.7));

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
  globalPulse = heartbeatPulse(t);
  applyAudioPulse(globalPulse);

  const prev = drawingContext.globalCompositeOperation;
  drawingContext.globalCompositeOperation = "lighter";

  for (const b of bodies) { b.update(); b.display(); }
  for (const b of bridges) { b.update(); b.display(); }
  for (const w of centerField) { w.update(); w.display(); }

  drawingContext.globalCompositeOperation = prev;

  drawHeartFlash();
  drawVignette();
  drawTitle();
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

    // aspect ratio = aspect de la imagen, sin deformar
    const aspect = bodyRefImg.width / bodyRefImg.height;

    let w = min(width * 0.48, 820);
    let h = w / aspect;
    const maxH = height * 0.82;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
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

    if (this.mirror) {
      g.push();
      g.translate(g.width, 0);
      g.scale(-1, 1);
      g.image(bodyRefImg, 0, 0, g.width, g.height);
      g.pop();
    } else {
      g.image(bodyRefImg, 0, 0, g.width, g.height);
    }

    g.loadPixels();
    this.mask = g;

    // anclas internas, espejadas si corresponde
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
    const maxAttempts = target * 60;

    while (this.fibers.length < target && attempts < maxAttempts) {
      attempts++;
      const lx = random(w);
      const ly = random(h);
      const idx = (floor(ly) * w + floor(lx)) * 4;
      const r = px[idx];
      const g = px[idx + 1];
      const b = px[idx + 2];
      const brightness = (r + g + b) / 3;
      if (brightness < 14) continue;
      // probabilidad proporcional al brillo
      if (random(255) > brightness * 1.3) continue;

      this.fibers.push(new Fiber(this, lx, ly, brightness, r, g, b));
    }
  }

  motion() {
    const pulse = globalPulse;
    return {
      swayX: sin(frameCount * 0.0095 + this.phase) * 5.5,
      swayY: cos(frameCount * 0.0125 + this.phase) * 2.2,
      breath: sin(frameCount * 0.028 + this.phase),
      pulseScale: 1 + pulse * 0.045,
      tilt: sin(frameCount * 0.008 + this.phase) * 0.030,
    };
  }

  toWorld(lx, ly) {
    const m = this.motion();
    const breath = 1 + m.breath * 0.022;
    const ps = m.pulseScale;

    const ox = (lx - this.bodyW * 0.5) * breath * ps;
    const oy = (ly - this.bodyH * 0.5) * (1 + m.breath * 0.028) * ps;

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

    // color del píxel del referente, con leve boost de saturación / variación
    const boost = 1.25;
    this.r = constrain(pr * boost + random(-14, 14), 0, 255);
    this.g = constrain(pg * boost + random(-14, 14), 0, 255);
    this.b = constrain(pb * boost + random(-14, 14), 0, 255);

    // foco cardíaco
    const dHeart = dist(lx, ly, body.localHeart.x, body.localHeart.y);
    const heartR = min(body.bodyW, body.bodyH) * 0.10;
    this.isHeart = dHeart < heartR;
    this.alphaBoost = this.isHeart ? 1.35 + (1 - dHeart / heartR) * 0.8 : 1.0;

    // física
    this.speed = random(0.28, 1.05);
    this.pull = random(0.022, 0.050);
    this.wander = random(0.45, 1.50);
    this.weight = random(0.28, 1.05);
    this.alpha = random(11, 34) * map(density, 30, 255, 0.55, 1.0);
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

  update() {
    const t = this.body.toWorld(this.lx, this.ly);

    const ang =
      noise(this.x * 0.0030, this.y * 0.0030, frameCount * 0.0060 + this.seed) *
      TWO_PI * 2.4;

    const flowX = cos(ang) * this.speed * 0.30;
    const flowY = sin(ang) * this.speed * 0.30;

    const jitterX = (noise(this.seed + 10, frameCount * 0.022) - 0.5) * this.wander;
    const jitterY = (noise(this.seed + 30, frameCount * 0.022) - 0.5) * this.wander;

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
    const flicker = 0.85 + noise(this.seed, frameCount * 0.028) * 0.30;
    const intensity = fiberIntensity();
    const heartBoost = this.isHeart ? 1 + globalPulse * 0.9 : 1;

    stroke(
      this.r, this.g, this.b,
      this.alpha * this.alphaBoost * flicker * intensity * heartBoost
    );
    strokeWeight(this.weight * (this.isHeart ? 1 + globalPulse * 0.35 : 1));
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
    this.col = heartish
      ? random([[255,45,100],[255,90,160],[210,80,255]])
      : random([[120,80,210],[90,140,255],[185,95,255]]);

    this.alpha = heartish ? random(8, 24) : random(4, 12);
    this.weight = heartish ? random(0.32, 0.95) : random(0.22, 0.62);
    this.speed = random(0.20, 0.70);
    this.pull = random(0.030, 0.060);

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
    const flick = 0.85 + noise(this.seed, frameCount * 0.025) * 0.30;
    const heartBoost = this.kind === "heart"
      ? 1 + globalPulse * 1.1
      : 1 + globalPulse * 0.25;

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

    this.col = random([
      [255, 40, 120],
      [185, 95, 255],
      [120, 185, 255],
      [255, 130, 190],
    ]);

    this.alpha = random(4, 14);
    this.weight = random(0.20, 0.58);
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
   HEART FLASH
========================================================= */

function drawHeartFlash() {
  if (globalPulse < 0.25) return;

  drawingContext.save();
  drawingContext.globalCompositeOperation = "lighter";

  for (const body of bodies) {
    const h = body.heartCenter();
    const radius = 180 + globalPulse * 120;
    const grad = drawingContext.createRadialGradient(h.x, h.y, 0, h.x, h.y, radius);
    const a = globalPulse * 0.45;
    grad.addColorStop(0.00, `rgba(255, 80, 110, ${a})`);
    grad.addColorStop(0.35, `rgba(255, 55, 130, ${a * 0.55})`);
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
