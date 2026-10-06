// Plant shapes for the 3D yard. Each shape type is a plant body plus a way of showing its flowers. Plants are
// built the way a hand-painted garden game builds them: lots of flat "cards", each carrying a cut-out picture of a
// leaf, a sprig, a fern frond, a daisy or a spike of florets, layered over a darker core so the clump looks full.
// The pictures are drawn once by code into one shared texture (no image files), and every plant is merged into a
// single 3D piece, so the yard stays smooth on phones.
//
// drawPlant() turns a plant's seasonal stage (bloom, fruit, dormant…) into what to draw, and the shape type
// decides how: spikes rise out of a clump, daisies sit on stems, a shrub's flowers cover its canopy.

import * as THREE from "three";
import { SHAPES } from "./look.js";

const SHAPE_IDS = new Set(SHAPES.map((s) => s.id));

// How each shape type shows its flowers unless the kind says otherwise (look.bloom in app/look.js):
// spike, daisy, ball (a round double like a dahlia or peony), cup, star (lily-like), cone (panicle), cluster
// (round head of florets), umbel (flat head), bells (small sprays) or plume.
const BLOOM_FORM = {
  spikes: "spike", daisies: "daisy", pompons: "ball", mound: "cup", fan: "star", grass: "plume",
  shrub: "cone", canes: "umbel", climber: "star", sprawler: "star", crop: "star", feathery: "umbel",
};
// Which leaf picture each shape type uses unless the kind says otherwise (look.foliage).
const FOLIAGE = {
  spikes: "lance", daisies: "lance", pompons: "sprig", mound: "broad", fan: "fan", grass: "blades",
  shrub: "sprig", canes: "sprig", climber: "lobed", sprawler: "lobed", crop: "sprig", feathery: "fern",
};
const WOODY = new Set(["shrub", "canes"]);

// ---------- the picture sheet ----------
// A 4×4 sheet of pictures, drawn in greys and white so each card can be tinted any color.
const CELLS = ["white", "broad", "sprig", "round", "lobed", "lance", "blades", "fern", "fan", "daisy", "disc", "star", "rose", "cluster", "spike", "plume",
  "palmate", "compound", "trefoil", "thread", "straps", "iris"];
const COLS = 4, ROWS = 6;
const CELL = Object.fromEntries(CELLS.map((c, i) => [c, i]));
// Width of each leaf picture compared to its height, and its usual size in feet.
const LEAF = {
  broad: [0.75, 0.55], sprig: [0.8, 0.7], round: [1, 0.6], lobed: [1, 0.6], lance: [0.42, 0.6], fern: [0.7, 0.8],
  palmate: [1, 0.8], compound: [0.75, 0.8], trefoil: [1, 0.7], thread: [0.75, 0.8],
};

// How much of its card each leaf picture fills from bottom to top, so a card can be sized to a real leaf length.
const FILL = { broad: 0.93, lance: 0.94, round: 0.86, lobed: 0.82, sprig: 0.9, fern: 0.95, palmate: 0.62, compound: 0.92, trefoil: 0.62, thread: 0.95 };
const SINGLE = new Set(["broad", "lance", "round", "lobed"]); // pictures of one leaf (the others show several)
const TWIG_LEAF = 0.3; // each leaf on the twig ("sprig") picture is about this much of the card's height

// One leaf card's height and width in feet. With the kind's real leaf length (look.leafIn, inches: one leaf, or one
// whole compound leaf or frond for the sprig and fern pictures) cards are true to size; otherwise a rough guess.
function leafSize(ctx, cell = ctx.leafCell, scale = 1) {
  const [aspect, base] = LEAF[cell] || LEAF.broad;
  const h = (ctx.look.leafIn ? ctx.look.leafIn / 12 / (FILL[cell] || 0.9) : base * ctx.ls) * scale * (ctx.o.young ? 0.65 : 1);
  return { cell, h, w: h * aspect };
}
// Leaves too small to draw one by one are drawn as twigs carrying several leaves, each still its real size.
function twigSize(ctx, scale = 1) {
  const leaf = (ctx.look.leafIn || 3) / 12 * scale * (ctx.o.young ? 0.65 : 1);
  const h = leaf / TWIG_LEAF;
  return { cell: "sprig", h, w: h * LEAF.sprig[0] };
}

function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function drawSheet() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = S * COLS; c.height = S * ROWS;
  const g = c.getContext("2d");
  const rnd = seeded(7);
  const grey = (lo, hi) => `hsl(0,0%,${lo + rnd() * (hi - lo)}%)`;
  const EDGE = "rgba(30,30,30,0.45)";
  const cell = (name, fn) => {
    const i = CELL[name];
    g.save();
    g.translate((i % COLS) * S, Math.floor(i / COLS) * S);
    g.beginPath(); g.rect(6, 6, S - 12, S - 12); g.clip();
    g.lineJoin = g.lineCap = "round";
    fn();
    g.restore();
  };
  // A pointed leaf from (x, y) along angle a (0 = straight up), len long and w wide at its widest.
  const leaf = (x, y, len, w, a, fill = grey(86, 100), rib = true, round = 0.3, edge = EDGE) => {
    g.save();
    g.translate(x, y); g.rotate(a);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(w, -len * round, w * 0.85, -len * 0.75, 0, -len);
    g.bezierCurveTo(-w * 0.85, -len * 0.75, -w, -len * round, 0, 0);
    g.fillStyle = fill; g.fill();
    g.strokeStyle = edge; g.lineWidth = 2.5; g.stroke();
    if (rib) {
      g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -len * 0.92);
      g.strokeStyle = "rgba(60,60,60,0.35)"; g.lineWidth = Math.max(1.5, w * 0.06); g.stroke();
      if (w > 30) for (let k = 1; k < 5; k++) {
        const yy = -len * (0.15 + k * 0.16);
        for (const sgn of [-1, 1]) { g.beginPath(); g.moveTo(0, yy); g.lineTo(sgn * w * 0.55, yy - len * 0.1); g.lineWidth = 1.5; g.stroke(); }
      }
    }
    g.restore();
  };
  const dot = (x, y, r, fill) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };

  cell("white", () => { g.fillStyle = "#fff"; g.fillRect(0, 0, S, S); });
  cell("broad", () => leaf(128, 250, 238, 100, 0, grey(92, 100)));
  cell("lance", () => leaf(128, 250, 240, 46, 0, grey(92, 100), true, 0.4));
  cell("sprig", () => {
    g.beginPath(); g.moveTo(128, 252); g.quadraticCurveTo(122, 140, 130, 26);
    g.strokeStyle = "hsl(0,0%,55%)"; g.lineWidth = 6; g.stroke();
    for (let i = 0; i < 8; i++) {
      const t = 0.12 + i * 0.105, side = i % 2 ? 1 : -1;
      leaf(127 + side * 2, 252 - t * 226, 78 - i * 3, 30, side * (0.85 + rnd() * 0.25), grey(84, 100), true, 0.3, "rgba(30,30,30,0.3)");
    }
    leaf(130, 34, 30, 18, 0);
    leaf(130, 60, 62, 26, 0.1, grey(88, 100));
  });
  cell("round", () => {
    g.beginPath();
    for (let k = 0; k <= 32; k++) {
      const a = (k / 32) * Math.PI * 2, rr = 104 + (k % 2 ? 6 : -2);
      const x = 128 + Math.sin(a) * rr, y = 130 - Math.cos(a) * rr;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.fillStyle = grey(92, 100); g.fill(); g.strokeStyle = EDGE; g.lineWidth = 2.5; g.stroke();
    g.strokeStyle = "rgba(60,60,60,0.3)"; g.lineWidth = 2;
    for (let k = 0; k < 9; k++) { const a = -2.2 + k * 0.55; g.beginPath(); g.moveTo(128, 222); g.lineTo(128 + Math.sin(a) * 95, 222 - 92 - Math.cos(a) * 80); g.stroke(); }
  });
  cell("lobed", () => {
    for (const k of [-2, 2, -1, 1, 0]) leaf(128, 240, 205 - Math.abs(k) * 32, 52, k * 0.55, grey(90, 100), true, 0.35);
  });
  cell("blades", () => {
    for (let i = 0; i < 13; i++) {
      const a = (rnd() - 0.5) * 1.3, len = 200 + rnd() * 50, bend = a * 60;
      const bx = 128 + (rnd() - 0.5) * 30, tx = bx + Math.sin(a) * len * 0.6 + bend, ty = 252 - Math.cos(a) * len;
      g.beginPath(); g.moveTo(bx - 6, 254); g.quadraticCurveTo(bx + bend * 0.2 - 5, (254 + ty) / 2, tx, ty);
      g.quadraticCurveTo(bx + bend * 0.2 + 5, (254 + ty) / 2, bx + 6, 254); g.closePath();
      g.fillStyle = grey(78, 100); g.fill(); g.strokeStyle = "rgba(30,30,30,0.3)"; g.lineWidth = 1.5; g.stroke();
    }
  });
  cell("fern", () => {
    g.beginPath(); g.moveTo(128, 254); g.quadraticCurveTo(122, 130, 134, 12);
    g.strokeStyle = "hsl(0,0%,60%)"; g.lineWidth = 4; g.stroke();
    for (let i = 0; i < 17; i++) {
      const y = 240 - i * 13.5, len = 92 * (1 - i / 19) + 12;
      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) leaf(128 + side * (3 + j * len * 0.22), y - j * 4, len * 0.32, 7, side * (1.05 + j * 0.05), grey(88, 100), false, 0.3, "rgba(30,30,30,0.15)");
      }
    }
  });
  cell("fan", () => {
    for (const [a, len, w] of [[-0.42, 190, 26], [0.4, 196, 26], [-0.2, 228, 30], [0.2, 222, 30], [0.02, 246, 32]]) {
      leaf(128 + a * 20, 254, len, w, a, grey(86, 100), true, 0.15);
    }
  });
  cell("daisy", () => {
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      g.save(); g.translate(128, 128); g.rotate(a);
      g.beginPath(); g.ellipse(0, -76, 17, 48, 0, 0, Math.PI * 2);
      g.fillStyle = grey(90, 100); g.fill(); g.strokeStyle = EDGE; g.lineWidth = 2; g.stroke();
      g.restore();
    }
  });
  cell("disc", () => {
    dot(128, 128, 112, "hsl(0,0%,82%)");
    for (let k = 0; k < 140; k++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 104; dot(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 4, grey(55, 75)); }
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.strokeStyle = EDGE; g.lineWidth = 3; g.stroke();
  });
  cell("star", () => {
    for (let k = 0; k < 6; k++) leaf(128, 128, 120, 42, (k / 6) * Math.PI * 2 + 0.26, grey(90, 100), true, 0.4);
    dot(128, 128, 22, "hsl(0,0%,62%)");
  });
  cell("rose", () => {
    dot(128, 128, 116, "hsl(0,0%,90%)");
    g.strokeStyle = "rgba(40,40,40,0.4)"; g.lineWidth = 3;
    for (let ring = 0; ring < 6; ring++) {
      const rr = 112 - ring * 18, n = 9 - ring;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.6;
        dot(128 + Math.cos(a) * rr * 0.55, 128 + Math.sin(a) * rr * 0.55, rr * 0.48, grey(84 + ring * 2, 100));
        g.beginPath(); g.arc(128 + Math.cos(a) * rr * 0.55, 128 + Math.sin(a) * rr * 0.55, rr * 0.48, a - 1.2, a + 1.2); g.stroke();
      }
    }
    dot(128, 128, 12, "hsl(0,0%,60%)");
  });
  cell("cluster", () => {
    const pts = [];
    for (let k = 0; k < 75; k++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 100; pts.push([128 + Math.cos(a) * d, 128 + Math.sin(a) * d * 0.95]); }
    pts.sort((p, q) => p[1] - q[1]);
    for (const [x, y] of pts) {
      for (let k = 0; k < 4; k++) dot(x + Math.cos(k * 1.57) * 7, y + Math.sin(k * 1.57) * 7, 7.5, grey(84, 100));
      dot(x, y, 3, "hsl(0,0%,55%)");
    }
  });
  cell("spike", () => {
    g.beginPath(); g.moveTo(128, 256); g.lineTo(128, 14); g.strokeStyle = "hsl(0,0%,55%)"; g.lineWidth = 4; g.stroke();
    for (let y = 248; y > 14; y -= 6) {
      const t = (248 - y) / 234, w = 44 * (1 - t * 0.8) + 4;
      for (let k = 0; k < 3; k++) {
        const x = 128 + (rnd() * 2 - 1) * w;
        dot(x, y, 9 - t * 3, grey(82, 100));
        g.beginPath(); g.arc(x, y, 9 - t * 3, 0, 6.28); g.strokeStyle = "rgba(30,30,30,0.3)"; g.lineWidth = 1.5; g.stroke();
      }
    }
  });
  cell("plume", () => {
    for (let k = 0; k < 160; k++) {
      const t = rnd(), y = 250 - t * 236, x = 128 + Math.sin(t * 2.4) * 18;
      const len = 32 * (1 - t) + 8, a = (rnd() - 0.5) * 1.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len * 0.7);
      g.strokeStyle = grey(78, 100); g.lineWidth = 4; g.stroke();
    }
  });

  // A hand-shaped leaf: leaflets spreading from the top of the stalk like fingers (hellebore, Virginia creeper).
  cell("palmate", () => {
    g.beginPath(); g.moveTo(128, 256); g.lineTo(128, 168); g.strokeStyle = "hsl(0,0%,55%)"; g.lineWidth = 5; g.stroke();
    for (const k of [-3, 3, -2, 2, -1, 1, 0]) leaf(128, 170, 150 - Math.abs(k) * 14, 24, k * 0.42, grey(88, 100), true, 0.4);
  });
  // A compound leaf: broad leaflets in pairs along a stalk, one at the tip (peony, dahlia, raspberry, tomato).
  cell("compound", () => {
    g.beginPath(); g.moveTo(128, 254); g.quadraticCurveTo(124, 140, 128, 40); g.strokeStyle = "hsl(0,0%,55%)"; g.lineWidth = 5; g.stroke();
    for (const [y, len, w] of [[200, 70, 30], [140, 80, 33]]) for (const side of [-1, 1]) leaf(128, y, len, w, side * 1.05, grey(86, 100), true, 0.35);
    leaf(128, 104, 96, 38, 0, grey(88, 100), true, 0.35);
  });
  // Columbine-style leaf: a stalk splitting into three, each ending in three round-lobed leaflets.
  cell("trefoil", () => {
    g.strokeStyle = "hsl(0,0%,58%)"; g.lineWidth = 4;
    const tips = [[128, 66], [60, 122], [196, 122]];
    for (const [x, y] of tips) { g.beginPath(); g.moveTo(128, 256); g.quadraticCurveTo(128, 175, x, y + 24); g.stroke(); }
    for (const [x, y] of tips) {
      for (const [dx, dy, rot] of [[0, -22, 0], [-22, 8, -0.9], [22, 8, 0.9]]) {
        // One leaflet: a rounded fan with three shallow lobes along its outer edge.
        g.save(); g.translate(x + dx, y + dy); g.rotate(rot);
        g.beginPath(); g.moveTo(0, 16);
        g.quadraticCurveTo(-26, 4, -22, -8); g.quadraticCurveTo(-18, -22, -8, -16);
        g.quadraticCurveTo(0, -30, 8, -16); g.quadraticCurveTo(18, -22, 22, -8);
        g.quadraticCurveTo(26, 4, 0, 16); g.closePath();
        g.fillStyle = grey(88, 100); g.fill(); g.strokeStyle = "rgba(30,30,30,0.4)"; g.lineWidth = 2; g.stroke();
        g.restore();
      }
    }
  });
  // Fine, wispy thread-leaves you can see through (cosmos, dill, asparagus).
  cell("thread", () => {
    const branch = (x, y, a, len, depth) => {
      const x2 = x + Math.sin(a) * len, y2 = y - Math.cos(a) * len;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.strokeStyle = grey(70, 92); g.lineWidth = Math.max(2, 4 - depth); g.stroke();
      if (depth < 4) for (const t of [0.35, 0.7]) for (const side of [-1, 1]) branch(x + (x2 - x) * t, y + (y2 - y) * t, a + side * (0.6 + rnd() * 0.5), len * 0.5, depth + 1);
      if (depth < 4) branch(x2, y2, a + (rnd() - 0.5) * 0.4, len * 0.6, depth + 1);
    };
    branch(128, 254, 0, 120, 0);
  });
  // Long strap leaves arching out and over from the crown, tips falling toward the ground (daylily).
  cell("straps", () => {
    for (let i = 0; i < 13; i++) {
      const side = i % 2 ? 1 : -1, reach = 40 + rnd() * 80, rise = 150 + rnd() * 90, fall = 60 + rnd() * 110;
      const cx = 128 + side * reach * 0.25, cy = 254 - rise * 1.25, tx = 128 + side * (reach + 20), ty = 254 - rise + fall;
      g.beginPath(); g.moveTo(128 - 8, 254); g.quadraticCurveTo(cx - 8, cy, tx, ty); g.quadraticCurveTo(cx + 8, cy + 14, 128 + 8, 254); g.closePath();
      g.fillStyle = grey(82, 100); g.fill(); g.strokeStyle = "rgba(30,30,30,0.35)"; g.lineWidth = 1.5; g.stroke();
    }
  });

  // An iris flower from the side: three standards curving up and in, three falls drooping out and down, each fall
  // with a darker beard.
  cell("iris", () => {
    const petal = (x, y, len, w, a, fill) => leaf(x, y, len, w, a, fill, true, 0.55, "rgba(30,30,30,0.4)");
    for (const a of [-0.38, 0.38]) petal(128, 150, 100, 34, a, grey(88, 100)); // side standards
    petal(128, 152, 118, 38, 0, grey(92, 100)); // middle standard
    for (const a of [-2.0, 2.0]) petal(128, 150, 112, 40, a, grey(80, 96)); // side falls, drooping
    petal(128, 150, 96, 42, Math.PI, grey(84, 98)); // front fall, hanging down
    for (const a of [-2.0, 2.0, Math.PI]) { // beards
      g.save(); g.translate(128, 150); g.rotate(a);
      g.beginPath(); g.moveTo(0, -8); g.lineTo(0, -48); g.strokeStyle = "hsl(0,0%,58%)"; g.lineWidth = 7; g.stroke();
      g.restore();
    }
    g.beginPath(); g.moveTo(128, 255); g.lineTo(128, 160); g.strokeStyle = "hsl(0,0%,55%)"; g.lineWidth = 6; g.stroke();
  });

  // Smaller copies for when plants are far away. Normal blurring would fade leaf edges until the cut-out drops
  // them and the plants go bald, so each smaller copy has its leaf edges made more solid.
  const levels = [c];
  for (let i = 1; Math.max(c.width, c.height) >> i >= 1; i++) {
    const w = Math.max(1, c.width >> i), h = Math.max(1, c.height >> i);
    const m = document.createElement("canvas");
    m.width = w; m.height = h;
    const mg = m.getContext("2d");
    mg.drawImage(levels[levels.length - 1], 0, 0, w, h);
    const img = mg.getImageData(0, 0, w, h), d = img.data, boost = 1 + 0.45 * i;
    for (let k = 3; k < d.length; k += 4) d[k] = Math.min(255, d[k] * boost);
    mg.putImageData(img, 0, 0);
    levels.push(m);
  }
  const tex = new THREE.Texture(c);
  tex.mipmaps = levels;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

