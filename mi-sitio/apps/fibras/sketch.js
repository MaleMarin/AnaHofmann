/*
 * Anatomía de la Distancia — v500
 *
 * NUEVA IDEA CENTRAL
 * ------------------
 * El cuerpo no aparece directamente. Primero existe un OVILLO DE LANA y ese
 * mismo ovillo se transforma gradualmente en el cuerpo basado en
 * cuerpo-ref.png. La transición no es un crossfade entre dos imágenes:
 * es una transformación estructural de un único sistema de fibras.
 *
 * UN SOLO SISTEMA DE FIBRAS
 *   Cada fibra guarda dos anchors locales (en coordenadas del master):
 *     - anchorBallX / anchorBallY  → posición dentro del ovillo
 *     - anchorBodyX / anchorBodyY  → posición sobre el cuerpo (sample del png)
 *   En cada frame el anchor activo se calcula como:
 *     currentAnchorX = lerp(anchorBallX, anchorBodyX, morph);
 *     currentAnchorY = lerp(anchorBallY, anchorBodyY, morph);
 *   La fibra es un sistema masa-resorte (atracción al anchor + damping +
 *   límite de distancia) sumado a un wander de noise lento.
 *
 * MORPH
 *   - morph parte en 0 (ovillo).
 *   - Se mantiene durante MORPH_HOLD_FRAMES.
 *   - Después: morph = lerp(morph, morphTarget, MORPH_SPEED).
 *
 * FASES POR MORPH
 *   - morph < 0.4   → movimiento más circular/compacto (drift rotacional
 *                     del ovillo, wander amplio).
 *   - 0.4–0.6       → transición.
 *   - morph > 0.6   → comportamiento ya tipo cuerpo.
 *   - morph > 0.85  → empieza a revelarse el cuerpo base (warp slices).
 *   - morph > 0.9   → respiración + sway global del cuerpo activos.
 *
 * COLOR
 *   Cada fibra guarda el color sampleado del cuerpo. En estado ovillo el
 *   color se mezcla con un tono "lana" (crema cálido). A medida que morph
 *   crece, recupera el color real del cuerpo.
 *
 * FASE 1: un solo cuerpo. Sin segundo cuerpo, sin bridges, sin sonido,
 * sin campo central. Hasta que la transformación quede afinada.
 *
 * DEBUG_VISUAL = true → referencia a la izquierda, transformación a la
 * derecha, lectura de morph + frameCount arriba.
 */

// ============ FLAGS ============
const PHASE                = 1;
const DEBUG_VISUAL         = true;
const SHOW_DEBUG_PARAMS    = true;
const SHOW_DEBUG_PULSE_DOT = true;

// ============ MORPH ============
let morph        = 0;
let morphTarget  = 1;
const MORPH_SPEED            = 0.01;
const MORPH_HOLD_FRAMES      = 120;
const BODY_ENABLE_THRESHOLD  = 0.85;

// ============ OVILLO ============
const BALL_RADIUS         = 90;
const BALL_ROT_SPEED      = 0.0035;
const BALL_WANDER_AMP     = 2.6;
const BALL_MAX_OFFSET     = 7.5;

// Color "lana" para el estado ovillo. Las fibras parten de aquí y derivan
// hacia el color sampleado del cuerpo a medida que morph → 1.
const WOOL_R = 232;
const WOOL_G = 218;
const WOOL_B = 188;

// ============ MOVIMIENTO GLOBAL DEL CUERPO (solo para morph >> 0.9) ============
const BODY_SWAY_X_AMP    = 4.0;
const BODY_SWAY_Y_AMP    = 1.8;
const BODY_SWAY_SPEED    = 0.0055;

const BODY_BREATH_SCALE_X = 0.0060;
const BODY_BREATH_SCALE_Y = 0.0100;
const BODY_BREATH_SPEED   = 0.0120;

// ============ WARP POR SLICES (solo se aplica cuando aparece el cuerpo) ============
const WARP_SLICE_STEP    = 12;
const WARP_X_AMP         = 3.5;
const WARP_Y_AMP         = 1.0;
const WARP_SPEED         = 0.0045;
const WARP_SPATIAL_SCALE = 0.08;

// ============ FIBRAS — DINÁMICA ============
const FIBER_NOISE_SPEED  = 0.0035;
const FIBER_WANDER_AMP   = 1.4;     // amplitud de wander en estado cuerpo
const FIBER_ANCHOR_PULL  = 0.06;
const FIBER_DAMPING      = 0.88;
const FIBER_MAX_OFFSET   = 4.0;     // límite de distancia en estado cuerpo

