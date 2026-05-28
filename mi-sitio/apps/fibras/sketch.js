/*
 * Anatomía de la Distancia
 * Versión limpia: cuerpos de microfibras luminosas
 * Dos cuerpos abstractos enfrentados, sin manchas negras ni contornos duros.
 */

let leftBody;
let rightBody;
let signals = [];

const BODY_SCALE = 1.0;
const FIBERS_PER_BODY = 5200;
const SIGNAL_COUNT = 420;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  strokeCap(ROUND);
  noFill();
  buildScene();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene();
}

function buildScene() {
  const sep = min(width * 0.24, 310);
  const cy = height * 0.54;

  leftBody = new WoolBody(width / 2 - sep, cy, 1);
  rightBody = new WoolBody(width / 2 + sep, cy, -1);

  signals = [];
  for (let i = 0; i < SIGNAL_COUNT; i++) {
    signals.push(new DistanceSignal());
  }
}

function draw() {
  background(0);

  drawingContext.globalCompositeOperation = "lighter";

  leftBody.draw();
  rightBody.draw();

  for (const s of signals) {
    s.draw();
  }

  drawingContext.globalCompositeOperation = "source-over";

  drawTitle();
  drawSoftVignette();
}

/* =========================
   CUERPO DE LANA
========================= */

class WoolBody {
  constructor(cx, cy, facing) {
    this.cx = cx;
    this.cy = cy;
    this.facing = facing;
    this.fibers = [];

    this.palette = {
      head: [
        [255, 70, 145],
        [255, 115, 70],
        [210, 40, 125]
      ],
      chest: [
        [95, 225, 240],
        [80, 255, 180],
        [145, 210, 255]
      ],
      heart: [
        [255, 45, 85],
        [255, 90, 125],
        [255, 160, 170]
      ],
      abdomen: [
        [185, 70, 255],
        [255, 130, 60],
        [160, 80, 230]
      ],
      legs: [
        [255, 220, 70],
        [235, 245, 255],
        [100, 180, 255]
      ],
      arms: [
        [95, 205, 255],
        [100, 255, 200],
        [170, 210, 255]
      ]
    };

    this.regions = this.createRegions();
    this.generateFibers();
  }

  createRegions() {
    const s = min(width, height) / 900 * BODY_SCALE;

    return [
      // cabeza
      {
        name: "head",
        x: 0,
        y: -260 * s,
        rx: 45 * s,
        ry: 58 * s,
        rot: 0,
        count: 620,
        type: "head",
        glow: 1.15
      },

      // cuello
      {
        name: "neck",
        x: 0,
        y: -195 * s,
        rx: 18 * s,
        ry: 30 * s,
        rot: 0,
        count: 180,
        type: "head",
        glow: 0.8
      },

      // pecho ancho pero difuso
      {
        name: "chest",
        x: 0,
        y: -115 * s,
        rx: 82 * s,
        ry: 64 * s,
        rot: 0,
        count: 820,
        type: "chest",
        glow: 1.0
      },

      // corazón, levemente hacia el otro cuerpo
      {
        name: "heart",
        x: this.facing * 24 * s,
        y: -118 * s,
        rx: 24 * s,
        ry: 24 * s,
        rot: 0,
        count: 430,
        type: "heart",
        glow: 1.6
      },

      // abdomen
      {
        name: "abdomen",
        x: 0,
        y: -20 * s,
        rx: 66 * s,
        ry: 82 * s,
        rot: 0,
        count: 760,
        type: "abdomen",
        glow: 0.9
      },

      // pelvis
      {
        name: "pelvis",
        x: 0,
        y: 85 * s,
        rx: 58 * s,
        ry: 48 * s,
        rot: 0,
        count: 420,
        type: "abdomen",
        glow: 0.8
      },

      // brazo externo, más largo
      {
        name: "outerArm",
        x: -this.facing * 95 * s,
        y: -42 * s,
        rx: 26 * s,
        ry: 145 * s,
        rot: radians(-8 * this.facing),
        count: 620,
        type: "arms",
        glow: 0.75
      },

      // brazo hacia la distancia, más sutil
      {
        name: "innerArm",
        x: this.facing * 94 * s,
        y: -55 * s,
        rx: 22 * s,
        ry: 135 * s,
        rot: radians(10 * this.facing),
        count: 500,
        type: "arms",
        glow: 0.72
      },

      // pierna izquierda
      {
        name: "legA",
        x: -28 * s,
        y: 230 * s,
        rx: 25 * s,
        ry: 155 * s,
        rot: radians(2),
        count: 700,
        type: "legs",
        glow: 0.78
      },

      // pierna derecha
      {
        name: "legB",
        x: 28 * s,
        y: 230 * s,
        rx: 25 * s,
        ry: 155 * s,
        rot: radians(-2),
        count: 700,
        type: "legs",
        glow: 0.78
      }
    ];
  }

  generateFibers() {
    this.fibers = [];

    for (const region of this.regions) {
      for (let i = 0; i < region.count; i++) {
        const p = sampleInEllipse(region.rx, region.ry);

        const fuzz = random() < 0.22 ? random(1.05, 1.35) : random(0.65, 1.05);

        const localX = p.x * fuzz;
        const localY = p.y * fuzz;

        const rotated = rotatePoint(localX, localY, region.rot);

        const col = random(this.palette[region.type]);

        this.fibers.push({
          region,
          lx: rotated.x,
          ly: rotated.y,
          seed: random(10000),
          col,
          len: random(2.2, 8.5),
          weight: random(0.45, 1.2),
          alpha: random(34, 92) * region.glow,
          drift: random(0.5, 2.2),
          wobble: random(0.8, 3.8)
        });
      }
    }
  }