let sheet = null;
let material = null, depthMaterial = null;
const greyMaterials = new Map();
// The plant material. With `grey` (a color), every color is drawn mostly that grey (a quarter of its own color
// left), for plants that aren't flowering while the bloom timeline is on; doing it here rather than in the
// plant's own colors lets one drawing serve both views.
function plantMaterial(grey) {
  const m = new THREE.MeshLambertMaterial({ map: sheet, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const g = grey && new THREE.Color(grey);
  m.onBeforeCompile = (shader) => {
    // Light both sides of a leaf the same way (by its own outward-facing normal), the way painted foliage looks.
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""));
    if (g) shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `diffuseColor.rgb *= mix(vec3(${g.r.toFixed(4)}, ${g.g.toFixed(4)}, ${g.b.toFixed(4)}), vColor, 0.25);`);
  };
  m.customProgramCacheKey = () => (g ? `plant-grey-${g.getHexString()}` : "plant");
  return m;
}
function materials() {
  if (material) return;
  sheet = drawSheet();
  material = plantMaterial(null);
  depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: sheet, alphaTest: 0.5, side: THREE.DoubleSide });
}
// A mesh showing a plant drawing (from drawPlant), greyed (see plantMaterial) or not. Several meshes can share one
// drawing, so the yard can keep drawings and reuse them.
export function plantMesh(geometry, grey = null) {
  materials();
  let m = material;
  if (grey) {
    const key = new THREE.Color(grey).getHexString();
    if (!greyMaterials.has(key)) greyMaterials.set(key, plantMaterial(grey));
    m = greyMaterials.get(key);
  }
  const mesh = new THREE.Mesh(geometry, m);
  mesh.customDepthMaterial = depthMaterial;
  return mesh;
}

// The picture sheet itself, for checking the pictures by eye (preview pages only).
export function pictureSheet() { materials(); return sheet.image; }

// ---------- solid shapes (stems, fruit, the dark core of a clump) ----------
function prep(geom) {
  if (!geom.attributes.normal) geom.computeVertexNormals();
  const g = geom.index ? geom.toNonIndexed() : geom;
  return { pos: g.attributes.position.array, nor: g.attributes.normal.array };
}
const BASE = {
  blob: prep(new THREE.IcosahedronGeometry(1, 1)),
  ball: prep(new THREE.IcosahedronGeometry(1, 1)),
  bud: prep(new THREE.IcosahedronGeometry(1, 0)), // small things seen in quantity: buds, berries
  smooth: prep(new THREE.IcosahedronGeometry(1, 2)), // big glossy fruit, where facets would show
  cyl: prep(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, 0.5, 0)),
  cone: prep(new THREE.ConeGeometry(1, 1, 6, 1, true).translate(0, 0.5, 0)),
  box: prep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  hoop: prep(new THREE.TorusGeometry(1, 0.035, 3, 14).rotateX(Math.PI / 2)),
};

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MAX_CARDS = 360; // leaf cards on one clump, to keep phones smooth
const WHITE_UV = [0.125, 0.875];
const cellUV = (i) => {
  const u = (i % COLS) / COLS, v = 1 - Math.floor(i / COLS) / ROWS, du = 1 / COLS, dv = 1 / ROWS;
  return [u + du * 0.016, u + du * 0.984, v - dv * 0.984, v - dv * 0.016];
};

// Collects the triangles of one plant, then hands back one geometry.
function builder(paint) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  let center = V(0, 1, 0); // the middle of the clump, which leaf lighting is softened toward
  let nv = 0;
  const vert = (p, n, u, w, c) => { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(u, w); col.push(c.r, c.g, c.b); return nv++; };

  const P = {
    setCenter(c) { center = c.clone(); },
    // Draws with light coming mostly from the sky, whichever way the cards face (for flowers, which glow in sun).
    skyLit(fn) { const saved = center; center = V(0, -1e4, 0); fn(); center = saved; },
    // A solid shape: stems, fruit, cages, the core of a clump.
    solid(base, color, p, scale, rot) {
      if (rot instanceof THREE.Quaternion) q.copy(rot);
      else if (rot) q.setFromEuler(rot instanceof THREE.Euler ? rot : new THREE.Euler(...rot));
      else q.identity();
      if (Array.isArray(scale)) sc.set(...scale); else sc.setScalar(scale);
      m.compose(p, q, sc);
      nm.getNormalMatrix(m);
      const c = paint(color), a = base.pos, b = base.nor, n = new THREE.Vector3();
      for (let i = 0; i < a.length; i += 3) {
        v.set(a[i], a[i + 1], a[i + 2]).applyMatrix4(m);
        n.set(b[i], b[i + 1], b[i + 2]).applyMatrix3(nm).normalize();
        idx.push(vert(v, n, WHITE_UV[0], WHITE_UV[1], c));
      }
    },
    // A stem (or cane, stake) running from one point to another.
    stalk(from, to, thick, color, base = BASE.cyl) {
      const dir = to.clone().sub(from);
      const len = dir.length();
      if (len < 1e-4) return;
      P.solid(base, color, from, [thick, len, thick], new THREE.Quaternion().setFromUnitVectors(UP, dir.divideScalar(len)));
    },
    // A flat picture card. Its bottom middle sits at `base`, it runs `h` along `up` and is `w` wide, facing as
    // close to `facing` as it can. soft (0–1) bends its lighting toward the clump's middle so it looks rounded.
    card(cellName, color, base, up, facing, w, h, soft = 0.6) {
      const u = up.clone().normalize();
      let right = new THREE.Vector3().crossVectors(u, facing);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0).cross(u);
      right.normalize();
      const n = new THREE.Vector3().crossVectors(right, u).normalize();
      if (n.dot(facing) < 0) { n.negate(); right.negate(); }
      const [u0, u1, v0, v1] = cellUV(CELL[cellName]);
      const b0 = base.clone().addScaledVector(right, -w / 2), b1 = base.clone().addScaledVector(right, w / 2);
      const t0 = b0.clone().addScaledVector(u, h), t1 = b1.clone().addScaledVector(u, h);
      const c = paint(color);
      const nOf = (p) => v.copy(p).sub(center).normalize().multiplyScalar(soft).addScaledVector(n, 1 - soft).normalize().clone();
      const a = vert(b0, nOf(b0), u0, v0, c), b = vert(b1, nOf(b1), u1, v0, c), d = vert(t1, nOf(t1), u1, v1, c), e = vert(t0, nOf(t0), u0, v1, c);
      idx.push(a, b, d, a, d, e);
    },
    // A picture standing up from `base`, as two (or more) cards crossed so it looks full from every side.
    cross(cellName, color, base, up, w, h, yaw = 0, n = 2, soft = 0.3) {
      for (let k = 0; k < n; k++) {
        const a = yaw + (k * Math.PI) / n;
        P.card(cellName, color, base, up, V(Math.cos(a), 0, Math.sin(a)), w, h, soft);
      }
    },
    // A flower head seen from any side: three cards at right angles.
    head(cellName, color, p, size, squash = 1) {
      for (const [up, facing] of [[V(0, 1, 0), V(1, 0, 0)], [V(0, 1, 0), V(0, 0, 1)], [V(0, 0, 1), V(0, 1, 0)]]) {
        const h = up.y ? size * squash : size;
        P.card(cellName, color, p.clone().addScaledVector(up, -h / 2), up, facing, size, h, 0.5);
      }
    },
    empty: () => !pos.length,
    // Packed small (normals in bytes, colors in 16 bits, cards sharing corners) since the yard keeps a drawing of
    // every plant in each of its stages.
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const n8 = new Int8Array(nor.length), c16 = new Uint16Array(col.length); // (plain loops: typed-array .from with a function is slow)
      for (let i = 0; i < nor.length; i++) n8[i] = Math.round(clamp(nor[i], -1, 1) * 127);
      for (let i = 0; i < col.length; i++) c16[i] = Math.round(clamp(col[i], 0, 1) * 65535);
      g.setAttribute("normal", new THREE.BufferAttribute(n8, 3, true));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute("color", new THREE.BufferAttribute(c16, 3, true));
      g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      return g;
    },
  };
  return P;
}

const shade = (color, k) => {
  const c = new THREE.Color(color);
  return (k < 1 ? c.multiplyScalar(k) : c.lerp(new THREE.Color("#ffffff"), k - 1)).getStyle();
};
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getStyle();

const TAN = "#c9b27a", BROWN = "#6b4f32", BARK = "#7a6048", SPRING = "#9ccf6a", SOIL = "#7a5a3c", DRIED = "#5b4330";

