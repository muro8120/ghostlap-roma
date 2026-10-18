// Ghostlap Roma: the cars in the 3D views. Low-poly bodies built from a side profile per style (the wheel arches cut
// out of it), extruded across the car with a bevel and pinched in plan, a glasshouse on top, four wheels that roll and
// steer, and a body that rolls in corners and pitches under braking and acceleration. All of it is visual: core.js still
// moves a point with a heading. Imported by chase.js.
import * as THREE from './vendor/three/three.module.min.js';

export const CAR_SC = 1.2;           // the cars drawn a touch bigger than their physics box, so they don't read as toys
const C = (c) => new THREE.Color(c), WHITE = new THREE.Color('#ffffff');
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// The side profile of each style, x as a fraction of the length (nose at +0.5) and heights as a fraction of it too.
// r: wheel radius (units); axF/axR: axles; sill: underside; nose: top of the nose; cowl: where the bonnet meets the
// windscreen, at belt bF; deck/bR: where the rear window meets the body; tail: top of the tail; roof: [front, back,
// height]; pinch: plan taper [nose width, tail width, where the nose taper starts]; bev: bevel; wing: rear wing height.
const STYLE = {
  bubble: { r: 2.3, axF: 0.29, axR: -0.29, sill: 0.08, nose: 0.25, cowl: 0.2, bF: 0.31, deck: -0.44, bR: 0.33, tail: 0.32,
    roof: [0.06, -0.3, 0.57], pinch: [0.78, 0.84, 0.18], bev: 1.4, tumble: 0.16 },
  gt: { r: 2.9, axF: 0.33, axR: -0.3, sill: 0.05, nose: 0.16, cowl: 0.06, bF: 0.245, deck: -0.4, bR: 0.255, tail: 0.245,
    roof: [-0.08, -0.23, 0.405], pinch: [0.82, 0.9, 0.28], bev: 0.9, tumble: 0.2 },
  hyper: { r: 2.9, axF: 0.32, axR: -0.31, sill: 0.045, nose: 0.13, cowl: 0.2, bF: 0.225, deck: -0.43, bR: 0.245, tail: 0.235,
    roof: [0.05, -0.13, 0.36], pinch: [0.76, 0.94, 0.15], bev: 0.8, tumble: 0.26, wing: 0.37 },
  wedge: { r: 2.9, axF: 0.32, axR: -0.31, sill: 0.045, nose: 0.1, cowl: 0.06, bF: 0.225, deck: -0.4, bR: 0.255, tail: 0.255,
    roof: [-0.09, -0.21, 0.355], pinch: [0.7, 0.98, 0.05], bev: 0.35, tumble: 0.22, wing: 0.38, flat: 1 },
};
// the two GTs share a style; the Modena is the longer-roofed 2+2 of the pair, so it gets its own glasshouse
const VARIANT = { modena: { roof: [-0.04, -0.3, 0.415], deck: -0.44, cowl: 0.08, nose: 0.17 } };
const styleOf = (sp) => Object.assign({}, STYLE[sp.style] || STYLE.gt, VARIANT[sp.id] || {});