const FIBER_ALPHA_MULT   = 0.85;
const FIBER_WEIGHT_MULT  = 0.95;

// ============ FIBRAS — MUESTREO ============
const FIBERS_PER_BODY    = 1400;
const FIBER_DENSITY_MIN  = 32;
const FIBER_ACCEPT_GAIN  = 1.0;
const FIBER_ALPHA_BASE   = 16;
const FIBER_WEIGHT_MIN   = 0.32;
const FIBER_WEIGHT_MAX   = 1.05;
const FIBER_HISTORY      = 6;

// ============ ESTADO ============
let bodyRefImg;
let bodies = [];

// audio (FASE 2 — apagado en FASE 1)
let bassOsc, subOsc, filterNode;
let soundOn = false;
let audioReady = false;

/* =========================================================
   BOOTSTRAP
========================================================= */

function preload() {
  bodyRefImg = loadImage("/apps/fibras/assets/cuerpo-ref.png");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  strokeCap(ROUND);
  drawingContext.lineJoin = "round";
  noFill();

  buildScene();
  background(0);

  setupSoundUI();

  const btn = document.getElementById("soundToggle");
  if (btn) btn.style.display = (PHASE < 2 || DEBUG_VISUAL) ? "none" : "block";
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene();
  background(0);
}

function buildScene() {
  bodies = [];
  morph = 0;

  if (DEBUG_VISUAL) {
    bodies.push(new AnimatedBody(width * 0.74, height * 0.52, false, 0.0));
  } else if (PHASE < 2) {
    bodies.push(new AnimatedBody(width * 0.50, height * 0.52, false, 0.0));
  } else {
    bodies.push(new AnimatedBody(width * 0.28, height * 0.52, false, 0.0));
    bodies.push(new AnimatedBody(width * 0.72, height * 0.52, true,  PI * 0.7));
  }
}

function draw() {
  background(0, DEBUG_VISUAL ? 38 : 30);

  // morph se mantiene en 0 durante MORPH_HOLD_FRAMES (ovillo crudo) y
  // después converge hacia morphTarget.
  if (frameCount > MORPH_HOLD_FRAMES) {
    morph = lerp(morph, morphTarget, MORPH_SPEED);
  }

  // El cuerpo base solo aparece cuando ya hay forma de cuerpo en las fibras.
  for (const body of bodies) body.drawBase();

  drawingContext.save();
  drawingContext.globalCompositeOperation = "lighter";
  for (const body of bodies) body.drawFibers();
  drawingContext.restore();

  if (DEBUG_VISUAL) {
    drawDebugReferencePanel();
    drawDebugTitle();
    if (SHOW_DEBUG_PARAMS)   drawDebugParams();
    if (SHOW_DEBUG_PULSE_DOT) drawDebugPulseDot();
  } else {
    drawTitle();
  }
}

/* =========================================================
   MOVIMIENTO GLOBAL DEL CUERPO
   Se aplica con peso "motionStrength" que va de 0 (ovillo, ningún
   movimiento global) a 1 (cuerpo respirando + sway). Esto evita que el
   ovillo herede el sway del cuerpo, que sería incoherente con su forma.
========================================================= */

function getBodyMotion(frame) {
  const swayX = Math.sin(frame * BODY_SWAY_SPEED) * BODY_SWAY_X_AMP;
  const swayY = Math.cos(frame * BODY_SWAY_SPEED * 0.85) * BODY_SWAY_Y_AMP;

  const breath = Math.sin(frame * BODY_BREATH_SPEED);
  const scaleX = 1 + breath * BODY_BREATH_SCALE_X;
  const scaleY = 1 + breath * BODY_BREATH_SCALE_Y;

  return { swayX, swayY, breath, scaleX, scaleY };
}

// 0 si morph <= 0.9, 1 si morph >= 1.0. Sirve para activar respiración +
// sway recién cuando el cuerpo está casi formado.
function bodyMotionStrength() {
  return constrain((morph - 0.9) / 0.1, 0, 1);
}

/* =========================================================
   AUDIO  —  scaffold para FASE 2; en FASE 1 no se usa.
========================================================= */