// What a seasonal stage means for drawing: leaf color, how much of its full height the plant has reached, and
// whether flowers, fruit or bare woody stems show.
function stageLook(state, look, woody) {
  switch (state) {
    case "dormant": case "bare": return woody ? { bare: true } : { crown: true };
    case "dormant-tan": return { leaf: TAN, h: 0.85, flower: TAN, dried: true };
    case "bare-flowerheads": return { bare: true, flower: "#cbb89a", dried: true };
    case "emerging": case "seedling": return { leaf: SPRING, h: 0.4, young: true };
    case "leafing": return woody ? { bare: true, buds: SPRING, budLeaves: SPRING } : { leaf: SPRING, h: 0.6, young: true };
    case "rosette": return { leaf: look.leaf, rosette: true };
    case "evergreen": return { leaf: shade(look.leaf, 0.8), h: 0.85 };
    case "bloom": return { leaf: look.leaf, flower: look.flower };
    case "aging-bloom": return { leaf: look.leaf, flower: look.aging };
    case "fruit": return { leaf: look.leaf, fruit: look.fruit };
    case "harvest": return { leaf: look.leaf, fruit: look.fruit, harvest: true };
    case "seedheads": return { leaf: mix(look.leaf, "#a08a5a", 0.45), flower: DRIED, dried: true };
    case "fall-color": return { leaf: look.fall, h: 0.9 };
    case "yellowing": return { leaf: "#d4c05a", h: 0.75 };
    case "frost-blackened": return { leaf: "#3a2f2a", h: 0.5, slump: true };
    default: return { leaf: look.leaf }; // foliage, ferns and anything unexpected
  }
}

// ---------- the plant ----------
// Returns one merged mesh for a plant, or null when there's nothing to draw (gone and stored are handled by the
// yard). r and H are its spread (radius) and full height in feet, s how much bigger than usual it is.
export function drawPlant(shape, { state, look, r, H, s, rand, stems, paint, grow = 1, month = 6, arch = null, support = null }) {
  materials();
  if (!SHAPE_IDS.has(shape)) shape = "mound";
  const P = builder(paint);
  // A kind can say how it looks in a particular stage (look.stage, e.g. peony shoots are red) or month (look.months,
  // e.g. blueberries are still green in June), and when its plumes show if that isn't a stage of its own (look.plumes: months, 0 = January).
  const o = { h: 1, ...stageLook(state, look, WOODY.has(shape)), ...look.stage?.[state], ...look.months?.[month] };
  if (state === "foliage" && (!WOODY.has(shape) || look.annualCanes)) o.h *= grow;
  if (state === "foliage" && look.plumes?.includes(month)) o.flower = look.flower;
  const own = look.shape === shape; // a kind's own flower and leaf pictures go with its own shape
  // support: what a vine was given to grow on ("arch", "trellis", "pole", "ground"), or null for its kind's way.
  const ctx = { P, look, rand, s, r, state, arch, support, stems: Number.isInteger(stems) && stems > 0 ? stems : 0, o, Hfull: H };
  ctx.form = own && look.bloom ? look.bloom : BLOOM_FORM[shape];
  ctx.leafCell = own && look.foliage ? look.foliage : FOLIAGE[shape];
  ctx.fs = (look.bloomSize || 1) * Math.sqrt(clamp(s, 0.6, 2.5)); // flower size
  ctx.ls = (look.leafSize || 1) * clamp(Math.sqrt(r / 0.8), 0.75, 1.35); // leaf size

  if (o.crown) crown(ctx, r, H, shape);
  else if (o.rosette) rosette(ctx, r, H);
  else {
    const rr = r * (o.spread ?? (o.young ? 0.65 : 1)); // o.spread: how far across it has grown (young plants are smaller)
    DRAW[shape](ctx, rr, H * o.h);
    if (o.harvest && look.root) roots(ctx);
  }
  if (P.empty()) return null;
  return plantMesh(P.geometry());
}

// Random spot within a circle of radius d (more of them toward the middle when bias > 1).
function spot(rand, d, bias = 1) {
  const a = rand() * Math.PI * 2, k = d * Math.pow(rand(), 0.5 * bias);
  return [Math.cos(a) * k, Math.sin(a) * k, a];
}
const count = (ctx, base, perFoot, lo, hi, r) => ctx.stems || clamp(Math.round(base + r * perFoot), lo, hi);
// How tall the leafy part of a plant is: `frac` of its full-grown height, but no taller than it has grown so far (H).
// Leaves reach full size well before the flower stalks do, so a spring clump isn't shrunk twice.
const leafTop = (ctx, frac, H) => Math.min(ctx.Hfull * frac, H * Math.max(frac, 0.8));

// Leaves covering a rounded clump (center c, radii rx/ry), over a darker inner layer of leaves that keeps it from
// looking hollow (a layer of leaves, not a solid ball, so nothing egg-like shows through the gaps).
// yMin: how far down the sides the leaves go (−1 = all the way round, 0 = only the top half).
function leafy(ctx, c, rx, ry, { cell = ctx.leafCell, color = ctx.o.leaf, yMin = -0.25, density = 1, size = 1, core = true, rz = rx, stickOut = 0.45 } = {}) {
  const { P, rand } = ctx;
  P.setCenter(c);
  // The clump's outer surface (an ellipsoid, down as far as yMin), and enough leaves to cover it about once over.
  const area = 4 * Math.PI * (((rx * rz) ** 1.6 + (rx * ry) ** 1.6 + (rz * ry) ** 1.6) / 3) ** (1 / 1.6) * ((1 - yMin) / 2);
  const need = (L) => Math.round((2.6 * density * area) / (L.h * L.w));
  let L = leafSize(ctx, cell, size);
  if (need(L) > MAX_CARDS && SINGLE.has(cell)) L = twigSize(ctx, size);
  cell = L.cell;
  const lh = Math.min(L.h, 0.9 * Math.max(rx, ry) + 0.05), lw = lh * (L.w / L.h); // never bigger than the clump
  const n = clamp(need({ h: lh, w: lw }), 12, MAX_CARDS);
  for (let i = 0; i < n; i++) {
    const y = yMin + (1 - yMin) * Math.pow(rand(), 0.85), a = rand() * Math.PI * 2, sxz = Math.sqrt(1 - y * y);
    const d = V(sxz * Math.cos(a), y, sxz * Math.sin(a));
    const k = 0.82 + 0.2 * rand();
    const p = V(c.x + d.x * rx * k, c.y + d.y * ry * k, c.z + d.z * rz * k);
    const facing = V(d.x / rx, d.y / ry, d.z / rz).normalize();
    // Each leaf faces outward from the middle of the clump (so from any side you see leaves, not gaps), tip up,
    // twisted a little either way.
    let up = UP.clone().addScaledVector(facing, -facing.y);
    if (up.lengthSq() < 0.02) up = V(Math.cos(a), 0, Math.sin(a));
    up.normalize().applyAxisAngle(facing, (rand() - 0.5) * 1.6);
    // Tilt each leaf out from the surface a little, so the outline is ragged and leafy rather than a clipped ball.
    up.addScaledVector(facing, stickOut * (0.5 + rand())).normalize();
    const tone = (y < 0.1 ? 0.8 : 0.92) + 0.22 * rand();
    P.card(cell, shade(color, tone), p.addScaledVector(up, -lh * 0.45), up, facing, lw, lh);
  }
  if (!core) return;
  for (let i = 0, m = Math.round(n * 0.35); i < m; i++) { // the inner layer, in shade
    const y = yMin + (1 - yMin) * rand(), a = rand() * Math.PI * 2, sxz = Math.sqrt(1 - y * y);
    const d = V(sxz * Math.cos(a), y, sxz * Math.sin(a)), k = 0.45 + 0.25 * rand();
    const up = UP.clone().addScaledVector(d, -d.y).add(V(rand() - 0.5, 0, rand() - 0.5));
    if (up.lengthSq() < 0.02) up.set(Math.cos(a), 0, Math.sin(a));
    up.normalize();
    P.card(cell, shade(color, 0.6 + 0.15 * rand()), V(c.x + d.x * rx * k, c.y + d.y * ry * k - lh * 0.4, c.z + d.z * rz * k), up, d, lw, lh, 0.3);
  }
}

// Leaves rising from the crown and arching outward, the way a perennial clump grows: coneflower, salvia, foxglove.
// Each leaf is its real length (with a stalk for the gap to the ground); L is how high the clump of leaves reaches.
function basal(ctx, r, L, { cell = ctx.leafCell, color = ctx.o.leaf, density = 1 } = {}) {
  const { P, rand } = ctx;
  const leaf = leafSize(ctx, cell);
  P.setCenter(V(0, L * 0.2, 0));
  // A small dark crown where the leaves meet (left out for root crops, so the beet or radish shows).
  if (!ctx.look.root) P.solid(BASE.blob, shade(color, 0.45), V(0, 0, 0), [r * 0.18, Math.min(L, leaf.h) * 0.2, r * 0.18]);
  // Two or three overlapping rings of leaves, as a real crown has: low outer ones and shorter, more upright inner ones.
  const n = clamp(Math.round((5 * Math.PI * r * density) / leaf.w), 12, 64);
  for (let i = 0; i < n; i++) {
    const inner = rand();
    // Narrow leaves stand up more; broad ones lie flatter.
    const a = (i / n) * Math.PI * 2 * 3 + rand() * 0.8, e = (leaf.w / leaf.h < 0.5 || ctx.look.upright ? 0.5 : 0.25) + (ctx.look.upright ? 0.35 : 0) + 0.6 * inner + 0.35 * rand();
    const [x, z] = spot(rand, r * 0.2);
    const dir = V(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
    const len = leaf.h * (0.95 - 0.3 * inner) * (0.85 + 0.3 * rand());
    // Leaf stalks lift the blades so the clump reaches its real height (L): most leaves end between half and all of it.
    const rise = Math.max(Math.sin(e), 0.35);
    const stalk = clamp((L * (0.5 + 0.5 * rand()) - len * rise * 0.85) / rise, 0, L * 1.2);
    const base = V(x, 0, z).addScaledVector(dir, stalk);
    if (stalk > 0.05) P.stalk(V(x, 0, z), base, 0.012, shade(color, 0.75));
    const side = V(-Math.sin(a), 0, Math.cos(a));
    P.card(cell, shade(color, 0.85 + 0.27 * rand()), base, dir, new THREE.Vector3().crossVectors(side, dir), len * (leaf.w / leaf.h), len, 0.45);
  }
}

// Leaf blades on their own stalks from the crown, overlapping like shingles over a dome with their tips pointing
// out and a little down: hosta, hellebore, coral bells, lady's mantle. The stalks hide underneath.
function umbrellas(ctx, r, L, { cell = ctx.leafCell, color = ctx.o.leaf } = {}) {
  const { P, rand } = ctx;
  const leaf = leafSize(ctx, cell);
  const blade = leaf.h * (FILL[cell] || 0.9); // the blade alone, without any stalk drawn in the picture
  // look.leafReach (0–1): shorter leaf stalks, so the leaves sit closer to the crown (hardy geranium).
  const rx = Math.max(r - blade * 0.45, r * 0.4) * (ctx.look.leafReach || 1), ry = Math.max(L - blade * 0.25, L * 0.45);
  P.setCenter(V(0, -ry * 0.4, 0));
  // With tilted leaves (look.leafTilt) the middle can show, so a few leaves stand up from the crown to fill it.
  for (let i = 0; i < (ctx.look.leafTilt ? 10 : 0); i++) {
    const a = (i / 10) * Math.PI * 2 + rand() * 0.4, out = V(Math.cos(a), 0, Math.sin(a)), lh = Math.min(leaf.h * 0.8, ry * 1.1);
    const at = out.clone().multiplyScalar(0.05).setY(ry * 0.25); // up in the middle of the mound, on a stalk from the crown
    P.stalk(V(0, 0, 0), at, 0.012, shade(color, 0.75));
    P.card(cell, shade(color, 0.8 + 0.15 * rand()), at, out.clone().add(V(0, 1.4, 0)).normalize(), out, lh * (leaf.w / leaf.h), lh, 0.3);
  }
  const area = Math.PI * (rx * rx + 2 * rx * ry) * 0.6;
  const n = clamp(Math.round((2.6 * area) / (blade * blade * 0.6)), 16, 110); // enough leaves to go all the way round evenly
  const back = (FILL[cell] ? 1 - FILL[cell] : 0.05) * leaf.h; // slide the picture's own stalk back under the blade
  for (let i = 0; i < n; i++) {
    const tilt0 = ctx.look.leafTilt || 0;
    // Spread evenly all the way round (a sunflower-seed turn between leaves), so the clump is balanced.
    const y = 0.12 + tilt0 * 0.2 + (0.88 - tilt0 * 0.2) * Math.pow(rand(), 0.7), a = i * 2.39996 + (rand() - 0.5) * 0.5, sxz = Math.sqrt(1 - y * y);
    const out = V(Math.cos(a), 0, Math.sin(a));
    const p = V(out.x * sxz * rx, y * ry, out.z * sxz * rx);
    const facing = V(out.x * sxz / rx, y / ry, out.z * sxz / rx).normalize();
    let down = facing.clone().multiplyScalar(facing.y).sub(UP);
    if (down.lengthSq() < 0.01) down = out.clone();
    // look.leafTilt (0–1): instead of lying shingled tip-down over the dome, blades tilt every which way, many held
    // up toward the light, so the mound looks layered in depth (hellebore, columbine, lady's mantle).
    const tilt = ctx.look.leafTilt || 0;
    const tipDir = down.normalize().multiplyScalar(0.45 * (1 - tilt)).addScaledVector(out, 0.9)
      .add(V(0, tilt * (rand() * 1.3 - 0.25), 0)).addScaledVector(V(-out.z, 0, out.x), tilt * (rand() - 0.5) * 0.4).normalize();
    const face = facing.clone().add(V((rand() - 0.5) * tilt, rand() * tilt * 0.6, (rand() - 0.5) * tilt)).normalize();
    const base = p.clone().addScaledVector(tipDir, -blade * 0.45).add(V(0, tilt * (rand() - 0.2) * blade * 0.4, 0));
    if (tilt) { // a tilted leaf never droops onto the soil: its tip stays a little above the ground
      if (tipDir.y < 0.05) tipDir.setY(0.05).normalize(); // level or angled up, never pointing down at the soil
      const lowest = Math.min(base.y, base.y + tipDir.y * leaf.h) - 0.1;
      if (lowest < 0) base.y -= lowest;
    }
    P.stalk(V(out.x * 0.05, 0, out.z * 0.05), base, 0.014, shade(color, 0.75));
    const sz = tilt ? 0.8 + 0.2 * y : 1; // the lowest, outermost leaves a little smaller, so none sticks out on its own
    P.card(cell, shade(color, 0.85 + 0.25 * rand() + 0.1 * y), base.clone().addScaledVector(tipDir, -back * sz), tipDir, face, leaf.w * sz, leaf.h * sz, 0.35);
  }
}

// One main shoot with side branches off it, like a tomato (ground cherry). Leaves along every branch; hands back
// the branches so fruit can hang from them.
function branched(ctx, r, L) {
  const { P, rand, o } = ctx;
  const leaf = leafSize(ctx), dens = Math.sqrt(ctx.look.leafDensity || 1);
  const top = V((rand() - 0.5) * 0.1, L * 0.95, (rand() - 0.5) * 0.1);
  P.stalk(V(0, 0, 0), top, 0.03, shade(o.leaf, 0.7));
  P.setCenter(V(0, L * 0.5, 0));
  const branches = [], nb = clamp(Math.round(L / 0.11), 5, 14);
  for (let i = 0; i < nb; i++) {
    const t = 0.12 + (0.78 * i) / (nb - 1), a = i * 2.4 + rand() * 0.4, out = V(Math.cos(a), 0, Math.sin(a));
    const node = V(0, 0, 0).lerp(top, t), reach = Math.min(r * (0.85 - 0.45 * t), L * 0.7) * (0.8 + 0.3 * rand());
    // Branches angle up and out from the main shoot, then level off toward their tips.
    const mid = node.clone().addScaledVector(out, reach * 0.5).add(V(0, reach * 0.45, 0)), end = node.clone().addScaledVector(out, reach * 0.9).add(V(0, reach * 0.6, 0));
    P.stalk(node, mid, 0.016, shade(o.leaf, 0.72)); P.stalk(mid, end, 0.011, shade(o.leaf, 0.72));
    const k = clamp(Math.round((reach / (leaf.w * 0.5)) * dens), 2, 10);
    for (let j = 0; j < k; j++) {
      const q = (j + 1) / k, p = q < 0.55 ? node.clone().lerp(mid, q / 0.55) : mid.clone().lerp(end, (q - 0.55) / 0.45);
      const side = (j % 2 ? 1 : -1), dir = out.clone().addScaledVector(V(-out.z, 0, out.x), side * 0.9).add(V(0, 0.25 + 0.3 * rand(), 0)).normalize();
      P.card(ctx.leafCell, shade(o.leaf, 0.85 + 0.27 * rand()), p, dir, V(0, 1, 0).addScaledVector(dir, -0.3), leaf.w, leaf.h, 0.5);
    }
    branches.push({ node, mid, end, out });
  }
  for (let j = 0; j < 4; j++) { const a = j * 1.6, dir = V(Math.cos(a), 1.2, Math.sin(a)).normalize(); P.card(ctx.leafCell, shade(o.leaf, 0.95 + 0.2 * rand()), top, dir, V(0, 1, 0).addScaledVector(dir, -0.4), leaf.w * 0.7, leaf.h * 0.7, 0.5); }
  return branches;
}

// Leggy stems trailing out from the crown and over the ground, round leaves held up on long stalks along them
// (nasturtium). Hands back points along the stems for flowers.
function trailing(ctx, r, H) {
  const { P, rand, o } = ctx;
  const leaf = leafSize(ctx), dens = Math.sqrt(ctx.look.leafDensity || 1);
  P.setCenter(V(0, -H, 0));
  const stems = clamp(Math.round(r * 7 * dens), 6, 18), nodes = [];
  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * Math.PI * 2 + rand() * 0.5, out = V(Math.cos(a), 0, Math.sin(a)), len = r * (0.75 + 0.35 * rand());
    const bend = (rand() - 0.5) * 0.8, rise = H * (0.25 + 0.3 * rand());
    const at = (t) => { const b = a + bend * t; return V(Math.cos(b) * len * t, 0.03 + rise * Math.sin(Math.PI * Math.min(1, t * 1.25)) * (1 - 0.6 * t), Math.sin(b) * len * t); };
    let prev = at(0);
    const k = clamp(Math.round(len / (leaf.w * 0.55)), 3, 14);
    for (let j = 1; j <= k; j++) {
      const p = at(j / k);
      P.stalk(prev, p, 0.012, shade(o.leaf, 0.7));
      prev = p;
      const side = V(-out.z, 0, out.x).multiplyScalar(j % 2 ? 1 : -1);
      const top = p.clone().addScaledVector(side, 0.06).add(V(0, H * (0.15 + 0.45 * rand()) * (1 - 0.4 * j / k), 0));
      P.stalk(p, top, 0.006, shade(o.leaf, 0.85)); // the long leaf stalk, holding the blade up like a little umbrella
      const tip = side.clone().addScaledVector(out, 0.6).add(V(0, 0.25 + 0.3 * rand(), 0)).normalize();
      const lh = leaf.h * (0.75 + 0.35 * rand());
      P.card(ctx.leafCell, shade(o.leaf, 0.85 + 0.27 * rand()), top.clone().addScaledVector(tip, -lh * 0.45), tip, UP, lh * (leaf.w / leaf.h), lh, 0.35);
      nodes.push({ p, out });
    }
  }
  return nodes;
}

