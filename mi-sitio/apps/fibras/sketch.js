/*
 * Fibras — Ana Hofmann
 * Dos figuras enfrentadas hechas de miles de curvas Bezier, con un
 * corazón rojo pulsante en el centro de cada una. Rotación global lenta.
 * Render en canvas 2D para máxima compatibilidad.
 */

let fibers = [];
let cores = [];

const FIBERS_PER_BODY = 1600;
const CORE_FIBERS     = 90;
const ROTATION_SPEED  = 0.0006;
const FIGURE_OFFSET   = 0.22;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  buildScene();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene();
}

function buildScene() {
  fibers = [];
  cores = [];
  const bodyW = min(width * 0.42, height * 1.65);
  const bodyH = bodyW * 0.30;
  const offset = width * FIGURE_OFFSET;
  buildFigure(-offset, 0, bodyW, bodyH);
  buildFigure( offset, 0, bodyW, bodyH);
}

function buildFigure(cx, cy, bodyW, bodyH) {
  const a = bodyW * 0.5;
  const b = bodyH * 0.5;
  const heartSize = bodyH * 0.85;

  for (let i = 0; i < FIBERS_PER_BODY; i++) {
    const r0 = Math.sqrt(Math.random()), ang0 = Math.random() * TWO_PI;
    const r1 = Math.sqrt(Math.random()), ang1 = Math.random() * TWO_PI;

    let p0x = cx + Math.cos(ang0) * r0 * a;
    let p0y = cy + Math.sin(ang0) * r0 * b;
    let p1x = cx + Math.cos(ang1) * r1 * a;
    let p1y = cy + Math.sin(ang1) * r1 * b;

    // Fibras cercanas al centro: atraidas al corazon parametrico.
    if (r0 < 0.32) {
      const h = heartPoint(Math.random() * TWO_PI, heartSize);
      p0x = cx + h.x; p0y = cy + h.y;
    }
    if (r1 < 0.32) {
      const h = heartPoint(Math.random() * TWO_PI, heartSize);
      p1x = cx + h.x; p1y = cy + h.y;
    }

    const meanR = (r0 + r1) * 0.5;
    const col = colorForDist(meanR);

    fibers.push({
      p0x, p0y, p1x, p1y,
      cp1x: (p0x + p1x) * 0.5 + (Math.random() - 0.5) * b * 1.2,
      cp1y: (p0y + p1y) * 0.5 + (Math.random() - 0.5) * b * 1.2,
      cp2x: (p0x + p1x) * 0.5 + (Math.random() - 0.5) * b * 1.2,
      cp2y: (p0y + p1y) * 0.5 + (Math.random() - 0.5) * b * 1.2,
      r: col[0], g: col[1], bb: col[2],
      alpha: 60 + Math.random() * 80,
      weight: 0.55 + Math.random() * 0.6,
      noiseOff: Math.random() * 1000,
    });
  }

  for (let i = 0; i < CORE_FIBERS; i++) {
    cores.push({
      cx, cy, heartSize,
      t0: Math.random() * TWO_PI,
      t1: Math.random() * TWO_PI,
      offX: (Math.random() - 0.5) * heartSize * 0.35,
      offY: (Math.random() - 0.5) * heartSize * 0.35,
      noiseOff: Math.random() * 1000,
      weight: 1.2 + Math.random() * 0.8,
    });
  }
}

function draw() {
  background(0);

  push();
  translate(width / 2, height / 2);
  rotate(frameCount * ROTATION_SPEED);

  // Fibras del cuerpo
  noFill();
  const t = frameCount * 0.005;
  for (let i = 0; i < fibers.length; i++) {
    const f = fibers[i];
    const n1 = (noise(f.noiseOff, t) - 0.5) * 26;
    const n2 = (noise(f.noiseOff + 50, t) - 0.5) * 26;
    const n3 = (noise(f.noiseOff + 100, t) - 0.5) * 26;
    const n4 = (noise(f.noiseOff + 150, t) - 0.5) * 26;
    stroke(f.r, f.g, f.bb, f.alpha);
    strokeWeight(f.weight);
    bezier(f.p0x, f.p0y,
           f.cp1x + n1, f.cp1y + n2,
           f.cp2x + n3, f.cp2y + n4,
           f.p1x, f.p1y);
  }

  // Corazones rojos pulsantes con glow
  const pulse = 1 + Math.sin(frameCount * 0.05) * 0.18;
  const tc = frameCount * 0.012;
  drawingContext.shadowBlur = 28 + Math.sin(frameCount * 0.05) * 10;
  drawingContext.shadowColor = 'rgba(230, 35, 35, 0.95)';
  for (let i = 0; i < cores.length; i++) {
    const c = cores[i];
    const size = c.heartSize * pulse;
    const p0 = heartPoint(c.t0, size);
    const p1 = heartPoint(c.t1, size);
    const n1 = (noise(c.noiseOff, tc) - 0.5) * 10;
    const n2 = (noise(c.noiseOff + 50, tc) - 0.5) * 10;
    stroke(225, 35, 40, 220);
    strokeWeight(c.weight);
    bezier(c.cx + p0.x, c.cy + p0.y,
           c.cx + (p0.x + p1.x) * 0.5 + c.offX + n1, c.cy + (p0.y + p1.y) * 0.5 + c.offY + n2,
           c.cx + (p0.x + p1.x) * 0.5 - c.offX - n1, c.cy + (p0.y + p1.y) * 0.5 - c.offY - n2,
           c.cx + p1.x, c.cy + p1.y);
  }
  drawingContext.shadowBlur = 0;

  pop();
}

// Curva del corazon parametrico clasico.
function heartPoint(t, scaleFactor) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  const k = scaleFactor / 17;
  return { x: x * k, y: y * k };
}

// Color radial: rojo en el centro → magenta → azul → hielo.
function colorForDist(d) {
  if (d < 0.30) return [230, 40, 50];
  if (d < 0.50) return [180, 60, 150];
  if (d < 0.72) return [95, 130, 230];
  return [160, 200, 245];
}