function setupSoundUI() {
  const btn = document.getElementById("soundToggle");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (PHASE < 2) return;
    try { await userStartAudio(); } catch (e) { console.warn(e); }
    if (!audioReady) buildAudio();
    soundOn = !soundOn;
    btn.textContent = soundOn ? "silenciar" : "activar sonido";
    if (!soundOn) {
      bassOsc.amp(0, 0.1);
      subOsc.amp(0, 0.1);
    }
  });
}

function buildAudio() {
  filterNode = new p5.LowPass();
  filterNode.freq(380);
  filterNode.res(4);

  bassOsc = new p5.Oscillator("sine");
  bassOsc.freq(55);
  bassOsc.amp(0);
  bassOsc.disconnect();
  bassOsc.connect(filterNode);
  bassOsc.start();

  subOsc = new p5.Oscillator("triangle");
  subOsc.freq(110);
  subOsc.amp(0);
  subOsc.disconnect();
  subOsc.connect(filterNode);
  subOsc.start();

  audioReady = true;
}

/* =========================================================
   ANIMATED BODY
   - Pre-renderiza el cuerpo (rotado 90° CW) como master para muestreo de
     fibras y dibujo final del cuerpo.
   - Cuando morph >= BODY_ENABLE_THRESHOLD: el master se redibuja por
     slices con warp y va apareciendo en alpha.
   - En cualquier morph: el sistema de fibras está vivo. Cada fibra usa
     su anchor activo (lerp ovillo↔cuerpo) y eso determina la silueta.
========================================================= */

class AnimatedBody {
  constructor(cx, cy, mirror, phase) {
    this.cx = cx;
    this.cy = cy;
    this.mirror = mirror;
    this.phase = phase;

    const aspect = bodyRefImg.height / bodyRefImg.width;

    let h = min(height * (DEBUG_VISUAL ? 0.92 : 0.86), 1200);
    let w = h * aspect;
    const maxW = width * (DEBUG_VISUAL ? 0.46 : (PHASE < 2 ? 0.50 : 0.40));
    if (w > maxW) { w = maxW; h = w / aspect; }

    this.bodyW = w;
    this.bodyH = h;

    this.buildMaster();
    this.buildFibers();
  }

  // Pre-render: imagen rotada 90° CW y escalada al tamaño final del cuerpo.
  // Solo se usa para muestrear posiciones+colores y para revelar el cuerpo
  // cuando morph >= BODY_ENABLE_THRESHOLD.
  buildMaster() {
    const g = createGraphics(floor(this.bodyW), floor(this.bodyH));
    g.pixelDensity(1);
    g.clear();

    g.push();
    g.imageMode(CENTER);
    g.translate(g.width / 2, g.height / 2);
    g.rotate(HALF_PI);
    if (this.mirror) g.scale(1, -1);
    g.image(bodyRefImg, 0, 0, g.height, g.width);
    g.pop();

    g.loadPixels();
    this.master = g;
  }

  // Para cada fibra:
  //   - anchorBody: muestreado por densidad (brillo+sat) sobre el master.
  //   - anchorBall: posición dentro de un disco compacto (sqrt(random())),
  //     centrado en el centro del cuerpo. Distribución uniforme en el área.
  buildFibers() {
    this.fibers = [];
    const px = this.master.pixels;
    const mw = this.master.width;
    const mh = this.master.height;
    const target = FIBERS_PER_BODY;

    let attempts = 0;
    const maxAttempts = target * 60;

    while (this.fibers.length < target && attempts < maxAttempts) {
      attempts++;
      const lx = floor(random(mw));
      const ly = floor(random(mh));
      const idx = (ly * mw + lx) * 4;
      const r = px[idx];
      const g = px[idx + 1];
      const b = px[idx + 2];
      const a = px[idx + 3];
      if (a < 8) continue;

      const bright = (r + g + b) / 3;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 0 ? ((maxC - minC) / maxC) * 255 : 0;
      const density = bright * 0.55 + sat * 0.45;
      if (density < FIBER_DENSITY_MIN) continue;
      if (random(255) > density * FIBER_ACCEPT_GAIN) continue;

      this.fibers.push(new Fiber(this, lx, ly, density, r, g, b));
    }
  }