// Leafy stems from the base, each with leaves spiralling up it: dahlia, asters, sneezeweed, balloon flower.
// The stems reach `top` (the leaves' height L unless flowering stems carry them higher) and the stem tips are
// handed back, so flowers can be put on them.
// leafFrom: how far up each stem its leaves start (a peony's lower stems are bare, its leaves held up in a dome).
function bushy(ctx, r, L, { cell = ctx.leafCell, color = ctx.o.leaf, top = L, leafFrom = 0.12 } = {}) {
  const { P, rand, look } = ctx;
  const leaf = leafSize(ctx, cell);
  const narrow = leaf.w / leaf.h < 0.5; // thin leaves (asters, goldenrod) sit closer together and point up
  const lh = Math.min(leaf.h, 0.5 * L + 0.1), lw = lh * (leaf.w / leaf.h);
  P.setCenter(V(0, top * 0.45, 0));
  const dens = Math.sqrt(look.leafDensity || 1);
  const n = ctx.stems || clamp(Math.round((6 + r * 6) * dens), 7, 24);
  const thick = clamp(top * 0.0035, 0.005, 0.016); // stems as thick as a real one, about a pencil on a 4 ft plant
  const tips = [];
  const turn0 = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    // Stems lean out evenly all the way round (a sunflower-seed turn between them), so the clump is balanced.
    const a = turn0 + i * 2.39996 + (rand() - 0.5) * 0.4, off = r * 0.2 * Math.sqrt(rand());
    const foot = V(Math.cos(a) * off, 0, Math.sin(a) * off), out = V(Math.cos(a), 0, Math.sin(a));
    const h = top * (0.75 + 0.25 * rand());
    // Stems lean out no further than the plant is tall, so young plants grow up rather than splay flat.
    const tip = foot.clone().addScaledVector(out, Math.min(r, h * 0.6) * (0.55 + 0.4 * rand())).setY(h);
    P.stalk(foot, tip, thick, shade(color, 0.7));
    const k = clamp(Math.round(((0.95 - leafFrom) * foot.distanceTo(tip) / (lh * (narrow ? 0.2 : 0.5))) * dens), 3, 30);
    for (let j = 0; j < k; j++) {
      const t = (j + 0.5) / k;
      const p = foot.clone().lerp(tip, leafFrom + (0.95 - leafFrom) * t);
      const sideA = a + j * 2.4 + rand() * 0.6; // leaves spiral round the stem, so it looks leafy from every side
      const dir = V(Math.cos(sideA), narrow ? 0.75 + 0.5 * rand() : 0.35 + 0.4 * rand(), Math.sin(sideA)).normalize();
      const sz = 1.15 - 0.4 * t; // smaller leaves toward the top
      P.card(cell, shade(color, 0.85 + 0.27 * rand()), p, dir, V(0, 1, 0).addScaledVector(dir, -0.3), lw * sz, lh * sz, 0.5);
    }
    P.card(cell, shade(color, 0.95 + 0.2 * rand()), tip.clone().add(V(0, -lh * 0.3, 0)), out.clone().add(V(0, 1.2, 0)).normalize(), V(0, 1, 0).addScaledVector(out, -0.6), lw * 0.7, lh * 0.7, 0.5);
    tips.push({ tip, out });
  }
  return tips;
}
// Loose sprays of n flowers at the stem tips bushy() handed back. bloom(i, point, facing) draws flower i.
function sprays(ctx, tips, n, r, bloom) {
  const { P, o, rand } = ctx;
  const spray = clamp(r * 0.3, 0.15, 0.45); // how far a spray spreads round its stem tip
  for (let i = 0; i < n; i++) {
    const { tip, out } = tips[i % tips.length];
    const [x, z] = spot(rand, spray, 0.8);
    const p = tip.clone().add(V(x, (rand() - 0.35) * spray * 0.7, z));
    P.stalk(tip.clone().addScaledVector(out, -0.02).add(V(0, -spray * 0.6, 0)), p, 0.005, o.dried ? BROWN : shade(o.leaf, 0.8));
    bloom(i, p, V(x * 0.8, 1, z * 0.8).normalize());
  }
}

// Usual flower sizes in feet across for each form, used when a kind has no real size (look.flowerIn).
const FLOWER_FT = { daisy: 0.48, ball: 0.5, star: 0.42, cone: 0.6, cluster: 0.42, umbel: 0.4, plume: 0.7, bells: 0.24, cup: 0.3, spike: 0.6, iris: 0.42 };
// One flower (or seed head) of the given form, sitting at point p and facing `facing` (up by default).
// With look.flowerIn (inches across, or spike/panicle/plume length) the flower is drawn at its real size.
function flower(ctx, p, color, size = 1, facing = UP, form = ctx.form) {
  const { P, o, look } = ctx;
  const inches = form === ctx.form ? look.flowerIn : look.flower2In;
  const f = (inches ? inches / 12 / FLOWER_FT[form || "cup"] : ctx.fs) * size;
  const dried = o.dried;
  const tilt = facing.clone().normalize();
  const up = Math.abs(tilt.y) > 0.95 ? V(1, 0, 0) : UP.clone().addScaledVector(tilt, -tilt.y).normalize();
  const flat = (cell, col, w) => P.card(cell, col, p.clone().addScaledVector(up, -w / 2), up, tilt, w, w, 0.6);
  // Flowers are lit mostly from the sky, so ones facing away from the sun still glow rather than go dark.
  P.skyLit(() => {
    switch (form) {
      case "spike": // a slim wand of florets (the spikes shape draws its own, bigger spires)
        P.cross("spike", color, p.clone().add(V(0, -0.35 * f, 0)), UP, 0.16 * f, 0.6 * f, ctx.rand() * 3);
        break;
      case "daisy":
        if (!dried) flat("daisy", color, 0.48 * f);
        P.head("disc", dried ? DRIED : look.center || "#7a4a1e", p.clone().addScaledVector(tilt, 0.03), (dried ? 0.17 : 0.15) * f, 0.6);
        break;
      case "ball":
        if (dried) P.solid(BASE.ball, color, p, 0.08 * f);
        else P.head("rose", color, p.clone().add(V(0, 0.12 * f, 0)), 0.5 * f, 0.85);
        break;
      case "star":
        flat("star", color, 0.42 * f);
        break;
      case "iris": // seen from the side, crossed so it looks right from anywhere
        if (dried) P.solid(BASE.ball, color, p, 0.05 * f);
        else P.cross("iris", color, p.clone().add(V(0, -0.24 * f, 0)), UP, 0.42 * f, 0.42 * f, ctx.rand() * 3, 3, 0.5);
        break;
      case "cone":
        P.cross("cluster", color, p.clone().add(V(0, -0.15 * f, 0)), UP, 0.48 * f, 0.66 * f, ctx.rand() * 3, 3); // a fat, tall head of florets
        break;
      case "cluster":
        P.head("cluster", color, p.clone().add(V(0, 0.08 * f, 0)), 0.42 * f, 0.8);
        break;
      case "umbel":
        P.card("cluster", color, p.clone().add(V(-0.2 * f, 0.02, 0)), V(1, 0, 0), UP, 0.4 * f, 0.4 * f, 0.1);
        break;
      case "plume":
        P.cross("plume", color, p.clone().add(V(0, -0.15 * f, 0)), UP, 0.22 * f, 0.7 * f, ctx.rand() * 3);
        break;
      case "bells":
        P.head("cluster", color, p, 0.24 * f, 0.8);
        break;
      default: // cup
        if (dried) P.solid(BASE.ball, color, p, 0.05 * f);
        else flat("star", color, 0.3 * f);
    }
  });
}

// A dormant perennial: a low brown crown at soil level.
// Kinds left standing for winter (look.winterStalks: their color) keep dried stalks and seed heads instead.
function crown(ctx, r, H, shape) {
  const { P, look, rand } = ctx;
  if (shape === "grass" || shape === "fan") P.cross("blades", TAN, V(0, 0, 0), UP, r * 0.8, 0.45, 0.3, 3);
  else P.solid(BASE.blob, SOIL, V(0, 0, 0), [r * 0.45, Math.min(0.18, H * 0.15), r * 0.45]);
  if (!look.winterStalks) return;
  ctx.o.dried = true;
  const n = clamp(Math.round(4 + r * 6), 5, 14);
  for (let i = 0; i < n; i++) {
    const [x, z] = spot(rand, r * 0.6);
    const tip = V(x * 1.2, H * (0.65 + 0.3 * rand()), z * 1.2);
    P.stalk(V(x * 0.5, 0, z * 0.5), tip, 0.018, look.winterStalks);
    if (rand() < 0.75) flower(ctx, tip, look.winterStalks);
  }
}

// A first-year rosette (or a winter one): leaves flat to the ground.
function rosette(ctx, r) {
  const { P, o, rand } = ctx;
  P.setCenter(V(0, 0.4, 0));
  const leaf = leafSize(ctx, SINGLE.has(ctx.leafCell) ? ctx.leafCell : "broad");
  const n = 22;
  for (let i = 0; i < n; i++) {
    const inner = i >= 12; // an outer ring lying almost flat, an inner ring of shorter leaves standing up more
    const a = (i / (inner ? 10 : 12)) * Math.PI * 2 + rand() * 0.5 + (inner ? 0.3 : 0), out = V(Math.cos(a), 0, Math.sin(a));
    const len = Math.min(leaf.h, r * 1.1) * (inner ? 0.7 : 1) * (0.85 + 0.3 * rand());
    P.card(leaf.cell, shade(o.leaf, (inner ? 0.95 : 0.85) + 0.2 * rand()), V(0, 0.04, 0), out.clone().add(V(0, inner ? 1.5 : 0.55, 0)).normalize(), V(0, 1, 0), len * (leaf.w / leaf.h), len, 0.4);
  }
}

