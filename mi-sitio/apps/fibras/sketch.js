/*
 * Fibras — Ana Hofmann
 * Dos figuras enfrentadas hechas de miles de curvas Bezier, con un
 * corazón rojo pulsante en el centro de cada una. Rotación global lenta.
 * Render en canvas 2D para máxima compatibilidad.
 */

let fibers = [];
let cores = [];

const FIBERS_PER_BODY = 1600;
const CORE_FIBERS     = 260;   // mucho mas denso para que el ovillo parezca lana real
const FUZZ_FIBERS     = 70;    // hilos cortos radiales (pelos sueltos del ovillo)
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
    // Solo conservamos las fibras del anillo rojo (interior del corazon).
    // Se descartan magenta, azul y blanco -> la composicion queda limpia,
    // unicamente el cuerpo rojo del corazon en cada figura.
    if (meanR >= 0.30) continue;
    const col = colorForDist(meanR);

    // Control points SOBRE la linea p0->p1 con offset perpendicular en el
    // MISMO sentido (mismo signo para cp1 y cp2). Esto produce arcos
    // limpios en vez de zigzags/eses.
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

  // Coleccion temporal para poder ordenar los hilos por "profundidad" (tone)
  // y dibujarlos de atras (oscuro) hacia adelante (claro). Esto da
  // sensacion de capas de lana enrolladas.
  const localCores = [];
  const totalCore  = CORE_FIBERS + FUZZ_FIBERS;

  for (let i = 0; i < totalCore; i++) {
    const isFuzz = i < FUZZ_FIBERS;

    // Cada hilo del corazon tiene 3 estados precomputados que no cambian
    // frame a frame: PUNTA, OVILLO y CORAZON. Al animar interpolamos
    // linealmente entre estos targets.
    let angA, angB, ballP0X, ballP0Y, ballP1X, ballP1Y, ballCurve;

    if (isFuzz) {
      // FUZZ: pelitos sueltos. Un trazo cortisimo radial que sale de la
      // superficie del ovillo hacia afuera (o un poco hacia dentro). Esto
      // simula los hilos sueltos tipicos de un ovillo real.
      angA = Math.random() * TWO_PI;
      angB = angA + (Math.random() - 0.5) * 0.25;
      const inOff  = ballR * (0.92 + Math.random() * 0.05);
      const outOff = ballR * (1.06 + Math.random() * 0.18);
      ballP0X = Math.cos(angA) * inOff;
      ballP0Y = Math.sin(angA) * inOff;
      ballP1X = Math.cos(angB) * outOff;
      ballP1Y = Math.sin(angB) * outOff;
      ballCurve = (Math.random() - 0.5) * heartSize * 0.04;
    } else {
      // OVILLO normal: cuerda que cruza el circulo, con curvatura perpendic.
      angA = Math.random() * TWO_PI;
      angB = angA + Math.PI * (0.35 + Math.random() * 1.30);
      ballP0X = Math.cos(angA) * ballR;
      ballP0Y = Math.sin(angA) * ballR;
      ballP1X = Math.cos(angB) * ballR;
      ballP1Y = Math.sin(angB) * ballR;
      ballCurve = (Math.random() - 0.5) * heartSize * 0.85;
    }

    // Tone 0..1: 0 = lana en sombra (parte trasera/abajo), 1 = lana iluminada
    // (parte delantera/arriba). Se calcula a partir del punto medio del
    // hilo, mas un pequeño jitter para que no quede en bandas.
    const midX = (ballP0X + ballP1X) * 0.5;
    const midY = (ballP0Y + ballP1Y) * 0.5;
    const rawTone = 0.55 - midY / (ballR * 2) + (Math.random() - 0.5) * 0.22;
    const tone    = Math.max(0, Math.min(1, rawTone));

    // Variacion de color de lana: rojo oscuro (lana en sombra) -> rojo
    // calido medio -> salmon claro (lana iluminada). Pequeño jitter de tono
    // por hilo para que ninguno sea exactamente del mismo color.
    const jitter = (Math.random() - 0.5) * 18;
    const colR = Math.round(88  + tone * 168 + jitter);
    const colG = Math.round(16  + tone * 78  + jitter * 0.6);
    const colB = Math.round(20  + tone * 58  + jitter * 0.5);

    // PUNTA: posicion del hilo cuando todos colapsan a un cluster diminuto.
    const pjit = heartSize * 0.04;

    localCores.push({
      cx, cy, heartSize,
      side: cx >= 0 ? 1 : -1,
      bodyA: a, bodyB: b,
      isFuzz,
      tone,
      colR, colG, colB,
      // Estado CORAZON:
      t0: Math.random() * TWO_PI,
      t1: Math.random() * TWO_PI,
      offX: (Math.random() - 0.5) * heartSize * 0.35,
      offY: (Math.random() - 0.5) * heartSize * 0.35,
      // Estado OVILLO:
      ballR,
      ballP0X, ballP0Y,
      ballP1X, ballP1Y,
      ballCurve,
      // Estado PUNTA:
      pointJX: (Math.random() - 0.5) * pjit,
      pointJY: (Math.random() - 0.5) * pjit,
      noiseOff: Math.random() * 1000,
      // Hilos en sombra son un pelin mas finos, hilos iluminados un pelin
      // mas gruesos -> efecto de relieve.
      weight: isFuzz ? (0.55 + Math.random() * 0.4)
                     : (0.95 + tone * 0.9 + Math.random() * 0.35),
      // Fuzz tiene menos opacidad de base; los hilos del ovillo varian segun tone.
      alphaBase: isFuzz ? (45 + tone * 70)
                        : (110 + tone * 130),
    });
  }

  // Orden por tone: primero los oscuros (atras), despues los iluminados
  // (adelante). Asi se forman capas visibles de lana.
  localCores.sort((a, b) => a.tone - b.tone);
  for (const c of localCores) cores.push(c);
}

