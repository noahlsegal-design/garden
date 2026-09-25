// Colors and rough heights for drawing each kind of plant in the 3D yard.
// Purely cosmetic: change a hex color here and the plant looks different. Care info lives in data/species.json.

export const LEAF = "#5f9a45";

// leaf: foliage color, flower: bloom color, fruit: fruit color, fall: fall color, h: height factor (1 = knee-high mound)
export const LOOK = {
  peony: { flower: "#e58fb0", fall: "#b5652f", h: 1.1 },
  dahlia: { flower: "#f08a6a", h: 1.8 },
  foxglove: { flower: "#c96bb0", h: 1.5 },
  "straw-foxglove": { flower: "#e8d98a", h: 1.3 },
  hellebore: { leaf: "#3f6b3a", flower: "#c9a3b8", h: 0.8 },
  "bleeding-heart-fernleaf": { leaf: "#8fb4a0", flower: "#e88fb0", h: 0.7 },
  coneflower: { flower: "#b0579e", h: 1.3 },
  gaillardia: { flower: "#e0762b", h: 0.9 },
  columbine: { leaf: "#7fa79a", flower: "#9a7fd1", h: 0.9 },
  heuchera: { leaf: "#7b4a63", flower: "#f0b8c8", h: 0.6 },
  iris: { leaf: "#6f9a6a", flower: "#6d5bd0", h: 1.2 },
  "great-blue-lobelia": { flower: "#3d5bd6", h: 1.1 },
  "penstemon-husker-red": { leaf: "#7a4545", flower: "#f2eee6", h: 1.2 },
  "salvia-may-night": { flower: "#5b3fa8", h: 1.0 },
  geum: { flower: "#e8743b", h: 0.7 },
  "ladys-mantle": { leaf: "#9dbb6a", flower: "#cfe06a", h: 0.7 },
  "bee-balm-or-phlox": { flower: "#d6437a", h: 1.4 },
  "baptisia-or-rose": { flower: "#5b6bd6", h: 1.1 },
  "ninebark-or-currant": { flower: "#f0e6dc", fall: "#9e3f2c", h: 1.8, shrub: true },
  "jacobs-ladder": { flower: "#8aa6e6", h: 0.8 },
  "hardy-geranium": { flower: "#8e6bd1", h: 0.8 },
  "rose-campion-or-lambs-ear": { leaf: "#a3b3a0", flower: "#d1307a", h: 0.6 },
  "sneezeweed-or-heliopsis": { flower: "#e8b43b", h: 1.5 },
  "ornamental-grass": { leaf: "#7fa35a", fall: "#c9b27a", h: 1.1, grass: true },
  "aster-or-fleabane": { flower: "#ece6f5", h: 1.0 },
  "iris-or-daylily": { leaf: "#6f9a6a", flower: "#e8a33b", h: 1.0, grass: true },
  "unknown-perennial": { h: 0.8 },
  weeds: { leaf: "#7aa35a", h: 0.4 },
  "wild-fenceline": { leaf: "#4f7f3a", h: 1.3 },
  "wild-asters-goldenrod": { flower: "#e0b92b", h: 1.6 },
  "balloon-flower": { flower: "#5670e0", h: 0.9 },
  blueberry: { flower: "#f5f2ea", fruit: "#3f4f9a", fall: "#b8322a", h: 1.4, shrub: true },
  "raspberry-fall": { flower: "#f5f2ea", fruit: "#c2213b", fall: "#b8742a", h: 1.6, shrub: true },
  "panicle-hydrangea": { flower: "#e9f0c9", aging: "#e3a6a6", h: 1.7, shrub: true },
  hosta: { leaf: "#8fb86a", flower: "#b9a7e0", fall: "#d7c35a", h: 0.8 },
  lilac: { leaf: "#3f6f38", flower: "#b58ad6", h: 2.4, shrub: true },
  cosmos: { flower: "#e67fb2", h: 1.6 },
  "brussels-sprouts": { leaf: "#7f9fa0", h: 1.1 },
  loofah: { flower: "#f2d33b", fruit: "#7a9a3a", h: 1.5 },
  honeydew: { fruit: "#d9e3a0", h: 0.5 },
  cucumber: { fruit: "#3f7a2e", h: 1.0 },
  zucchini: { fruit: "#2f5a2a", h: 0.8 },
  squash: { fruit: "#e39b2b", h: 0.7 },
  peas: { leaf: "#9cc97a", fruit: "#8fc464", h: 1.2 },
  radish: { leaf: "#7cae55", h: 0.3 },
  eggplant: { leaf: "#5a7a4a", fruit: "#4b2a5e", h: 1.0 },
  tomato: { fruit: "#d9412b", h: 1.4 },
  beet: { leaf: "#6a3a3a", h: 0.4 },
  "ground-cherry": { leaf: "#a4c98a", fruit: "#e8c23b", h: 0.9 },
  nasturtium: { leaf: "#7fb35a", flower: "#f08a24", h: 0.5 },
  asparagus: { leaf: "#a9cf7a", fall: "#d8b95a", h: 1.6 },
  dill: { leaf: "#9cc46a", flower: "#e8d85a", h: 1.4 },
  basil: { leaf: "#3f8f3a", h: 0.6 },
  "unknown-pot": { h: 0.6, pot: true },
};

// Per-plant touches where plants of one kind look different.
export const PLANT_LOOK = {
  "pb-39": { leaf: "#5e2350" },   // purple ruffled coral bells
  "pb-48": { leaf: "#a7b0a4" },   // silver-veined coral bells
  "pb-50": { leaf: "#b8577f" },   // pink/purple speckled coral bells
};

const DAHLIA_COLORS = ["#f08a6a", "#f4b183", "#e85d75", "#f6efe6", "#c43d5a", "#f0a2b8", "#e87f2d", "#7a1f3d"];

export function lookFor(plant) {
  const base = LOOK[plant.speciesId] || {};
  const look = { leaf: LEAF, flower: "#e8e0f0", fruit: "#c0392b", fall: "#c9772e", aging: "#d9b3a3", h: 1, ...base, ...PLANT_LOOK[plant.id] };
  if (plant.speciesId === "dahlia") {
    let hash = 0;
    for (const ch of plant.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    look.flower = DAHLIA_COLORS[hash % DAHLIA_COLORS.length];
  }
  return look;
}