// Beets and radishes: shoulders of the root showing at the soil.
function roots(ctx) {
  // One root per plant, its shoulder in the middle of the leaves (look.rootIn: how wide it is, in inches).
  const k = (ctx.look.rootIn || 2) / 24;
  ctx.P.solid(BASE.smooth, ctx.look.root, V(0, k * (ctx.look.rootUp ?? 0.35), 0), [k, k * 0.85, k]); // look.rootUp: how much of it shows above the soil
}

// Leaves along a stem, sticking out to the sides.
function stemLeaves(ctx, from, to, n, size = 0.6) {
  const { P, rand, o } = ctx;
  const cell = ctx.leafCell === "fern" ? "fern" : ctx.leafCell === "lance" ? "lance" : "broad";
  const leaf = leafSize(ctx, cell, size);
  for (let i = 0; i < n; i++) {
    const p = from.clone().lerp(to, 0.15 + (0.7 * (i + rand() * 0.5)) / n);
    const a = rand() * Math.PI * 2, out = V(Math.cos(a), 0, Math.sin(a));
    P.card(cell, shade(o.leaf, 0.9 + 0.2 * rand()), p, out.clone().add(V(0, 0.5, 0)).normalize(), V(0, 1, 0).add(out.clone().multiplyScalar(-0.3)), leaf.w, leaf.h, 0.3);
  }
}

// A vine growing up one leg of an arch trellis and over the top (ctx.arch: the arch's outline and where it
// stands, from the yard). The further into the season (o.h), the further along the arch it has climbed.
function archVine(ctx) {
  const { P, o, rand } = ctx;
  const { dx, dz, across, through, profile, leg, depth } = ctx.arch;
  const ax = V(across[0], 0, across[1]), th = V(through[0], 0, through[1]), mid = V(dx, 0, dz);
  // The outline from the vine's own leg over to the far one, measured along its length.
  const pts = (leg < 0 ? profile : [...profile].reverse()).map(([u, y]) => mid.clone().addScaledVector(ax, u).setY(y));
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = lens.at(-1);
  const path = (t) => { // 0 = foot of the near leg, 1 = foot of the far leg
    const d = t * total;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < d) i++;
    const k = (d - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
    return pts[i - 1].clone().lerp(pts[i], clamp(k, 0, 1));
  };
  const reach = clamp(o.h, 0.1, 1) * (o.young ? 0.15 : 1); // how far along the arch it has grown
  const leaf = leafSize(ctx);
  const steps = clamp(Math.round((reach * total) / (leaf.w * 0.35)), 6, 160);
  const top = Math.max(...pts.map((p) => p.y));
  P.setCenter(mid.clone().setY(top * 0.6));
  const faces = depth > 0.05 ? [-depth / 2, depth / 2] : [0]; // a deep arch has a frame on each side to cover
  let prev = V(0, 0, 0);
  for (let i = 0; i <= steps; i++) {
    const p = path((reach * i) / steps);
    P.stalk(prev, p, 0.02, shade(o.leaf, 0.7));
    prev = p;
    for (const off of faces) for (const side of [-1, 1]) { // leaves on both faces of each frame, held out toward the light
      const out = th.clone().multiplyScalar(side).add(V(0, 0.3 + 0.4 * rand(), 0)).addScaledVector(ax, (rand() - 0.5) * 0.6).normalize();
      const lh = leaf.h * (0.8 + 0.3 * rand());
      const at = p.clone().addScaledVector(th, off + side * 0.08).add(V(0, -lh * 0.2, 0)).addScaledVector(ax, (rand() - 0.5) * 0.3);
      P.card(ctx.leafCell, shade(o.leaf, 0.85 + 0.25 * rand()), at, out, th.clone().multiplyScalar(side).add(V(0, 0.4, 0)), lh * (leaf.w / leaf.h), lh, 0.35);
    }
    const hang = p.clone().addScaledVector(th, faces.at(-1) * (rand() < 0.5 ? -1 : 1));
    if (o.fruit && i % 6 === 3 && p.y > top * 0.4) hangFruit(ctx, hang.add(V(0, -0.1, 0)).addScaledVector(ax, (rand() - 0.5) * 0.4), o.fruit);
    else if (o.flower && i % 4 === 1) { const side = rand() < 0.5 ? -1 : 1; flower(ctx, hang.addScaledVector(th, side * 0.3).add(V(0, 0.1, 0)), o.flower, 1, th.clone().multiplyScalar(side).add(V(0, 0.6, 0)).normalize()); }
  }
}

// A vine trained up a flat trellis panel as wide as the plant (running front to back in the yard): two posts,
// a top rail and netting, covered on both faces with leaves up to how far it has grown, fruit hanging off it.
function trellisVine(ctx, r, H) {
  const { P, o, rand } = ctx;
  const w = Math.max(r, 0.6), tall = H * 1.05;
  for (const z of [-w, w]) P.stalk(V(0, 0, z), V(0, tall, z), 0.035, BARK);
  P.stalk(V(0, tall, -w), V(0, tall, w), 0.025, BARK);
  for (let k = 1; k <= 4; k++) P.stalk(V(0, (tall * k) / 5, -w), V(0, (tall * k) / 5, w), 0.006, "#c8c4b8"); // netting wires
  const grown = clamp(o.h, 0.1, 1) * (o.young ? 0.25 : 1) * H;
  const leaf = leafSize(ctx);
  P.setCenter(V(0, grown * 0.5, 0));
  const n = clamp(Math.round((2.4 * 2 * w * grown * 2) / (leaf.h * leaf.w * 0.7)), 12, MAX_CARDS); // both faces, about 1.2 deep
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, y = grown * Math.pow(rand(), 0.8), z = (rand() * 2 - 1) * w * (0.4 + 0.6 * Math.min(1, y / 0.8 + 0.3));
    const lh = leaf.h * (0.8 + 0.3 * rand());
    const out = V(side, 0.3 + 0.5 * rand(), (rand() - 0.5) * 0.8).normalize();
    P.card(ctx.leafCell, shade(o.leaf, 0.85 + 0.25 * rand()), V(side * 0.06, y - lh * 0.3, z), out, V(side, 0.4, 0), lh * (leaf.w / leaf.h), lh, 0.35);
  }
  for (let i = 0; i < clamp(Math.round(grown * 2), 3, 14); i++) {
    const side = rand() < 0.5 ? -1 : 1, p = V(side * 0.18, grown * (0.15 + 0.75 * rand()), (rand() * 2 - 1) * w * 0.85);
    if (o.fruit) hangFruit(ctx, p, o.fruit);
    else if (o.flower) flower(ctx, p.add(V(side * 0.1, 0, 0)), o.flower, 1.1, V(side, 0.5, 0).normalize());
  }
}

// One vine stem twining up along path(t) (t 0→1, `total` feet long), as far as it has grown (reach 0–1): a leaf
// on a short stalk at every few inches, alternating sides and turned outward (away from out(p)'s support), with
// fruit or flowers hanging off it.
function vineUp(ctx, path, total, reach, out) {
  const { P, o, rand } = ctx;
  const leaf = leafSize(ctx);
  const steps = clamp(Math.round((reach * total) / (leaf.w * 0.4)), 3, 120);
  let prev = path(0);
  for (let i = 1; i <= steps; i++) {
    const p = path((reach * i) / steps);
    P.stalk(prev, p, 0.014, shade(o.leaf, 0.7));
    prev = p;
    const away = out(p), side = new THREE.Vector3().crossVectors(UP, away).normalize().multiplyScalar(i % 2 ? 1 : -1);
    const dir = away.clone().multiplyScalar(0.8).addScaledVector(side, 0.55).add(V(0, 0.15 + 0.45 * rand(), 0)).normalize();
    const lh = leaf.h * (0.8 + 0.3 * rand()) * (i / steps > 0.85 ? 0.7 : 1); // small new leaves at the growing tip
    const at = p.clone().addScaledVector(dir, 0.06);
    P.stalk(p, at, 0.006, shade(o.leaf, 0.8));
    P.card(ctx.leafCell, shade(o.leaf, 0.85 + 0.25 * rand()), at, dir, away.clone().add(V(0, 0.5, 0)), lh * (leaf.w / leaf.h), lh, 0.35);
    if (i % 3 === 0) { // a curling tendril
      const t1 = p.clone().addScaledVector(side, -0.12).add(V(0, 0.1, 0)), t2 = t1.clone().addScaledVector(away, 0.06).add(V(0, 0.05, 0));
      P.stalk(p, t1, 0.004, shade(o.leaf, 0.9)); P.stalk(t1, t2, 0.004, shade(o.leaf, 0.9));
    }
    if (o.fruit && i % 3 === 2 && p.y > 0.6) hangFruit(ctx, p.clone().addScaledVector(away, 0.4).addScaledVector(side, -0.1).add(V(0, -0.1, 0)), o.fruit); // out past the leaves, where it shows
    else if (o.flower && i % 3 === 1) flower(ctx, p.clone().addScaledVector(away, 0.15).add(V(0, 0.05, 0)), o.flower, 1.1, away.clone().add(V(0, 0.5, 0)).normalize());
  }
}

// Vines twining up a single pole.
function poleVine(ctx, r, H) {
  const { P, o } = ctx;
  P.stalk(V(0, 0, 0), V(0, H * 1.08, 0), 0.04, BARK);
  const reach = clamp(o.h, 0.1, 1) * (o.young ? 0.25 : 1);
  for (const phase of [0, Math.PI]) {
    const path = (t) => V(Math.cos(phase + t * 9) * 0.1, t * H, Math.sin(phase + t * 9) * 0.1);
    vineUp(ctx, path, H * 1.1, reach, (p) => V(p.x, 0, p.z).normalize());
  }
}

// Whether a climbing or sprawling vine was given something else to grow on, and if so draws it that way.
// Returns false to let the shape draw its usual way.
function onSupport(ctx, r, H) {
  const sup = ctx.support === "arch" && !ctx.arch ? "trellis" : ctx.support; // no arch nearby: a trellis instead
  if (sup === "arch") archVine(ctx);
  else if (sup === "trellis") trellisVine(ctx, r, H);
  else if (sup === "pole") poleVine(ctx, r, H);
  else if (sup === "ground") carpet(ctx, r * (ctx.look.shape === "climber" ? 1.6 : 1), Math.min(H, 1.2));
  else return false;
  return true;
}

// A low, unbroken carpet of leaves on short stalks, highest over the crown and lower out along the runners, the
// blades tipped to the sky: melons, vining squash (and any vine left on the ground). Leaves are spread evenly
// over the ground the vine covers (a sunflower-seed spiral, jittered) so no soil shows between runners.
function carpet(ctx, r, H) {
  const { P, o, rand } = ctx;
  const leaf = leafSize(ctx);
  const aspect = leaf.w / leaf.h;
  const blade = () => leaf.h * (0.8 + 0.3 * rand()) * (o.slump ? 0.8 : 1);
  P.setCenter(V(0, -H * 0.6, 0));
  P.solid(BASE.blob, shade(o.leaf, 0.55), V(0, 0, 0), [r * 0.8, H * 0.3, r * 0.8]); // shade under the leaves
  const runners = clamp(Math.round(r * 3), 5, 12);
  for (let k = 0; k < runners; k++) { // the runners themselves, wandering out under the leaves
    let a = (k / runners) * Math.PI * 2 + rand() * 0.5, prev = V(0, 0.03, 0);
    const turn = (rand() - 0.5) * 1.4, len = r * (0.8 + 0.2 * rand());
    for (let j = 1; j <= 6; j++) {
      a += turn / 6 + (rand() - 0.5) * 0.3;
      const node = prev.clone().add(V(Math.cos(a) * (len / 6), 0, Math.sin(a) * (len / 6))).setY(0.03);
      P.stalk(prev, node, 0.012, shade(o.leaf, 0.7));
      prev = node;
    }
  }
  const n = clamp(Math.round((2.6 * Math.PI * r * r) / (leaf.h * leaf.w * 0.7)), 20, MAX_CARDS);
  const gap = r / Math.sqrt(n); // about how far apart neighbouring leaves are
  for (let i = 0; i < n; i++) {
    const t = Math.sqrt((i + 0.5) / n), a = i * 2.39996 + (rand() - 0.5) * 0.5;
    const d = r * 0.97 * t + (rand() - 0.5) * gap;
    const out = V(Math.cos(a), 0, Math.sin(a));
    const lh = blade();
    const side = out.clone().applyAxisAngle(UP, (rand() - 0.5) * 2.2); // each blade turned its own way
    const top = out.clone().multiplyScalar(Math.max(0, d)).setY(H * (0.3 + 0.6 * rand()) * (1 - 0.5 * t) + 0.05);
    if (i % 3 === 0) P.stalk(top.clone().setY(0.03), top, 0.006, shade(o.leaf, 0.9));
    const tipDir = side.add(V(0, 0.08 + 0.3 * rand(), 0)).normalize(); // blades held nearly flat
    P.card(ctx.leafCell, shade(o.leaf, 0.85 + 0.25 * rand()), top.clone().addScaledVector(tipDir, -lh * 0.4), tipDir, UP, lh * aspect, lh, 0.3);
  }
  groundFruit(ctx, r);
}
// Fruit lying on the ground out where the leaves are lower, so it shows (or flowers on top before fruit sets).
function groundFruit(ctx, r) {
  const { P, o, rand, look } = ctx;
  if (o.fruit) {
    for (let i = 0; i < 3; i++) {
      const a = rand() * Math.PI * 2, d = r * (0.55 + 0.4 * rand()), x = Math.cos(a) * d, z = Math.sin(a) * d;
      const big = look.fruitSize || 0.3;
      const len = look.fruitLen || big * 2.6;
      if (look.fruitShape === "long") P.stalk(V(x, big * 0.5, z), V(x + Math.cos(a) * len, big * 0.5, z + Math.sin(a) * len), big * 0.5, o.fruit);
      else P.solid(BASE.ball, o.fruit, V(x, big * 0.8, z), [big, big * 0.85, big]);
    }
  } else if (o.flower) for (let i = 0; i < 5; i++) { const [x, z] = spot(rand, r * 0.6); flower(ctx, V(x, 0.6, z), o.flower, 1.2); }
}