// non-indexed geometry with a colour per face from fn(normal, centroid); the parts of a car are merged into one
function paint(g, fn) {
  if (g.index) g = g.toNonIndexed();
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, col = [], c = new THREE.Color(), N = new THREE.Vector3(), M = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    N.set(n.getX(i) + n.getX(i + 1) + n.getX(i + 2), n.getY(i) + n.getY(i + 1) + n.getY(i + 2), n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2)).normalize();
    M.set((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3);
    c.set(fn(N, M));
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
function mergeAll(list) { // geometries with position, normal and color
  const p = [], n = [], c = [];
  for (const g of list) {
    p.push(...g.attributes.position.array); n.push(...g.attributes.normal.array); c.push(...g.attributes.color.array);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}
const boxAt = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// The body: the profile (wheel arches cut out) extruded to the car's width, then pinched in plan towards the nose and
// tail. The glasshouse is a second, narrower extrusion leaning in towards the roof. Returns the merged, painted
// geometry and the measurements the lights, wheels and the bonnet camera need.
function bodyGeometry(sp) {
  const S = styleOf(sp), L = sp.len, W = sp.wid, r = S.r, ra = r + 0.6, bv = S.bev, h = (f) => f * L;
  const X = (f) => f * L, sill = Math.max(h(S.sill), 0.9);
  // the outline, from the rear bumper forwards along the bottom (over both arches), up the nose and back over the top
  const P = [];
  P.push([X(-0.5) + 1.2, sill]);
  for (const ax of [S.axR, S.axF]) {
    const cx = X(ax), d = Math.asin(clamp((r - sill) / ra, -1, 1));
    for (let k = 0; k <= 6; k++) { const t = Math.PI + d - (k / 6) * (Math.PI + 2 * d); P.push([cx + Math.cos(t) * ra, r + Math.sin(t) * ra]); }
  }
  const nose = h(S.nose), bF = h(S.bF), bR = h(S.bR), tail = h(S.tail), cowl = X(S.cowl), deck = X(S.deck);
  if (S.flat) { P.push([X(0.5) - 0.6, sill], [X(0.5), nose * 0.55], [X(0.5) - 0.4, nose]); } // the wedge: a blade of a nose
  else P.push([X(0.5) - 1.0, sill], [X(0.5), sill + 1.0], [X(0.5), (sill + nose) / 2], [X(0.5), nose - 1.0], [X(0.5) - 1.0, nose]);
  // the bonnet: rising from the nose to the windscreen, and always a little above the front wheel arch (a fender)
  const fx = X(S.axF), fr = ra + 0.8;
  const hood = (x) => Math.max(nose + (bF - nose) * Math.pow(clamp((X(0.5) - x) / (X(0.5) - cowl), 0, 1), S.flat ? 0.6 : 0.5),
    Math.abs(x - fx) < fr ? r + Math.sqrt(fr * fr - (x - fx) ** 2) + 0.4 : 0);
  for (let k = 1; k < 8; k++) { const x = X(0.5) - 0.4 - ((X(0.5) - 0.4 - cowl) * k) / 8; P.push([x, hood(x)]); }
  P.push([cowl, bF], [deck, bR], [X(-0.5) + 0.8, tail], [X(-0.5), tail - 1.0], [X(-0.5), sill + 2.6], [X(-0.5), sill + 1.0]);
  const shape = new THREE.Shape(P.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = W - 2 * bv;
  const body = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bv, bevelSize: bv * 0.6, bevelSegments: S.flat ? 1 : 2, curveSegments: 1 });
  body.translate(0, 0, -depth / 2);
  // plan: the nose and tail narrower than the middle (the extrusion is a slab otherwise)
  const half = (x) => 1 - (1 - S.pinch[0]) * sstep(X(S.pinch[2]), X(0.5), x) - (1 - S.pinch[1]) * sstep(X(-0.3), X(-0.5), x);
  const pos = body.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * half(pos.getX(i)));
  // the glasshouse: windscreen, roof, rear window; leaning in towards the roof
  const [rf, rb, rh] = S.roof, roofY = h(rh), cf = cowl - 0.4, cb = deck + 0.6;
  const G = [[cf, bF - 0.8], [X(rf), roofY], [X(rb), roofY], [cb, bR - 0.8]];
  if (S.flat) G.splice(2, 0, [X((rf + rb) / 2), roofY + 0.15]);
  const gd = W * 0.84 - 2 * 0.6;
  const glass = new THREE.ExtrudeGeometry(new THREE.Shape(G.map(([x, y]) => new THREE.Vector2(x, y))), { depth: gd, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 1, curveSegments: 1 });
  glass.translate(0, 0, -gd / 2);
  const gp = glass.attributes.position, lo = Math.min(bF, bR);
  for (let i = 0; i < gp.count; i++) { const y = gp.getY(i), k = 1 - S.tumble * clamp((y - lo) / (roofY - lo), 0, 1); gp.setZ(i, gp.getZ(i) * k * half(gp.getX(i))); }
  // paint: body colour, a dark grille in the nose and diffuser in the tail, dark arch liners and underside;
  // the glasshouse dark glass with the roof panel in the roof colour
  const body0 = sp.body, dark = '#14161a', liner = '#0b0c0e';
  const parts = [paint(body, (n, m) => {
    if (n.y < -0.35) return liner;
    if (n.x > 0.6 && m.y < (sill + nose) / 2 && !S.flat) return dark; // the grille, under the bumper line
    if (n.x < -0.6 && m.y < sill + 2.6) return dark;                 // the diffuser
    return body0;
  }), paint(glass, (n) => (n.y > 0.8 ? sp.roof : '#0d1117'))];
  // door mirrors, and for the hyper and the wedge a rear wing on two struts
  const mirrors = [];
  for (const s of [-1, 1]) mirrors.push(boxAt(1.4, 1.0, 1.6, cowl - 1.2, bF + 0.9, s * (W / 2 + 0.3) * half(cowl)));
  parts.push(...mirrors.map((g) => paint(g, () => body0)));
  if (S.wing) {
    const wy = h(S.wing), wx = X(-0.46), wing = [boxAt(L * 0.11, 0.55, W * 0.98, wx, wy, 0)];
    for (const s of [-1, 1]) wing.push(boxAt(1.0, wy - bR + 0.6, 0.7, wx + 0.6, (wy + bR) / 2 - 0.2, s * W * 0.3), boxAt(L * 0.12, 2.2, 0.35, wx, wy - 0.6, s * W * 0.49));
    parts.push(...wing.map((g) => paint(g, () => sp.roof)));
  }
  // the bonnet camera: a hand's width above the bonnet, far enough forward that the bonnet is a strip at the bottom
  const eyeX = Math.max(cowl + 1, X(0.5) - 6.5);
  // what of the car the bonnet camera sees: the bonnet from just ahead of the eye to the nose, both edges
  // (the domed panel from bonnetGeometry included: its crown is the highest thing the camera sees of the car)
  const hoodPts = [], dome = S.flat ? 0.35 : 0.7;
  for (const x of [eyeX + 0.5, X(0.5) - 0.4]) for (const s of [-1, 0, 1]) hoodPts.push([x, hood(x) + 0.12 + (s ? 0 : dome), s * (W / 2) * half(x)]);
  return { geo: mergeAll(parts), S, L, W, r, nose, sill, tail, cowl, bF, half, eyeX, eyeY: hood(eyeX) + 3.2, hoodPts, hoodGeo: bonnetGeometry(sp, S, X(0.5), eyeX - 2, hood, half, W) };
}

