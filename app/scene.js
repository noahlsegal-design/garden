// The 3D yard: builds the beds, fences, shed and trees from data/layout.json, draws every plant
// the way it looks in the chosen month, and reports taps on plants.
//
// Data coordinates are in feet: x = left(-)/right(+) as seen from the deck, z = distance out from the deck.
// three.js looks the other way round, so the helper W() mirrors x to keep "left" on the left of the screen.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { stateFor } from "./data.js";
import { lookFor } from "./look.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const W = (x, z, y = 0) => V(-x, y, z);

function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

// ---------- shared shapes & paints (reused by every plant, so the scene stays light on phones) ----------
const GEO = {
  blob: new THREE.IcosahedronGeometry(1, 1),
  ball: new THREE.IcosahedronGeometry(1, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  ring: new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2),
  disc: new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
  hit: new THREE.SphereGeometry(1, 8, 6),
};
const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true, ...opts }));
  return mats.get(key);
}
const MUTED = new THREE.Color("#b3b5a8"); // plants that aren't flowering while the bloom timeline is on
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

function mesh(geom, material, pos, scale, { shadow = true, rot } = {}) {
  const m = new THREE.Mesh(geom, material);
  m.position.copy(pos);
  if (Array.isArray(scale)) m.scale.set(...scale); else m.scale.setScalar(scale);
  if (rot) m.rotation.set(...rot);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

// ---------- month-dependent colors ----------
const LAWN = ["#a3a88c", "#a3a88c", "#8fa56b", "#7aa653", "#6ea04f", "#6a9c4b", "#6b9a49", "#72994a", "#6f9c4c", "#7a9f55", "#8e9f6a", "#a3a88c"];
const CANOPY = [null, null, null, "#a9cc72", "#5e8f45", "#4f7d3a", "#4b7636", "#4e7437", "#557a3a", "fall", null, null];
const FALL = ["#d9822b", "#e3b23c", "#b8452a", "#c9a23a", "#8f6a3a"];
const SKY = "#dde8ec";

// ---------- one plant ----------
// bloomView: the bloom timeline is on, so plants in flower get a ring in their flower color and everything else is greyed.
function buildPlant(p, sp, month, bloomView = false) {
  const g = new THREE.Group();
  const look = lookFor(p);
  const s = p.size || 1;
  const shrub = look.shrub || sp.kind === "shrub";
  const r = (shrub ? 1.1 : 0.75) * s;
  const H = Math.max(0.3, r * 1.2 * look.h);
  const rand = rng(hashStr(p.id));
  const state = stateFor(sp, month);
  const blooming = state === "bloom";
  const paint = bloomView && !blooming ? (color, opts) => mat(MUTED.clone().lerp(new THREE.Color(color), 0.25).getStyle(), opts) : mat;
  const body = new THREE.Group();
  g.add(body);

  const blob = (color, hFrac = 1, rFrac = 1, opts) => body.add(mesh(GEO.blob, paint(color, opts), V(0, (H * hFrac) / 2, 0), [r * rFrac, (H * hFrac) / 2, r * rFrac]));
  const tufts = (color, hFrac = 1) => {
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2, d = r * 0.55 * Math.sqrt(rand());
      body.add(mesh(GEO.cone, paint(color), V(Math.cos(a) * d, 0, Math.sin(a) * d), [0.16 * s + 0.05, H * hFrac * (0.7 + 0.4 * rand()), 0.16 * s + 0.05], { rot: [(rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5] }));
    }
  };
  const foliage = (color = look.leaf, hFrac = 1) => (look.grass ? tufts(color, hFrac) : blob(color, hFrac));
  const dots = (color, n = 7, size = 0.17, yTop = 1) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, d = r * 0.75 * Math.sqrt(rand());
      const y = H * yTop * (0.62 + 0.42 * rand()) * Math.sqrt(1 - (d / r) ** 2 * 0.6);
      body.add(mesh(GEO.ball, paint(color), V(Math.cos(a) * d, y, Math.sin(a) * d), (size + 0.05 * rand()) * Math.max(1, s * 0.8)));
    }
  };
  const sticks = (color = "#6b4f32", n = 7, hFrac = 1) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, d = r * 0.35 * rand();
      body.add(mesh(GEO.cyl, paint(color), V(Math.cos(a) * d, 0, Math.sin(a) * d), [0.045 * s + 0.02, H * hFrac * (0.75 + 0.3 * rand()), 0.045 * s + 0.02], { rot: [(rand() - 0.5) * 0.7, 0, (rand() - 0.5) * 0.7] }));
    }
  };
  const marker = (color, opacity = 0.75) => g.add(mesh(GEO.ring, paint(color, { transparent: true, opacity, side: THREE.DoubleSide }), V(0, 0.2, 0), [r, 1, r], { shadow: false }));

  switch (state) {
    case "gone": marker("#b9a57e", 0.8); break;
    case "stored":
      marker("#8a6a45", 0.8);
      body.add(mesh(GEO.box, paint("#8a6a45"), V(0, 0, 0), [0.55, 0.4, 0.55]));
      break;
    case "dormant":
      if (shrub) sticks(); else blob("#7a5a3c", 0.18, 0.6);
      break;
    case "dormant-tan": tufts("#c9b27a", 0.9); break;
    case "bare": if (shrub) sticks(); else blob("#7a5a3c", 0.18, 0.6); break;
    case "bare-flowerheads": sticks("#7a6048"); dots("#cbb89a", 6, 0.28); break;
    case "emerging": case "seedling": foliage("#9ccf6a", 0.45); break;
    case "leafing": if (shrub) { sticks(); dots("#9ccf6a", 10, 0.2); } else foliage("#9ccf6a", 0.6); break;
    case "rosette": blob(look.leaf, 0.32); break;
    case "evergreen": foliage(new THREE.Color(look.leaf).multiplyScalar(0.8).getStyle(), 0.8); break;
    case "bloom": foliage(); dots(look.flower, look.grass ? 5 : 8); break;
    case "aging-bloom": foliage(); dots(look.aging, 7, 0.24); break;
    case "fruit": foliage(); dots(look.fruit, 7, 0.14); break;
    case "harvest": foliage(); if (look.fruit && !["radish", "beet"].includes(p.speciesId)) dots(look.fruit, 5, 0.14); break;
    case "ferns": body.add(mesh(GEO.cone, paint(look.leaf, { transparent: true, opacity: 0.85 }), V(0, 0, 0), [r * 0.9, H * 1.1, r * 0.9])); break;
    case "seedheads": sticks("#6b4f32", 6, 0.95); dots("#3b2a1e", 5, 0.13, 1.05); break;
    case "fall-color": foliage(look.fall, 0.85); break;
    case "yellowing": foliage("#d4c05a", 0.7); break;
    case "frost-blackened": foliage("#3a2f2a", 0.7); break;
    default: foliage(); // foliage and anything unexpected
  }

  if (look.pot) {
    g.add(mesh(GEO.cyl, paint("#b5653a"), V(0, 0, 0), [0.45, 0.6, 0.45]));
    body.position.y = 0.6;
  }

  if (bloomView && blooming) {
    const y = look.pot ? 0.65 : 0.22; // just above the bed's surface
    const size = r * 1.45 + 0.4;
    g.add(mesh(GEO.disc, mat(look.flower, { transparent: true, opacity: 0.5, depthWrite: false }), V(0, y, 0), size, { shadow: false }));
    g.add(mesh(GEO.ring, mat(look.flower, { side: THREE.DoubleSide }), V(0, y + 0.02, 0), size, { shadow: false }));
  }

  const hitR = Math.max(1.0, r * 1.15);
  const hit = new THREE.Mesh(GEO.hit, HIT_MAT);
  hit.position.set(0, Math.max(0.6, H / 2), 0);
  hit.scale.set(hitR, Math.max(hitR, H / 2 + 0.3), hitR);
  hit.userData.plantId = p.id;
  g.add(hit);

  g.position.copy(W(p.position.x, p.position.z, p.area?.startsWith("raised-bed") ? 1 : 0));
  g.userData = { plantId: p.id, radius: r, height: H, hit, blooming };
  return g;
}

