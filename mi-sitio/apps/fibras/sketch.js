/*
 * Anatomía de la Distancia — v601
 *
 * IDEA CENTRAL
 * ------------
 * El cuerpo no aparece de golpe. Primero existe un OVILLO DE LANA, hecho
 * íntegramente de fibras, que se desamarra y viaja hacia la silueta del
 * cuerpo (cuerpo-ref.png). La transformación es un único sistema de
 * fibras con dos anclas: anchorBall (espiral) y anchorBody (sample del
 * png). El anchor activo es lerp(ball, body, morphSmoothed).
 *
 * MORPH
 *   - Lo controla voz.mp4 (currentTime / duration).
 *   - smoothstep(0.03, 0.97) para evitar saltos en bordes.
 *   - morphSmoothed = lerp(morphSmoothed, morph, 0.045) para suavizar.
 *
 * OVILLO VISIBLE DESDE EL INICIO
 *   - Las fibras tienen alpha mínimo alto (BALL_MIN_ALPHA) cuando
 *     morphSmoothed ≈ 0.
 *   - Se distribuyen como espiral (i / totalFibers).
 *   - El color de lana se boostea y algunas fibras llevan acentos
 *     (blanco, cian, magenta) para que el ovillo tenga presencia.
 *
 * VIAJE VISIBLE
 *   - Durante 0.10 < morphSmoothed < 0.85 las fibras dejan más rastro:
 *     trail más largo, alpha multiplicada, fondo borra menos.
 *
 * CUERPO BASE
 *   - Aparece con fade gradual usando smoothstep(0.35, 0.95) * 0.65.
 *   - Nunca al 100%: las fibras siguen siendo el medio principal.
 */

// ============ FLAGS ============
const SHOW_DEBUG_PARAMS = true;

// ============ AUDIO ============
const VOICE_SRC = "/apps/fibras/anatomiadeladistancia/voz.mp4";

// ============ MORPH ============
let morph         = 0;
let morphSmoothed = 0;
let voiceMedia    = null;
let voiceStarted  = false;

// ============ OVILLO ============
const BALL_RADIUS         = 105;
const BALL_ALPHA_MULT     = 2.4;
const BALL_WEIGHT_MULT    = 1.35;
const BALL_COLOR_BOOST    = 1.35;
const BALL_MIN_ALPHA      = 110;
const BALL_ROT_SPEED      = 0.0030;
const BALL_WANDER_AMP     = 2.4;
const BALL_MAX_OFFSET     = 8.0;
const BALL_TANGENTIAL_AMP = 14;

// Color "lana" (boosted vs v500). Es el punto de partida; las fibras
// derivan hacia el color real del cuerpo a medida que morph crece.
const WOOL_R = 235;
const WOOL_G = 220;
const WOOL_B = 188;

// Probabilidad de que una fibra sea "acento" (blanco, cian o magenta)
// para que el ovillo no se lea como mancha homogénea.
const ACCENT_PROBABILITY = 0.06;

// ============ MOVIMIENTO GLOBAL DEL CUERPO (solo al final) ============
const BODY_SWAY_X_AMP    = 4.0;
const BODY_SWAY_Y_AMP    = 1.8;
const BODY_SWAY_SPEED    = 0.0055;
const BODY_BREATH_SCALE_X = 0.0060;
const BODY_BREATH_SCALE_Y = 0.0100;
const BODY_BREATH_SPEED   = 0.0120;

// ============ WARP POR SLICES ============
const WARP_SLICE_STEP    = 12;
const WARP_X_AMP         = 3.5;
const WARP_Y_AMP         = 1.0;
const WARP_SPEED         = 0.0045;
const WARP_SPATIAL_SCALE = 0.08;

// ============ FIBRAS — DINÁMICA ============
const FIBER_NOISE_SPEED  = 0.0035;
const FIBER_WANDER_AMP   = 1.4;
const FIBER_ANCHOR_PULL  = 0.06;
const FIBER_DAMPING      = 0.88;
const FIBER_MAX_OFFSET   = 4.0;
const FIBER_ALPHA_MULT   = 0.95;
const FIBER_WEIGHT_MULT  = 0.95;