// What the bonnet camera sees of its own car: the bonnet as a curved panel laid just over the body's flat one, domed
// across and creased down the middle, shading darker towards the camera and to its edges, with a bright edge where it
// turns over the nose and a dark lip below. Shown only on the bonnet camera. (A portrait screen sees only the middle
// few units of it, so the headlight housings at the corners stay out of frame and are not modelled here.)
function bonnetGeometry(sp, S, xn, x0, hood, half, W) {
  const ZN = [-1, -0.8, -0.5, -0.16, 0, 0.16, 0.5, 0.8, 1], NX = 8, dome = S.flat ? 0.35 : 0.7, // (the same dome as hoodPts)
    p = [], c = [], idx = [], col = new THREE.Color(), base = C(sp.body);
  const at = (i) => x0 + ((xn - 0.4 - x0) * i) / NX;
  for (let i = 0; i <= NX + 1; i++) {
    const lip = i > NX, x = lip ? xn - 0.1 : at(i), t = Math.min(1, i / NX); // the last row turns down over the nose: the far edge
    for (const z of ZN) {
      const hw = (W / 2 - 0.2) * half(x), y = hood(x) + 0.12 + (lip ? -0.9 : dome * (1 - Math.abs(z) ** 1.6));
      p.push(x, y, z * hw);
      // a highlight down the crease and along the far edge where the panel turns over; darker towards the camera
      // (the highlights mix towards white rather than scale, so a saturated paint still shows them)
      const near = 0.3 + 0.7 * clamp(1 - (xn - x) / 6, 0, 1), edge = 1 - 0.35 * Math.abs(z) ** 2;
      col.copy(base).multiplyScalar(lip ? 0.25 : edge * (i === NX ? 1 : near));
      if (!lip) col.lerp(WHITE, i === NX ? 0.2 : z === 0 ? 0.16 * near : Math.abs(z) < 0.2 ? 0.06 * near : 0);
      c.push(col.r, col.g, col.b);
    }
  }
  const n = ZN.length;
  for (let i = 0; i <= NX; i++) for (let j = 0; j < n - 1; j++) { const a = i * n + j, b = a + n; idx.push(a, a + 1, b + 1, a, b + 1, b); }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

// a wheel: tyre, and a rim with five lighter spokes so you can see it turn at parking speed
function wheelGeometry(r, w) {
  const g = new THREE.CylinderGeometry(r, r, w, 10, 1).rotateX(Math.PI / 2);
  return paint(g, (n, m) => (Math.abs(n.z) < 0.5 ? '#0b0b0c' : Math.hypot(m.x, m.y) > r * 0.66 ? '#1a1b1e' : (Math.round((Math.atan2(m.y, m.x) / (Math.PI * 2)) * 10 + 10) % 2 ? '#8d939c' : '#2a2c31')));
}

// a little sheen on the paint: a rim of the night sky's colour where the body turns away from you, so the shape reads
// against dark asphalt (the cars are Lambert, which has no highlight of its own)
// (uRim: less of it on the bonnet camera, where the whole bonnet is at a grazing angle)
function paintMaterial(c) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: C(c).multiplyScalar(0.05) });
  m.userData.rim = { value: 1 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = m.userData.rim;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ vec3 nv = normalize(vNormal); float rim = pow(1.0 - clamp(abs(nv.z), 0.0, 1.0), 3.0) * uRim;
  totalEmissiveRadiance += diffuseColor.rgb * rim * 0.55 + vec3(0.16, 0.18, 0.24) * rim * max(nv.y, 0.0); }`);
  };
  return m;
}

// The car as a group placed at the physics position: body (rolls and pitches about the wheel centres), wheels
// (one instanced mesh of four), lights, the shadow blob, and the headlight's throw on the road. tex: chase.js's
// glow, blob and beam textures. The ghost gets the same body and wheels in pale blue glass with a faint outline.
export function carMesh(sp, ghost, tex) {
  const B = bodyGeometry(sp), { L, W, r, S } = B, g = new THREE.Group(), body = new THREE.Group();
  g.scale.setScalar(CAR_SC);
  body.position.y = r; g.add(body);
  const wg = wheelGeometry(r, 2.6), track = W / 2 - 1.5;
  const st = { init: false, a: 0, x: 0, y: 0, vF: 0, vFs: 0, acc: 0, yr: 0, roll: 0, rv: 0, pitch: 0, pv: 0, spin: 0, steer: 0 };
  g.userData = { st, body, r, L, W, axF: S.axF * L, axR: S.axR * L, track, ghost: !!ghost, eye: [B.eyeX, B.eyeY], nose: L / 2, hoodPts: B.hoodPts };
  const add = (m, parent) => { (parent || body).add(m); return m; };
  if (ghost) {
    const glass = new THREE.MeshBasicMaterial({ color: '#a9d3ff', transparent: true, opacity: 0.4, depthWrite: false });
    add(new THREE.Mesh(B.geo, glass)).position.y = -r;
    const ol = add(new THREE.LineSegments(new THREE.EdgesGeometry(B.geo, 28), new THREE.LineBasicMaterial({ color: '#e4f3ff', transparent: true, opacity: 0.38, depthWrite: false })));
    ol.position.y = -r; ol.renderOrder = 4;
    g.userData.wheels = add(new THREE.InstancedMesh(wg, glass, 4), g);
    const gl = add(new THREE.Mesh(new THREE.PlaneGeometry(L * 2, W * 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.glow, color: C('#5f9dff').multiplyScalar(0.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), g);
    gl.position.y = 0.5; gl.renderOrder = 2;
  } else {
    const pm = add(new THREE.Mesh(B.geo, paintMaterial(sp.body))); pm.position.y = -r; g.userData.rim = pm.material.userData.rim;
    const hm = add(new THREE.Mesh(B.hoodGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: C(sp.body).multiplyScalar(0.04) })));
    hm.position.y = -r; hm.visible = false; g.userData.hood = hm;
    g.userData.wheels = add(new THREE.InstancedMesh(wg, new THREE.MeshLambertMaterial({ vertexColors: true }), 4), g);
    // lamps sit just proud of the bevelled nose and tail, where the plan taper puts the corners
    const xf = L / 2 + S.bev * 0.6 + 0.05, xb = -L / 2 - S.bev * 0.6 - 0.05, zf = W * 0.32 * B.half(L / 2), zb = W * 0.33 * B.half(-L / 2);
    const hy = S.flat ? B.nose * 0.6 : B.nose - 1.1, ty = B.tail - 1.4;
    const head = [], tl = [], rv = [];
    for (const s of [-1, 1]) {
      head.push(boxAt(0.7, S.flat ? 0.7 : 1.1, W * 0.17, xf - 0.3, hy - r, s * zf));
      tl.push(boxAt(0.6, 1.4, W * 0.22, xb, ty - r, s * zb));
      rv.push(boxAt(0.6, 0.9, W * 0.07, xb, ty - r, s * (zb - W * 0.15)));
    }
    const lamp = (list, m) => add(new THREE.Mesh(mergeAll(list.map((q) => paint(q, () => '#ffffff'))), m));
    lamp(head, new THREE.MeshBasicMaterial({ color: '#fff4d6' }));
    g.userData.tail = lamp(tl, new THREE.MeshBasicMaterial({ color: '#a31717' })).material;
    g.userData.rev = lamp(rv, new THREE.MeshBasicMaterial({ color: '#2a2b2e' })).material;
    // the soft shadow under the car, and a red (braking) or white (reversing) glow on the road behind it
    const blob = add(new THREE.Mesh(new THREE.PlaneGeometry(L * 1.5, W * 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.blob, transparent: true, depthWrite: false, opacity: 0.8 })), g);
    blob.position.y = 0.5; blob.renderOrder = 1; g.userData.blob = blob;
    const bg = add(new THREE.Mesh(new THREE.PlaneGeometry(26, W * 1.7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, color: '#000000' })), g);
    bg.position.set(-L / 2 - 9, 0.6, 0); bg.renderOrder = 3; bg.visible = false; g.userData.glow = bg;
    const beam = add(new THREE.Mesh(new THREE.PlaneGeometry(300, 190).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.beam, color: C('#ffe9c4').multiplyScalar(0.22), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), g);
    beam.position.set(L * 0.45 + 150, 0.8, 0); beam.renderOrder = 3;
    // the beam's sheen on wet asphalt: a long soft streak down the middle of the throw
    const wet = add(new THREE.Mesh(new THREE.PlaneGeometry(230, 30).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.glow, color: C('#ffe2b8').multiplyScalar(0.14), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), g);
    wet.position.set(L * 0.5 + 100, 0.9, 0); wet.renderOrder = 3;
    g.userData.beams = [beam.material, wet.material].map((m) => [m, m.color.clone()]);
    Object.assign(g.userData, { beam, wet, beamX: beam.position.x });
  }
  g.userData.wheels.frustumCulled = false;
  poseWheels(g);
  let tris = 0; // for Chase.info(): what one car costs as the chase camera draws it (the bonnet panel stands in for the body's flat one)
  g.traverse((o) => { if (o.isMesh && o !== g.userData.hood) tris += (o.geometry.attributes.position.count / 3) * (o.isInstancedMesh ? o.count : 1); });
  g.userData.tris = Math.round(tris);
  return g;
}

const m4 = new THREE.Matrix4(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
const AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1), FLIP = new THREE.Quaternion().setFromAxisAngle(AY, Math.PI);
function poseWheels(g) {
  const u = g.userData, st = u.st, w = u.wheels;
  [[u.axF, 1], [u.axF, -1], [u.axR, 1], [u.axR, -1]].forEach(([x, s], k) => {
    q1.setFromAxisAngle(AY, k < 2 ? st.steer : 0); q2.setFromAxisAngle(AZ, -st.spin * s);
    // the left-hand wheels are the right-hand ones turned round, so their spokes face out too
    if (s < 0) q2.premultiply(FLIP);
    m4.compose(v3.set(x, u.r, s * u.track), q1.multiply(q2), one); w.setMatrixAt(k, m4);
  });
  w.instanceMatrix.needsUpdate = true;
}

// Place a car and animate it from its motion. c: { x, y, a } and for the player also steer (-1..1), braking, rev.
// y: the height of the road under it. o.low: Low quality (the shadow does not shift with the body).
// The body's roll comes from the cornering force (speed times turn rate), its pitch from the change in speed; both
// are springs, so a sharp stop dips the nose and lets it bounce back a little. The ghost's steering is worked out
// from its turn rate.
export function poseCar(g, c, dt, y, o) {
  const u = g.userData, st = u.st;
  g.position.set(c.x, y, c.y); g.rotation.y = -c.a;
  if (!st.init || dt > 0.5) { Object.assign(st, { init: true, a: c.a, x: c.x, y: c.y, vF: 0, vFs: 0, yr: 0, roll: 0, rv: 0, pitch: 0, pv: 0 }); dt = 0; }
  if (dt > 1e-4) {
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    const vF = c.vx != null ? c.vx * fx + c.vy * fy : ((c.x - st.x) * fx + (c.y - st.y) * fy) / dt;
    const yr = wrap(c.a - st.a) / dt, k6 = 1 - Math.exp(-6 * dt);
    const vFs = st.vFs + (vF - st.vFs) * k6;
    st.acc += ((vFs - st.vFs) / dt - st.acc) * k6; st.vFs = vFs;
    st.yr += (yr - st.yr) * (1 - Math.exp(-10 * dt));
    const roll = clamp(-st.yr * vFs * 1.6e-4, -0.075, 0.075), pitch = clamp(st.acc * 6.5e-5, -0.05, 0.03);
    const n = Math.max(1, Math.ceil(dt / 0.02)), h = dt / n;
    for (let i = 0; i < n; i++) { // a slightly underdamped spring, stepped finely enough to stay stable at the test's time-warp
      st.rv += (60 * (roll - st.roll) - 9 * st.rv) * h; st.roll += st.rv * h;
      st.pv += (60 * (pitch - st.pitch) - 9 * st.pv) * h; st.pitch += st.pv * h;
    }
    st.spin = (st.spin + (vF * dt) / (u.r * CAR_SC)) % (Math.PI * 2);
    const want = c.steer != null ? -c.steer * 0.42 : clamp(-Math.atan2((u.axF - u.axR) * CAR_SC * st.yr, Math.max(40, Math.abs(vFs))), -0.45, 0.45);
    st.steer += (want - st.steer) * (1 - Math.exp(-14 * dt));
    st.vF = vF;
  }
  st.a = c.a; st.x = c.x; st.y = c.y;
  u.body.rotation.set(st.roll, 0, st.pitch);
  poseWheels(g);
  if (u.ghost) return;
  if (u.blob && !(o && o.low)) u.blob.position.z = -st.roll * 18; // the shadow slides out under the roll
  // From the bonnet the near field would be a haze right under the lens: the shadow blob and the wet streak go, and the
  // beam keeps only its far throw (pushed out ahead and fainter), so the road's markings and patches stay readable.
  // The curved bonnet panel takes over from the body's flat one.
  const bonnet = !!(o && o.bonnet);
  if (u.bonnet !== bonnet) {
    u.bonnet = bonnet; u.rim.value = bonnet ? 0.3 : 1;
    for (const [m, c0] of u.beams) m.color.copy(c0).multiplyScalar(bonnet ? 0.45 : 1);
    u.blob.visible = u.wet.visible = !bonnet; u.hood.visible = bonnet;
    u.beam.position.x = u.beamX + (bonnet ? 90 : 0);
  }
  u.tail.color.set(c.braking ? '#ff3a30' : '#a31717');
  u.rev.color.set(c.rev ? '#f4f6ff' : '#2a2b2e');
  u.glow.visible = !!(c.braking || c.rev);
  if (u.glow.visible) u.glow.material.color.set(c.rev ? '#3a3c40' : '#5a0d0d');
}
export function resetCar(g) { if (g) g.userData.st.init = false; }
// what the tests read: the car's cost and its moving parts
export function carInfo(g) {
  const u = g.userData, st = u.st, f = (v) => +v.toFixed(3);
  return { tris: u.tris, steer: f(st.steer), roll: f(st.roll), pitch: f(st.pitch), spin: f(st.spin), tail: u.tail ? u.tail.color.getHexString() : '', rev: u.rev ? u.rev.color.getHexString() : '' };
}

// The bonnet camera's eye and a point straight ahead of it, in world space (they roll and pitch with the body)
export function bonnetEye(g, eye, ahead, up) {
  const u = g.userData;
  g.updateMatrixWorld(true);
  eye.set(u.eye[0], u.eye[1] - u.r, 0); u.body.localToWorld(eye);
  ahead.set(u.eye[0] + 100, u.eye[1] - u.r - 10, 0); u.body.localToWorld(ahead);
  up.set(0, 1, 0).applyQuaternion(u.body.getWorldQuaternion(q1));
}
