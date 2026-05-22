/*
 * Figura de Fibras (ex Anatomia de la Distancia)
 *
 * Dos figuras humanas abstractas hechas de miles de fibras nerviosas
 * enfrentadas sobre un fondo negro, con un "corazón" rojo pulsante en
 * el centro de cada una y una rotación global lenta.
 *
 * Renderizado en canvas 2D (P2D) para garantizar compatibilidad con
 * curvas Bezier finas, sombras y composición sobre fondo negro.
 */

// ---------------------------------------------------------------------------
// Estado global
// ---------------------------------------------------------------------------

let figures = [];

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

const FIBERS_PER_BODY = 1800;       // fibras del cuerpo por figura
const CORE_FIBERS     = 110;        // fibras del corazon por figura
const ROTATION_SPEED  = 0.0006;     // velocidad de la rotacion global (rad/frame)
const FIGURE_OFFSET   = 0.22;       // separacion entre figuras (% del ancho)
const TRAIL_ALPHA     = 28;         // opacidad del fondo (genera leves estelas)

// ---------------------------------------------------------------------------
// p5 lifecycle
// ---------------------------------------------------------------------------

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noiseDetail(2, 0.5);
  buildScene();
}

function draw() {
  // Fondo casi opaco -> deja una leve estela del frame anterior.
  noStroke();
  fill(0, 0, 0, TRAIL_ALPHA);
  rect(0, 0, width, height);

  push();
  translate(width / 2, height / 2);
  rotate(frameCount * ROTATION_SPEED);

  for (const fig of figures) fig.displayFibers();
  drawConnections();
  for (const fig of figures) fig.displayHeart();

  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene();
}

function buildScene() {
  figures = [];
  const bodyW = min(width * 0.42, height * 1.65);
  const bodyH = bodyW * 0.30;
  const offset = width * FIGURE_OFFSET;
  figures.push(new Figure(-offset, 0, bodyW, bodyH));
  figures.push(new Figure( offset, 0, bodyW, bodyH));
}

// ---------------------------------------------------------------------------
// Conectores: fibras ultra finas que cruzan el vacio entre las dos figuras.
// ---------------------------------------------------------------------------

function drawConnections() {
  const closeness = (sin(frameCount * 0.004) + 1) * 0.5;
  if (closeness < 0.7) return;
  const intensity = map(closeness, 0.7, 1.0, 0, 1);
  const numLines = floor(60 * intensity);

  noFill();
  for (let i = 0; i < numLines; i++) {
    const p0 = figures[0].pickEdgePoint();
    const p1 = figures[1].pickEdgePoint();
    const mx = (p0.x + p1.x) * 0.5 + random(-40, 40);
    const my = (p0.y + p1.y) * 0.5 + random(-40, 40);
    stroke(180, 210, 240, random(20, 50) * intensity);
    strokeWeight(random(0.3, 0.7));
    bezier(p0.x, p0.y, mx, my, mx, my, p1.x, p1.y);
  }
}

// ===========================================================================
// FIGURE = FiberSystem + CoreHeart
// ===========================================================================

class Figure {
  constructor(cx, cy, bodyW, bodyH) {
    this.cx = cx;
    this.cy = cy;
    this.bodyW = bodyW;
    this.bodyH = bodyH;
    this.fibers = [];
    this.coreFibers = [];

    this.heartSize = bodyH * 0.85;
    for (let i = 0; i < FIBERS_PER_BODY; i++) this.fibers.push(this.buildFiber());
    for (let i = 0; i < CORE_FIBERS;     i++) this.coreFibers.push(this.buildCoreFiber());
  }

  pickEdgePoint() {
    const ang = random(TWO_PI);
    const r = random(0.7, 1.0);
    return createVector(
      this.cx + cos(ang) * r * this.bodyW * 0.5,
      this.cy + sin(ang) * r * this.bodyH * 0.5
    );
  }