  // Convierte un punto en coordenadas locales del master (origen en
  // esquina superior izquierda, eje y hacia abajo) a coordenadas del canvas.
  // motionStrength escala cuánto sway/breath se aplica (0 = ninguno).
  toWorld(lx, ly, motionStrength = 1) {
    const m = getBodyMotion(frameCount + this.phase * 60);
    const sx = lerp(1, m.scaleX, motionStrength);
    const sy = lerp(1, m.scaleY, motionStrength);
    const swayX = m.swayX * motionStrength;
    const swayY = m.swayY * motionStrength;
    const ox = (lx - this.bodyW * 0.5) * sx;
    const oy = (ly - this.bodyH * 0.5) * sy;
    return { x: this.cx + swayX + ox, y: this.cy + swayY + oy };
  }

  // CAPA CUERPO BASE
  // Solo aparece cuando morph >= BODY_ENABLE_THRESHOLD. Antes de eso es
  // pura materia de fibras (ovillo). El alpha sube linealmente a partir
  // del threshold; no es un crossfade entre imágenes (no hay otra imagen
  // del ovillo: el ovillo está hecho íntegramente de fibras).
  drawBase() {
    if (morph < BODY_ENABLE_THRESHOLD) return;

    const reveal = constrain(
      (morph - BODY_ENABLE_THRESHOLD) / (1 - BODY_ENABLE_THRESHOLD),
      0, 1
    );
    const motionStrength = bodyMotionStrength();
    const m = getBodyMotion(frameCount + this.phase * 60);

    const drawW = this.bodyW * lerp(1, m.scaleX, motionStrength);
    const drawH = this.bodyH * lerp(1, m.scaleY, motionStrength);

    const ctx = drawingContext;
    ctx.save();
    ctx.globalAlpha = reveal;

    ctx.translate(this.cx + m.swayX * motionStrength,
                  this.cy + m.swayY * motionStrength);
    ctx.translate(-drawW * 0.5, -drawH * 0.5);

    const masterEl = this.master.elt || this.master.canvas;
    const mw = this.master.width;
    const mh = this.master.height;

    const slices = max(1, floor(drawH / WARP_SLICE_STEP));
    const sliceSrcH = mh / slices;
    const sliceDstStep = drawH / slices;
    const sliceDstH = sliceDstStep + 1.0;

    // Warp también escala con motionStrength: el cuerpo aparece "quieto"
    // en el momento del reveal y va ganando movimiento.
    const warpAmpX = WARP_X_AMP * motionStrength;
    const warpAmpY = WARP_Y_AMP * motionStrength;

    for (let i = 0; i < slices; i++) {
      const sy = i * sliceSrcH;
      const dy = i * sliceDstStep;

      const n = noise(i * WARP_SPATIAL_SCALE,
                      frameCount * WARP_SPEED + this.phase * 0.5);
      const dx = map(n, 0, 1, -warpAmpX, warpAmpX);

      const wave = Math.sin(frameCount * WARP_SPEED * 1.3 + i * 0.12 + this.phase);
      const dyOff = wave * warpAmpY;

      ctx.drawImage(
        masterEl,
        0, sy, mw, sliceSrcH,
        dx, dy + dyOff, drawW, sliceDstH
      );
    }

    ctx.restore();
  }

  drawFibers() {
    for (const f of this.fibers) {
      f.update();
      f.display();
    }
  }
}

/* =========================================================
   FIBER
   Sistema masa-resorte hacia el anchor activo (lerp ovillo↔cuerpo).
   - Estado ovillo (morph≈0): drift rotacional + wander amplio + límite
     de offset alto. Sensación de hilos sueltos enredados.
   - Estado cuerpo (morph≈1): wander corto + límite chico, atado al
     píxel original del cuerpo.
========================================================= */

class Fiber {
  constructor(body, lx, ly, density, pr, pg, pb) {
    this.body = body;
    this.density = density;

    // Anchor en el cuerpo: vino del muestreo del master.
    this.anchorBodyX = lx;
    this.anchorBodyY = ly;

    // Anchor en el ovillo: distribución polar uniforme dentro del disco
    // BALL_RADIUS, centrado en el centro del cuerpo (en coordenadas
    // locales del master).
    const angle  = random(TWO_PI);
    const radius = sqrt(random()) * BALL_RADIUS;
    this.anchorBallX = body.bodyW * 0.5 + cos(angle) * radius;
    this.anchorBallY = body.bodyH * 0.5 + sin(angle) * radius;

    // Guardamos el ángulo y radio de la posición original en el ovillo
    // para poder hacer un drift rotacional lento mientras morph es bajo.
    this.ballAngle0  = angle;
    this.ballRadius0 = radius;

    this.seed = random(10000);
    this.r = pr;
    this.g = pg;
    this.b = pb;

    this.weight = random(FIBER_WEIGHT_MIN, FIBER_WEIGHT_MAX);
    this.alpha  = FIBER_ALPHA_BASE * map(density, 30, 255, 0.5, 1.0);

    // Posición inicial: directamente en el anchor del ovillo (en mundo).
    const w = body.toWorld(this.anchorBallX, this.anchorBallY, 0);
    this.x  = w.x;
    this.y  = w.y;
    this.vx = 0;
    this.vy = 0;

    this.history = [];
    for (let i = 0; i < FIBER_HISTORY; i++) {
      this.history.push({ x: this.x, y: this.y });
    }
  }

