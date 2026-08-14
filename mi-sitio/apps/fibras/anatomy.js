/*
 * Anatomía de plástico — torso / cuello / abanicos.
 * Cápsulas y esferas con z-buffer + shading satinado.
 * Coordenadas normalizadas: origen al centro, +y hacia abajo, escala = min(w,h).
 */

const ANAT = {
  pink:   [255,  82, 158],
  hot:    [255,  52, 118],
  orange: [255, 118,  52],
  blue:   [ 42,  72, 205],
  teal:   [ 68, 198, 198],
  peach:  [246, 176, 154],
  lips:   [232, 122, 108],
  green:  [ 48, 132,  78],
  yellow: [255, 196,  78],
  cream:  [250, 228, 214],
};

function anatX(nx, w, S) { return w * 0.5 + nx * S; }
function anatY(ny, h, S) { return h * 0.5 + ny * S; }
function anatR(nr, S) { return nr * S; }

function stampSphere(zbuf, nx, ny, nz, cr, cg, cb, w, h, cx, cy, radius, col, z0) {
  const r = radius;
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + r + 1));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const invR = 1 / r;
      const zn = Math.sqrt(Math.max(0, 1 - d2 * invR * invR));
      const z = z0 + zn;
      const i = y * w + x;
      if (z < zbuf[i]) continue;
      zbuf[i] = z;
      nx[i] = dx * invR;
      ny[i] = dy * invR;
      nz[i] = zn;
      cr[i] = col[0]; cg[i] = col[1]; cb[i] = col[2];
    }
  }
}

function stampCapsule(zbuf, nx, ny, nz, cr, cg, cb, w, h, ax, ay, bx, by, radius, col, z0) {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy || 1;
  const r = radius;
  const pad = r + 1;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - pad));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - pad));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + pad));
  const invR = 1 / r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let t = ((x - ax) * vx + (y - ay) * vy) / l2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const px = ax + t * vx;
      const py = ay + t * vy;
      const dx = x - px;
      const dy = y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const zn = Math.sqrt(Math.max(0, 1 - d2 * invR * invR));
      const z = z0 + zn;
      const i = y * w + x;
      if (z < zbuf[i]) continue;
      zbuf[i] = z;
      nx[i] = dx * invR;
      ny[i] = dy * invR;
      nz[i] = zn;
      cr[i] = col[0]; cg[i] = col[1]; cb[i] = col[2];
    }
  }
}

function stampChain(zbuf, nx, ny, nz, cr, cg, cb, w, h, pts, radius, col, z0) {
  for (let i = 0; i < pts.length - 1; i++) {
    const t = i / Math.max(1, pts.length - 2);
    const rad = radius * (1.08 - t * 0.18);
    stampCapsule(
      zbuf, nx, ny, nz, cr, cg, cb, w, h,
      pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1],
      rad, col, z0
    );
  }
}

function growFan(segments, ox, oy, ang, len, rad, col, z, depth, spread, seed) {
  const stack = [{ x: ox, y: oy, ang, len, rad, depth, z, spread }];
  let s = seed || 1;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s % 10000) / 10000;
  };
  while (stack.length && segments.length < 240) {
    const n = stack.pop();
    const x2 = n.x + Math.cos(n.ang) * n.len;
    const y2 = n.y + Math.sin(n.ang) * n.len;
    segments.push({ x1: n.x, y1: n.y, x2, y2, r: Math.max(0.9, n.rad), col, z: n.z });
    if (n.depth <= 0 || n.rad < 1.15) continue;
    const kids = n.depth > 4 ? 2 : 3;
    for (let i = 0; i < kids; i++) {
      const t = kids === 1 ? 0.5 : i / (kids - 1);
      stack.push({
        x: x2,
        y: y2,
        ang: n.ang + (t - 0.5) * 2 * n.spread + (rnd() - 0.5) * n.spread * 0.28,
        len: n.len * (0.52 + rnd() * 0.24),
        rad: n.rad * 0.64,
        depth: n.depth - 1,
        z: n.z + 0.35,
        spread: n.spread * 0.82,
      });
    }
  }
}