const DRAW = {
  // Leafy clump with spires rising out of it: foxglove, salvia, lobelia, penstemon.
  spikes(ctx, r, H) {
    const { P, o, rand, look } = ctx;
    const L = leafTop(ctx, Math.min(0.9, (look.leaves ?? 0.4) * (o.flower ? 1 : 1.15)), H);
    if (look.leaves > 0.6) bushy(ctx, r * 0.85, L, { leafFrom: 0.25 }); // a bushy base of leafy stems, like baptisia
    else basal(ctx, r * 0.9, L);
    if (!o.flower) {
      // Growing toward bloom: leafy flower stalks rising out of the clump, topped with green buds.
      if (ctx.state === "foliage" && o.h < 0.95 && look.spikeIn && !o.young) {
        const n = clamp(Math.round((look.spikes || 3) * 0.4), 1, 5);
        for (let i = 0; i < n; i++) {
          const [x, z] = spot(rand, r * 0.35);
          const tip = V(x * 1.1, H * (0.9 + 0.1 * rand()), z * 1.1), start = V(x, H * 0.75, z);
          P.stalk(V(x, L * 0.3, z), start, 0.025, shade(o.leaf, 0.8));
          stemLeaves(ctx, V(x, L * 0.5, z), start, 3, 0.6);
          P.cross("spike", shade(o.leaf, 1.1), start, tip.clone().sub(start), (look.spikeIn[1] / 12 / 0.38) * 0.45, tip.distanceTo(start), rand() * 3, 2);
        }
      }
      return;
    }
    const n = look.spikes || count(ctx, 2, 4, 3, 9, r);
    for (let i = 0; i < n; i++) {
      const [x, z, a] = spot(rand, r * (look.leafyStems ? 0.7 : 0.45), 0.6);
      const top = H * (0.82 + 0.18 * rand());
      const lean = 0.12 * rand();
      // A real spike length (look.spikeIn = [length, width] in inches) sets where the flowers start on the stalk.
      const spikeFt = look.spikeIn ? (look.spikeIn[0] / 12) * (0.8 + 0.3 * rand()) : (top - L) * 0.85;
      const start = V(x * 1.15, Math.max(L * 0.6, top - spikeFt), z * 1.15);
      const tip = V(start.x + Math.cos(a) * lean, top, start.z + Math.sin(a) * lean);
      P.stalk(V(x, L * 0.4, z), start, 0.025, o.dried ? BROWN : shade(o.leaf, 0.8));
      if (look.leafyStems && !o.dried) stemLeaves(ctx, V(x, L * 0.25, z), start, 4, 0.8); // leaves all the way up the flower stems
      // The florets on the spike picture fill about 0.38 of its width.
      const w = look.spikeIn ? (look.spikeIn[1] / 12 / 0.38) * (o.dried ? 0.5 : 1) : (o.dried ? 0.16 : 0.4) * ctx.fs;
      P.cross("spike", o.dried ? shade(o.flower, 0.9 + 0.2 * rand()) : shade(o.flower, 0.92 + 0.16 * rand()), start, tip.clone().sub(start), w, tip.distanceTo(start), rand() * 3, 2);
    }
  },

  // Upright stems with flat flowers: coneflower, blanket flower, asters, cosmos.
  daisies(ctx, r, H) {
    const { P, o, rand, look } = ctx;
    const L = leafTop(ctx, Math.min(0.85, (look.leaves ?? 0.55) + (o.flower ? 0 : 0.2)), H);
    const n = look.blooms || count(ctx, 3, 5, 5, 16, r);
    // A second flower mixed in (look.flower2, in its own form look.flower2Form): goldenrod plumes among the asters.
    const bloom = (i, p, facing) => {
      if (look.flower2 && i % 2) flower(ctx, p, o.dried ? o.flower : look.flower2, 1, facing, look.flower2Form);
      else flower(ctx, p, o.flower, 1, facing);
    };
    if (look.habit === "stems" || (!look.habit && look.leaves > 0.65)) {
      // Tall leafy stems (asters, sneezeweed, goldenrod), leafy right up to loose sprays of flowers at their tips.
      const tips = bushy(ctx, r * 0.9, L, { top: o.flower ? H * 0.9 : L });
      if (o.flower) sprays(ctx, tips, n, r, bloom);
      return;
    }
    basal(ctx, r * 0.9, L, { density: look.leafDensity || 1 });
    if (!o.flower) return;
    for (let i = 0; i < n; i++) {
      // look.sprawl: flower stems lean out over the leaves at different heights instead of standing up together.
      const [x, z] = spot(rand, r * (look.sprawl ? 1.15 : 0.85), look.sprawl ? 0.4 : 0.7);
      const tip = V(x, H * (look.sprawl ? 0.6 + 0.4 * rand() : 0.8 + 0.2 * rand()), z);
      const from = V(x * 0.4, L * 0.5, z * 0.4);
      P.stalk(from, tip, clamp(H * 0.004, 0.006, 0.014), o.dried ? BROWN : shade(o.leaf, 0.8));
      if (i % 2 === 0 && !o.dried) stemLeaves(ctx, from, tip, 1, 0.5);
      bloom(i, tip, V(x * 0.4, 1, z * 0.4).normalize());
    }
  },

  // Bushy clump with big round flowers: peony, dahlia.
  pompons(ctx, r, H) {
    const { P, o, rand, look } = ctx;
    const L = o.flower ? H * (ctx.look.leaves ?? 0.78) : H * 0.9;
    // A peony is many separate stalks from the crown, bare below and leafy above, together making a dome.
    const tips = look.habit === "dome" ? bushy(ctx, r, L, { leafFrom: 0.35 }) : bushy(ctx, r, L);
    if (o.slump || !o.flower) return;
    // Each flower tops one of the leafy stems, on the stem carrying on up past the leaves.
    const n = look.blooms || count(ctx, 4, 4, 5, 11, r);
    for (let i = 0; i < n; i++) {
      const { tip, out } = tips[i % tips.length];
      const f = tip.clone().addScaledVector(out, 0.05 + 0.1 * rand()).add(V((rand() - 0.5) * 0.12, (H - L) * (0.4 + 0.6 * rand()) + 0.1, (rand() - 0.5) * 0.12));
      P.stalk(tip.clone().add(V(0, -0.15, 0)), f, 0.022, shade(o.leaf, 0.8));
      flower(ctx, f, shade(o.flower, 0.94 + 0.12 * rand()));
    }
  },

  // Low dome with small flowers on or above it: hardy geranium, coral bells, hosta, lady's mantle.
  mound(ctx, r, H) {
    const { P, o, rand, look } = ctx;
    // A dome sunk into the ground, never much taller than it is wide; anything above that is flower stalks,
    // which only show while it's in flower. Kinds with leafy upright stems (look.habit "stems") are bushier.
    const L = Math.min(leafTop(ctx, look.leaves ?? 0.8, H), r * 1.15 * (look.habit === "stems" ? 1.6 : 1));
    const n = look.blooms || (ctx.form === "spike" ? count(ctx, 3, 2, 4, 8, r) : count(ctx, 5, 7, 6, 16, r));
    const facing = (x, z) => (look.nod ? V(x, -0.2, z).normalize() : V(x * 0.5, 1, z * 0.5).normalize());
    if (look.habit === "branched") { // one main shoot with branches off it (ground cherry)
      const br = branched(ctx, r, Math.max(L, H * 0.9));
      if (o.flower) for (let i = 0; i < n; i++) { const b = br[i % br.length]; flower(ctx, b.mid.clone().add(V(0, -0.05, 0)), o.flower, 1, b.out.clone().add(V(0, -0.3, 0)).normalize()); }
      if (o.fruit && !o.harvest) for (let i = 0; i < clamp(Math.round(r * 14), 8, 30); i++) { // lanterns hanging under the branches
        const b = br[i % br.length], q = 0.3 + 0.6 * rand();
        hangFruit(ctx, b.node.clone().lerp(b.end, q).add(V(0, -0.04, 0)), o.fruit);
      }
      return;
    }
    if (look.habit === "trailing") { // leggy trailing stems (nasturtium)
      const nodes = trailing(ctx, r, H * (o.flower ? 0.8 : 1));
      if (o.flower) for (let i = 0; i < n && nodes.length; i++) {
        const { p, out } = nodes[Math.floor(rand() * nodes.length)];
        const f = p.clone().add(V((rand() - 0.5) * 0.15, H * (0.3 + 0.3 * rand()), (rand() - 0.5) * 0.15)); // just at or above the leaves
        P.stalk(p, f, 0.006, shade(o.leaf, 0.85));
        flower(ctx, f, shade(o.flower, 0.94 + 0.12 * rand()), 1, out.clone().add(V(0, 0.9, 0)).normalize());
      }
      return;
    }
    if (look.habit === "stems") { // leafy stems with the flowers at their tips (balloon flower, basil, ground cherry)
      const tips = bushy(ctx, r, L, { top: o.flower ? Math.max(L, H * 0.92) : L });
      if (o.flower) sprays(ctx, tips, n, r * 0.6, (i, p) => flower(ctx, p, shade(o.flower, 0.94 + 0.12 * rand()), 1, facing(p.x, p.z)));
      // Fruit hanging under the leaves along the stems (ground cherry lanterns).
      if (o.fruit && !o.harvest) for (let i = 0; i < clamp(Math.round(r * 14), 8, 30); i++) {
        const { tip, out } = tips[i % tips.length], t = 0.35 + 0.5 * rand();
        hangFruit(ctx, V(tip.x * t, tip.y * t, tip.z * t).addScaledVector(out, 0.06), o.fruit);
      }
      return;
    }
    if (look.habit === "crown") umbrellas(ctx, r, L); // leaf blades on long stalks straight from the crown
    else if (look.habit === "basal") basal(ctx, r, L, { density: look.leafDensity || 1 }); // leaves arching up from the crown
    else {
      leafy(ctx, V(0, L * 0.25, 0), r, L * 0.75, { yMin: -0.1 });
      // Green stems from the crown branching up into the mound, so the leaves are held up on something.
      for (let i = 0; i < clamp(Math.round(r * 10), 6, 18); i++) {
        const a = i * 2.39996, y = 0.2 + 0.6 * rand(), d = Math.sqrt(1 - y * y) * 0.75;
        const end = V(Math.cos(a) * r * d, L * 0.25 + L * 0.75 * y * 0.75, Math.sin(a) * r * d);
        const mid = end.clone().multiplyScalar(0.45).setY(end.y * 0.6);
        P.stalk(V(0, 0, 0), mid, 0.014, shade(o.leaf, 0.7)); P.stalk(mid, end, 0.01, shade(o.leaf, 0.7));
      }
    }
    if (o.fruit && !o.harvest) {
      for (let i = 0; i < 7; i++) {
        const [x, z] = spot(rand, r * 0.85);
        P.solid(BASE.ball, o.fruit, V(x, L * 0.25 + L * 0.75 * Math.sqrt(Math.max(0, 1 - (Math.hypot(x, z) / r) ** 2)) * 0.95, z), 0.11 * ctx.fs);
      }
    }
    if (!o.flower) return;
    for (let i = 0; i < n; i++) {
      const [x, z] = spot(rand, r * 0.85);
      const surf = L * 0.25 + L * 0.75 * Math.sqrt(Math.max(0, 1 - (Math.hypot(x, z) / r) ** 2));
      // look.roundTop: the flower stems fan out into a rounded dome, shortest at the edge (rose campion).
      const edge = Math.hypot(x, z) / r;
      const lift = (H - L) * (look.roundTop ? 0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - edge * edge)) : 0.6 + 0.4 * rand()) + 0.05;
      const p = look.roundTop ? V(x * 1.25, surf + lift, z * 1.25) : V(x, surf + lift, z);
      if (lift > 0.2 && look.roundTop) { // a gently curving stem: up from the crown, then out
        const mid = V(x * 0.7, surf + lift * 0.6, z * 0.7);
        P.stalk(V(x * 0.3, surf - 0.15, z * 0.3), mid, 0.012, o.dried ? BROWN : mix(o.leaf, "#9aa878", 0.4));
        P.stalk(mid, p, 0.01, o.dried ? BROWN : mix(o.leaf, "#9aa878", 0.4));
      } else if (lift > 0.2) P.stalk(V(x * 0.8, surf - 0.15, z * 0.8), p, 0.01, o.dried ? BROWN : mix(o.leaf, "#9aa878", 0.4));
      if (lift > 0.3 && look.leafyStems && i % 2 === 0) stemLeaves(ctx, V(x * 0.8, surf, z * 0.8), p, 2, 0.5);
      // look.nod: flowers hang or face outward (columbine, hellebore) rather than looking up.
      flower(ctx, p, shade(o.flower, 0.94 + 0.12 * rand()), 1, facing(x, z));
    }
  },

  // Sword or strap leaves in fans: iris, daylily.
  fan(ctx, r, H) {
    const { P, o, rand, look } = ctx;
    const L = o.flower ? H * (look.leaves ?? 0.75) : H;
    const n = clamp(Math.round(3 + r * 2), 3, 7);
    for (let i = 0; i < n; i++) {
      const [x, z] = spot(rand, r * 0.25);
      const yaw = (i / n) * Math.PI + rand() * 0.4;
      P.card(ctx.leafCell === "straps" ? "straps" : "fan", shade(o.leaf, 0.88 + 0.2 * rand()), V(x, 0, z), V(Math.cos(yaw) * 0.1, 1, Math.sin(yaw) * 0.1), V(Math.cos(yaw + 1.57), 0, Math.sin(yaw + 1.57)), r * 1.5, L * (0.85 + 0.15 * rand()), 0.3);
    }
    if (!o.flower) return;
    const k = look.blooms || clamp(Math.round(1 + r * 2), 2, 5);
    for (let i = 0; i < k; i++) {
      const [x, z] = spot(rand, r * 0.4);
      const tip = V(x * 1.3, H * (0.88 + 0.12 * rand()), z * 1.3);
      P.stalk(V(x, 0, z), tip, 0.025, o.dried ? BROWN : shade(o.leaf, 0.8));
      flower(ctx, tip, o.flower, 1.3, V(x, 0.6, z).normalize());
    }
  },

  // Thin blades arching out from the middle, with plumes: ornamental grasses, sedges.
  grass(ctx, r, H) {
    const { P, o, rand } = ctx;
    const n = clamp(Math.round(3 + r * 1.5), 4, 7);
    for (let i = 0; i < n; i++) {
      const yaw = (i / n) * Math.PI + rand() * 0.3;
      P.card("blades", shade(o.leaf, 0.85 + 0.25 * rand()), V(0, 0, 0), UP, V(Math.cos(yaw), 0, Math.sin(yaw)), r * 2.1, H * (o.flower ? 0.8 : 1) * (0.85 + 0.15 * rand()), 0.25);
    }
    if (!o.flower) return;
    for (let i = 0; i < 7; i++) {
      const [x, z] = spot(rand, r * 0.35);
      const tip = V(x * 1.6, H * (0.85 + 0.15 * rand()), z * 1.6);
      P.stalk(V(x * 0.3, 0, z * 0.3), tip, 0.012, o.flower);
      flower(ctx, tip, o.flower);
    }
  },

  // Woody stems under a round canopy: hydrangea, lilac, blueberry.
  shrub(ctx, r, H) {
    const { P, o, rand, look } = ctx;
    const n = count(ctx, 3, 2, 4, 8, r);
    if (o.bare && !o.buds) { bareBranches(ctx, r, H, n + 2); return; }
    const cy = H * 0.58, ch = H * 0.42;
    // look.wall: a narrow band of leaves along a fence (front to back in the yard) rather than a round shrub.
    const depth = look.wall ? Math.min(r, look.wall / 2) : r * 0.92, rz = look.wall ? r : depth;
    // One connected frame: trunks from the ground fork low down, and the forks branch up and out to where the
    // leaves are, so every leaf, flower and berry is on a branch.
    const thick = clamp(H * 0.011, 0.025, 0.08) * Math.sqrt(ctx.s), bark = look.bark || BARK, ends = []; // about 1 in thick on a 4 ft shrub
    for (let i = 0; i < Math.min(n, 5); i++) {
      const [x, z, a] = spot(rand, r * 0.3), out = V(Math.cos(a), 0, Math.sin(a));
      const foot = V(x, 0, z), fork = foot.clone().addScaledVector(out, r * 0.25).setY(H * (0.2 + 0.08 * rand()));
      P.stalk(foot, fork, thick, bark);
      for (let j = 0; j < 3; j++) {
        const ang = a + (j - 1) * 0.9 + (rand() - 0.5) * 0.4, y = -0.25 + 0.85 * rand(), sxz = Math.sqrt(1 - y * y);
        const end = V(Math.cos(ang) * depth * 0.72 * sxz, cy + y * ch * 0.72, Math.sin(ang) * rz * 0.72 * sxz);
        P.stalk(fork, end, thick * 0.55, bark);
        const tip = end.clone().multiplyScalar(1.22).setY(end.y + ch * 0.12);
        P.stalk(end, tip, thick * 0.3, bark);
        ends.push(end, tip);
      }
    }
    if (o.bare) { // leafing out: fat buds at the twig tips and the first small leaves filling in
      for (const t of ends) for (let k = 0; k < 3; k++) P.solid(BASE.bud, shade(o.buds, 0.9 + 0.2 * rand()), t.clone().add(V((rand() - 0.5) * 0.14, (rand() - 0.3) * 0.12, (rand() - 0.5) * 0.14)), 0.045 * ctx.fs);
      leafy(ctx, V(0, cy, 0), depth, ch, { yMin: -0.4, rz, density: 0.35, size: 0.6, color: o.budLeaves || SPRING, core: false });
      return;
    }
    leafy(ctx, V(0, cy, 0), depth, ch, { yMin: -0.7, rz, density: look.leafDensity || 1 });
    const onTop = (from = 0.85, lift = 0) => {
      const [x, z] = spot(rand, r * from);
      const d = Math.hypot(x, z) / (r * 0.92);
      const p = V(x, cy + ch * Math.sqrt(Math.max(0.05, 1 - d * d)) * 0.95 + lift, z);
      return [p, V(x * 0.6, 1, z * 0.6).normalize()];
    };
    // Flower heads sit at the branch tips, out past the leaves (leaves stick out about a third of a leaf).
    const above = leafSize(ctx).h * 0.75;
    if (o.flower) for (let i = 0, m = look.blooms || clamp(Math.round(6 + r * 5), 7, 22); i < m; i++) { const [p, f] = onTop(0.9, above); flower(ctx, p, shade(o.flower, 0.94 + 0.12 * rand()), 1, f); }
    // Bunches of berries (blueberries come in clusters of 5–10) just out past the leaves.
    if (o.fruit) P.skyLit(() => { for (let i = 0, m = clamp(Math.round(10 + r * 12), 12, 40); i < m; i++) { const [p] = onTop(0.95, above * 0.45); P.head("cluster", shade(o.fruit, 0.9 + 0.2 * rand()), p, 0.2, 0.8); } });
  },

  // A vase of long canes with leaves along them: raspberries, ninebark, currant.
  canes(ctx, r, H) {
    const { P, o, rand, look } = ctx;
    const n = count(ctx, 5, 4, 5, 14, r);
    if (o.bare && !o.buds) { bareBranches(ctx, r, H, n, 0.45); return; }
    // Each cane arches up and out from the crown with its leaves (and flowers, berries) along it, so nothing
    // floats. Leafing out (o.buds) shows the same canes with small new leaves.
    const keeps = !look.annualCanes; // ninebark and currant keep their canes, leafy nearly to the ground
    const leafing = Boolean(o.bare), leaf = leafSize(ctx), dens = Math.sqrt(look.leafDensity || 1);
    const bark = look.bark || "#8a5a3c", color = leafing ? o.budLeaves || SPRING : o.leaf;
    const perCane = Math.ceil((look.blooms || clamp(Math.round(10 + r * 8), 12, 40)) / n);
    const canopy = keeps && !leafing; // a shrub in leaf: a full, rounded bush of leaves around its canes
    P.setCenter(V(0, H * 0.5, 0));
    for (let i = 0; i < n; i++) {
      const [x, z, a] = spot(rand, r * 0.3), out = V(Math.cos(a), 0, Math.sin(a));
      const len = H * (0.85 + 0.2 * rand()), foot = V(x, 0, z);
      const ctrl = foot.clone().addScaledVector(out, r * 0.15).setY(len * 0.8);
      const end = foot.clone().addScaledVector(out, r * (keeps ? (leafing ? 0.85 : 0.6) : 0.45) * (0.8 + 0.3 * rand())).setY(len * (keeps ? 0.72 : 0.95)); // a shrub's canes arch out into a fountain
      const at = (t) => foot.clone().multiplyScalar((1 - t) ** 2).addScaledVector(ctrl, 2 * t * (1 - t)).addScaledVector(end, t * t);
      let prev = foot;
      for (let k = 1; k <= 6; k++) { const p = at(k / 6); P.stalk(prev, p, 0.03 * (1 - k * 0.08), bark); prev = p; }
      // A shrub's canes (ninebark) branch: side shoots from the upper half arch out with leaves, flowers at their tips.
      const shoots = [];
      if (canopy) continue;
      if (keeps) for (let j = 0; j < 3; j++) {
        const t = 0.35 + 0.18 * j + 0.08 * rand(), base = at(t), sa = a + (j % 2 ? 1 : -1) * (0.6 + 0.5 * rand());
        const tip = base.clone().add(V(Math.cos(sa) * r * 0.4, r * 0.18, Math.sin(sa) * r * 0.4));
        const mid = base.clone().lerp(tip, 0.5).add(V(0, r * 0.08, 0));
        P.stalk(base, mid, 0.016, bark); P.stalk(mid, tip, 0.012, bark);
        shoots.push({ base, mid, tip, out: V(Math.cos(sa), 0, Math.sin(sa)) });
        const k = clamp(Math.round((r * 0.45 * dens) / (leaf.w * 0.35) * (leafing ? 1.3 : 1)), 3, 14);
        for (let q = 0; q < k; q++) {
          const u = (q + 1) / k, p = u < 0.5 ? base.clone().lerp(mid, u * 2) : mid.clone().lerp(tip, (u - 0.5) * 2);
          const dir = V(Math.cos(sa + q * 2.4) * 0.8, 0.4 + 0.3 * rand(), Math.sin(sa + q * 2.4) * 0.8).normalize();
          const lh = leaf.h * (leafing ? 0.55 + 0.2 * rand() : 0.8 + 0.3 * rand());
          P.card(ctx.leafCell, shade(color, 0.85 + 0.27 * rand()), p, dir, V(0, 1, 0).addScaledVector(dir, -0.3), lh * (leaf.w / leaf.h), lh, 0.5);
        }
      }
      const from = keeps ? 0.12 : 0.3;
      const m = clamp(Math.round((len * (1 - from) * dens) / (leaf.w * 0.4) * (leafing ? 1.3 : 1)), 4, 36);
      for (let j = 0; j < m; j++) {
        const t = from + ((1 - from) * (j + 0.5)) / m, p = at(t);
        const side = a + j * 2.4, dir = V(Math.cos(side) * 0.8, 0.35 + 0.3 * rand(), Math.sin(side) * 0.8).addScaledVector(out, 0.4).normalize();
        const lh = leaf.h * (leafing ? 0.55 + 0.2 * rand() : 0.8 + 0.3 * rand()) * (t > 0.92 ? 0.7 : 1);
        P.card(ctx.leafCell, shade(color, 0.85 + 0.27 * rand()), p, dir, V(0, 1, 0).addScaledVector(dir, -0.3), lh * (leaf.w / leaf.h), lh, 0.5);
      }
      if (o.flower) for (let j = 0; j < perCane; j++) { // clusters at the shoot tips and along the arching top of the cane
        const s0 = shoots[j % Math.max(1, shoots.length)];
        const p = s0 && j < shoots.length * 2 ? (j < shoots.length ? s0.tip : s0.mid).clone().add(V(0, 0.08, 0)) : at(0.55 + 0.45 * rand()).add(V((rand() - 0.5) * 0.25, 0.08, (rand() - 0.5) * 0.25));
        flower(ctx, p, o.flower, 1, out.clone().add(V(0, 1, 0)).normalize());
      }
      if (o.fruit) for (let j = 0; j < 6; j++) { // berries hanging just under the leaves
        const p = at(0.45 + 0.55 * rand()).add(V((rand() - 0.5) * 0.2, -0.08, (rand() - 0.5) * 0.2));
        P.solid(BASE.bud, o.fruit, p, 0.07 * Math.sqrt(ctx.fs));
      }
    }
    if (!canopy) return;
    const cy = H * 0.52, ch = H * 0.48, cr = r * 0.95;
    leafy(ctx, V(0, cy, 0), cr, ch, { yMin: -0.85, stickOut: 0.55, density: look.leafDensity || 1 });
    const onSurface = (lift) => {
      const y = -0.3 + 1.3 * rand(), a = rand() * Math.PI * 2, sxz = Math.sqrt(Math.max(0, 1 - y * y));
      const d = V(sxz * Math.cos(a), y, sxz * Math.sin(a));
      return [V(d.x * (cr + lift), cy + d.y * (ch + lift), d.z * (cr + lift)), d];
    };
    const above = leaf.h * 0.3 + 0.08;
    if (o.flower) for (let i = 0, m = look.blooms || clamp(Math.round(10 + r * 8), 12, 40); i < m; i++) { const [p, d] = onSurface(above); flower(ctx, p, o.flower, 1, d.clone().add(V(0, 0.8, 0)).normalize()); }
    if (o.fruit) for (let i = 0, m = clamp(Math.round(15 + r * 10), 20, 60); i < m; i++) { const [p] = onSurface(above * 0.5); P.solid(BASE.bud, o.fruit, p, 0.07 * Math.sqrt(ctx.fs)); }
  },

  // Leaves clinging all the way up a support, with hanging fruit: luffa, peas, climbing cucumbers.
  climber(ctx, r, H) {
    const { P, o, rand, look } = ctx;
    if (onSupport(ctx, r, H)) return;
    if (ctx.arch) { archVine(ctx); return; }
    // Its usual way: two vines twining up each of three stakes leaned together into a teepee.
    const reach = clamp(o.h, 0.1, 1) * (o.young ? 0.2 : 1) * (o.slump ? 0.85 : 1);
    const top = V(0, H * 1.05, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rand() * 0.3, foot = V(Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5);
      if (look.support !== false) P.stalk(foot, top.clone().add(V(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08)), 0.03, BARK);
      for (const phase of [0, Math.PI]) {
        const path = (t) => {
          const p = foot.clone().lerp(top, t * 0.95);
          return p.add(V(Math.cos(phase + t * 8) * 0.1, 0, Math.sin(phase + t * 8) * 0.1));
        };
        vineUp(ctx, path, foot.distanceTo(top), reach, (p) => V(p.x, 0, p.z).normalize().lengthSq() ? V(p.x, 0, p.z).normalize() : V(Math.cos(a), 0, Math.sin(a)));
      }
    }
  },

  // Big leaves spread low with the fruit underneath: squash, zucchini, melons.

  sprawler(ctx, r, H) {
    const { P, o, rand, look } = ctx;
    if (onSupport(ctx, r, H)) return;
    if (look.habit === "vine") { carpet(ctx, r, H); return; }
    // A bush: one thick main stalk growing out along the ground and slowly rising, huge leaves on long hollow
    // stalks springing up from it, and the fruit growing straight out of the main stalk at the leaf joints
    // (zucchini, bush squash).
    P.setCenter(V(0, -H * 0.6, 0));
    const leaf = leafSize(ctx), aspect = leaf.w / leaf.h;
    const a0 = rand() * Math.PI * 2, dir = V(Math.cos(a0), 0, Math.sin(a0)), len = r * 0.75;
    const stalkAt = (t) => dir.clone().multiplyScalar(len * t).setY(0.14 + H * 0.22 * t); // low along the soil, slowly rising
    let prev = stalkAt(0);
    for (let k = 1; k <= 8; k++) { const p = stalkAt(k / 8); P.stalk(prev, p, 0.07 - 0.025 * (k / 8), mix(o.leaf, "#c8d8a0", 0.35)); prev = p; } // thick, pale, easy to see
    const n = clamp(Math.round((6 * Math.PI * r * r) / (leaf.h * leaf.w)), 12, 50);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, node = stalkAt(t * 0.95), a = i * 2.4 + rand() * 0.5, out = V(Math.cos(a), 0, Math.sin(a));
      const lh = leaf.h * (0.75 + 0.35 * rand()) * (t > 0.85 ? 0.7 : 1) * (o.slump ? 0.8 : 1);
      const reach = r * (0.25 + 0.5 * rand()) * (1 - 0.4 * t);
      const tip = node.clone().addScaledVector(out, reach).setY(H * (0.6 + 0.35 * rand()) - lh * 0.25);
      P.stalk(node, tip, 0.02, shade(o.leaf, 0.75));
      P.card(ctx.leafCell, shade(o.leaf, 0.85 + 0.25 * rand()), tip, out.clone().add(V(0, 0.7, 0)).normalize(), V(0, 0.7, 0).addScaledVector(out, 0.6), lh * aspect, lh, 0.3);
    }
    // Fruit grows out of the main stalk on a short stem, spread evenly round it, hanging down toward the soil.
    // Fruit grows from the main stalk near the middle of the plant on short pale stems, one toward each side, and
    // lies out on the soil from there.
    if (o.fruit) for (let i = 0; i < 4; i++) {
      const node = stalkAt(0.1 + 0.08 * i), a = a0 + Math.PI / 4 + (i * Math.PI) / 2, away = V(Math.cos(a), 0, Math.sin(a));
      const big = look.fruitSize || 0.3, flen = look.fruitLen || big * 2.6, stem = mix(o.leaf, "#c8d8a0", 0.35);
      if (look.fruitShape === "long") {
        const start = node.clone().addScaledVector(away, 0.12).setY(Math.max(big * 0.6, node.y - 0.03));
        P.stalk(node, start, 0.03, stem);
        P.stalk(start, start.clone().addScaledVector(away, flen).setY(big * 0.55), big * 0.5, shade(o.fruit, 0.9 + 0.2 * rand()));
      } else {
        const c = node.clone().addScaledVector(away, r * 0.3 + big).setY(big * 0.85);
        P.stalk(node, c.clone().addScaledVector(away, -big * 0.8), 0.03, stem);
        P.solid(BASE.smooth, shade(o.fruit, 0.9 + 0.2 * rand()), c, [big, big * 0.85, big]);
      }
    }
    else if (o.flower) for (let i = 0; i < 5; i++) { const node = stalkAt(0.2 + 0.15 * i); flower(ctx, node.clone().add(V((rand() - 0.5) * 0.3, 0.25, (rand() - 0.5) * 0.3)), o.flower, 1.2); }
  },

  // A staked or caged stem with leaves and hanging fruit: tomato, eggplant, Brussels sprouts.
  crop(ctx, r, H) {
    const { P, o, rand, look } = ctx;
    if (look.stalk) { // Brussels sprouts: one thick upright stalk, big round leaves spiralling up it on long stalks
      const leaf = leafSize(ctx);
      if (o.young) { basal(ctx, r, H, { density: 0.6 }); return; } // a young plant: a rosette of long-stalked leaves
      // Big oval, blistered leaves on thick pale leaf stalks that sweep up and out from one fat stem, a sprout
      // tucked into each leaf joint. In leaf (summer) the leaves cover the stem; at harvest the lower stem is bare,
      // studded with sprouts, under a tuft of leaves.
      const harvest = Boolean(o.harvest), stalkTop = H * (harvest ? 0.8 : 0.6), pale = mix(o.leaf, "#d8e4c4", 0.45);
      P.stalk(V(0, 0, 0), V(0, stalkTop, 0), 0.07 * Math.sqrt(ctx.s) + 0.03, pale);
      P.setCenter(V(0, H * 0.45, 0));
      const from = harvest ? 0.68 : 0.05, nLeaves = harvest ? 10 : 26;
      for (let i = 0; i < nLeaves; i++) {
        const t = i / (nLeaves - 1), y = stalkTop * (from + (1 - from) * t);
        const a = i * 2.4, out = V(Math.cos(a), 0, Math.sin(a));
        const up = harvest ? 0.9 + 0.5 * t : 0.15 + 1.3 * t; // lower leaves spread out nearly flat, upper ones stand up
        const stem = (harvest ? 0.35 : 0.45) * (1.1 - 0.4 * t);
        const end = V(0, y, 0).addScaledVector(out.clone().add(V(0, up, 0)).normalize(), stem);
        P.stalk(V(0, y, 0), end, 0.022, pale);
        const lh = leaf.h * (harvest ? 0.8 : 1) * (1.05 - 0.35 * t) * (0.9 + 0.2 * rand());
        const dir = out.clone().add(V(0, up * 0.8, 0)).normalize(); // the blade carries on the way its stalk points
        P.card(ctx.leafCell, shade(o.leaf, 0.85 + 0.25 * rand()), end.clone().addScaledVector(dir, -lh * 0.08), dir, V(0, 1, 0).addScaledVector(out, 0.4), lh * (leaf.w / leaf.h) * 1.4, lh, 0.35); // broad, nearly as wide as long
        if (!harvest && t < 0.5) P.solid(BASE.ball, shade(o.fruit || "#8fb06a", 0.95), V(out.x * 0.09, y + 0.05, out.z * 0.09), 0.03); // small new sprout in the joint
      }
      if (harvest) for (let i = 0, m = 40; i < m; i++) { // sprouts packed up the bare stem, biggest at the bottom
        const t = i / m, a = i * 2.4, y = stalkTop * (0.06 + 0.6 * t), size = 0.07 * (1.1 - 0.35 * t);
        P.solid(BASE.ball, shade(o.fruit || "#8fb06a", 0.85 + 0.25 * rand()), V(Math.cos(a) * 0.12, y, Math.sin(a) * 0.12), [size, size * 1.1, size]);
        P.solid(BASE.bud, shade(pale, 0.8), V(Math.cos(a + 0.5) * 0.085, y - 0.04, Math.sin(a + 0.5) * 0.085), 0.025); // the scar of the leaf that was there
      }
      return;
    }
    P.stalk(V(0, 0, 0), V(0, H * 0.9, 0), 0.04, shade(o.leaf, 0.75));
    if (look.cage) {
      for (const y of [0.3, 0.62, 0.95]) P.solid(BASE.hoop, "#8a8f94", V(0, H * y, 0), [r * 0.85, 1, r * 0.85]);
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; P.stalk(V(Math.cos(a) * r * 0.85, 0, Math.sin(a) * r * 0.85), V(Math.cos(a) * r * 0.85, H * 0.95, Math.sin(a) * r * 0.85), 0.025, "#8a8f94"); }
    } else P.stalk(V(r * 0.15, 0, 0), V(r * 0.15, H * 1.02, 0), 0.03, BARK);
    // An eggplant is a little branching tree of big leaves (look.habit "stems"); a tomato a leafy column in its cage.
    if (look.habit === "stems") bushy(ctx, r * (o.slump ? 0.8 : 1), H * 0.95, { leafFrom: 0.2 });
    else leafy(ctx, V(0, H * 0.52, 0), r * 0.85 * (o.slump ? 0.8 : 1), H * 0.48, { yMin: -0.6 });
    if (o.fruit && !o.slump) for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2, t = 0.35 + 0.45 * rand(); // hanging from branches well up the plant
      const bulge = Math.sqrt(Math.max(0.1, 1 - ((t - 0.52) / 0.48) ** 2));
      hangFruit(ctx, V(Math.cos(a) * r * 0.8 * bulge, H * t, Math.sin(a) * r * 0.8 * bulge), o.fruit);
    }
  },

  // Fine ferny fronds, with flat flower heads: dill, asparagus.
  feathery(ctx, r, H) {
    const { P, o, rand } = ctx;
    if (o.harvest && ctx.look.spears) { // asparagus spears coming up through the soil, 6–10 in, scaly purple-tinged tips
      for (let i = 0; i < 14; i++) {
        const [x, z] = spot(rand, r * 0.35);
        const h = 0.25 + 0.6 * rand(), lean = V((rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.06);
        const top = V(x, h, z).add(lean);
        P.stalk(V(x, 0, z), top, 0.03, mix("#9cc060", "#7aa448", rand()));
        P.solid(BASE.ball, mix("#8a5a8a", "#7aa448", 0.6), top.clone().add(V(0, 0.02, 0)), [0.034, 0.06, 0.034]); // the tight, scaly tip
        for (let k = 0; k < 4; k++) { // small scales up the spear, closer together and more purple toward the tip
          const y = h * (0.3 + 0.17 * k), a = k * 2.2 + rand();
          P.solid(BASE.ball, mix("#7aa448", "#8a6a8a", k / 4), V(x + Math.cos(a) * 0.028, y, z + Math.sin(a) * 0.028).add(lean.clone().multiplyScalar(y / h)), [0.014, 0.03, 0.014]);
        }
      }
      return;
    }
    P.setCenter(V(0, H * 0.3, 0));
    const n = count(ctx, 6, 4, 7, 14, r);
    for (let i = 0; i < n; i++) {
      const [x, z, a] = spot(rand, r * 0.3);
      const lean = 0.08 + 0.4 * rand();
      const len = H * (o.flower ? 0.8 : 1) * (0.7 + 0.3 * rand());
      const dir = V(Math.sin(lean) * Math.cos(a), Math.cos(lean), Math.sin(lean) * Math.sin(a));
      P.cross(ctx.leafCell === "thread" ? "thread" : "fern", shade(o.leaf, 0.9 + 0.25 * rand()), V(x, 0, z), dir, len * 0.55, len, a, 2, 0.3);
      if (o.flower) {
        const head = V(x + dir.x * len * 1.1, H * (0.9 + 0.1 * rand()), z + dir.z * len * 1.1);
        P.stalk(V(x, len * 0.3, z), head, 0.015, o.dried ? BROWN : shade(o.leaf, 0.8));
        flower(ctx, head, o.flower);
      }
    }
  },
};