  draw() {
    const breathe = sin(frameCount * 0.026 + this.cx * 0.001) * 1.0;
    const swayX = sin(frameCount * 0.011 + this.cx * 0.002) * 3.5;
    const swayY = cos(frameCount * 0.014 + this.cx * 0.002) * 2.0;

    for (const f of this.fibers) {
      const r = f.region;

      let baseX = this.cx + swayX + r.x + f.lx * (1 + breathe * 0.006);
      let baseY = this.cy + swayY + r.y + f.ly * (1 + breathe * 0.008);

      const n = noise(
        baseX * 0.006,
        baseY * 0.006,
        frameCount * 0.012 + f.seed
      );

      const angle =
        n * TWO_PI * 2.6 +
        sin(frameCount * 0.018 + f.seed) * 0.8;

      const vibX = cos(angle) * f.wobble;
      const vibY = sin(angle) * f.wobble;

      const x1 = baseX + vibX;
      const y1 = baseY + vibY;

      const x2 = x1 + cos(angle) * f.len;
      const y2 = y1 + sin(angle) * f.len;

      const flicker = 0.74 + noise(f.seed, frameCount * 0.035) * 0.45;

      stroke(
        f.col[0],
        f.col[1],
        f.col[2],
        constrain(f.alpha * flicker, 0, 135)
      );

      strokeWeight(f.weight);
      line(x1, y1, x2, y2);
    }
  }

  heartPoint() {
    const s = min(width, height) / 900 * BODY_SCALE;
    return {
      x: this.cx + this.facing * 24 * s,
      y: this.cy - 118 * s
    };
  }

  headPoint() {
    const s = min(width, height) / 900 * BODY_SCALE;
    return {
      x: this.cx,
      y: this.cy - 260 * s
    };
  }
}

/* =========================
   DISTANCIA / INTERFERENCIA
========================= */

class DistanceSignal {
  constructor() {
    this.seed = random(10000);
    this.t = random();
    this.kind = random() < 0.62 ? "heart" : "head";

    this.col =
      this.kind === "heart"
        ? random([
            [255, 40, 100],
            [255, 80, 150],
            [190, 80, 255]
          ])
        : random([
            [115, 80, 190],
            [80, 180, 255],
            [220, 90, 255]
          ]);

    this.alpha = this.kind === "heart" ? random(18, 50) : random(7, 24);
    this.weight = random(0.35, 0.95);
    this.len = random(3, 12);
  }

  draw() {
    const a =
      this.kind === "heart" ? leftBody.heartPoint() : leftBody.headPoint();

    const b =
      this.kind === "heart" ? rightBody.heartPoint() : rightBody.headPoint();

    const midX = lerp(a.x, b.x, this.t);
    const midY = lerp(a.y, b.y, this.t);

    const wave =
      sin(this.t * PI * 2 + frameCount * 0.018 + this.seed) *
      (this.kind === "heart" ? 28 : 48);

    const vertical =
      this.kind === "heart"
        ? sin(this.t * PI) * 20
        : -70 + sin(this.t * PI) * 18;

    const x =
      midX +
      (noise(this.seed, frameCount * 0.01) - 0.5) * 22;

    const y =
      midY +
      vertical +
      wave +
      (noise(this.seed + 44, frameCount * 0.01) - 0.5) * 18;

    const angle =
      noise(x * 0.004, y * 0.004, frameCount * 0.01 + this.seed) *
      TWO_PI *
      2;

    stroke(this.col[0], this.col[1], this.col[2], this.alpha);
    strokeWeight(this.weight);

    line(
      x,
      y,
      x + cos(angle) * this.len,
      y + sin(angle) * this.len
    );
  }
}

/* =========================
   HELPERS
========================= */

function sampleInEllipse(rx, ry) {
  const a = random(TWO_PI);

  // centro denso, borde peludo
  let r = sqrt(random());

  if (random() < 0.22) {
    r = random(0.85, 1.18);
  }

  return {
    x: cos(a) * r * rx,
    y: sin(a) * r * ry
  };
}

function rotatePoint(x, y, a) {
  return {
    x: x * cos(a) - y * sin(a),
    y: x * sin(a) + y * cos(a)
  };
}

function drawSoftVignette() {
  const cx = width / 2;
  const cy = height / 2;
  const rMax = max(width, height) * 0.72;

  const grad = drawingContext.createRadialGradient(
    cx,
    cy,
    0,
    cx,
    cy,
    rMax
  );

  grad.addColorStop(0.0, "rgba(0,0,0,0)");
  grad.addColorStop(0.62, "rgba(0,0,0,0)");
  grad.addColorStop(0.84, "rgba(0,0,0,0.35)");
  grad.addColorStop(1.0, "rgba(0,0,0,0.92)");

  drawingContext.fillStyle = grad;
  drawingContext.fillRect(0, 0, width, height);
}

function drawTitle() {
  push();
  drawingContext.globalCompositeOperation = "source-over";
  noStroke();
  fill(210, 205, 195, 78);
  textAlign(CENTER, CENTER);
  textSize(13);
  textFont("monospace");
  textStyle(NORMAL);
  text("A N A T O M Í A   D E   L A   D I S T A N C I A", width / 2, height - 46);
  pop();
}
