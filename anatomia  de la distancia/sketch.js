/*
 * Anatomia de la Distancia
 * Dos figuras humanas abstractas hechas de miles de fibras nerviosas vibrantes.
 *
 * Arquitectura:
 *   - Lienzo WEBGL principal con blendMode(ADD) para que la densidad brille.
 *   - Buffer P2D offscreen (coreBuffer) para los nucleos rojos con shadowBlur,
 *     que se compone sobre el lienzo principal.
 *   - Modulos:
 *       FiberSystem -> nube de fibras del cuerpo (Bezier + Perlin).
 *       CoreHeart   -> nucleo rojo con forma del corazon parametrico, pulsa.
 *   - Las posiciones base de las fibras se precalculan en setup() y solo se
 *     aplica ruido a los puntos de control en draw().
 */

// ---------------------------------------------------------------------------
// Estado global
// ---------------------------------------------------------------------------

let figures = [];
let coreBuffer;

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

const FIBERS_PER_BODY = 3000;       // fibras del cuerpo por figura
const CORE_FIBERS     = 110;        // fibras del corazon por figura
const ROTATION_SPEED  = 0.0007;     // velocidad de la rotacion global (rad/frame)
const FIGURE_OFFSET   = 0.22;       // separacion entre figuras (% del ancho)

// ---------------------------------------------------------------------------
// p5 lifecycle
// ---------------------------------------------------------------------------

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(1);
  noiseDetail(2, 0.5);

  // Buffer P2D para los nucleos (necesita shadowBlur, que WEBGL no soporta).
  coreBuffer = createGraphics(width, height);
  coreBuffer.colorMode(RGB, 255, 255, 255, 255);

  buildScene();
}

function draw() {
  background(0);

  const rotation = frameCount * ROTATION_SPEED;

  // ------ Cuerpos (nubes de fibras) en lienzo WEBGL con blendMode(ADD) -----
  blendMode(ADD);
  push();
  rotateZ(rotation);
  for (const fig of figures) {
    fig.fiberSystem.display();
  }
  pop();

  // ------ Fibras conectoras entre las dos figuras --------------------------
  drawConnectionFibers(rotation);

  // ------ Nucleos rojos pintados en buffer P2D (shadowBlur) ----------------
  coreBuffer.clear();
  coreBuffer.push();
  coreBuffer.translate(width / 2, height / 2);
  coreBuffer.rotate(rotation);
  for (const fig of figures) {
    fig.coreHeart.displayTo(coreBuffer);
  }
  coreBuffer.pop();

  // ------ Componer buffer sobre el lienzo WEBGL ----------------------------
  blendMode(BLEND);
  push();
  translate(-width / 2, -height / 2);
  image(coreBuffer, 0, 0);
  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  coreBuffer = createGraphics(width, height);
  coreBuffer.colorMode(RGB, 255, 255, 255, 255);
  buildScene();
}

function buildScene() {
  figures = [];

  const bodyW = min(width * 0.42, height * 1.65);
  const bodyH = bodyW * 0.30;
  const offset = width * FIGURE_OFFSET;

  // Coordenadas en sistema WEBGL (origen al centro del lienzo).
  figures.push(new Figure(-offset, 0, bodyW, bodyH));
  figures.push(new Figure( offset, 0, bodyW, bodyH));
}

// ---------------------------------------------------------------------------
// Conectores: fibras ultra finas que cruzan el vacio entre las dos figuras.
// Aparecen periodicamente, como una tension nerviosa entre los cuerpos.
// ---------------------------------------------------------------------------

function drawConnectionFibers(rotation) {
  // Pulso lento que controla la "cercania" simbolica entre cuerpos.
  const closeness = (sin(frameCount * 0.004) + 1) * 0.5;
  if (closeness < 0.7) return;

  const intensity = map(closeness, 0.7, 1.0, 0, 1);
  const numLines = floor(70 * intensity);

  blendMode(ADD);
  push();
  rotateZ(rotation);
  noFill();
  for (let i = 0; i < numLines; i++) {
    const p0 = figures[0].pickEdgePoint();
    const p1 = figures[1].pickEdgePoint();
    const mx = (p0.x + p1.x) * 0.5 + random(-40, 40);
    const my = (p0.y + p1.y) * 0.5 + random(-40, 40);

    stroke(180, 210, 240, random(15, 35) * intensity);
    strokeWeight(random(0.2, 0.5));
    bezier(p0.x, p0.y, mx, my, mx, my, p1.x, p1.y);
  }
  pop();
}

