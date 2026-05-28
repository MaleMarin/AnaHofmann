/*
 * Anatomía de la Distancia — Ana Hofmann
 *
 * Dos cuerpos humanos abstractos enfrentados sobre fondo negro. No son sólidos
 * ni se dibujan con contornos: aparecen por acumulación de miles de partículas
 * pequeñas (puntos, microtrazos y filamentos cortos) ubicadas en regiones
 * anatómicas (cabeza, pecho, corazón, abdomen, pelvis, brazos, piernas).
 *
 * Cada región tiene su propio color emocional / nervioso. Las partículas
 * respiran (alpha breathing) y se desplazan levemente con noise(). El blending
 * aditivo hace que las zonas densas brillen y los bordes queden difusos.
 *
 * Entre los dos cuerpos hay un campo de partículas y filamentos que intentan
 * conectarlos: en los extremos están alineados; en el medio se enredan, se
 * desvían y se cortan rítmicamente (la distancia confunde la conexión).
 */

let leftBody, rightBody;
let bridgeParticles = [];
let filaments       = [];

// Densidad global de partículas. Bajar a 0.7 si va lento, subir a 1.2 si tiene
// margen el equipo. 1.0 ≈ ~11–13k partículas totales.
const PARTICLE_DENSITY = 1.0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noiseDetail(2, 0.5);
  buildScene();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene();
}

function buildScene() {
  const cy = height * 0.50;
  // Altura del cuerpo: limitada por alto y ancho de pantalla para que entren los
  // dos cuerpos sin tocarse.
  const h  = Math.min(height * 0.82, width * 0.42);
  const xLeft  = width * 0.30;
  const xRight = width * 0.70;
  // facing = dirección hacia el otro cuerpo (+1 = mira a la derecha, -1 = izq.)
  leftBody  = buildBody(xLeft,  cy, h, +1);
  rightBody = buildBody(xRight, cy, h, -1);
  buildBridge();
  buildFilaments();
}

// ────────────────────────────────────────────────────────────────────────────
// CUERPOS: regiones anatómicas
// ────────────────────────────────────────────────────────────────────────────