// Bare woody stems with a few side twigs, for shrubs and canes in winter.
function bareBranches(ctx, r, H, n, spread = 0.2) {
  const { P, o, rand, look } = ctx;
  const bark = look.bark || BARK; // a kind's own twig color: blueberry twigs are red, lilac stems gray
  const ends = [];
  for (let i = 0; i < n; i++) {
    const [x, z, a] = spot(rand, r * spread);
    const lean = 0.15 + 0.4 * rand();
    const len = H * (0.75 + 0.25 * rand());
    const out = V(Math.cos(a), 0, Math.sin(a));
    const tip = V(x + Math.sin(lean) * len * out.x, Math.cos(lean) * len, z + Math.sin(lean) * len * out.z);
    P.stalk(V(x, 0, z), tip, 0.03 * Math.sqrt(ctx.s) + 0.02, bark);
    ends.push(tip);
    // Side shoots up the upper half, each forking once more, so a bare shrub reads as a twiggy outline.
    for (let k = 0; k < 3; k++) {
      const from = V(x, 0, z).lerp(tip, 0.45 + 0.18 * k);
      const sa = a + (rand() - 0.5) * 2.4, side = V(Math.cos(sa), 0, Math.sin(sa));
      const l2 = len * (0.28 - 0.05 * k);
      const end = from.clone().addScaledVector(side, l2 * 0.7).add(V(0, l2 * 0.7, 0));
      P.stalk(from, end, 0.012, bark);
      const fork = from.clone().lerp(end, 0.6), end2 = fork.clone().addScaledVector(side, l2 * 0.25).add(V((rand() - 0.5) * 0.2, l2 * 0.35, (rand() - 0.5) * 0.2));
      P.stalk(fork, end2, 0.008, bark);
      ends.push(end, end2);
    }
  }
  // Leafing out: a few fat buds at each twig tip (o.buds: their color, pink on a blueberry), most with the first
  // small leaves unfolding (o.budLeaves).
  const leaf = leafSize(ctx, SINGLE.has(ctx.leafCell) ? ctx.leafCell : "broad", 0.45);
  for (const t of ends) {
    if (o.buds) {
      for (let k = 0; k < 3; k++) P.solid(BASE.bud, shade(o.buds, 0.9 + 0.2 * rand()), t.clone().add(V((rand() - 0.5) * 0.12, (rand() - 0.4) * 0.1, (rand() - 0.5) * 0.12)), 0.045 * ctx.fs);
      if (o.budLeaves && rand() < 0.75) {
        const dir = V(rand() - 0.5, 0.8, rand() - 0.5).normalize();
        P.card(leaf.cell, shade(o.budLeaves, 0.9 + 0.2 * rand()), t, dir, V(rand() - 0.5, 0, rand() - 0.5), leaf.w, leaf.h, 0.4);
      }
    } else if (o.flower && rand() < 0.6) flower(ctx, t, o.flower);
  }
}