// ============ FIBRAS — MUESTREO ============
const FIBERS_PER_BODY    = 1400;
const FIBER_DENSITY_MIN  = 32;
const FIBER_ACCEPT_GAIN  = 1.0;
const FIBER_ALPHA_BASE   = 22;
const FIBER_WEIGHT_MIN   = 0.36;
const FIBER_WEIGHT_MAX   = 1.10;
const FIBER_HISTORY      = 8;

// ============ VIAJE / RASTRO ============
const MORPH_TRAIL_ALPHA       = 42;   // (referencia, ver fondo dinámico)
const MORPH_LINE_WEIGHT       = 0.8;  // (referencia)
const MORPH_TRAVEL_VISIBILITY = 1.6;
const MORPH_LOW_LIMIT         = 0.10;
const MORPH_HIGH_LIMIT        = 0.85;

// ============ ESTADO ============
let bodyRefImg;
let bodies = [];

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

  setupVoiceMedia();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene();
  background(0);
}

function buildScene() {
  bodies = [];
  morph = 0;
  morphSmoothed = 0;
  bodies.push(new AnimatedBody(width * 0.5, height * 0.52, false, 0.0));
}

/* =========================================================
   AUDIO  —  voz.mp4 controla el morph (currentTime / duration).
========================================================= */

function setupVoiceMedia() {
  voiceMedia = document.createElement("video");
  voiceMedia.src = VOICE_SRC;
  voiceMedia.preload = "auto";
  voiceMedia.playsInline = true;
  voiceMedia.style.display = "none";
  document.body.appendChild(voiceMedia);

  voiceMedia.addEventListener("error", () => {
    console.warn("voz.mp4 no se pudo cargar.", voiceMedia.error);
  });

  const btn = document.getElementById("soundToggle");
  if (!btn) return;

  btn.style.display = "block";
  btn.textContent = "iniciar";

  btn.addEventListener("click", () => {
    morph = 0;
    morphSmoothed = 0;
    voiceStarted = true;
    if (!voiceMedia) return;
    try {
      voiceMedia.currentTime = 0;
    } catch (e) {
      // currentTime puede fallar si los metadatos aún no están listos.
    }
    const p = voiceMedia.play();
    if (p && p.catch) {
      p.catch(err => console.warn("no se pudo reproducir voz.mp4", err));
    }
    btn.textContent = "reiniciar";
  });
}

/* =========================================================
   HELPERS
========================================================= */