function buildBody(cx, cy, h, facing) {
  // Unidad base: 1/14 de la altura total del cuerpo. Las regiones se posicionan
  // como múltiplos de u para que mantengan proporciones humanas.
  const u = h / 14;

  // Cada región es una elipse (cx, cy, rx, ry) con su paleta de colores, su
  // cantidad de partículas, rango de alpha y un mix de "kinds" (dot / dash /
  // filament). Los kinds aportan textura: la mayoría son puntos, algunos son
  // microtrazos cortos y unos pocos filamentos algo más largos.
  const regions = [
    // CABEZA: magenta / rojo / naranja (cerebro emocional)
    { name: 'head', cx: 0, cy: -5.5*u, rx: 1.00*u, ry: 1.20*u,
      colors: [[240,80,140],[240,100,70],[245,160,80],[220,60,120]],
      count: 520, alphaMin: 70, alphaMax: 175, size: 1.10, drift: 0.50,
      kinds: { dot: 0.55, dash: 0.30, filament: 0.15 } },

    // CUELLO: conector
    { name: 'neck', cx: 0, cy: -3.90*u, rx: 0.42*u, ry: 0.55*u,
      colors: [[220,80,120],[200,70,100],[210,90,110]],
      count: 110, alphaMin: 50, alphaMax: 130, size: 0.90, drift: 0.40,
      kinds: { dot: 0.70, dash: 0.30, filament: 0.00 } },

    // PECHO: celeste / verde (respiración, pulmones, calma)
    { name: 'chest', cx: 0, cy: -2.50*u, rx: 1.70*u, ry: 1.50*u,
      colors: [[90,210,230],[120,230,180],[80,200,220],[160,235,200]],
      count: 980, alphaMin: 45, alphaMax: 145, size: 1.00, drift: 0.55,
      kinds: { dot: 0.55, dash: 0.30, filament: 0.15 } },

    // CORAZÓN: rojo intenso, denso, ligeramente desplazado hacia el otro cuerpo
    { name: 'heart', cx: facing*0.35*u, cy: -2.60*u, rx: 0.52*u, ry: 0.58*u,
      colors: [[240,40,50],[255,75,70],[220,25,40],[200,15,30]],
      count: 460, alphaMin: 125, alphaMax: 230, size: 1.45, drift: 0.85,
      kinds: { dot: 0.50, dash: 0.30, filament: 0.20 },
      isHeart: true },

    // ABDOMEN: violeta / naranja (vísceras, plexo solar)
    { name: 'abdomen', cx: 0, cy: -0.30*u, rx: 1.30*u, ry: 1.25*u,
      colors: [[170,80,220],[210,100,90],[195,75,180],[225,140,80]],
      count: 760, alphaMin: 55, alphaMax: 150, size: 1.00, drift: 0.55,
      kinds: { dot: 0.60, dash: 0.30, filament: 0.10 } },

    // PELVIS: violeta apagado
    { name: 'pelvis', cx: 0, cy: 1.40*u, rx: 1.20*u, ry: 0.70*u,
      colors: [[180,100,180],[150,80,170],[200,110,140]],
      count: 340, alphaMin: 55, alphaMax: 130, size: 1.00, drift: 0.45,
      kinds: { dot: 0.65, dash: 0.30, filament: 0.05 } },

    // BRAZOS: azul cool (sistema nervioso periférico)
    { name: 'armR', cx:  1.70*u, cy: -2.00*u, rx: 0.36*u, ry: 2.20*u,
      colors: [[90,140,230],[140,200,240],[110,170,235],[80,180,220]],
      count: 420, alphaMin: 35, alphaMax: 125, size: 0.85, drift: 0.60,
      kinds: { dot: 0.55, dash: 0.30, filament: 0.15 } },
    { name: 'armL', cx: -1.70*u, cy: -2.00*u, rx: 0.36*u, ry: 2.20*u,
      colors: [[90,140,230],[140,200,240],[110,170,235],[80,180,220]],
      count: 420, alphaMin: 35, alphaMax: 125, size: 0.85, drift: 0.60,
      kinds: { dot: 0.55, dash: 0.30, filament: 0.15 } },

    // PIERNAS: amarillo / azul / blanco (sostén, raíz, contacto con la tierra)
    { name: 'legR', cx:  0.55*u, cy: 4.50*u, rx: 0.52*u, ry: 2.55*u,
      colors: [[235,210,90],[200,225,235],[100,150,230],[245,245,230]],
      count: 660, alphaMin: 45, alphaMax: 135, size: 0.95, drift: 0.55,
      kinds: { dot: 0.55, dash: 0.30, filament: 0.15 } },
    { name: 'legL', cx: -0.55*u, cy: 4.50*u, rx: 0.52*u, ry: 2.55*u,
      colors: [[235,210,90],[200,225,235],[100,150,230],[245,245,230]],
      count: 660, alphaMin: 45, alphaMax: 135, size: 0.95, drift: 0.55,
      kinds: { dot: 0.55, dash: 0.30, filament: 0.15 } },
  ];

  const particles = [];
  for (const r of regions) {
    const n = Math.round(r.count * PARTICLE_DENSITY);
    for (let i = 0; i < n; i++) {
      // Sample uniforme dentro de la elipse (area-uniform: sqrt del radio).
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random());
      const px = r.cx + Math.cos(ang) * rad * r.rx;
      const py = r.cy + Math.sin(ang) * rad * r.ry;
      const col = r.colors[Math.floor(Math.random() * r.colors.length)];

      // kind: dot (mayoría), dash (microtrazo), filament (filamento corto).
      const kr = Math.random();
      let kind, dashLen;
      if      (kr < r.kinds.dot)                           { kind = 'dot';      dashLen = 0; }
      else if (kr < r.kinds.dot + r.kinds.dash)            { kind = 'dash';     dashLen = 1.2 + Math.random() * 2.0; }
      else                                                  { kind = 'filament'; dashLen = 3.5 + Math.random() * 6.0; }

      particles.push({
        bx: cx + px, by: cy + py,
        col,
        alpha: r.alphaMin + Math.random() * (r.alphaMax - r.alphaMin),
        size: r.size * (0.55 + Math.random() * 0.85),
        kind, dashLen,
        dashAng: Math.random() * Math.PI * 2,
        drift: r.drift,
        noiseOff: Math.random() * 1000,
        breathePhase: Math.random() * Math.PI * 2,
        isHeart: !!r.isHeart,
      });
    }
  }

  // PERIFERIA: partículas dispersas alrededor del cuerpo (polvo nervioso /
  // campo emocional). Densas cerca del cuerpo, más raras lejos.
  const periphN = Math.round(820 * PARTICLE_DENSITY);
  for (let i = 0; i < periphN; i++) {
    const ang = Math.random() * Math.PI * 2;
    // Distribución exponencial: pocas lejos, muchas cerca del límite del cuerpo.
    const rad = 4.0*u + Math.random() * Math.random() * 6.5*u;
    const px = Math.cos(ang) * rad;
    const py = Math.sin(ang) * rad - 1.0*u;
    const tone = 0.35 + Math.random() * 0.55;
    particles.push({
      bx: cx + px, by: cy + py,
      col: [
        Math.round(60*tone + Math.random()*60),
        Math.round(60*tone + Math.random()*45),
        Math.round(80*tone + Math.random()*70),
      ],
      alpha: 14 + Math.random() * 55,
      size: 0.55 + Math.random() * 0.85,
      kind: Math.random() < 0.7 ? 'dot' : 'dash',
      dashLen: 1 + Math.random() * 2,
      dashAng: Math.random() * Math.PI * 2,
      drift: 1.3,
      noiseOff: Math.random() * 1000,
      breathePhase: Math.random() * Math.PI * 2,
      isHeart: false,
    });
  }

  return { cx, cy, h, u, facing, particles };
}