// ---------- the yard ----------
function perimeterStones(points, group, skip) {
  const rand = rng(7);
  const pts = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (skip && skip(a, b)) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 1.1));
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const inst = new THREE.InstancedMesh(GEO.ball, mat("#9b9a91"), pts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  pts.forEach(([x, z], i) => {
    const k = 0.35 + 0.2 * rand();
    q.setFromEuler(new THREE.Euler(0, rand() * 6, 0));
    sc.set(k * 1.2, k * 0.7, k);
    m4.compose(W(x, z, 0.15), q, sc);
    inst.setMatrixAt(i, m4);
  });
  inst.castShadow = true; inst.receiveShadow = true;
  group.add(inst);
}

function flatShape(shape, color, height = 0.15) {
  const geom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geom, mat(color));
  m.receiveShadow = true;
  return m;
}

function segmentBox(from, to, height, thick, material, y0 = 0) {
  const a = W(from[0], from[1]), b = W(to[0], to[1]);
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(GEO.box, material);
  m.position.set((a.x + b.x) / 2, y0, (a.z + b.z) / 2);
  m.scale.set(thick, height, len);
  m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function buildYard(layout, trees, fadeable) {
  const g = new THREE.Group();
  const MULCH = "#8b6a4a";

  for (const a of layout.areas) {
    if (a.id === "lawn") continue;
    if (a.shape === "rect") {
      const c = W(a.x + a.width / 2, a.z + a.depth / 2);
      if (a.id === "deck") {
        g.add(mesh(GEO.box, mat("#a57c52"), c, [a.width, 2, a.depth]));
        for (const [dx, dz, w, d] of [[0, a.depth / 2, a.width, 0.25], [a.width / 2, 0, 0.25, a.depth], [-a.width / 2, 0, 0.25, a.depth]]) {
          g.add(mesh(GEO.box, mat("#f1efe8"), V(c.x + dx, 2, c.z + dz), [w, 3, d]));
        }
      } else if (a.id.startsWith("raised-bed")) {
        g.add(mesh(GEO.box, mat("#9c7b55"), c, [a.width, 1, a.depth - 0.2]));
        g.add(mesh(GEO.box, mat("#5a4330"), V(c.x, 0.02, c.z), [a.width - 0.35, 1, a.depth - 0.55], { shadow: false }));
      } else {
        g.add(mesh(GEO.box, mat(MULCH), c, [a.width, 0.15, a.depth], { shadow: false }));
      }
    } else if (a.shape === "polygon") {
      const shape = new THREE.Shape(a.points.map(([x, z]) => new THREE.Vector2(-x, -z)));
      g.add(flatShape(shape, MULCH));
      if (a.edge === "stone") perimeterStones(a.points, g, (p, q) => (p[0] <= -25.9 && q[0] <= -25.9) || (p[1] >= 62.9 && q[1] >= 62.9));
    } else if (a.shape === "ellipse") {
      const shape = new THREE.Shape();
      shape.absellipse(-a.cx, -a.cz, a.rx, a.rz, 0, Math.PI * 2, false, 0);
      g.add(flatShape(shape, MULCH));
      const pts = [];
      for (let i = 0; i < 48; i++) { const t = (i / 48) * Math.PI * 2; pts.push([a.cx + a.rx * Math.cos(t), a.cz + a.rz * Math.sin(t)]); }
      // No stones along the shed side of the island.
      if (a.edge === "stone") perimeterStones(pts, g, (p, q) => p[1] > a.cz + a.rz * 0.8 && q[1] > a.cz + a.rz * 0.8);
    }
  }

  for (const s of layout.structures) {
    switch (s.type) {
      case "wall":
      case "building": {
        const c = W(s.x + s.width / 2, s.z + s.depth / 2);
        const side = mat(s.color);
        const faces = s.frontColor ? [side, side, side, side, side, mat(s.frontColor)] : side;
        g.add(mesh(GEO.box, faces, c, [s.width, s.height, s.depth]));
        if (s.type === "building") g.add(mesh(GEO.box, mat(s.notOurs ? "#9b8f7a" : "#3d3d3a"), V(c.x, s.height, c.z), [s.width + 1, 0.5, s.depth + 1]));
        break;
      }
      case "fence": {
        const see = s.seeThrough;
        g.add(segmentBox(s.from, s.to, s.height, 0.2, see ? mat(s.color, { transparent: true, opacity: 0.3 }) : mat(s.color)));
        const a = W(...s.from), b = W(...s.to), len = a.distanceTo(b), n = Math.round(len / (see ? 8 : 6));
        for (let i = 0; i <= n; i++) {
          const p = a.clone().lerp(b, i / n);
          g.add(mesh(GEO.box, mat(see ? "#6d7275" : s.color), p, [see ? 0.2 : 0.45, s.height + 0.3, see ? 0.2 : 0.45]));
        }
        break;
      }
      case "trellis": {
        const c = W(s.x, s.z);
        const m = mat(s.color);
        if (s.id === "arch-trellis") {
          const R = s.width / 2, post = s.height - R;
          for (const dz of [-R, R]) g.add(mesh(GEO.cyl, m, V(c.x, 0, c.z + dz), [0.08, post, 0.08]));
          const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.08, 6, 24, Math.PI), m);
          arc.rotation.y = Math.PI / 2; arc.position.set(c.x, post, c.z); arc.castShadow = true;
          g.add(arc);
        } else {
          for (const dx of [-s.width / 2, s.width / 2]) g.add(mesh(GEO.cyl, m, V(c.x + dx, 0, c.z), [0.1, s.height, 0.1]));
          for (const y of [2, 4, s.height - 0.1]) g.add(mesh(GEO.box, m, V(c.x, y, c.z), [s.width, 0.1, 0.1]));
        }
        break;
      }
      case "post": {
        const c = W(s.x, s.z);
        g.add(mesh(GEO.cyl, mat(s.color), c, [0.25, s.height, 0.25]));
        g.add(mesh(GEO.box, mat("#caa27a"), V(c.x, s.height, c.z), [0.9, 1, 0.9]));
        g.add(mesh(GEO.cone, mat("#6b4f32"), V(c.x, s.height + 1, c.z), [0.8, 0.6, 0.8]));
        break;
      }
      case "rock": {
        const c = W(s.x, s.z);
        g.add(mesh(GEO.ball, mat("#8f8f88"), V(c.x, 0.1, c.z), [s.radius, 0.35, s.radius * 0.8]));
        if (s.hook) {
          const hx = c.x - 0.5;
          g.add(mesh(GEO.cyl, mat("#222"), V(hx, 0, c.z), [0.05, 6.5, 0.05]));
          g.add(mesh(GEO.box, mat("#222"), V(hx - 0.5, 6.4, c.z), [1, 0.08, 0.08]));
          g.add(mesh(GEO.box, mat("#c9a26a"), V(hx - 1, 5.2, c.z), [0.6, 0.8, 0.6]));
        }
        break;
      }
      case "stump": {
        const c = W(s.x, s.z);
        g.add(mesh(GEO.cyl, mat("#7a5a3a"), c, [s.radius, 0.9, s.radius]));
        break;
      }
      case "shrub": {
        const c = W(s.x, s.z);
        const rand = rng(11);
        for (let i = 0; i < 4; i++) {
          const a = rand() * 6.28, d = s.radius * 0.35 * rand();
          g.add(mesh(GEO.blob, mat(s.color), V(c.x + Math.cos(a) * d, s.height * 0.45, c.z + Math.sin(a) * d), [s.radius * (0.7 + 0.3 * rand()), s.height * 0.5, s.radius * (0.7 + 0.3 * rand())]));
        }
        break;
      }
      case "trees": {
        const rand = rng(hashStr(s.id));
        const a = W(...s.from), b = W(...s.to), len = a.distanceTo(b);
        const n = Math.round(len / 5);
        for (let i = 0; i < n; i++) {
          const base = a.clone().lerp(b, (i + rand() * 0.8) / n);
          base.z += rand() * s.depth;
          const h = 14 + rand() * 12;
          const trunk = mesh(GEO.cyl, mat("#6e6259"), base, [0.45 + rand() * 0.3, h, 0.45 + rand() * 0.3]);
          const conifer = rand() < 0.12;
          const canopy = conifer
            ? mesh(GEO.cone, mat("#2f5132"), V(base.x, h * 0.35, base.z), [3.2, h * 0.85, 3.2])
            : mesh(GEO.blob, mat("#4f7d3a"), V(base.x, h * 0.85, base.z), [4.5 + rand() * 3, 4 + rand() * 2.5, 4.5 + rand() * 3]);
          canopy.userData = {
            conifer, fallColor: FALL[i % FALL.length], trunk,
            center: conifer ? V(base.x, h * 0.75, base.z) : canopy.position.clone(),
            r: conifer ? 4.5 : Math.max(canopy.scale.x, canopy.scale.z),
          };
          g.add(trunk, canopy);
          trees.push(canopy);
          fadeable.push(canopy);
        }
        break;
      }
    }
  }
  return g;
}