// Fruit hanging from a branch: round (tomato) or long (eggplant, cucumber, luffa, pea pods).
// It hangs on a short stem and never reaches the ground (a fruit too low for its length is lifted).
function hangFruit(ctx, p, color) {
  const { P, look, o } = ctx;
  const big = look.fruitSize || 0.13, long = look.fruitShape === "long" || look.fruitShape === "drop", len = look.fruitLen || big * 3;
  const at = p.clone().setY(Math.max(p.y, (long ? len : big) + 0.25));
  const hang = at.clone().add(V(0, -0.06, 0));
  P.stalk(at, hang, 0.008, shade(o.leaf, 0.7));
  if (look.fruitShape === "drop") { // an oblong, rounded fruit, fuller at the bottom, under a green cap
    P.solid(BASE.cone, shade(o.leaf, 0.7), hang.clone().add(V(0, -0.07, 0)), [big * 0.55, 0.08, big * 0.55]);
    P.solid(BASE.smooth, color, hang.clone().add(V(0, -len * 0.36, 0)), [big * 0.75, len * 0.32, big * 0.75]);
    P.solid(BASE.smooth, color, hang.clone().add(V(0, -len * 0.64, 0)), [big, len * 0.36, big]);
  } else if (long) P.stalk(hang, V(hang.x, hang.y - len, hang.z), big * 0.5, color);
  else P.solid(BASE.ball, color, hang.add(V(0, -big * 0.9, 0)), big);
}