// ────────────────────────────────────────────────────────────────────────────
// PUENTE: partículas en el espacio entre los dos cuerpos
// ────────────────────────────────────────────────────────────────────────────

function buildBridge() {
  bridgeParticles = [];
  const cyMid = (leftBody.cy + rightBody.cy) * 0.5;
  const xL = leftBody.cx  + leftBody.u  * 1.8;
  const xR = rightBody.cx - rightBody.u * 1.8;
  const total = Math.round(900 * PARTICLE_DENSITY);

  for (let i = 0; i < total; i++) {
    // t en [0,1]: 0 = cuerpo izquierdo, 1 = cuerpo derecho. Sesgamos las
    // partículas hacia los extremos para que en el medio la "conexión" se vea
    // más rala / rota.
    let t = Math.random();
    t = t < 0.5
      ? 0.5 * Math.pow(2 * t, 1.4)
      : 1 - 0.5 * Math.pow(2 * (1 - t), 1.4);

    const widening = 1 - Math.abs(t - 0.5) * 2; // 0 en extremos, 1 en el medio
    const bx = xL + (xR - xL) * t;
    // Más ancho verticalmente en el medio (la conexión se dispersa).
    const spread = leftBody.u * (0.6 + widening * 4.5);
    const by = cyMid + (Math.random() - 0.5) * spread;

    // Color: rojo/magenta en el medio (corazón proyectado entre los dos),
    // cyan/azul en los extremos (sale del pecho de cada cuerpo).
    const distFromMid = Math.abs(t - 0.5) * 2;
    let r, g, b;
    if (distFromMid < 0.4) {
      const lerp = distFromMid / 0.4;
      r = 240 - lerp * 60;
      g = 55  + lerp * 55;
      b = 95  + lerp * 65;
    } else {
      const lerp = (distFromMid - 0.4) / 0.6;
      r = 180 - lerp * 95;
      g = 110 + lerp * 80;
      b = 160 + lerp * 75;
    }

    const kr = Math.random();
    const kind    = kr < 0.55 ? 'dot' : kr < 0.85 ? 'dash' : 'filament';
    const dashLen = kind === 'dot' ? 0
                   : kind === 'dash' ? 1.5 + Math.random() * 2.0
                   : 4 + Math.random() * 7;

    bridgeParticles.push({
      bx, by, t,
      col: [r|0, g|0, b|0],
      alpha: 22 + Math.random() * 85,
      size: 0.6 + Math.random() * 1.1,
      kind, dashLen,
      dashAng: Math.random() * Math.PI * 2,
      // Drift mucho más grande en el medio para que ahí "explote" la conexión.
      drift: 0.5 + widening * 2.0,
      noiseOff: Math.random() * 1000,
      cutPhase: Math.random() * Math.PI * 2,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FILAMENTOS: hilos largos que aparecen entre los cuerpos, se enredan y rompen
// ────────────────────────────────────────────────────────────────────────────

function buildFilaments() {
  filaments = [];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const startReg = pickRegionName();
    const endReg   = pickRegionName();
    const p0 = samplePointInRegion(leftBody,  startReg);
    const p1 = samplePointInRegion(rightBody, endReg);

    const segs = 38;
    const waypoints = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const x = p0.x + (p1.x - p0.x) * t;
      const y = p0.y + (p1.y - p0.y) * t;
      const amp = 1 - Math.abs(t - 0.5) * 2; // 0 extremos, 1 medio
      waypoints.push({ x, y, t, amp });
    }
    filaments.push({
      waypoints,
      noiseOff: Math.random() * 1000,
      hueShift: Math.random(),
      alphaBase: 55 + Math.random() * 70,
      weight: 0.55 + Math.random() * 0.55,
      lifeSpeed: 0.012 + Math.random() * 0.025,
      lifePhase: Math.random() * Math.PI * 2,
    });
  }
}

function pickRegionName() {
  const r = Math.random();
  if (r < 0.55) return 'chest';
  if (r < 0.80) return 'head';
  return 'heart';
}

function samplePointInRegion(body, name) {
  const u = body.u;
  let cx, cy, rx, ry;
  if      (name === 'head')  { cx = 0;                    cy = -5.5*u; rx = 0.8*u; ry = 1.0*u; }
  else if (name === 'heart') { cx = body.facing * 0.35*u; cy = -2.5*u; rx = 0.4*u; ry = 0.5*u; }
  else                       { cx = 0;                    cy = -2.5*u; rx = 1.4*u; ry = 1.3*u; }
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * 0.7;
  return {
    x: body.cx + cx + Math.cos(ang) * rad * rx,
    y: body.cy + cy + Math.sin(ang) * rad * ry,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// DRAW
// ────────────────────────────────────────────────────────────────────────────

function draw() {
  // Fade trail muy sutil: cada frame oscurecemos un poco lo dibujado antes,
  // sin borrarlo del todo. Las partículas que se mueven dejan un rastro como
  // sistema nervioso latiendo. Si subimos la alpha del rect, el rastro se
  // acorta; si la bajamos, se alarga.
  drawingContext.globalCompositeOperation = 'source-over';
  drawingContext.fillStyle = 'rgba(0, 0, 3, 0.22)';
  drawingContext.fillRect(0, 0, width, height);

  const tt = frameCount * 0.005;
  // Latido cardíaco: ciclo de ~0.9s con dos golpes y una pausa.
  const beat = heartbeatEnvelope((frameCount * 0.018) % 1);

  // Partículas con blending aditivo: las acumulaciones brillan.
  drawingContext.globalCompositeOperation = 'lighter';

  drawBody(leftBody,  tt, beat);
  drawBody(rightBody, tt, beat);
  drawBridge(tt, beat);
  drawFilaments(tt);

  drawingContext.globalCompositeOperation = 'source-over';
  drawVignette();
}

// Envolvente de un latido: dos picos rápidos al inicio del ciclo, después pausa.
function heartbeatEnvelope(phase) {
  if (phase < 0.06) return Math.sin((phase / 0.06) * Math.PI);
  if (phase < 0.12) return 0;
  if (phase < 0.18) return 0.7 * Math.sin(((phase - 0.12) / 0.06) * Math.PI);
  return 0;
}

function drawBody(body, tt, beat) {
  const ps = body.particles;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const nx = (noise(p.noiseOff,       tt) - 0.5) * p.drift * 10;
    const ny = (noise(p.noiseOff + 500, tt) - 0.5) * p.drift * 10;
    const x = p.bx + nx;
    const y = p.by + ny;

    // Respiración: alpha que oscila suavemente. El corazón además late con beat.
    let breathe = 0.82 + 0.20 * Math.sin(tt * 6 + p.breathePhase);
    if (p.isHeart) breathe *= 0.85 + beat * 0.65;
    const a = p.alpha * breathe;

    stroke(p.col[0], p.col[1], p.col[2], a);
    strokeWeight(p.size);
    if (p.kind === 'dot') {
      point(x, y);
    } else {
      const dx = Math.cos(p.dashAng) * p.dashLen * 0.5;
      const dy = Math.sin(p.dashAng) * p.dashLen * 0.5;
      line(x - dx, y - dy, x + dx, y + dy);
    }
  }
}

function drawBridge(tt, beat) {
  for (let i = 0; i < bridgeParticles.length; i++) {
    const p = bridgeParticles[i];
    const widening = 1 - Math.abs(p.t - 0.5) * 2;
    const nx = (noise(p.noiseOff,       tt * 1.3) - 0.5) * p.drift * 14;
    const ny = (noise(p.noiseOff + 500, tt * 1.3) - 0.5) * p.drift * 14;
    const x = p.bx + nx;
    const y = p.by + ny;

    // Cortes: el centro pulsa, las partículas centrales se desvanecen
    // rítmicamente (la conexión se rompe y se rearma).
    let cutMask = 1;
    if (widening > 0.2) {
      const cutPulse = (1 + Math.sin(tt * 4 + p.cutPhase)) * 0.5;
      cutMask = 1 - widening * cutPulse * 0.78;
    }
    // El latido empuja la intensidad de la zona central (el corazón llega al medio).
    const heartBoost = widening > 0.5 ? (1 + beat * 0.55) : 1;
    const a = p.alpha * cutMask * heartBoost;

    stroke(p.col[0], p.col[1], p.col[2], a);
    strokeWeight(p.size);
    if (p.kind === 'dot') {
      point(x, y);
    } else {
      const dx = Math.cos(p.dashAng) * p.dashLen * 0.5;
      const dy = Math.sin(p.dashAng) * p.dashLen * 0.5;
      line(x - dx, y - dy, x + dx, y + dy);
    }
  }
}

function drawFilaments(tt) {
  // Cada filamento es una secuencia de segmentos con ruido perpendicular. El
  // ruido es bajo en los extremos (cerca de los cuerpos = conexión estable) y
  // alto en el medio (donde se enreda y se corta). Los filamentos aparecen y
  // desaparecen suavemente con su lifePhase: nunca están todos visibles a la vez.
  for (let f = 0; f < filaments.length; f++) {
    const fil = filaments[f];
    const life = (Math.sin(tt * 60 * fil.lifeSpeed + fil.lifePhase) + 1) * 0.5;
    if (life < 0.15) continue;
    const lifeMask = Math.max(0, (life - 0.15) / 0.85);

    // Color: interpolación rojo → magenta → cyan según hueShift del filamento.
    const h = fil.hueShift;
    const r = 235 - h * 110;
    const g =  50 + h *  90;
    const b = 100 + h * 130;

    const wp = fil.waypoints;
    for (let s = 0; s < wp.length - 1; s++) {
      const A = wp[s];
      const C = wp[s + 1];
      const amp = (A.amp + C.amp) * 0.5;
      // Probabilidad de "corte" del segmento: alta en el medio del filamento.
      if (Math.random() < amp * 0.32) continue;
      const nA = (noise(fil.noiseOff + s * 0.13,     tt * 0.8) - 0.5) * 60 * amp;
      const nB = (noise(fil.noiseOff + s * 0.13 + 1, tt * 0.8) - 0.5) * 60 * amp;
      const sdx = C.x - A.x, sdy = C.y - A.y;
      const slen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
      const perpX = -sdy / slen, perpY = sdx / slen;
      const x0 = A.x + perpX * nA, y0 = A.y + perpY * nA;
      const x1 = C.x + perpX * nB, y1 = C.y + perpY * nB;
      const alpha = fil.alphaBase * lifeMask * (0.45 + amp * 0.55);
      stroke(r, g, b, alpha);
      strokeWeight(fil.weight * (0.5 + amp * 0.8));
      line(x0, y0, x1, y1);
    }
  }
}

function drawVignette() {
  const cx = width / 2;
  const cy = height / 2;
  const rMin = Math.min(width, height) * 0.30;
  const rMax = Math.max(width, height) * 0.95;
  const grad = drawingContext.createRadialGradient(cx, cy, rMin, cx, cy, rMax);
  grad.addColorStop(0,    'rgba(0, 0, 0, 0)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.30)');
  grad.addColorStop(0.85, 'rgba(0, 0, 0, 0.75)');
  grad.addColorStop(1,    'rgba(0, 0, 0, 0.96)');
  drawingContext.fillStyle = grad;
  drawingContext.fillRect(0, 0, width, height);
}