// ---------- places to look from ----------
// Each vantage point says which side you look from (a direction in yard feet: x left/right as seen from the deck,
// z out from the deck), how far the view tilts down from overhead (0 = straight down, 1.4 = nearly level),
// and the stretch of yard to fit on screen. The camera backs off just enough for that stretch to fit any screen.
const VIEWPOINTS = [
  { id: "corner", name: "The back corner", from: [0.35, 1], tilt: 1.0, fit: { x: [-26, -11], z: [36, 63] } },
  { id: "shed", name: "The shed", from: [-0.3, 1], tilt: 0.9, fit: { x: [-26, 14], z: [-10, 26] } },
  { id: "side", name: "Across the lawn", from: [1, -0.25], tilt: 1.0, fit: { x: [-26, -19], z: [0, 40] } },
];
// Beds to zoom to. Each is one or more areas from layout.json.
const PLACES = [
  { id: "dahlia-strip", name: "Dahlia strip", areas: ["dahlia-strip"] },
  { id: "raised-beds", name: "Raised beds", areas: ["trellis", "raised-bed-1", "raised-bed-2", "raised-bed-3", "raised-bed-4", "raised-bed-5"] },
  { id: "perennial-bed", name: "Perennial bed", areas: ["perennial-bed"] },
  { id: "island-bed", name: "Shed island bed", areas: ["island-bed"] },
];
const GROUND = new THREE.Plane(V(0, 1, 0), 0);