  // Anchor activo (en coordenadas locales del master) según morph.
  // El ovillo gira lentamente: mientras morph es bajo, los anchors del
  // ovillo se reescriben a partir de un ángulo que avanza con frameCount.
  // Ese drift se apaga gradualmente conforme morph crece.
  currentLocalAnchor() {
    const ballDriftAmt = constrain(1 - morph * 1.4, 0, 1);

    let ballX = this.anchorBallX;
    let ballY = this.anchorBallY;

    if (ballDriftAmt > 0.001) {
      const a = this.ballAngle0 + frameCount * BALL_ROT_SPEED * ballDriftAmt;
      const driftedX = this.body.bodyW * 0.5 + cos(a) * this.ballRadius0;
      const driftedY = this.body.bodyH * 0.5 + sin(a) * this.ballRadius0;
      ballX = lerp(this.anchorBallX, driftedX, ballDriftAmt);
      ballY = lerp(this.anchorBallY, driftedY, ballDriftAmt);
    }

    const ax = lerp(ballX, this.anchorBodyX, morph);
    const ay = lerp(ballY, this.anchorBodyY, morph);
    return { ax, ay };
  }

  update() {
    const { ax: localAX, ay: localAY } = this.currentLocalAnchor();

    // Solo el cuerpo tiene sway+breath (y solo cuando ya está revelado).
    const motionStrength = bodyMotionStrength();
    const anchor = this.body.toWorld(localAX, localAY, motionStrength);

    // Wander: amplitud alta en estado ovillo, baja en estado cuerpo.
    const wanderAmp = lerp(BALL_WANDER_AMP, FIBER_WANDER_AMP, morph);
    const targetX = anchor.x + map(
      noise(this.seed, frameCount * FIBER_NOISE_SPEED),
      0, 1, -wanderAmp, wanderAmp
    );
    const targetY = anchor.y + map(
      noise(this.seed + 100, frameCount * FIBER_NOISE_SPEED),
      0, 1, -wanderAmp, wanderAmp
    );

    // Atracción al anchor + damping.
    const fx = (targetX - this.x) * FIBER_ANCHOR_PULL;
    const fy = (targetY - this.y) * FIBER_ANCHOR_PULL;
    this.vx = (this.vx + fx) * FIBER_DAMPING;
    this.vy = (this.vy + fy) * FIBER_DAMPING;

    this.x += this.vx;
    this.y += this.vy;

    // Límite de offset respecto al anchor: en ovillo es laxo, en cuerpo
    // es estricto. Esto define la "tensión" de las fibras.
    const offX = this.x - anchor.x;
    const offY = this.y - anchor.y;
    const offD = Math.sqrt(offX * offX + offY * offY);
    const maxOffset = lerp(BALL_MAX_OFFSET, FIBER_MAX_OFFSET, morph);

    if (offD > maxOffset) {
      this.x = lerp(this.x, anchor.x, 0.15);
      this.y = lerp(this.y, anchor.y, 0.15);
    }

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > FIBER_HISTORY) this.history.shift();
  }

  display() {
    if (this.history.length < 4) return;

    // Color: lana → color del cuerpo. La mezcla termina antes (morph≈0.7)
    // para que cuando aparece el cuerpo base, las fibras ya estén con su
    // color real y no haya "salto" de tono.
    const colorMix = constrain(map(morph, 0.0, 0.7, 0, 1), 0, 1);
    const r = lerp(WOOL_R, this.r, colorMix);
    const g = lerp(WOOL_G, this.g, colorMix);
    const b = lerp(WOOL_B, this.b, colorMix);

    stroke(r, g, b, this.alpha * FIBER_ALPHA_MULT);
    strokeWeight(this.weight * FIBER_WEIGHT_MULT);
    noFill();

    beginShape();
    curveVertex(this.history[0].x, this.history[0].y);
    for (const p of this.history) curveVertex(p.x, p.y);
    const last = this.history[this.history.length - 1];
    curveVertex(last.x, last.y);
    endShape();
  }
}