// Curva del ciclo PUNTA -> OVILLO -> CORAZON -> OVILLO -> PUNTA con
// PAUSAS cortas en cada estado y smoothstep en las transiciones rapidas.
// Devuelve un numero en [0, 2]: 0 = punta, 1 = ovillo, 2 = corazon.
function heartMorph(phase) {
  const ss = x => x * x * (3 - 2 * x);
  if      (phase < 0.10) return 0;                            // punta (linger corto)
  else if (phase < 0.32) return ss((phase - 0.10) / 0.22);    // punta -> ovillo (rapido)
  else if (phase < 0.50) return 1;                            // ovillo (linger corto)
  else if (phase < 0.72) return 1 + ss((phase - 0.50) / 0.22);// ovillo -> corazon (rapido)
  else if (phase < 1.00) return 2;                            // corazon (linger)
  else if (phase < 1.22) return 2 - ss((phase - 1.00) / 0.22);// corazon -> ovillo (rapido)
  else if (phase < 1.42) return 1;                            // ovillo (linger corto)
  else if (phase < 1.64) return 1 - ss((phase - 1.42) / 0.22);// ovillo -> punta (rapido)
  else                   return 0;                            // punta (linger antes de reiniciar)
}

function draw() {
  // Fondo apenas tintado en azul muy oscuro (frio): crea contraste cinematografico
  // con los rojos calidos del corazon y los spotlights.
  background(3, 3, 6);

  // ── Parametros del ciclo del corazon (se calculan una vez por frame y
  // los usan tanto los spotlights como las fibras del corazon).
  const pulse = 1 + Math.sin(frameCount * 0.05) * 0.18;
  // Ciclo mas rapido: ~12s en total para que el ovillo entre y se forme
  // sin hacer esperar (antes eran ~21s).
  const phase = (frameCount * 0.0028) % 2;
  const morph = heartMorph(phase);                          // 0..2
  const inOut = morph - 1;                                  // -1..+1
  const kAB   = Math.min(1, morph);                          // 0..1 (punta -> ovillo)
  const kBC   = Math.max(0, morph - 1);                      // 0..1 (ovillo -> corazon)
  const visible = Math.max(0.25, (inOut + 1) * 0.5);

  push();
  translate(width / 2, height / 2);
  rotate(frameCount * ROTATION_SPEED);

  // ── Iluminacion cinematografica detras de cada corazon. Mas suave y
  // difusa, con sombra proyectada hacia abajo para dar sensacion de
  // contacto y peso. El glow pulsa suavemente con el latido.
  const coresPerBody = CORE_FIBERS + FUZZ_FIBERS;
  if (cores.length) {
    // 1) SOMBRA proyectada bajo el corazon: blob oscuro elongado.
    //    Se dibuja en modo normal (no lighter) para que oscurezca el fondo.
    for (let f = 0; f < 2; f++) {
      const c = cores[f * coresPerBody];
      if (!c) continue;
      const dxHeart = -c.side * inOut * c.bodyA * 1.10;
      const cxLive  = c.cx + dxHeart;
      const cyLive  = c.cy;
      const shadowIntensity = visible * (0.55 + kBC * 0.45);
      const sRad = c.heartSize * 1.9;
      const sCx  = cxLive + c.side * c.heartSize * 0.12;
      const sCy  = cyLive + c.heartSize * 0.55;
      const sGrad = drawingContext.createRadialGradient(sCx, sCy, 0, sCx, sCy, sRad);
      sGrad.addColorStop(0,    `rgba(0, 0, 0, ${0.55 * shadowIntensity})`);
      sGrad.addColorStop(0.45, `rgba(0, 0, 0, ${0.28 * shadowIntensity})`);
      sGrad.addColorStop(1,     'rgba(0, 0, 0, 0)');
      drawingContext.fillStyle = sGrad;
      drawingContext.save();
      drawingContext.translate(sCx, sCy);
      drawingContext.scale(1.0, 0.42);
      drawingContext.translate(-sCx, -sCy);
      drawingContext.fillRect(sCx - sRad, sCy - sRad, sRad * 2, sRad * 2);
      drawingContext.restore();
    }

    // 2) GLOW calido suave detras del corazon, mucho mas difuso y tenue
    //    que antes. Tres parejas de gradients (mas radio + menos alpha).
    const prevComp = drawingContext.globalCompositeOperation;
    drawingContext.globalCompositeOperation = 'lighter';
    for (let f = 0; f < 2; f++) {
      const c = cores[f * coresPerBody];
      if (!c) continue;
      const dxHeart = -c.side * inOut * c.bodyA * 1.10;
      const cxLive  = c.cx + dxHeart;
      const cyLive  = c.cy;
      const intensity = visible * (0.40 + kBC * 0.55) * (0.95 + (pulse - 1) * 0.5);
      const radius = c.heartSize * 6.4;
      const grad = drawingContext.createRadialGradient(cxLive, cyLive, 0, cxLive, cyLive, radius);
      grad.addColorStop(0,    `rgba(255, 110, 80, ${0.18 * intensity})`);
      grad.addColorStop(0.16, `rgba(210, 60, 45, ${0.14 * intensity})`);
      grad.addColorStop(0.42, `rgba(120, 28, 22, ${0.07 * intensity})`);
      grad.addColorStop(1,     'rgba(0, 0, 0, 0)');
      drawingContext.fillStyle = grad;
      drawingContext.fillRect(cxLive - radius, cyLive - radius, radius * 2, radius * 2);
    }
    drawingContext.globalCompositeOperation = prevComp;
  }

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
  // pulse, phase, morph, inOut, kAB, kBC y visible ya fueron calculados al
  // principio de draw() (se comparten con los spotlights).
  // Glow suave alrededor de los hilos del corazon (menos intenso, mas amplio).
  drawingContext.shadowBlur  = (44 + Math.sin(frameCount * 0.05) * 14) * visible;
  drawingContext.shadowColor = `rgba(255, 70, 50, ${0.55 * visible})`;

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

    // Mezcla de color: en OVILLO usamos el color tonal de lana (con
    // sombras y luces); cuando muta a CORAZON, los hilos convergen hacia
    // un rojo unificado mas saturado.
    const woolAmt  = 1 - kBC;
    const heartAmt = kBC;
    const baseR = c.colR * woolAmt + 220 * heartAmt;
    const baseG = c.colG * woolAmt + 32  * heartAmt;
    const baseB = c.colB * woolAmt + 38  * heartAmt;

    // Alpha precomputado (ya incorpora el tone). Fuzz se desvanece cuando
    // el ovillo se transforma en corazon (los pelitos no tienen sentido en
    // la forma de corazon).
    const fadeOut = c.isFuzz ? (1 - kBC) : 1;
    const alpha   = c.alphaBase * visible * fadeOut;

    stroke(baseR, baseG, baseB, alpha);
    strokeWeight(c.weight);
    bezier(cxLive + p0x,        cyLive + p0y,
           cxLive + cp1x + n1,  cyLive + cp1y + n2,
           cxLive + cp2x - n1,  cyLive + cp2y - n2,
           cxLive + p1x,        cyLive + p1y);
  }
  drawingContext.shadowBlur = 0;

  pop();

  // ── Vignette: oscurece los bordes para enfocar al centro (drama de cine).
  drawVignette();
}

// Vignette radial: transparente en el centro, casi negro hacia los bordes.
// Se profundiza mas que antes para que las sombras envuelvan el cuadro.
function drawVignette() {
  const cx = width / 2;
  const cy = height / 2;
  const rMin = Math.min(width, height) * 0.28;
  const rMax = Math.max(width, height) * 0.92;
  const grad = drawingContext.createRadialGradient(cx, cy, rMin, cx, cy, rMax);
  grad.addColorStop(0,    'rgba(0, 0, 0, 0)');
  grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(1,    'rgba(0, 0, 0, 0.97)');
  drawingContext.fillStyle = grad;
  drawingContext.fillRect(0, 0, width, height);
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