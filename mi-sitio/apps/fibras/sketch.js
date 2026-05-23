/*
 * Fibras — Ana Hofmann — "Anatomía de la Distancia"
 *
 * Dos siluetas humanas verticales enfrentadas, tejidas con miles de fibras
 * nerviosas (curvas Bezier). Paleta neón por región:
 *   - Cabeza y pierna izquierda → naranja neón
 *   - Brazos → 7 colores neón aleatorios por fibra
 *   - Resto → azul suave
 *
 * Cada figura tiene movimiento orgánico permanente:
 *   - Respiración global (breathPhase)
 *   - Inquietud por miembro (leftArm, rightArm, leftLeg, rightLeg)
 *   - Espasmos ocasionales en un miembro al azar
 *
 * Render: Canvas 2D para máxima compatibilidad.
 *
 * (Fase 1: solo silueta + movimiento. Fase 2: tender points + clicks.)
 */

let bodies = [];
let breathPhase = 0;

const FIBERS_PER_BODY = 1400;
const FIGURE_OFFSET   = 0.22; // separación del centro, en % del ancho

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
  bodies = [];
  const bh = Math.min(height * 0.82, width * 0.42);
  const bw = bh * 0.55;
  const offset = width * FIGURE_OFFSET;
  bodies.push(buildFigure(-offset, 0, bw, bh, 0));
  bodies.push(buildFigure( offset, 0, bw, bh, 1));
}

// ────────────────────────────────────────────────────────────────
// Silueta humana paramétrica (vertical, cabeza arriba). Coordenadas
// normalizadas en u (ancho) y v (alto). u, v ∈ [-0.5, 0.5].
// ────────────────────────────────────────────────────────────────
function isInBody(lx, ly, bw, bh) {
  const u = lx / bw;
  const v = ly / bh;
  // Cabeza (círculo).
  if (sq(u/0.14) + sq((v + 0.42)/0.10) < 1) return true;
  // Cuello.
  if (u > -0.05 && u < 0.05 && v >= -0.32 && v <= -0.28) return true;
  // Torso (elipse, hombros marcados).
  if (sq(u/0.22) + sq((v + 0.05)/0.22) < 1) return true;
  // Brazos (separados ligeramente del torso).
  if (sq((u + 0.28)/0.07) + sq((v + 0.00)/0.21) < 1) return true;
  if (sq((u - 0.28)/0.07) + sq((v + 0.00)/0.21) < 1) return true;
  // Cadera.
  if (sq(u/0.20) + sq((v - 0.17)/0.08) < 1) return true;
  // Piernas (separadas con entrepierna).
  if (sq((u + 0.10)/0.08) + sq((v - 0.34)/0.20) < 1) return true;
  if (sq((u - 0.10)/0.08) + sq((v - 0.34)/0.20) < 1) return true;
  return false;
}

function sq(x) { return x * x; }

// Asigna región anatómica a un punto en coords locales.
function regionOf(lx, ly, bw, bh) {
  const u = lx / bw;
  const v = ly / bh;
  if (v < -0.28) return 'head';
  if (v > 0.20)  return (u < 0) ? 'leftLeg' : 'rightLeg';
  if (u < -0.20) return 'leftArm';
  if (u >  0.20) return 'rightArm';
  return 'torso';
}

function pickInBody(bw, bh) {
  for (let i = 0; i < 80; i++) {
    const lx = (Math.random() - 0.5) * bw * 1.05;
    const ly = (Math.random() - 0.5) * bh * 1.05;
    if (isInBody(lx, ly, bw, bh)) {
      return { x: lx, y: ly, region: regionOf(lx, ly, bw, bh) };
    }
  }
  return { x: 0, y: 0, region: 'torso' };
}

function pickInRegion(bw, bh, region) {
  for (let i = 0; i < 120; i++) {
    const p = pickInBody(bw, bh);
    if (p.region === region) return p;
  }
  return pickInBody(bw, bh);
}