/* =========================================================
   DEBUG  —  comparación referencia ↔ animado + lectura de morph.
========================================================= */

function drawDebugReferencePanel() {
  if (!bodies.length) return;
  const body = bodies[0];

  const cx = width * 0.26;
  const cy = height * 0.52;
  const tW = body.bodyW;
  const tH = body.bodyH;

  push();
  drawingContext.globalCompositeOperation = "source-over";

  noFill();
  stroke(255, 22);
  strokeWeight(1);
  rect(cx - tW / 2 - 4, cy - tH / 2 - 4, tW + 8, tH + 8, 4);

  push();
  imageMode(CENTER);
  translate(cx, cy);
  rotate(HALF_PI);
  image(bodyRefImg, 0, 0, tH, tW);
  pop();

  noStroke();
  fill(210, 205, 195, 150);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  textSize(11);
  text("REFERENCIA",     cx, cy - tH / 2 - 20);
  text("TRANSFORMACIÓN", width * 0.74, cy - tH / 2 - 20);

  pop();
}

function drawDebugTitle() {
  push();
  drawingContext.globalCompositeOperation = "source-over";
  noStroke();
  fill(210, 205, 195, 110);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  textSize(12);
  text(
    "MODO DEBUG · ovillo → cuerpo · morph de fibras · v500",
    width * 0.5,
    24
  );

  textAlign(LEFT, CENTER);
  textSize(10);
  fill(210, 205, 195, 140);
  text(`frame ${frameCount}`, 16, 24);

  textAlign(RIGHT, CENTER);
  fill(210, 205, 195, 180);
  text(`morph ${morph.toFixed(3)}`, width - 48, 24);
  pop();
}

function drawDebugParams() {
  push();
  drawingContext.globalCompositeOperation = "source-over";
  noStroke();
  fill(210, 205, 195, 120);
  textAlign(LEFT, TOP);
  textFont("monospace");
  textSize(10);

  // Etiqueta de fase legible según morph.
  let phaseLabel;
  if (morph < 0.05)                      phaseLabel = "ovillo";
  else if (morph < 0.4)                  phaseLabel = "ovillo deshaciéndose";
  else if (morph < 0.6)                  phaseLabel = "transición";
  else if (morph < BODY_ENABLE_THRESHOLD) phaseLabel = "cuerpo formándose";
  else if (morph < 0.95)                 phaseLabel = "cuerpo emergiendo";
  else                                   phaseLabel = "cuerpo respirando";

  const lines = [
    `morph             ${morph.toFixed(3)}`,
    `fase              ${phaseLabel}`,
    `MORPH_SPEED       ${MORPH_SPEED}`,
    `MORPH_HOLD_FRAMES ${MORPH_HOLD_FRAMES}`,
    `BALL_RADIUS       ${BALL_RADIUS}`,
    `FIBERS_PER_BODY   ${FIBERS_PER_BODY}`,
    `BODY_ENABLE_THR   ${BODY_ENABLE_THRESHOLD}`,
    `WARP_SLICE_STEP   ${WARP_SLICE_STEP}`,
    `BODY_SWAY_SPEED   ${BODY_SWAY_SPEED}`,
    `BODY_BREATH_SPEED ${BODY_BREATH_SPEED}`,
    `FIBER_NOISE_SPEED ${FIBER_NOISE_SPEED}`,
  ];
  const x = 16;
  let y = 44;
  for (const line of lines) {
    text(line, x, y);
    y += 13;
  }
  pop();
}

// Punto pulsante con la frecuencia de respiración. Sirve solo para
// confirmar visualmente que draw() está corriendo a la velocidad esperada.
function drawDebugPulseDot() {
  push();
  drawingContext.globalCompositeOperation = "source-over";
  const phase = Math.sin(frameCount * BODY_BREATH_SPEED);
  const r = 3 + (phase * 0.5 + 0.5) * 4;
  noStroke();
  fill(220, 90, 90, 220);
  circle(width - 24, 24, r * 2);
  pop();
}

function drawTitle() {
  push();
  drawingContext.globalCompositeOperation = "source-over";
  noStroke();
  fill(215, 210, 200, 60);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  textSize(13);
  text("A N A T O M Í A   D E   L A   D I S T A N C I A", width * 0.5, height - 42);
  pop();
}