function shadeAnatomy(zbuf, nx, ny, nz, cr, cg, cb, w, h) {
  const gbuf = createGraphics(w, h);
  gbuf.pixelDensity(1);
  gbuf.clear();
  const ctx = gbuf.drawingContext;
  const img = ctx.createImageData(w, h);
  const out = img.data;

  const nlen = (x, y, z) => {
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / l, y / l, z / l];
  };
  const [lx, ly, lz] = nlen(0.46, -0.50, 0.74);
  const [fx, fy, fz] = nlen(-0.55, 0.12, 0.55);
  const [hx, hy, hz] = nlen(lx, ly, lz + 1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (zbuf[i] < -1e8) {
        out[o + 3] = 0;
        continue;
      }
      const ndotl = nx[i] * lx + ny[i] * ly + nz[i] * lz;
      const ndotf = nx[i] * fx + ny[i] * fy + nz[i] * fz;
      const ndoth = Math.max(0, nx[i] * hx + ny[i] * hy + nz[i] * hz);
      const wrap = 0.42;
      const key = constrain((ndotl + wrap) / (1 + wrap), 0, 1);
      const fill = constrain(ndotf, 0, 1) * 0.26;

      let ao = 1;
      if (x > 1 && x < w - 2 && y > 1 && y < h - 2) {
        const z = zbuf[i];
        if (zbuf[i - 2] > z + 4) ao -= 0.07;
        if (zbuf[i + 2] > z + 4) ao -= 0.07;
        if (zbuf[i - 2 * w] > z + 4) ao -= 0.07;
        if (zbuf[i + 2 * w] > z + 4) ao -= 0.07;
      }
      ao = constrain(ao, 0.55, 1);

      const amb = 0.24;
      const lit = (amb + key * 0.70 + fill) * ao;
      const sss = constrain(0.32 - ndotl, 0, 1) * 0.20 * ao;
      const spec = (Math.pow(ndoth, 16) * 0.42 + Math.pow(ndoth, 48) * 0.22) * ao;
      const fres = Math.pow(1 - Math.max(0, nz[i]), 2.1) * 0.10 * ao;

      let ar = cr[i] * 0.90 + 255 * 0.10;
      let ag = cg[i] * 0.90 + 255 * 0.10;
      let ab = cb[i] * 0.90 + 255 * 0.10;

      out[o]     = constrain(ar * (lit + sss) + (spec + fres) * 255, 0, 255) | 0;
      out[o + 1] = constrain(ag * (lit + sss) + (spec + fres) * 255, 0, 255) | 0;
      out[o + 2] = constrain(ab * (lit + sss) + (spec + fres) * 255, 0, 255) | 0;
      out[o + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  gbuf.loadPixels();
  return gbuf;
}

function generatePlasticAnatomy(w, h) {
  w = Math.max(8, w | 0);
  h = Math.max(8, h | 0);
  const n = w * h;
  const zbuf = new Float32Array(n);
  zbuf.fill(-1e9);
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  const nz = new Float32Array(n);
  const cr = new Float32Array(n);
  const cg = new Float32Array(n);
  const cb = new Float32Array(n);

  const S = Math.min(w, h);
  const X = (nxv) => anatX(nxv, w, S);
  const Y = (nyv) => anatY(nyv, h, S);
  const R = (nr) => anatR(nr, S);
  const P = (a, b) => [X(a), Y(b)];

  const stampS = (nxv, nyv, r, col, z) =>
    stampSphere(zbuf, nx, ny, nz, cr, cg, cb, w, h, X(nxv), Y(nyv), R(r), col, z);
  const stampC = (pts, r, col, z) =>
    stampChain(zbuf, nx, ny, nz, cr, cg, cb, w, h, pts.map(([a, b]) => P(a, b)), R(r), col, z);

  // --- fondo del torso (atrás) ---
  stampC([[-0.10, -0.28], [-0.12, -0.08], [-0.10, 0.14], [-0.06, 0.30]], 0.062, ANAT.teal, 8);
  stampC([[0.10, -0.24], [0.12, -0.02], [0.14, 0.18], [0.10, 0.32]], 0.070, ANAT.blue, 10);
  stampS(-0.14, 0.24, 0.12, ANAT.orange, 12);
  stampS(0.16, 0.22, 0.11, ANAT.blue, 11);
  stampS(0.00, 0.20, 0.10, ANAT.pink, 13);
  stampC([[-0.22, 0.10], [-0.04, 0.14], [0.14, 0.18], [0.26, 0.12]], 0.048, ANAT.teal, 9);

  // --- cuello, tubos que se trenzan ---
  stampC([[0.02, -0.34], [0.00, -0.18], [-0.03, -0.02], [0.00, 0.14]], 0.078, ANAT.pink, 22);
  stampC([[0.10, -0.28], [0.08, -0.12], [0.10, 0.04], [0.08, 0.20]], 0.068, ANAT.blue, 18);
  stampC([[-0.08, -0.26], [-0.06, -0.08], [-0.08, 0.10], [-0.04, 0.24]], 0.058, ANAT.teal, 16);
  stampC([[0.18, -0.12], [0.08, -0.02], [-0.04, 0.08], [-0.12, 0.16]], 0.050, ANAT.orange, 24);
  stampC([[0.14, -0.22], [0.18, -0.08], [0.20, 0.06], [0.14, 0.16]], 0.042, ANAT.hot, 26);
  stampC([[-0.02, -0.20], [0.04, -0.06], [0.06, 0.08]], 0.046, ANAT.blue, 20);
  stampS(0.04, 0.02, 0.055, ANAT.pink, 25);
  stampS(-0.06, 0.06, 0.048, ANAT.orange, 21);

  // --- mandíbula / labios (ancla humana) ---
  stampS(0.10, -0.36, 0.090, ANAT.peach, 28);
  stampS(0.18, -0.34, 0.072, ANAT.peach, 30);
  stampS(0.22, -0.40, 0.038, ANAT.lips, 32);
  stampS(0.20, -0.37, 0.028, ANAT.lips, 33);
  stampS(0.08, -0.40, 0.055, ANAT.peach, 29);

  // --- abanicos (coral / bronquios) ---
  const fans = [];
  growFan(fans, X(0.16), Y(0.06), -0.55, R(0.055), R(0.013), ANAT.green, 36, 6, 0.85, 17);
  growFan(fans, X(0.02), Y(-0.14), -1.35, R(0.048), R(0.012), ANAT.hot, 38, 6, 0.95, 31);
  growFan(fans, X(-0.16), Y(0.00), -2.55, R(0.050), R(0.012), ANAT.cream, 34, 6, 0.90, 53);
  growFan(fans, X(0.14), Y(-0.26), -0.85, R(0.042), R(0.011), ANAT.yellow, 31, 5, 0.80, 71);

  for (const s of fans) {
    stampCapsule(zbuf, nx, ny, nz, cr, cg, cb, w, h, s.x1, s.y1, s.x2, s.y2, s.r, s.col, s.z);
  }

  return shadeAnatomy(zbuf, nx, ny, nz, cr, cg, cb, w, h);
}
