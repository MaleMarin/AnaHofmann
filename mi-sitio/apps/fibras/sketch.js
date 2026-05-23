/*
 * Fibras — Ana Hofmann — "Anatomía de la Distancia"
 *
 * Dos siluetas humanas enfrentadas, tejidas con miles de hebras de lana
 * (curvas Bezier) que respiran. Cada hebra esta formada por una curva
 * principal + una hebra paralela (torsion) + 3 pelitos perpendiculares
 * que dan la textura afelpada. En el pecho de cada cuerpo late un
 * corazon rojo con halo.
 *
 * Render: Canvas 2D para maxima compatibilidad.
 */

let bodies = [];

const FIBERS_PER_BODY = 1100;
const CORE_FIBERS     = 110;
const FUZZ_PER_FIBER  = 3;
const ROTATION_SPEED  = 0.0005;
const FIGURE_OFFSET   = 0.20; // separacion del centro, en % del ancho

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
  // Cuerpo vertical: alto = min(78% alto ventana, 40% ancho ventana).
  const bh = Math.min(height * 0.78, width * 0.40);
  const bw = bh * 0.55;
  const offset = width * FIGURE_OFFSET;
  bodies.push(buildFigure(-offset, 0, bw, bh));
  bodies.push(buildFigure( offset, 0, bw, bh));
}

// ────────────────────────────────────────────────────────────────
// Silueta humana paramétrica. Compuesta por: cabeza, cuello, torso,
// brazos pegados al lado, cadera y dos piernas. Coordenadas locales
// en rango [-0.5, 0.5] en u (ancho) y v (alto, v<0 arriba).
// ────────────────────────────────────────────────────────────────
function isInBody(lx, ly, bw, bh) {
  const u = lx / bw;
  const v = ly / bh;

  // Cabeza (círculo).
  if (sq(u/0.13) + sq((v + 0.40)/0.10) < 1) return true;
  // Cuello (rectángulo corto).
  if (u > -0.05 && u < 0.05 && v > -0.32 && v < -0.27) return true;
  // Torso (elipse, hombros marcados).
  if (sq(u/0.20) + sq((v + 0.05)/0.22) < 1) return true;
  // Brazos (dos elipses verticales pegadas al torso).
  if (sq((u + 0.22)/0.07) + sq((v + 0.05)/0.20) < 1) return true;
  if (sq((u - 0.22)/0.07) + sq((v + 0.05)/0.20) < 1) return true;
  // Cadera.
  if (sq(u/0.18) + sq((v - 0.17)/0.08) < 1) return true;
  // Piernas (dos elipses verticales).
  if (sq((u + 0.09)/0.08) + sq((v - 0.35)/0.20) < 1) return true;
  if (sq((u - 0.09)/0.08) + sq((v - 0.35)/0.20) < 1) return true;
  return false;
}

function sq(x) { return x * x; }

function pickInBody(bw, bh) {
  for (let i = 0; i < 80; i++) {
    const lx = (Math.random() - 0.5) * bw * 1.05;
    const ly = (Math.random() - 0.5) * bh * 1.05;
    if (isInBody(lx, ly, bw, bh)) return { x: lx, y: ly };
  }
  return { x: 0, y: 0 };
}

function buildFigure(cx, cy, bw, bh) {
  const fibers = [];
  const cores  = [];
  const heartSize  = bh * 0.14;
  const heartLocalY = -0.05 * bh; // centro del corazon en el torso superior
  const heartCx = cx;
  const heartCy = cy + heartLocalY;

  // ── Hebras dentro del cuerpo ─────────────────────────────────
  for (let i = 0; i < FIBERS_PER_BODY; i++) {
    const p0 = pickInBody(bw, bh);
    // Hebra corta: el extremo cae cerca del origen (radio aleatorio).
    const distMax = bh * 0.18;
    let p1 = null;
    for (let j = 0; j < 18; j++) {
      const ang = Math.random() * TWO_PI;
      const d   = 4 + Math.random() * distMax;
      const cand = { x: p0.x + Math.cos(ang) * d, y: p0.y + Math.sin(ang) * d };
      if (isInBody(cand.x, cand.y, bw, bh)) { p1 = cand; break; }
    }
    if (!p1) p1 = { x: p0.x + 2, y: p0.y + 2 };

    // Coords absolutas (suma el centro de la figura).
    const p0ax = cx + p0.x, p0ay = cy + p0.y;
    const p1ax = cx + p1.x, p1ay = cy + p1.y;

    // Distancia al corazon (normalizada a la mitad del alto del cuerpo).
    const midX = (p0.x + p1.x) * 0.5;
    const midY = (p0.y + p1.y) * 0.5;
    const dh = Math.hypot(midX - 0, midY - heartLocalY) / (bh * 0.5);

    // Cerca del pecho: re-anclar el extremo al corazon paramétrico.
    let q0x = p0ax, q0y = p0ay;
    if (dh < 0.22) {
      const h = heartPoint(Math.random() * TWO_PI, heartSize);
      q0x = heartCx + h.x;
      q0y = heartCy + h.y;
    }

    fibers.push(makeFiber(q0x, q0y, p1ax, p1ay, colorForDist(dh)));
  }

  // ── Hebras del corazon ───────────────────────────────────────
  for (let i = 0; i < CORE_FIBERS; i++) {
    cores.push({
      cx: heartCx, cy: heartCy, heartSize,
      t0: Math.random() * TWO_PI,
      t1: Math.random() * TWO_PI,
      offX: (Math.random() - 0.5) * heartSize * 0.35,
      offY: (Math.random() - 0.5) * heartSize * 0.35,
      noiseOff: Math.random() * 1000,
      weight: 1.3 + Math.random() * 0.9,
    });
  }

  return { cx, cy, bw, bh, heartCx, heartCy, heartSize, fibers, cores };
}