function smoothstep(edge0, edge1, x) {
  const t = constrain((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function getRawProgress() {
  if (!voiceMedia) return 0;
  const dur = voiceMedia.duration;
  if (!dur || isNaN(dur) || !isFinite(dur)) return 0;
  return constrain(voiceMedia.currentTime / dur, 0, 1);
}

function isMorphingNow() {
  return morphSmoothed > MORPH_LOW_LIMIT && morphSmoothed < MORPH_HIGH_LIMIT;
}

// Factor 1 → estado ovillo puro, 0 → estado cuerpo puro.
// Suave: cae entre morph 0 y 0.5.
function ballFactor() {
  return 1 - smoothstep(0.0, 0.5, morphSmoothed);
}

// 0 hasta morph ~0.9, 1 al final. Sólo entonces se activan respiración
// y sway globales del cuerpo.
function bodyMotionStrength() {
  return constrain((morphSmoothed - 0.9) / 0.1, 0, 1);
}

function getBodyMotion(frame) {
  const swayX = Math.sin(frame * BODY_SWAY_SPEED) * BODY_SWAY_X_AMP;
  const swayY = Math.cos(frame * BODY_SWAY_SPEED * 0.85) * BODY_SWAY_Y_AMP;
  const breath = Math.sin(frame * BODY_BREATH_SPEED);
  const scaleX = 1 + breath * BODY_BREATH_SCALE_X;
  const scaleY = 1 + breath * BODY_BREATH_SCALE_Y;
  return { swayX, swayY, breath, scaleX, scaleY };
}

/* =========================================================
   DRAW LOOP
========================================================= */

function draw() {
  // Fondo dinámico: durante la transición se borra menos para que se
  // vean los rastros del desamarre.
  const morphing = isMorphingNow();
  const bgAlpha = morphing ? 28 : 45;
  background(0, bgAlpha);

  // Morph desde voz.mp4. Si el audio no está cargado, rawProgress = 0.
  const rawProgress = getRawProgress();
  const morphRaw = constrain(rawProgress, 0, 1);
  morph = smoothstep(0.03, 0.97, morphRaw);
  morphSmoothed = lerp(morphSmoothed, morph, 0.045);

  // Capa 1: cuerpo base con fade gradual (smoothstep), nunca al 100%.
  const bodyBaseAlpha = smoothstep(0.35, 0.95, morphSmoothed) * 0.65;
  for (const body of bodies) body.drawBase(bodyBaseAlpha);

  // Capa 2: fibras (composite "lighter" para que sumen sobre el negro).
  drawingContext.save();
  drawingContext.globalCompositeOperation = "lighter";
  for (const body of bodies) body.drawFibers();
  drawingContext.restore();

  if (SHOW_DEBUG_PARAMS) drawDebugOverlay(rawProgress, bodyBaseAlpha, morphing);
  drawTitle();
}

/* =========================================================
   ANIMATED BODY
========================================================= */

class AnimatedBody {
  constructor(cx, cy, mirror, phase) {
    this.cx = cx;
    this.cy = cy;
    this.mirror = mirror;
    this.phase = phase;

    const aspect = bodyRefImg.height / bodyRefImg.width;
    let h = min(height * 0.86, 1200);
    let w = h * aspect;
    const maxW = width * 0.50;
    if (w > maxW) { w = maxW; h = w / aspect; }

    this.bodyW = w;
    this.bodyH = h;

    this.buildMaster();
    this.buildFibers();
  }

  // Pre-render: imagen rotada 90° CW. Se usa para muestrear posiciones
  // y colores y para revelar el cuerpo cuando morph avanza.
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

  // Muestra puntos del cuerpo y los empareja, por índice, con anclas
  // de espiral del ovillo. Esto garantiza que cada fibra tenga
  // OBLIGATORIAMENTE anchorBall + anchorBody (mismo objeto, no fibras
  // distintas).
  buildFibers() {
    this.fibers = [];
    const px = this.master.pixels;
    const mw = this.master.width;
    const mh = this.master.height;
    const target = FIBERS_PER_BODY;

    const samples = [];
    let attempts = 0;
    const maxAttempts = target * 60;

    while (samples.length < target && attempts < maxAttempts) {
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

      samples.push({ lx, ly, density, r, g, b });
    }

    const total = samples.length;
    for (let i = 0; i < total; i++) {
      const s = samples[i];
      this.fibers.push(new Fiber(this, i, total, s.lx, s.ly, s.density, s.r, s.g, s.b));
    }
  }

  // Local→world. motionStrength escala cuánto sway/breath se aplica.
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

  // Cuerpo base: fade continuo. Sin umbral duro.
  drawBase(bodyBaseAlpha) {
    if (bodyBaseAlpha <= 0.001) return;

    const motionStrength = bodyMotionStrength();
    const m = getBodyMotion(frameCount + this.phase * 60);

    const drawW = this.bodyW * lerp(1, m.scaleX, motionStrength);
    const drawH = this.bodyH * lerp(1, m.scaleY, motionStrength);

    const ctx = drawingContext;
    ctx.save();
    ctx.globalAlpha = bodyBaseAlpha;

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
========================================================= */

class Fiber {
  constructor(body, index, total, lx, ly, density, pr, pg, pb) {
    this.body = body;
    this.index = index;
    this.density = density;

    // Anchor cuerpo (sample del png).
    this.anchorBodyX = lx;
    this.anchorBodyY = ly;

    // Anchor ovillo: espiral basada en el índice. Cada fibra recibe un
    // ángulo y radio coherentes con la forma del ovillo, más un jitter
    // pequeño + offset tangencial para que no sean puntos perfectos.
    const totalForSpiral = max(total, 1);
    const baseAngle = index * 0.18 + random(-0.25, 0.25);
    const baseR = BALL_RADIUS * sqrt(index / totalForSpiral) * random(0.75, 1.12);
    const cx = body.bodyW * 0.5;
    const cy = body.bodyH * 0.5;

    const tang = random(-0.5, 0.5);
    const tangX = -Math.sin(baseAngle) * BALL_TANGENTIAL_AMP * tang;
    const tangY =  Math.cos(baseAngle) * BALL_TANGENTIAL_AMP * tang;

    this.anchorBallX = cx + Math.cos(baseAngle) * baseR + tangX;
    this.anchorBallY = cy + Math.sin(baseAngle) * baseR + tangY;
    this.spiralAngle = baseAngle;
    this.spiralR     = baseR;

    // Color sampleado del cuerpo.
    this.r = pr;
    this.g = pg;
    this.b = pb;

    // Acento opcional para presencia del ovillo.
    this.accent = null;
    if (random() < ACCENT_PROBABILITY) {
      const choice = floor(random(3));
      if      (choice === 0) this.accent = { r: 255, g: 255, b: 255 };
      else if (choice === 1) this.accent = { r: 130, g: 220, b: 255 };
      else                   this.accent = { r: 255, g: 130, b: 220 };
    }

    this.seed   = random(10000);
    this.weight = random(FIBER_WEIGHT_MIN, FIBER_WEIGHT_MAX);
    this.alpha  = FIBER_ALPHA_BASE * map(density, 30, 255, 0.6, 1.0);

    // Posición inicial = anchor ovillo en mundo.
    const w = body.toWorld(this.anchorBallX, this.anchorBallY, 0);
    this.x  = w.x;
    this.y  = w.y;
    this.vx = 0;
    this.vy = 0;

    this.history = [];
    for (let j = 0; j < FIBER_HISTORY; j++) {
      this.history.push({ x: this.x, y: this.y });
    }
  }

  // Lerp continuo entre anchorBall y anchorBody, con drift rotacional
  // del ovillo que se apaga conforme morph crece.
  currentLocalAnchor() {
    const ballAmt = constrain(1 - morphSmoothed * 1.4, 0, 1);

    let ballX = this.anchorBallX;
    let ballY = this.anchorBallY;

    if (ballAmt > 0.001) {
      const a = this.spiralAngle + frameCount * BALL_ROT_SPEED * ballAmt;
      const driftedX = this.body.bodyW * 0.5 + Math.cos(a) * this.spiralR;
      const driftedY = this.body.bodyH * 0.5 + Math.sin(a) * this.spiralR;
      ballX = lerp(this.anchorBallX, driftedX, ballAmt);
      ballY = lerp(this.anchorBallY, driftedY, ballAmt);
    }

    const ax = lerp(ballX, this.anchorBodyX, morphSmoothed);
    const ay = lerp(ballY, this.anchorBodyY, morphSmoothed);
    return { ax, ay };
  }

  update() {
    const { ax: localAX, ay: localAY } = this.currentLocalAnchor();

    const motionStrength = bodyMotionStrength();
    const anchor = this.body.toWorld(localAX, localAY, motionStrength);

    const wanderAmp = lerp(BALL_WANDER_AMP, FIBER_WANDER_AMP, morphSmoothed);
    const targetX = anchor.x + map(
      noise(this.seed, frameCount * FIBER_NOISE_SPEED),
      0, 1, -wanderAmp, wanderAmp
    );
    const targetY = anchor.y + map(
      noise(this.seed + 100, frameCount * FIBER_NOISE_SPEED),
      0, 1, -wanderAmp, wanderAmp
    );

    const fx = (targetX - this.x) * FIBER_ANCHOR_PULL;
    const fy = (targetY - this.y) * FIBER_ANCHOR_PULL;
    this.vx = (this.vx + fx) * FIBER_DAMPING;
    this.vy = (this.vy + fy) * FIBER_DAMPING;

    this.x += this.vx;
    this.y += this.vy;

    const offX = this.x - anchor.x;
    const offY = this.y - anchor.y;
    const offD = Math.sqrt(offX * offX + offY * offY);
    const maxOffset = lerp(BALL_MAX_OFFSET, FIBER_MAX_OFFSET, morphSmoothed);

    if (offD > maxOffset) {
      this.x = lerp(this.x, anchor.x, 0.15);
      this.y = lerp(this.y, anchor.y, 0.15);
    }

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > FIBER_HISTORY) this.history.shift();
  }

  display() {
    if (this.history.length < 4) return;

    const bf = ballFactor();
    const alphaMul   = lerp(FIBER_ALPHA_MULT, BALL_ALPHA_MULT, bf);
    const weightMul  = lerp(FIBER_WEIGHT_MULT, BALL_WEIGHT_MULT, bf);
    const colorBoost = lerp(1.0, BALL_COLOR_BOOST, bf);

    // Color: lana → cuerpo. Termina antes para no saltar de tono cuando
    // aparece el cuerpo base.
    const colorMix = constrain(map(morphSmoothed, 0.0, 0.7, 0, 1), 0, 1);
    let baseR = lerp(WOOL_R, this.r, colorMix);
    let baseG = lerp(WOOL_G, this.g, colorMix);
    let baseB = lerp(WOOL_B, this.b, colorMix);

    if (this.accent && bf > 0.001) {
      const m = bf * 0.7;
      baseR = lerp(baseR, this.accent.r, m);
      baseG = lerp(baseG, this.accent.g, m);
      baseB = lerp(baseB, this.accent.b, m);
    }

    const r = constrain(baseR * colorBoost, 0, 255);
    const g = constrain(baseG * colorBoost, 0, 255);
    const b = constrain(baseB * colorBoost, 0, 255);

    // Visibilidad del viaje: durante el morph, las fibras se vuelven
    // más visibles para que se vea el desamarre.
    const travelMult = isMorphingNow() ? MORPH_TRAVEL_VISIBILITY : 1.0;
    const minA       = BALL_MIN_ALPHA * bf;
    let alpha        = max(this.alpha * alphaMul * travelMult, minA);
    alpha = constrain(alpha, 0, 255);

    stroke(r, g, b, alpha);
    strokeWeight(this.weight * weightMul);
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
   DEBUG / TÍTULO
========================================================= */

function drawDebugOverlay(rawProgress, bodyBaseAlpha, morphing) {
  push();
  drawingContext.globalCompositeOperation = "source-over";

  noStroke();
  fill(0, 0, 0, 140);
  rect(12, 12, 220, 110, 6);

  textAlign(LEFT, TOP);
  textFont("monospace");
  textSize(11);

  fill(220, 215, 205, 230);
  const x = 22;
  let y = 22;
  text(`raw:       ${rawProgress.toFixed(3)}`,    x, y); y += 14;
  text(`morph:     ${morph.toFixed(3)}`,          x, y); y += 14;
  text(`smooth:    ${morphSmoothed.toFixed(3)}`,  x, y); y += 14;
  text(`bodyAlpha: ${bodyBaseAlpha.toFixed(3)}`,  x, y); y += 14;
  text(`morphing:  ${morphing ? "true" : "false"}`, x, y); y += 14;

  // estado audio
  let st = "no cargado";
  if (voiceMedia) {
    if (voiceMedia.error)         st = "error";
    else if (!voiceMedia.duration || isNaN(voiceMedia.duration)) st = "esperando";
    else if (voiceMedia.paused)   st = voiceStarted ? "pausa" : "listo";
    else                          st = "reproduciendo";
  }
  fill(150, 200, 255, 200);
  text(`voz:       ${st}`, x, y);

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