function buildFigure(cx, cy, bw, bh, idx) {
  const fibers = [];
  const heartSize  = bh * 0.13;
  const heartLocalY = -0.05 * bh;
  const heartCx = cx;
  const heartCy = cy + heartLocalY;

  // Conteos por región: brazos y piernas más densos (como en la referencia).
  const counts = {
    head:     Math.floor(FIBERS_PER_BODY * 0.18),
    torso:    Math.floor(FIBERS_PER_BODY * 0.15),
    leftArm:  Math.floor(FIBERS_PER_BODY * 0.17),
    rightArm: Math.floor(FIBERS_PER_BODY * 0.17),
    leftLeg:  Math.floor(FIBERS_PER_BODY * 0.18),
    rightLeg: Math.floor(FIBERS_PER_BODY * 0.15),
  };

  for (const region in counts) {
    for (let i = 0; i < counts[region]; i++) {
      const p0 = pickInRegion(bw, bh, region);
      // Hebra corta dentro de la misma región.
      const distMax = bh * 0.16;
      let p1 = null;
      for (let j = 0; j < 18; j++) {
        const ang = Math.random() * TWO_PI;
        const d   = 5 + Math.random() * distMax;
        const cand = { x: p0.x + Math.cos(ang) * d, y: p0.y + Math.sin(ang) * d };
        if (isInBody(cand.x, cand.y, bw, bh)) { p1 = cand; break; }
      }
      if (!p1) p1 = { x: p0.x + 2, y: p0.y + 2 };

      fibers.push(makeFiber(cx, cy, p0.x, p0.y, p1.x, p1.y, region));
    }
  }

  // Hebras del corazón (manto rojo en el pecho).
  const cores = [];
  for (let i = 0; i < 90; i++) {
    cores.push({
      cx: heartCx, cy: heartCy, heartSize,
      t0: Math.random() * TWO_PI,
      t1: Math.random() * TWO_PI,
      offX: (Math.random() - 0.5) * heartSize * 0.35,
      offY: (Math.random() - 0.5) * heartSize * 0.35,
      noiseOff: Math.random() * 1000,
      weight: 1.2 + Math.random() * 0.8,
    });
  }

  return {
    idx, cx, cy, bw, bh, heartCx, heartCy, heartSize,
    fibers, cores,
    // Tiempo desfasado entre figuras para que no respiren al unísono.
    time: idx * 1.7,
    // Movimientos por miembro (osciladores globales por figura).
    limbMov: { leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 },
    spasm:   { leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 },
    nextSpasm: 1.5 + Math.random() * 3,
    spasmT: 0,
  };
}

// Cada fibra: curva Bezier suave con puntos interpolados; cada punto tiene
// su propio offset de respiración y de ruido para movimiento orgánico.
function makeFiber(cx, cy, p0x, p0y, p1x, p1y, region) {
  // Coords absolutas (referidas al centro de la figura).
  const ax0 = cx + p0x, ay0 = cy + p0y;
  const ax1 = cx + p1x, ay1 = cy + p1y;

  const dx = ax1 - ax0, dy = ay1 - ay0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = -dy / len;
  const perpY =  dx / len;
  const curvature = (Math.random() - 0.5) * 20;

  // Puntos a lo largo de la fibra (precomputados con jitter).
  const N = 8;
  const points = [];
  const originals = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const edge = Math.sin(t * Math.PI);
    const offX = perpX * curvature * edge + (Math.random() - 0.5) * 1.5;
    const offY = perpY * curvature * edge + (Math.random() - 0.5) * 1.5;
    const x = ax0 + dx * t + offX;
    const y = ay0 + dy * t + offY;
    points.push({ x, y });
    originals.push({ x, y });
  }

  // Tipo de color random para brazos (7 paletas).
  const armColorType = Math.floor(Math.random() * 7);

  return {
    region,
    armColorType,
    points,
    originals,
    flowPhase:     Math.random() * TWO_PI,
    breathSpeed:   0.8 + Math.random() * 0.4,
    breathAmp:     0.5 + Math.random() * 1.0,
    noiseOff:      Math.random() * 1000,
    inkOff:        Math.random() * 1000,
    weight:        0.45 + Math.random() * 0.55,
    alpha:         95 + Math.random() * 80,
    colorVar:      (Math.random() - 0.5) * 50,
    // Para hilos en miembros, su posición media en el miembro (0 base → 1 punta).
    memberT:       Math.random(),
  };
}