// ===========================================================================
// FIGURE: compone una figura humana abstracta = FiberSystem + CoreHeart
// ===========================================================================

class Figure {
  constructor(cx, cy, bodyW, bodyH) {
    this.cx = cx;
    this.cy = cy;
    this.bodyW = bodyW;
    this.bodyH = bodyH;
    this.fiberSystem = new FiberSystem(cx, cy, bodyW, bodyH);
    this.coreHeart   = new CoreHeart(cx, cy, bodyH * 0.85);
  }

  pickEdgePoint() {
    // Punto cerca del borde de la nube, para que las conexiones nazcan
    // donde la silueta abstracta es mas visible.
    const ang = random(TWO_PI);
    const r = random(0.7, 1.0);
    return createVector(
      this.cx + cos(ang) * r * this.bodyW * 0.5,
      this.cy + sin(ang) * r * this.bodyH * 0.5
    );
  }
}

// ===========================================================================
// FIBER SYSTEM
// Nube de fibras Bezier distribuidas en una elipse alargada (cuerpo).
// Las fibras cercanas al centro son "succionadas" hacia la curva del corazon.
// ===========================================================================

class FiberSystem {
  constructor(cx, cy, bodyW, bodyH) {
    this.cx = cx;
    this.cy = cy;
    this.bodyW = bodyW;
    this.bodyH = bodyH;
    this.fibers = [];

    const heartSize = bodyH * 0.85;
    for (let i = 0; i < FIBERS_PER_BODY; i++) {
      this.fibers.push(this.buildFiber(heartSize));
    }
  }

  buildFiber(heartSize) {
    const a = this.bodyW * 0.5;
    const b = this.bodyH * 0.5;

    // Distribucion paramerica uniforme dentro de la elipse del cuerpo.
    const r0 = sqrt(random());
    const ang0 = random(TWO_PI);
    const r1 = sqrt(random());
    const ang1 = random(TWO_PI);

    let p0 = createVector(this.cx + cos(ang0) * r0 * a, this.cy + sin(ang0) * r0 * b);
    let p3 = createVector(this.cx + cos(ang1) * r1 * a, this.cy + sin(ang1) * r1 * b);

    // Succion al corazon: las fibras cercanas al centro proyectan uno o ambos
    // extremos sobre la curva parametrica del corazon. Esto crea el efecto
    // de "atractor" sin necesidad de un calculo fisico real.
    const dn0 = sqrt(pow(r0 * cos(ang0), 2) + pow(r0 * sin(ang0), 2));
    const dn1 = sqrt(pow(r1 * cos(ang1), 2) + pow(r1 * sin(ang1), 2));
    if (dn0 < 0.32) {
      const h = heartPoint(random(TWO_PI), heartSize);
      p0 = createVector(this.cx + h.x, this.cy + h.y);
    }
    if (dn1 < 0.32) {
      const h = heartPoint(random(TWO_PI), heartSize);
      p3 = createVector(this.cx + h.x, this.cy + h.y);
    }

    // Puntos de control: cerca del medio + offset organico.
    const cp1 = createVector(
      lerp(p0.x, p3.x, 0.33) + random(-b * 0.7, b * 0.7),
      lerp(p0.y, p3.y, 0.33) + random(-b * 0.7, b * 0.7)
    );
    const cp2 = createVector(
      lerp(p0.x, p3.x, 0.66) + random(-b * 0.7, b * 0.7),
      lerp(p0.y, p3.y, 0.66) + random(-b * 0.7, b * 0.7)
    );

    // Color por gradiente radial: rojo cerca del corazon, frio en el exterior.
    const meanDist = (dn0 + dn1) * 0.5;
    const col = colorForDist(meanDist);

    return {
      p0, p3, cp1, cp2,
      col,
      alpha: random(22, 40),
      weight: random(0.45, 0.95),
      noiseOff: random(1000),
    };
  }

