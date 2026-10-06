// Arch trellises in the yard: their shape, size and which way they face, worked out from data/layout.json and
// any changes made in Edit mode. Nothing here draws anything; scene.js builds the arch from archProfile() and
// shapes.js grows vines along the same outline.
//
// An arch in layout.json: { id, type: "trellis", arch: true, x, z (where its middle is, in yard feet), width
// (feet between the legs), height (feet to the top), depth (feet between its front and back frames, 0 for a
// single hoop), shape (one of ARCH_SHAPES), turn (degrees; 0 = you walk through it heading out from the deck) }.

export const ARCH_SHAPES = [
  { id: "round", name: "Round", about: "A half-circle over two straight legs." },
  { id: "pointed", name: "Pointed", about: "Two curves that meet in a point, like a church window." },
  { id: "flat", name: "Flat top", about: "Two posts and a straight crossbar, like an arbor." },
  { id: "low", name: "Low curve", about: "A shallow, wide curve on tall legs." },
];
const SHAPE_IDS = new Set(ARCH_SHAPES.map((s) => s.id));
// The sizes Edit mode allows, in feet (and degrees for turn).
export const ARCH_LIMITS = { width: [1, 16], height: [2, 14], depth: [0, 6], turn: [0, 179] };

const num = (v) => typeof v === "number" && Number.isFinite(v);
const within = (v, [lo, hi]) => num(v) && v >= lo && v <= hi;

// Whether a structure is an arch trellis (the old layout marked the black arch by its id alone).
export const isArch = (s) => s?.type === "trellis" && (s.arch === true || s.id === "arch-trellis");

// An arch's details with the defaults filled in, so older layouts (no shape, depth or turn) still work.
export function archOf(s) {
  return {
    id: s.id, name: s.name || "Arch trellis", color: s.color || "#1d1d1d",
    x: num(s.x) ? s.x : 0, z: num(s.z) ? s.z : 0,
    width: within(s.width, ARCH_LIMITS.width) ? s.width : 5,
    height: within(s.height, ARCH_LIMITS.height) ? s.height : 7,
    depth: within(s.depth, ARCH_LIMITS.depth) ? s.depth : 0,
    shape: SHAPE_IDS.has(s.shape) ? s.shape : "round",
    turn: within(s.turn, [0, 360]) ? s.turn % 180 : 0,
  };
}

// Whether a value makes sense for one of an arch's details (Edit mode changes it as "position", "width"…).
export function usableArchValue(field, v) {
  if (field === "position") return v != null && num(v.x) && num(v.z);
  if (field === "shape") return SHAPE_IDS.has(v);
  if (field in ARCH_LIMITS) return within(v, ARCH_LIMITS[field]);
  return false;
}
export const ARCH_FIELDS = ["position", "width", "height", "depth", "shape", "turn"];

// The arch's outline as seen walking through it: points [u, y] in feet from the foot of one leg (u = −width/2)
// over the top to the foot of the other (u = +width/2). Legs are straight; the top follows the shape.
export function archProfile(a, steps = 16) {
  const R = a.width / 2, H = a.height;
  const pts = [];
  const curve = (rise, f) => { // f(t) for t 0→1 across the top gives [u, height above the legs]
    const post = H - rise;
    pts.push([-R, 0]);
    for (let i = 0; i <= steps; i++) { const [u, y] = f(i / steps); pts.push([u, post + y * rise]); }
    pts.push([R, 0]);
  };
  if (a.shape === "flat") {
    const c = Math.min(0.4, R * 0.25, H * 0.2); // a small rounded corner where post meets crossbar
    pts.push([-R, 0], [-R, H - c], [-R + c * 0.3, H - c * 0.3], [-R + c, H], [R - c, H], [R - c * 0.3, H - c * 0.3], [R, H - c], [R, 0]);
  } else if (a.shape === "pointed") {
    // Two circular arcs, each centred on the far leg (an equilateral gothic arch), squashed to fit the height.
    const rise = Math.min(a.width * 0.866, H * 0.7);
    curve(rise, (t) => {
      const side = t < 0.5 ? -1 : 1, k = side < 0 ? t * 2 : (1 - t) * 2; // 0 at a leg, 1 at the point
      const ang = (k * Math.PI) / 3;
      return [side * (R - a.width * (1 - Math.cos(ang))), Math.sin(ang) / Math.sin(Math.PI / 3)];
    });
  } else {
    const rise = a.shape === "low" ? Math.min(a.width * 0.2, H * 0.4) : Math.min(R, H * 0.8);
    curve(rise, (t) => { const ang = Math.PI * (1 - t); return [R * Math.cos(ang), Math.sin(ang)]; });
  }
  return pts;
}

// The direction the arch spans (from one leg to the other) and the direction you walk through it, as yard
// [x, z] unit vectors.
export function archAxes(a) {
  const t = (a.turn * Math.PI) / 180;
  return { across: [Math.sin(t), Math.cos(t)], through: [Math.cos(t), -Math.sin(t)] };
}

// Where each leg stands, in yard feet: [[x, z], [x, z]] for the u = −width/2 leg and the u = +width/2 leg.
export function archFeet(a) {
  const { across } = archAxes(a), R = a.width / 2;
  return [-1, 1].map((s) => [a.x + s * R * across[0], a.z + s * R * across[1]]);
}

// The arch a vine at (x, z) climbs: the nearest leg within `reach` feet. Returns { arch, leg (−1 or +1) } or null.
export function nearestArch(arches, x, z, reach = 4) {
  let best = null, bestD = reach;
  for (const a of arches) {
    archFeet(a).forEach(([fx, fz], i) => {
      const d = Math.hypot(x - fx, z - fz);
      if (d < bestD) { bestD = d; best = { arch: a, leg: i ? 1 : -1 }; }
    });
  }
  return best;
}
