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
const ROTATION_SPEED  = 0;
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

    // Control points SOBRE la linea p0->p1 con offset perpendicular en el
    // MISMO sentido (mismo signo para cp1 y cp2). Esto produce arcos
    // limpios en vez de zigzags/eses. Las fibras del borde (anillo blanco)
    // usan curvatura mas chica para que no salgan "chuecas".
    const dxL = p1x - p0x;
    const dyL = p1y - p0y;
    const lenL = Math.sqrt(dxL * dxL + dyL * dyL) || 1;
    const perpX = -dyL / lenL;
    const perpY =  dxL / lenL;
    const isOuter = meanR >= 0.62;
    const curvMag = isOuter ? b * 0.28 : b * 0.65;
    const curvSign = Math.random() < 0.5 ? -1 : 1;
    const curv1 = curvSign * curvMag * (0.55 + Math.random() * 0.45);
    const curv2 = curvSign * curvMag * (0.55 + Math.random() * 0.45);
    const mid1x = p0x + dxL * 0.33;
    const mid1y = p0y + dyL * 0.33;
    const mid2x = p0x + dxL * 0.66;
    const mid2y = p0y + dyL * 0.66;

    fibers.push({
      p0x, p0y, p1x, p1y,
      cp1x: mid1x + perpX * curv1,
      cp1y: mid1y + perpY * curv1,
      cp2x: mid2x + perpX * curv2,
      cp2y: mid2y + perpY * curv2,
      r: col[0], g: col[1], bb: col[2],
      alpha: 60 + Math.random() * 80,
      weight: 0.55 + Math.random() * 0.6,
      noiseOff: Math.random() * 1000,
      // Las fibras del borde (anillo blanco) quedan COMPLETAMENTE quietas.
      // Las del interior conservan su movimiento organico.
      noiseAmp: isOuter ? 0 : 22,
    });
  }

  // Radio del ovillo (compartido por todas las fibras del corazon): un poco
  // mas grande que el corazon para que el ovillo sea claramente una "bola".
  const ballR = heartSize * 0.82;

  for (let i = 0; i < CORE_FIBERS; i++) {
    // Cada hilo del corazon tiene 3 estados precomputados que no cambian
    // frame a frame: PUNTA (cluster diminuto en el centro), OVILLO (cuerda
    // que cruza un circulo) y CORAZON (curva limpia parametrica). Al
    // animar, simplemente interpolamos linealmente entre estos targets.

    // OVILLO: cuerda cruzando el circulo. p0 y p1 en angulos angA y angB
    // sobre el circulo de radio ballR. Si la separacion es chica, la cuerda
    // bordea la pelota; si es grande, la cruza por el centro.
    const angA = Math.random() * TWO_PI;
    const angB = angA + Math.PI * (0.35 + Math.random() * 1.30);
    // Curvatura propia de la cuerda (perpendicular). Signos aleatorios
    // hacen que algunas cuerdas curven hacia adentro, otras hacia afuera.
    const ballCurve = (Math.random() - 0.5) * heartSize * 0.85;

    // PUNTA: posicion del hilo cuando todos colapsan a un cluster diminuto.
    // Un pequeño jitter por fibra para que no sea un solo pixel.
    const pjit = heartSize * 0.04;

    cores.push({
      cx, cy, heartSize,
      // side = +1 figura derecha, -1 figura izquierda. Sirve para que los
      // corazones se asomen el uno hacia el otro y se hundan al alejarse.
      side: cx >= 0 ? 1 : -1,
      bodyA: a, bodyB: b,
      // Estado CORAZON:
      t0: Math.random() * TWO_PI,
      t1: Math.random() * TWO_PI,
      offX: (Math.random() - 0.5) * heartSize * 0.35,
      offY: (Math.random() - 0.5) * heartSize * 0.35,
      // Estado OVILLO:
      ballR,
      ballP0X: Math.cos(angA) * ballR,
      ballP0Y: Math.sin(angA) * ballR,
      ballP1X: Math.cos(angB) * ballR,
      ballP1Y: Math.sin(angB) * ballR,
      ballCurve,
      // Estado PUNTA:
      pointJX: (Math.random() - 0.5) * pjit,
      pointJY: (Math.random() - 0.5) * pjit,
      noiseOff: Math.random() * 1000,
      weight: 1.2 + Math.random() * 0.8,
    });
  }
}