  buildFiber() {
    const a = this.bodyW * 0.5;
    const b = this.bodyH * 0.5;

    const r0 = sqrt(random()), ang0 = random(TWO_PI);
    const r1 = sqrt(random()), ang1 = random(TWO_PI);

    let p0 = createVector(this.cx + cos(ang0) * r0 * a, this.cy + sin(ang0) * r0 * b);
    let p3 = createVector(this.cx + cos(ang1) * r1 * a, this.cy + sin(ang1) * r1 * b);

    // Succion al corazon: si la fibra nace cerca del centro, su extremo se
    // proyecta sobre la curva parametrica del corazon (efecto atractor).
    if (r0 < 0.32) {
      const h = heartPoint(random(TWO_PI), this.heartSize);
      p0 = createVector(this.cx + h.x, this.cy + h.y);
    }
    if (r1 < 0.32) {
      const h = heartPoint(random(TWO_PI), this.heartSize);
      p3 = createVector(this.cx + h.x, this.cy + h.y);
    }

    const cp1 = createVector(
      lerp(p0.x, p3.x, 0.33) + random(-b * 0.7, b * 0.7),
      lerp(p0.y, p3.y, 0.33) + random(-b * 0.7, b * 0.7)
    );
    const cp2 = createVector(
      lerp(p0.x, p3.x, 0.66) + random(-b * 0.7, b * 0.7),
      lerp(p0.y, p3.y, 0.66) + random(-b * 0.7, b * 0.7)
    );

    const meanR = (r0 + r1) * 0.5;
    const col = colorForDist(meanR);

    return {
      p0, p3, cp1, cp2,
      col,
      alpha: random(55, 120),
      weight: random(0.55, 1.05),
      noiseOff: random(1000),
    };
  }

  buildCoreFiber() {
    const s = this.heartSize;
    return {
      t0: random(TWO_PI),
      t1: random(TWO_PI),
      cp1Off: createVector(random(-s * 0.18, s * 0.18), random(-s * 0.18, s * 0.18)),
      cp2Off: createVector(random(-s * 0.18, s * 0.18), random(-s * 0.18, s * 0.18)),
      noiseOff: random(1000),
      weight: random(1.2, 2.0),
      red: 210 + random(-15, 35),
    };
  }

  displayFibers() {
    const t = frameCount * 0.005;
    noFill();
    for (const f of this.fibers) {
      const n1x = (noise(f.noiseOff,       t) - 0.5) * 26;
      const n1y = (noise(f.noiseOff + 30,  t) - 0.5) * 26;
      const n2x = (noise(f.noiseOff + 60,  t) - 0.5) * 26;
      const n2y = (noise(f.noiseOff + 90,  t) - 0.5) * 26;

      stroke(f.col.r, f.col.g, f.col.b, f.alpha);
      strokeWeight(f.weight);
      bezier(
        f.p0.x, f.p0.y,
        f.cp1.x + n1x, f.cp1.y + n1y,
        f.cp2.x + n2x, f.cp2.y + n2y,
        f.p3.x, f.p3.y
      );
    }
  }

  displayHeart() {
    const pulse = 1 + sin(frameCount * 0.05) * 0.18;
    const size = this.heartSize * pulse;
    const t = frameCount * 0.012;

    push();
    translate(this.cx, this.cy);

    drawingContext.shadowBlur = 28 + sin(frameCount * 0.05) * 10;
    drawingContext.shadowColor = 'rgba(220, 35, 35, 0.95)';
    noFill();

    for (const f of this.coreFibers) {
      const p0 = heartPoint(f.t0, size);
      const p1 = heartPoint(f.t1, size);

      const n1x = (noise(f.noiseOff,       t) - 0.5) * 10;
      const n1y = (noise(f.noiseOff + 30,  t) - 0.5) * 10;
      const n2x = (noise(f.noiseOff + 60,  t) - 0.5) * 10;
      const n2y = (noise(f.noiseOff + 90,  t) - 0.5) * 10;

      const cp1x = lerp(p0.x, p1.x, 0.33) + f.cp1Off.x + n1x;
      const cp1y = lerp(p0.y, p1.y, 0.33) + f.cp1Off.y + n1y;
      const cp2x = lerp(p0.x, p1.x, 0.66) + f.cp2Off.x + n2x;
      const cp2y = lerp(p0.y, p1.y, 0.66) + f.cp2Off.y + n2y;

      stroke(f.red, 28, 32, 220);
      strokeWeight(f.weight);
      bezier(p0.x, p0.y, cp1x, cp1y, cp2x, cp2y, p1.x, p1.y);
    }

    drawingContext.shadowBlur = 0;
    pop();
  }
}

// ===========================================================================
// UTILIDADES
// ===========================================================================

// Punto sobre la curva del corazon parametrico clasico.
//   x(t) = 16 sin(t)^3
//   y(t) = 13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t)
function heartPoint(t, scaleFactor) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  const k = scaleFactor / 17;
  return createVector(x * k, y * k);
}

// Color por distancia radial normalizada (0 = centro, 1 = borde).
// Rojo Italiano en el nucleo -> magenta -> azul frio -> hielo.
function colorForDist(d) {
  if (d < 0.30) return { r: 220, g: 35, b: 45 };
  if (d < 0.50) return { r: 170, g: 60, b: 140 };
  if (d < 0.72) return { r: 95,  g: 115, b: 215 };
  return { r: 150, g: 195, b: 240 };
}