// Cada hebra: bezier principal + bezier paralela (torsion) + pelitos.
function makeFiber(p0x, p0y, p1x, p1y, col) {
  const dx = p1x - p0x, dy = p1y - p0y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = -dy / len;
  const perpY =  dx / len;
  const off  = (Math.random() - 0.5) * 6;

  return {
    p0x, p0y, p1x, p1y,
    cp1x: p0x + dx * 0.30 + perpX * off,
    cp1y: p0y + dy * 0.30 + perpY * off,
    cp2x: p0x + dx * 0.70 + perpX * off,
    cp2y: p0y + dy * 0.70 + perpY * off,
    perpX, perpY,
    r: col[0], g: col[1], bb: col[2],
    alpha: 90 + Math.random() * 90,
    weight: 0.65 + Math.random() * 0.65,
    noiseOff: Math.random() * 1000,
    fuzz: makeFuzz(p0x, p0y, p1x, p1y, perpX, perpY),
  };
}

function makeFuzz(p0x, p0y, p1x, p1y, perpX, perpY) {
  const out = [];
  for (let i = 0; i < FUZZ_PER_FIBER; i++) {
    const t  = 0.18 + Math.random() * 0.64;
    const x0 = p0x * (1 - t) + p1x * t;
    const y0 = p0y * (1 - t) + p1y * t;
    const sign = Math.random() < 0.5 ? 1 : -1;
    const flen = 1.5 + Math.random() * 2.4;
    out.push({
      x1: x0,
      y1: y0,
      x2: x0 + perpX * flen * sign,
      y2: y0 + perpY * flen * sign,
    });
  }
  return out;
}

function draw() {
  background(7, 7, 9);

  push();
  translate(width / 2, height / 2);
  rotate(frameCount * ROTATION_SPEED);

  noFill();
  const t = frameCount * 0.005;

  for (const body of bodies) {
    for (let i = 0; i < body.fibers.length; i++) {
      const f = body.fibers[i];
      const n1 = (noise(f.noiseOff,       t) - 0.5) * 12;
      const n2 = (noise(f.noiseOff + 50,  t) - 0.5) * 12;
      const n3 = (noise(f.noiseOff + 100, t) - 0.5) * 12;
      const n4 = (noise(f.noiseOff + 150, t) - 0.5) * 12;

      // Hebra principal
      stroke(f.r, f.g, f.bb, f.alpha);
      strokeWeight(f.weight);
      bezier(f.p0x, f.p0y,
             f.cp1x + n1, f.cp1y + n2,
             f.cp2x + n3, f.cp2y + n4,
             f.p1x, f.p1y);

      // Hebra paralela (torsion) — desplazada perpendicular ~1px
      const dx = f.perpX * 1.1, dy = f.perpY * 1.1;
      stroke(f.r, f.g, f.bb, f.alpha * 0.55);
      strokeWeight(f.weight * 0.55);
      bezier(f.p0x + dx, f.p0y + dy,
             f.cp1x - n1 * 0.4 + dx, f.cp1y - n2 * 0.4 + dy,
             f.cp2x - n3 * 0.4 + dx, f.cp2y - n4 * 0.4 + dy,
             f.p1x + dx, f.p1y + dy);

      // Pelitos perpendiculares (afelpado de la lana)
      stroke(f.r, f.g, f.bb, f.alpha * 0.40);
      strokeWeight(0.45);
      for (let k = 0; k < f.fuzz.length; k++) {
        const z = f.fuzz[k];
        line(z.x1, z.y1, z.x2, z.y2);
      }
    }
  }

  // ── Corazones rojos pulsantes con halo ─────────────────────
  const pulse = 1 + Math.sin(frameCount * 0.05) * 0.18;
  const tc = frameCount * 0.012;
  drawingContext.shadowBlur = 30 + Math.sin(frameCount * 0.05) * 12;
  drawingContext.shadowColor = 'rgba(235, 45, 40, 0.95)';
  for (const body of bodies) {
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
  }
  drawingContext.shadowBlur = 0;

  pop();
}

// Curva paramétrica clásica del corazón.
function heartPoint(t, scaleFactor) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  const k = scaleFactor / 17;
  return { x: x * k, y: y * k };
}

// Paleta de lana: corazón rojo → terracota → ocre → crema cruda.
function colorForDist(d) {
  if (d < 0.22) return [225,  55,  50]; // rojo profundo (corazón)
  if (d < 0.42) return [200, 105,  70]; // terracota
  if (d < 0.66) return [205, 165, 120]; // ocre / camello
  return                [225, 205, 178]; // lana cruda
}