// ---------- public ----------
export function createYard(canvas, { layout, onPick, onMove }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 110, 230);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 600);

  // Map-style controls: dragging slides you around the yard, pinching or scrolling zooms toward the spot you're
  // pointing at, and two fingers (or right-drag, or Shift-drag) turn and tilt the view.
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.maxPolarAngle = 1.45;
  controls.minDistance = 5;
  controls.maxDistance = 170;
  controls.listenToKeyEvents(canvas); // arrow keys slide the view when the yard has keyboard focus
  // Keep the spot you're looking at inside the yard.
  const b = layout.bounds || { xMin: -30, xMax: 30, zMin: -12, zMax: 78 };
  controls.cursor.copy(W((b.xMin + b.xMax) / 2, (b.zMin + b.zMax) / 2));
  controls.maxTargetRadius = Math.hypot(b.xMax - b.xMin, b.zMax - b.zMin) / 2 + 5;

  scene.add(new THREE.HemisphereLight("#ffffff", "#5d6b45", 1.5));
  const sun = new THREE.DirectionalLight("#fff3dd", 2.2);
  sun.position.copy(W(-30, -20, 70));
  sun.target.position.copy(W(0, 30));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 220 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), mat(LAWN[8]));
  ground.receiveShadow = true;
  scene.add(ground);

  const trees = [], fadeable = [];
  scene.add(buildYard(layout, trees, fadeable));
  const areaById = new Map(layout.areas.map((a) => [a.id, a]));

  const plantsRoot = new THREE.Group();
  scene.add(plantsRoot);
  const selRing = mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, side: THREE.DoubleSide }), V(0, 0.08, 0), 1, { shadow: false });
  selRing.renderOrder = 5; selRing.visible = false;
  scene.add(selRing);
  const hlRoot = new THREE.Group();
  scene.add(hlRoot);

  let groups = new Map();
  let hitTargets = [];
  let selectedId = null;
  let highlight = null;
  let needsRender = true;
  let anim = null;
  let userMoved = false;
  const ray = new THREE.Raycaster();

  // ----- camera -----
  // Start by looking down the yard from above the deck. Tall phone screens get a higher, more
  // top-down view so the whole length of the yard fits.
  const CENTER = W(-6, 27);
  const FACING_OUT = Math.PI; // the direction you face standing on the deck
  function defaultView() {
    const aspect = camera.aspect || 1;
    const offset = aspect < 0.8 ? V(0, 86, -40) : V(0, 44, -40).multiplyScalar(aspect < 1.2 ? 1.25 : 1);
    return { target: CENTER.clone(), pos: CENTER.clone().add(offset) };
  }
  const clampDist = (d) => THREE.MathUtils.clamp(d, controls.minDistance, controls.maxDistance);
  const inYard = (p) => p.sub(controls.cursor).clampLength(0, controls.maxTargetRadius).add(controls.cursor);
  const current = () => new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const place = (target, s) => target.clone().add(V(0, 0, 0).setFromSpherical(s));

  // Glides to a new view. Angles are blended, so turns follow an arc and zooms feel even.
  function flyTo(target, pos, ms = 700) {
    const toT = inYard(target.clone());
    const to = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
    to.radius = clampDist(to.radius);
    to.phi = Math.min(to.phi, controls.maxPolarAngle);
    const from = current();
    let turn = to.theta - from.theta;
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    // Drop any leftover glide from the last drag so it doesn't pull against the animation.
    controls._sphericalDelta.set(0, 0, 0);
    controls._panOffset.set(0, 0, 0);
    anim = { t0: performance.now(), ms, fromT: controls.target.clone(), toT, from, to, turn };
    userMoved = true; // so a small window resize doesn't snap back to the start view
    needsRender = true;
  }
  function resetView(instant = false) {
    const v = defaultView();
    if (!instant) { flyTo(v.target, v.pos); userMoved = false; return; }
    anim = null;
    controls.target.copy(v.target);
    camera.position.copy(v.pos);
    controls.update();
    needsRender = true;
  }
  function focus(id) {
    const g = groups.get(id);
    if (!g) return;
    const target = V(g.position.x, 0, g.position.z);
    const s = current();
    s.radius = THREE.MathUtils.clamp(s.radius, 16, 30);
    s.phi = Math.min(s.phi, 1.1);
    flyTo(target, place(target, s));
  }
  function zoomBy(factor) {
    const s = current();
    s.radius = clampDist(s.radius * factor);
    flyTo(controls.target, place(controls.target, s), 350);
  }
  function turn(angle) {
    const s = current();
    s.theta += angle;
    flyTo(controls.target, place(controls.target, s), 450);
  }
  function screenRay(x, y) {
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), camera);
    return ray;
  }
  // Zooms in (or out) on the spot of ground under a screen point, and centers it.
  function zoomAt(x, y, factor) {
    const spot = screenRay(x, y).ray.intersectPlane(GROUND, V(0, 0, 0)) || controls.target.clone();
    const s = current();
    s.radius = clampDist(s.radius * factor);
    flyTo(spot, place(spot, s), 450);
  }

  // Fits a stretch of ground on screen from a given angle (the current one unless told otherwise),
  // moving back just far enough that every corner is in view.
  function fitGround(points, { phi, theta } = {}) {
    const xs = points.map((p) => p.x), zs = points.map((p) => p.z);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const center = V((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const corners = [V(x0, 0, z0), V(x1, 0, z0), V(x0, 0, z1), V(x1, 0, z1), V(x0, 3, z0), V(x1, 3, z1)];
    const s = current();
    s.phi = phi ?? THREE.MathUtils.clamp(s.phi, 0.05, 1.0);
    if (theta != null) s.theta = theta;
    const probe = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
    const fits = (dist) => {
      s.radius = dist;
      probe.position.copy(place(center, s));
      probe.lookAt(center);
      probe.updateMatrixWorld();
      return corners.every((c) => {
        const p = c.clone().project(probe);
        return p.z < 1 && Math.abs(p.x) < 0.86 && Math.abs(p.y) < 0.8;
      });
    };
    let lo = controls.minDistance, hi = controls.maxDistance;
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    s.radius = Math.max(hi, 14);
    flyTo(center, place(center, s));
  }
  function areaCorners(a) {
    if (a.shape === "rect") return [W(a.x, a.z), W(a.x + a.width, a.z + a.depth)];
    if (a.shape === "polygon") return a.points.map(([x, z]) => W(x, z));
    if (a.shape === "ellipse") return [W(a.cx - a.rx, a.cz - a.rz), W(a.cx + a.rx, a.cz + a.rz)];
    return [];
  }
  // Frames a set of plants, e.g. the ones ringed by "Show in yard".
  function fitTo(ids) {
    const pts = [];
    for (const id of ids) {
      const g = groups.get(id);
      if (!g) continue;
      const r = g.userData.radius + 1;
      pts.push(V(g.position.x - r, 0, g.position.z - r), V(g.position.x + r, 0, g.position.z + r));
    }
    if (pts.length) fitGround(pts);
  }
  function views() {
    return [
      { id: "start", name: "The deck", note: "Start view", group: "look" },
      { id: "above", name: "Straight above", note: "Like a map", group: "look" },
      ...VIEWPOINTS.map(({ id, name }) => ({ id, name, group: "look" })),
      ...PLACES.filter((p) => p.areas.some((a) => areaById.has(a))).map(({ id, name }) => ({ id, name, group: "zoom" })),
    ];
  }
  function goTo(id) {
    if (id === "start") return resetView();
    if (id === "above") return fitGround(layout.areas.flatMap(areaCorners), { phi: 0.02, theta: FACING_OUT });
    const vp = VIEWPOINTS.find((v) => v.id === id);
    if (vp) {
      const { x: [x0, x1], z: [z0, z1] } = vp.fit;
      const from = W(vp.from[0], vp.from[1]);
      return fitGround([W(x0, z0), W(x1, z1)], { phi: vp.tilt, theta: Math.atan2(from.x, from.z) });
    }
    const bed = PLACES.find((p) => p.id === id);
    if (bed) fitGround(bed.areas.filter((a) => areaById.has(a)).flatMap((a) => areaCorners(areaById.get(a))));
  }

  controls.addEventListener("start", () => { userMoved = true; anim = null; onMove?.(); });
  controls.addEventListener("change", () => { needsRender = true; });

  // ----- trees between you and what you're looking at step aside -----
  // A tree (trunk and all) hides when it's on screen and clearly nearer to you, measured along the ground,
  // than the spot you're looking at, or when you're right up against it. Trees behind that spot stay as the backdrop.
  const onScreen = V(0, 0, 0);
  const along = (p) => Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
  function fadeTrees() {
    const lookDist = along(controls.target);
    for (const m of fadeable) {
      const u = m.userData;
      onScreen.copy(u.center).project(camera);
      const inView = onScreen.z < 1 && Math.abs(onScreen.x) < 1.3 && Math.abs(onScreen.y) < 1.3;
      const fade = (inView && along(u.center) < lookDist - 6) || u.center.distanceTo(camera.position) < u.r + 3;
      if (fade !== !!u.faded) {
        u.faded = fade;
        m.visible = !fade && u.inSeason !== false;
        u.trunk.visible = !fade;
      }
    }
  }

  // ----- plants -----
  let lastPlants = [], lastSpecies = null, lastMonth = 0, bloomView = false;
  function setPlants(plants, species, month) {
    lastPlants = plants; lastSpecies = species; lastMonth = month;
    plantsRoot.clear();
    groups = new Map();
    hitTargets = [];
    for (const p of plants) {
      const g = buildPlant(p, species.get(p.speciesId), month, bloomView);
      plantsRoot.add(g);
      groups.set(p.id, g);
      hitTargets.push(g.userData.hit);
    }
    placeRings();
  }
  function setMonth(month) {
    setPlants(lastPlants, lastSpecies, month);
    ground.material = mat(LAWN[month]);
    for (const c of trees) {
      if (c.userData.conifer) continue;
      const col = CANOPY[month];
      c.userData.inSeason = !!col; // bare in winter
      c.visible = !!col && !c.userData.faded;
      if (col) c.material = mat(col === "fall" ? c.userData.fallColor : col);
    }
    needsRender = true;
  }
  function setBloom(on) {
    if (bloomView === !!on) return;
    bloomView = !!on;
    setPlants(lastPlants, lastSpecies, lastMonth);
  }
  function placeRings() {
    const g = selectedId && groups.get(selectedId);
    selRing.visible = !!g;
    if (g) { selRing.position.set(g.position.x, g.position.y + 0.22, g.position.z); selRing.scale.setScalar(g.userData.radius * 1.45 + 0.3); }
    hlRoot.clear();
    if (highlight) {
      for (const id of highlight.ids) {
        const hg = groups.get(id);
        if (!hg) continue;
        const ring = mesh(GEO.ring, mat(highlight.color, { transparent: true, opacity: 0.95, side: THREE.DoubleSide }), V(hg.position.x, hg.position.y + 0.2, hg.position.z), hg.userData.radius * 1.3 + 0.35, { shadow: false });
        hlRoot.add(ring);
      }
    }
    needsRender = true;
  }
  function select(id) { selectedId = id; placeRings(); }
  function setHighlight(h) { highlight = h; placeRings(); }

  // ----- tapping -----
  // A quick tap or click picks a plant, and a double-tap or double-click zooms in on that spot. Anything done
  // with two fingers is a gesture, not a tap.
  const downs = new Map();
  let multi = false, lastTap = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    if (downs.size > 1) multi = true;
  });
  const lift = (e) => {
    const d = downs.get(e.pointerId);
    downs.delete(e.pointerId);
    const gesture = multi;
    if (!downs.size) multi = false;
    return gesture ? null : d;
  };
  canvas.addEventListener("pointercancel", lift);
  canvas.addEventListener("pointerup", (e) => {
    const d = lift(e);
    const now = performance.now();
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || now - d.t > 600) return;
    const touchDouble = e.pointerType !== "mouse" && lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
    if (touchDouble) {
      lastTap = null;
      zoomAt(e.clientX, e.clientY, 0.5);
      onMove?.();
      return;
    }
    lastTap = { x: e.clientX, y: e.clientY, t: now };
    const hit = screenRay(e.clientX, e.clientY).intersectObjects(hitTargets, false)[0];
    onPick(hit ? hit.object.userData.plantId : null);
  });
  canvas.addEventListener("dblclick", (e) => { zoomAt(e.clientX, e.clientY, 0.5); onMove?.(); }); // mice (touch is handled above)

  // ----- sizing & drawing -----
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const wasPortrait = camera.aspect < 0.8;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!userMoved || wasPortrait !== camera.aspect < 0.8) resetView(true);
    needsRender = true;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function frame(now) {
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.ms);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      controls.target.lerpVectors(anim.fromT, anim.toT, e);
      const s = new THREE.Spherical(
        anim.from.radius * (anim.to.radius / anim.from.radius) ** e,
        THREE.MathUtils.lerp(anim.from.phi, anim.to.phi, e),
        anim.from.theta + anim.turn * e,
      );
      camera.position.copy(place(controls.target, s));
      needsRender = true;
      if (t === 1) anim = null;
    }
    if (controls.update()) needsRender = true;
    if (selRing.visible) {
      selRing.material.opacity = 0.6 + 0.35 * Math.sin(now / 300);
      needsRender = true;
    }
    if (needsRender) {
      fadeTrees();
      renderer.render(scene, camera);
      needsRender = false;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { setPlants, setMonth, setBloom, select, focus, resetView, setHighlight, fitTo, views, goTo, zoomBy, turn };
}