  display() {
    const t = frameCount * 0.005;
    noFill();
    for (const f of this.fibers) {
      const n1x = (noise(f.noiseOff,       t) - 0.5) * 28;
      const n1y = (noise(f.noiseOff + 30,  t) - 0.5) * 28;
      const n2x = (noise(f.noiseOff + 60,  t) - 0.5) * 28;
      const n2y = (noise(f.noiseOff + 90,  t) - 0.5) * 28;

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
}

// ===========================================================================
// CORE HEART
// Nucleo rojo con forma del corazon parametrico clasico:
//   x(t) = 16 sin(t)^3
//   y(t) = 13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t)
// Las fibras nacen y mueren sobre la curva, vibran y pulsan al ritmo
// de sin(frameCount * 0.05). Se pinta en un buffer P2D con shadowBlur
// para conseguir el efecto acrilico iluminado.
// ===========================================================================

class CoreHeart {
  constructor(cx, cy, sizePx) {
    this.cx = cx;
    this.cy = cy;
    this.sizePx = sizePx;
    this.fibers = [];

    for (let i = 0; i < CORE_FIBERS; i++) {
      this.fibers.push({
        t0: random(TWO_PI),
        t1: random(TWO_PI),
        cp1Off: createVector(
          random(-sizePx * 0.18, sizePx * 0.18),
          random(-sizePx * 0.18, sizePx * 0.18)
        ),
        cp2Off: createVector(
          random(-sizePx * 0.18, sizePx * 0.18),
          random(-sizePx * 0.18, sizePx * 0.18)
        ),
        noiseOff: random(1000),
        weight: random(1.3, 2.0),
        red: 200 + random(-15, 35),
      });
    }
  }

  displayTo(buf) {
    // El llamador ya hizo: buf.translate(width/2, height/2); buf.rotate(rot);
    // Por lo tanto trabajamos en el sistema rotante, con origen al centro.
    buf.push();
    buf.translate(this.cx, this.cy);

    const pulse = 1 + sin(frameCount * 0.05) * 0.18;
    const sizeNow = this.sizePx * pulse;

    buf.drawingContext.shadowBlur = 22 + sin(frameCount * 0.05) * 8;
    buf.drawingContext.shadowColor = 'rgba(220, 30, 30, 0.9)';
    buf.noFill();

    const t = frameCount * 0.012;
    for (const f of this.fibers) {
      const p0 = heartPoint(f.t0, sizeNow);
      const p1 = heartPoint(f.t1, sizeNow);

      const n1x = (noise(f.noiseOff,       t) - 0.5) * 10;
      const n1y = (noise(f.noiseOff + 30,  t) - 0.5) * 10;
      const n2x = (noise(f.noiseOff + 60,  t) - 0.5) * 10;
      const n2y = (noise(f.noiseOff + 90,  t) - 0.5) * 10;

      const cp1x = lerp(p0.x, p1.x, 0.33) + f.cp1Off.x + n1x;
      const cp1y = lerp(p0.y, p1.y, 0.33) + f.cp1Off.y + n1y;
      const cp2x = lerp(p0.x, p1.x, 0.66) + f.cp2Off.x + n2x;
      const cp2y = lerp(p0.y, p1.y, 0.66) + f.cp2Off.y + n2y;

      buf.stroke(f.red, 25, 30, 210);
      buf.strokeWeight(f.weight);
      buf.bezier(p0.x, p0.y, cp1x, cp1y, cp2x, cp2y, p1.x, p1.y);
    }

    buf.drawingContext.shadowBlur = 0;
    buf.pop();
  }
}

// ===========================================================================
// UTILIDADES
// ===========================================================================

// Punto sobre la curva del corazon parametrico.
// La curva original ocupa x in [-16,16], y in [-17,12] (eje Y matematico).
// Invertimos Y para que apunte hacia arriba en pantalla y normalizamos.
function heartPoint(t, scaleFactor) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  const k = scaleFactor / 17;
  return createVector(x * k, y * k);
}

// Color por distancia normalizada al centro (0 = centro, 1 = borde).
// Rojo Italiano en el nucleo -> purpura de transicion -> azul frio -> hielo.
function colorForDist(d) {
  if (d < 0.30) return { r: 220, g: 35, b: 45 };
  if (d < 0.50) return { r: 160, g: 60, b: 130 };
  if (d < 0.72) return { r: 80,  g: 100, b: 210 };
  return { r: 140, g: 190, b: 235 };
}
