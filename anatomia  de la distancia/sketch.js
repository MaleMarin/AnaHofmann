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

  for (let i = 0; i < CORE_FIBERS; i++) {
    // Cada hilo del corazon tiene un destino FIJO de enredo (angulo + radio
    // propios, no aleatorios por frame). Al enredarse cp1 y cp2 se deslizan
    // hacia esos puntos como un ovillo de lana que se va armando, y al
    // desenredarse vuelven en linea recta a la curva limpia del corazon.
    const angA = Math.random() * TWO_PI;
    const angB = angA + Math.PI + (Math.random() - 0.5) * 0.7;
    cores.push({
      cx, cy, heartSize,
      // side = +1 figura derecha, -1 figura izquierda. Sirve para que los
      // corazones se asomen el uno hacia el otro y se hundan al alejarse.
      side: cx >= 0 ? 1 : -1,
      bodyA: a, bodyB: b,
      t0: Math.random() * TWO_PI,
      t1: Math.random() * TWO_PI,
      tangleAngA: angA, tangleAngB: angB,
      tangleRadA: 0.55 + Math.random() * 0.75,
      tangleRadB: 0.55 + Math.random() * 0.75,
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

  // ── Corazones rojos: laten, entran/salen del cuerpo, se enredan/desenredan.
  //
  // Tres ciclos independientes:
  //  - latido (pulse):  respiracion rapida del tamaño.
  //  - viaje in/out:    el corazon entra y sale del cuerpo (eje x).
  //                     inOut > 0  -> AFUERA (asomado hacia la otra figura).
  //                     inOut < 0  -> ADENTRO (hundido en el cuerpo).
  //  - ovillo:          cuando esta DENTRO se enreda como un ovillo de lana
  //                     (cada hilo va deslizandose hacia un destino FIJO);
  //                     al salir se desenreda LINEAL y LENTAMENTE a la curva
  //                     limpia del corazon. No hay ruido caotico.
  const pulse  = 1 + Math.sin(frameCount * 0.05) * 0.18;
  // Ciclo lento (periodo ~21s) para que enredar y desenredar sea pausado.
  const inOut  = Math.sin(frameCount * 0.005);             // -1 (dentro) .. +1 (afuera)
  const tangle = Math.max(0, -inOut);                       // 0 limpio .. 1 ovillo
  // Curva suavizada (smoothstep) para que cerca de 0 y de 1 el movimiento
  // sea aun mas lento: empieza a enredarse de a poco y termina de a poco.
  const tw     = tangle * tangle * (3 - 2 * tangle);

  // Glow del corazon: brillante cuando sale, opaco cuando se hunde adentro.
  const visible = Math.max(0.25, (inOut + 1) * 0.5);       // 0.25 .. 1
  drawingContext.shadowBlur  = (28 + Math.sin(frameCount * 0.05) * 10) * visible;
  drawingContext.shadowColor = `rgba(230, 35, 35, ${0.95 * visible})`;

  // Pequeño ruido organico SIEMPRE presente, sutil, no caotico.
  const tc = frameCount * 0.010;

  for (let i = 0; i < cores.length; i++) {
    const c = cores[i];
    const size = c.heartSize * pulse;

    // Desplazamiento del centro del corazon: hacia la otra figura al salir,
    // hacia el fondo del propio cuerpo al entrar.
    const dxHeart = -c.side * inOut * c.bodyA * 1.10;
    const cxLive  = c.cx + dxHeart;
    const cyLive  = c.cy;

    // Desplazamiento ordenado de los control points: cada hilo se enrolla
    // hacia un par de destinos FIJOS (angA/radA y angB/radB) escalados por
    // tw. Al ser ANGULOS FIJOS POR FIBRA, no hay caos: el conjunto se ve
    // como un ovillo armandose lenta y limpiamente.
    const wind = c.heartSize * 0.65 * tw;
    const wax  = Math.cos(c.tangleAngA) * wind * c.tangleRadA;
    const way  = Math.sin(c.tangleAngA) * wind * c.tangleRadA;
    const wbx  = Math.cos(c.tangleAngB) * wind * c.tangleRadB;
    const wby  = Math.sin(c.tangleAngB) * wind * c.tangleRadB;

    // Ruido organico SIEMPRE muy pequeño (no depende del tangle).
    const n1 = (noise(c.noiseOff,       tc) - 0.5) * 6;
    const n2 = (noise(c.noiseOff + 50,  tc) - 0.5) * 6;

    const p0 = heartPoint(c.t0, size);
    const p1 = heartPoint(c.t1, size);
    const mx = (p0.x + p1.x) * 0.5;
    const my = (p0.y + p1.y) * 0.5;

    // Opacidad: corazon mas tenue cuando esta hundido (lo cubren las fibras
    // del cuerpo); claro y brillante cuando sale al exterior.
    const alpha = 90 + 150 * visible;
    stroke(225, 35, 40, alpha);
    strokeWeight(c.weight);
    bezier(cxLive + p0.x, cyLive + p0.y,
           cxLive + mx + c.offX + wax + n1, cyLive + my + c.offY + way + n2,
           cxLive + mx - c.offX + wbx - n1, cyLive + my - c.offY + wby - n2,
           cxLive + p1.x, cyLive + p1.y);
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