function draw() {
  background(0);

  breathPhase += 0.030;

  for (const body of bodies) {
    updateBody(body);
    drawBody(body);
  }
}

// Actualiza osciladores de miembros y espasmos por figura.
function updateBody(body) {
  body.time += 0.012;
  const t = body.time;

  // Inquietud continua de cada miembro (sin/cos desfasados).
  body.limbMov.leftArm  = Math.sin(t * 1.4)         * 1.5 + Math.cos(t * 0.6)       * 0.8;
  body.limbMov.rightArm = Math.sin(t * 1.8 + 1.5)   * 1.4 + Math.cos(t * 0.8 + 2)   * 0.9;
  body.limbMov.leftLeg  = Math.sin(t * 1.2 + 3.0)   * 1.6 + Math.cos(t * 1.0 + 1)   * 0.7;
  body.limbMov.rightLeg = Math.sin(t * 1.6 + 4.5)   * 1.5 + Math.cos(t * 0.7 + 3)   * 0.8;

  // Espasmos ocasionales (decaen exponencialmente).
  body.spasmT += 1 / 60;
  if (body.spasmT >= body.nextSpasm) {
    const limbs = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
    const pick = limbs[Math.floor(Math.random() * limbs.length)];
    body.spasm[pick] += 3 + Math.random() * 4;
    body.spasmT = 0;
    body.nextSpasm = 1.5 + Math.random() * 3.5;
  }
  for (const k in body.spasm) body.spasm[k] *= 0.93;

  // Mover cada fibra.
  for (let i = 0; i < body.fibers.length; i++) {
    updateFiber(body.fibers[i], body);
  }
}

function updateFiber(f, body) {
  const baseLimbMov = body.limbMov[f.region] || 0;
  const spasmMov    = body.spasm[f.region]   || 0;
  const movement    = baseLimbMov + spasmMov;
  const isLimb = (f.region === 'leftArm' || f.region === 'rightArm'
               || f.region === 'leftLeg' || f.region === 'rightLeg');

  for (let i = 0; i < f.points.length; i++) {
    const o = f.originals[i];
    const t = i / f.points.length;

    // Respiración orgánica.
    const breathX = Math.sin((breathPhase + f.flowPhase) * f.breathSpeed + i * 0.2)
                  * 2.2 * f.breathAmp;
    const breathY = Math.cos((breathPhase + f.flowPhase) * f.breathSpeed + i * 0.3)
                  * 1.4 * f.breathAmp;

    // Drift con Perlin (ondulación natural).
    const driftX = (noise(f.noiseOff       + i * 0.1, frameCount * 0.012) - 0.5) * 3;
    const driftY = (noise(f.noiseOff + 500 + i * 0.1, frameCount * 0.012) - 0.5) * 3;

    let nx = o.x + breathX + driftX;
    let ny = o.y + breathY + driftY;

    // Movimiento por miembro (mayor en el centro de la fibra).
    if (isLimb && Math.abs(movement) > 0.01) {
      const posFactor = Math.sin(t * Math.PI);
      const memberFactor = 0.5 + f.memberT * 1.5; // mayor en puntas
      const amp = movement * memberFactor;
      nx += Math.cos(body.time * 0.7 + f.flowPhase) * amp * 0.8 * posFactor;
      ny += Math.sin(body.time * 0.9 + f.flowPhase) * amp * 1.2 * posFactor;
    }

    // Suavizado al target.
    f.points[i].x = lerp(f.points[i].x, nx, 0.20);
    f.points[i].y = lerp(f.points[i].y, ny, 0.20);
  }
}