// Curva del ciclo PUNTA -> OVILLO -> CORAZON -> OVILLO -> PUNTA con
// PAUSAS en cada estado y smoothstep en las transiciones.
// Devuelve un numero en [0, 2]: 0 = punta, 1 = ovillo, 2 = corazon.
function heartMorph(phase) {
  const ss = x => x * x * (3 - 2 * x);
  if      (phase < 0.20) return 0;                            // punta (linger)
  else if (phase < 0.50) return ss((phase - 0.20) / 0.30);    // punta -> ovillo
  else if (phase < 0.70) return 1;                            // ovillo (linger)
  else if (phase < 1.00) return 1 + ss((phase - 0.70) / 0.30);// ovillo -> corazon
  else if (phase < 1.20) return 2;                            // corazon (linger)
  else if (phase < 1.50) return 2 - ss((phase - 1.20) / 0.30);// corazon -> ovillo
  else if (phase < 1.70) return 1;                            // ovillo (linger)
  else                   return 1 - ss((phase - 1.70) / 0.30);// ovillo -> punta
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
    const na = f.noiseAmp;
    const n1 = (noise(f.noiseOff,       t) - 0.5) * na;
    const n2 = (noise(f.noiseOff + 50,  t) - 0.5) * na;
    const n3 = (noise(f.noiseOff + 100, t) - 0.5) * na;
    const n4 = (noise(f.noiseOff + 150, t) - 0.5) * na;
    stroke(f.r, f.g, f.bb, f.alpha);
    strokeWeight(f.weight);
    bezier(f.p0x, f.p0y,
           f.cp1x + n1, f.cp1y + n2,
           f.cp2x + n3, f.cp2y + n4,
           f.p1x, f.p1y);
  }

  // ── Corazones rojos: ciclo PUNTA -> OVILLO -> CORAZON -> OVILLO -> PUNTA.
  //
  // Cada hilo del corazon tiene 3 targets precomputados (punta, ovillo,
  // corazon). Frame a frame interpolamos linealmente entre ellos segun el
  // valor de `morph` (0 = punta, 1 = ovillo, 2 = corazon). El ciclo dura
  // ~21s con PAUSAS en cada estado y smoothstep en las transiciones, asi
  // se ve claramente "primero punta, despues ovillo, despues corazon".
  //
  // Ademas el corazon entra y sale del cuerpo: cuando es punta esta hundido
  // adentro, como ovillo asoma a la mitad, como corazon esta afuera asomado.
  const pulse = 1 + Math.sin(frameCount * 0.05) * 0.18;
  const phase = (frameCount * 0.0016) % 2;                  // periodo ~21s
  const morph = heartMorph(phase);                          // 0..2
  const inOut = morph - 1;                                  // -1..+1
  const kAB   = Math.min(1, morph);                         // 0..1 (punta -> ovillo)
  const kBC   = Math.max(0, morph - 1);                     // 0..1 (ovillo -> corazon)

  const visible = Math.max(0.25, (inOut + 1) * 0.5);
  drawingContext.shadowBlur  = (28 + Math.sin(frameCount * 0.05) * 10) * visible;
  drawingContext.shadowColor = `rgba(230, 35, 35, ${0.95 * visible})`;

  const tc = frameCount * 0.010;

  for (let i = 0; i < cores.length; i++) {
    const c = cores[i];
    const size = c.heartSize * pulse;

    // Target del estado CORAZON (curva parametrica limpia).
    const hp0 = heartPoint(c.t0, size);
    const hp1 = heartPoint(c.t1, size);
    const hmx = (hp0.x + hp1.x) * 0.5;
    const hmy = (hp0.y + hp1.y) * 0.5;
    const hcp1x = hmx + c.offX, hcp1y = hmy + c.offY;
    const hcp2x = hmx - c.offX, hcp2y = hmy - c.offY;

    // Target del estado OVILLO (cuerda en el circulo, curvada perpendic.).
    const bp0x = c.ballP0X, bp0y = c.ballP0Y;
    const bp1x = c.ballP1X, bp1y = c.ballP1Y;
    const bdx = bp1x - bp0x, bdy = bp1y - bp0y;
    const blen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
    const bperpX = -bdy / blen, bperpY = bdx / blen;
    const bcp1x = bp0x + bdx * 0.33 + bperpX * c.ballCurve;
    const bcp1y = bp0y + bdy * 0.33 + bperpY * c.ballCurve;
    const bcp2x = bp0x + bdx * 0.66 + bperpX * c.ballCurve;
    const bcp2y = bp0y + bdy * 0.66 + bperpY * c.ballCurve;

    // Target del estado PUNTA (jitter chico). Todos los puntos del bezier
    // colapsan al mismo lugar -> degeneracion controlada al cluster.
    const ptX = c.pointJX, ptY = c.pointJY;

    // ── Interpolacion en dos tramos. Primero punta -> ovillo (kAB),
    //    despues ovillo -> corazon (kBC).
    let p0x = ptX + (bp0x - ptX) * kAB;
    let p0y = ptY + (bp0y - ptY) * kAB;
    let p1x = ptX + (bp1x - ptX) * kAB;
    let p1y = ptY + (bp1y - ptY) * kAB;
    let cp1x = ptX + (bcp1x - ptX) * kAB;
    let cp1y = ptY + (bcp1y - ptY) * kAB;
    let cp2x = ptX + (bcp2x - ptX) * kAB;
    let cp2y = ptY + (bcp2y - ptY) * kAB;
    if (kBC > 0) {
      p0x = p0x + (hp0.x - p0x) * kBC;
      p0y = p0y + (hp0.y - p0y) * kBC;
      p1x = p1x + (hp1.x - p1x) * kBC;
      p1y = p1y + (hp1.y - p1y) * kBC;
      cp1x = cp1x + (hcp1x - cp1x) * kBC;
      cp1y = cp1y + (hcp1y - cp1y) * kBC;
      cp2x = cp2x + (hcp2x - cp2x) * kBC;
      cp2y = cp2y + (hcp2y - cp2y) * kBC;
    }

    // Posicion del centro del corazon: entra/sale del cuerpo segun inOut.
    const dxHeart = -c.side * inOut * c.bodyA * 1.10;
    const cxLive  = c.cx + dxHeart;
    const cyLive  = c.cy;

    // Ruido organico SIEMPRE muy chico (no depende del estado).
    const n1 = (noise(c.noiseOff,      tc) - 0.5) * 6;
    const n2 = (noise(c.noiseOff + 50, tc) - 0.5) * 6;

    const alpha = 90 + 150 * visible;
    stroke(225, 35, 40, alpha);
    strokeWeight(c.weight);
    bezier(cxLive + p0x,        cyLive + p0y,
           cxLive + cp1x + n1,  cyLive + cp1y + n2,
           cxLive + cp2x - n1,  cyLive + cp2y - n2,
           cxLive + p1x,        cyLive + p1y);
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