function drawBody(body) {
  // Fibras
  noFill();
  for (let i = 0; i < body.fibers.length; i++) {
    drawFiber(body.fibers[i]);
  }

  // Corazón rojo pulsante con halo.
  const pulse = 1 + Math.sin(frameCount * 0.05) * 0.18;
  const tc = frameCount * 0.012;
  drawingContext.shadowBlur = 26 + Math.sin(frameCount * 0.05) * 10;
  drawingContext.shadowColor = 'rgba(235, 40, 35, 0.95)';
  for (let i = 0; i < body.cores.length; i++) {
    const c = body.cores[i];
    const size = c.heartSize * pulse;
    const p0 = heartPoint(c.t0, size);
    const p1 = heartPoint(c.t1, size);
    const n1 = (noise(c.noiseOff,      tc) - 0.5) * 6;
    const n2 = (noise(c.noiseOff + 50, tc) - 0.5) * 6;
    stroke(230, 40, 40, 230);
    strokeWeight(c.weight);
    bezier(c.cx + p0.x, c.cy + p0.y,
           c.cx + (p0.x + p1.x) * 0.5 + c.offX + n1, c.cy + (p0.y + p1.y) * 0.5 + c.offY + n2,
           c.cx + (p0.x + p1.x) * 0.5 - c.offX - n1, c.cy + (p0.y + p1.y) * 0.5 - c.offY - n2,
           c.cx + p1.x, c.cy + p1.y);
  }
  drawingContext.shadowBlur = 0;
}

function drawFiber(f) {
  const col = colorForFiber(f);

  // Trazo principal con strokeWeight variable (efecto tinta).
  drawingContext.shadowBlur = 1.5;
  drawingContext.shadowColor = `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.30)`;
  stroke(col[0], col[1], col[2], f.alpha);

  beginShape();
  curveVertex(f.points[0].x, f.points[0].y);
  for (let i = 0; i < f.points.length; i++) {
    const p = f.points[i];
    const t = i / f.points.length;
    const inkN = noise(f.inkOff + t * 5, frameCount * 0.015);
    strokeWeight(f.weight * (0.7 + inkN * 0.6));
    curveVertex(p.x, p.y);
  }
  const last = f.points[f.points.length - 1];
  curveVertex(last.x, last.y);
  endShape();

  drawingContext.shadowBlur = 0;
}

// ────────────────────────────────────────────────────────────────
// Paleta neón por región (adaptada de la referencia).
//   - head, leftLeg → naranja neón
//   - leftArm, rightArm → 7 colores neón (random por fibra)
//   - resto → azul suave
// ────────────────────────────────────────────────────────────────
function colorForFiber(f) {
  const v = Math.sin(f.flowPhase + breathPhase) * 25;
  const k = f.colorVar;

  // Naranja neón para cabeza y pierna izquierda.
  if (f.region === 'head' || f.region === 'leftLeg') {
    return [
      clamp(255 + v * 0.8 + k * 1.6),
      clamp(140 + v       + k * 1.3),
      clamp( 20 + v * 0.4 + k * 0.5),
    ];
  }

  // 7 paletas neón para brazos.
  if (f.region === 'leftArm' || f.region === 'rightArm') {
    switch (f.armColorType) {
      case 0: return [clamp(220 + v + k*1.5), clamp(200 + v + k*1.3), clamp( 30 + v*0.5 + k*0.5)]; // amarillo
      case 1: return [clamp( 50 + v + k*0.7), clamp(255 + v*0.8 + k*1.5), clamp( 80 + v*0.6 + k*0.8)]; // verde neón
      case 2: return [clamp(120 + v + k*1.5), clamp( 50 + v + k*0.8), clamp(180 + v*0.9 + k)];   // violeta
      case 3: return [clamp(180 + v + k*1.3), clamp( 50 + v + k*0.7), clamp(140 + v*0.8 + k*0.9)]; // magenta
      case 4: return [clamp( 40 + v + k*0.8), clamp(180 + v + k*1.5), clamp(100 + v*0.7 + k)];   // esmeralda
      case 5: return [clamp(255 + v*0.8 + k*1.4), clamp(140 + v + k*1.1), clamp( 30 + v*0.5 + k*0.6)]; // naranja
      case 6: return [clamp( 30 + v + k), clamp(150 + v + k*1.2), clamp(180 + v*0.8 + k*0.8)];   // cian
    }
  }

  // Azul suave para torso y pierna derecha.
  return [
    clamp( 40 + v + k),
    clamp( 80 + v + k * 0.8),
    clamp(150 + v * 0.8 + k * 0.5),
  ];
}

function clamp(x) { return Math.max(0, Math.min(255, x)); }

// Curva paramétrica clásica del corazón.
function heartPoint(t, scaleFactor) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  const k = scaleFactor / 17;
  return { x: x * k, y: y * k };
}
