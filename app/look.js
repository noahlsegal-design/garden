// Colors and rough heights for drawing each kind of plant in the 3D yard.
// Purely cosmetic: change a hex color here and the plant looks different. Care info lives in data/species.json.

export const LEAF = "#5f9a45";

// How each kind is drawn. Sizes, leaf and flower measurements and stage looks come from the October 2026 research
// (Missouri Botanical Garden, NC State and other extension pages, breeders, and photos of each stage); see
// preview/compare.html (a review page kept on the Mac, not online) for each kind next to real photos.
//
// Colors — leaf: foliage, flower: bloom, fruit, fall: fall color, aging: fading flowers, center: middle of a daisy,
// root: a root crop's shoulder at the soil, winterStalks: dried stalks left standing for winter (and their color).
// Size — shape: the shape type (app/shapes.js), ft: full-grown height in feet with flowers, wide: usual spread in
// feet across (multiplied by a plant's "size" in plants.json), leaves: how much of the height is leaves (the rest
// is flower stalks, which only show in flower).
// Leaves — foliage: leaf picture (broad, lance, round, lobed, palmate, compound, trefoil, fern, thread, sprig, or
// straps for the fan shape), leafIn: real length in inches of one leaf (or one whole compound leaf, frond or twig
// for the compound, fern, thread, trefoil, palmate and sprig pictures), habit "stems": leafy upright stems.
// Flowers — bloom: flower form (spike, daisy, ball, cup, star, cone, cluster, umbel, plume, bells, iris), flowerIn: real
// size in inches (across, or long for spikes, cones and plumes), spikeIn: [length, width] of a flower spike,
// blooms / spikes: how many show at once, flower2 / flower2Form / flower2In: a second flower mixed in, plumes:
// months (0 = Jan) a grass shows plumes.
// Seasons — stage: how a stage looks for this kind ({ leaf, h: share of full height, spread: share of full width,
// buds, ... }), months: how it looks in one month
// whatever the stage (0 = Jan; e.g. green berries in June), growFrom: how much of its height it has
// when it starts growing in spring (0–1), annualCanes: woody canes that regrow from the ground each year,
// leafDensity: more (or fewer) leaves than usual in a clump, upright: leaves stand up rather than spread, sprawl: flower stems lean out every which way,
// leafTilt (0–1): crown leaves tilt every which way instead of lying flat like shingles, leafReach (0–1): shorter
// leaf stalks so crown leaves sit closer in (not used by any kind right now), roundTop: flower stems fan out
// into a rounded dome,
// nod: flowers hang or face outward instead of up.
// Habits — habit: "stems" (leafy upright stems), "crown" (leaves on stalks from the crown), "basal", "dome", "vine",
// "branched" (one main shoot with side branches, like a tomato), "trailing" (leggy stems over the ground).
// Vegetables — rootUp: how much of a root crop's root shows above the soil (0–1), climbsArch: grows over a nearby arch trellis, fruitShape "long" (or "drop", a teardrop like an eggplant), fruitSize (feet, radius), fruitLen (feet), cage, stalk, support, spears.
// Other — shrub: woody, bark: color of bare stems and twigs, pot: in a pot, wall: a band this many feet deep along
// a fence.
export const LOOK = {
  peony: { leafDensity: 2.5, leaf: "#55793f", flower: "#e58fb0", fall: "#9a4a2e", shape: "pompons", habit: "dome", ft: 2.75, wide: 2.5, leaves: 0.88, foliage: "compound", leafIn: 10, flowerIn: 5.5, blooms: 14,
    stage: { emerging: { leaf: "#8a2f3a", h: 0.3 }, "fall-color": { h: 0.85 } } },
  dahlia: { leaf: "#3f6a35", flower: "#f08a6a", shape: "pompons", ft: 3, wide: 2.5, leaves: 0.7, foliage: "compound", leafIn: 10, flowerIn: 4, blooms: 9,
    stage: { emerging: { leaf: "#4f7040", h: 0.15 }, "frost-blackened": { leaf: "#2b2622", h: 0.75 } } },
  foxglove: { leaf: "#668a54", flower: "#b45ea0", shape: "spikes", ft: 4, wide: 1.5, leaves: 0.25, growFrom: 0.6, foliage: "broad", leafIn: 9, spikeIn: [18, 3.5], spikes: 2,
    stage: { rosette: { leaf: "#6d8a5c" } } },
  "straw-foxglove": { leaf: "#557a44", flower: "#efe08a", shape: "spikes", leafyStems: true, ft: 2.5, wide: 1.25, leaves: 0.55, foliage: "lance", leafIn: 7, spikeIn: [10, 2.5], spikes: 5 },
  hellebore: { nod: true, leafTilt: 0.8, leaf: "#33573a", flower: "#b97a95", shape: "mound", habit: "crown", ft: 1.5, wide: 2, leaves: 0.95, foliage: "palmate", leafIn: 8, bloom: "cup", flowerIn: 2.75, blooms: 20 },
  "bleeding-heart-fernleaf": { leafDensity: 2.2, growFrom: 0.7, leaf: "#9ab5a5", flower: "#d86b9c", shape: "mound", habit: "basal", ft: 1.25, wide: 1.25, leaves: 0.7, foliage: "fern", leafIn: 6, bloom: "bells", flowerIn: 2, blooms: 24 },
  coneflower: { leaf: "#3f6033", flower: "#c773a8", shape: "daisies", ft: 3, wide: 1.75, leaves: 0.45, foliage: "broad", leafIn: 5.5, flowerIn: 4, blooms: 14, center: "#b5622a",
    winterStalks: "#3b2f26", growFrom: 0.3 },
  gaillardia: { sprawl: true, leaf: "#7d8c5c", flower: "#c9472d", shape: "daisies", ft: 2, wide: 1.5, leaves: 0.4, foliage: "lance", leafIn: 4.5, flowerIn: 3, blooms: 16, center: "#7a2a1e" },
  columbine: { nod: true, leafTilt: 0.8, leafyStems: true, leaf: "#7a9c8c", flower: "#7d63b2", shape: "mound", habit: "crown", ft: 2, wide: 1.25, leaves: 0.4, foliage: "trefoil", leafIn: 7, bloom: "star", flowerIn: 2, blooms: 20 },
  heuchera: { leaf: "#5c2a45", flower: "#f2e6e8", shape: "mound", habit: "crown", ft: 1.5, wide: 1.25, leaves: 0.5, foliage: "lobed", leafIn: 4, bloom: "spike", flowerIn: 6, blooms: 6 },
  iris: { leaf: "#6f9a6a", flower: "#6d5bd0", shape: "fan", ft: 2.75, wide: 1.5, leaves: 0.7, flowerIn: 4, blooms: 6 },
  "great-blue-lobelia": { leaf: "#7ea85a", flower: "#4a5fc9", shape: "spikes", leafyStems: true, ft: 2.5, wide: 1.25, leaves: 0.5, foliage: "lance", leafIn: 4, spikeIn: [9, 2], spikes: 6, growFrom: 0.2 },
  "penstemon-husker-red": { leaf: "#5e2a33", flower: "#f3ecef", shape: "spikes", ft: 2.5, wide: 1.5, leaves: 0.35, foliage: "lance", leafIn: 5, spikeIn: [9, 4], spikes: 8,
    stage: { evergreen: { leaf: "#5a2430" }, bloom: { leaf: "#4e3a33" }, seedheads: { leaf: "#4a5a35" } } },
  "salvia-may-night": { leaf: "#5d7d48", flower: "#4b2f8f", shape: "spikes", leafyStems: true, ft: 1.75, wide: 1.25, leaves: 0.4, foliage: "lance", leafIn: 3, spikeIn: [6, 0.9], spikes: 40 },
  geum: { leafTilt: 0.8, leaf: "#5f8a45", flower: "#e2502a", shape: "mound", habit: "crown", ft: 1.75, wide: 1.25, leaves: 0.35, foliage: "compound", leafIn: 6, bloom: "star", flowerIn: 1.4, blooms: 14 },
  "ladys-mantle": { leafTilt: 1, leaf: "#9dbb6a", flower: "#cfdc5a", shape: "mound", habit: "crown", ft: 1.25, wide: 2, leaves: 0.75, foliage: "round", leafIn: 4.5, bloom: "bells", flowerIn: 3, blooms: 16 },
  "bee-balm-or-phlox": { leafDensity: 1.5, leaf: "#4f7a3e", flower: "#d65fa8", shape: "daisies", ft: 3, wide: 2, leaves: 0.8, foliage: "lance", leafIn: 4.5, bloom: "cluster", flowerIn: 7, blooms: 12, growFrom: 0.2 },
  "baptisia-or-rose": { leaf: "#6f8f96", flower: "#4b4fb0", shape: "spikes", ft: 3.5, wide: 3, leaves: 0.75, leafDensity: 1.6, foliage: "sprig", leafIn: 6, spikeIn: [9, 2], spikes: 16,
    winterStalks: "#2f2b28" },
  "ninebark-or-currant": { leafDensity: 1.5, blooms: 45, bark: "#7a5a45", leaf: "#4f6e35", flower: "#f3ece6", fall: "#c9a64a", shrub: true, shape: "canes", ft: 5, wide: 4, foliage: "lobed", leafIn: 3, bloom: "cluster", flowerIn: 2.2 },
  "jacobs-ladder": { leafDensity: 1.8, growFrom: 0.6, leaf: "#6f9a45", flower: "#6d7fd1", shape: "mound", habit: "basal", ft: 1.75, wide: 1.5, leaves: 0.7, foliage: "fern", leafIn: 8, bloom: "bells", flowerIn: 2.5, blooms: 14 },
  "hardy-geranium": { leaf: "#4f7a36", flower: "#6a6fc8", shape: "mound", ft: 1.5, wide: 2, leaves: 0.85, foliage: "lobed", leafIn: 3, bloom: "star", flowerIn: 2.25, blooms: 24 },
  "rose-campion-or-lambs-ear": { roundTop: true, leaf: "#b4bcb0", flower: "#c0187a", shape: "mound", habit: "basal", ft: 2.5, wide: 1.75, leaves: 0.3, foliage: "broad", leafIn: 4, bloom: "star", flowerIn: 1.1, blooms: 50 },
  "sneezeweed-or-heliopsis": { leafDensity: 1.6, habit: "stems", leaf: "#4f7a36", flower: "#e8b81c", shape: "daisies", ft: 3.5, wide: 2, leaves: 0.6, foliage: "lance", leafIn: 4.5, flowerIn: 1.75, blooms: 70, center: "#6a4a1e", growFrom: 0.15 },
  "aster-or-fleabane": { leafDensity: 2.2, leaf: "#4a6b30", flower: "#7b4fb3", shape: "daisies", ft: 3.5, wide: 2, leaves: 0.7, foliage: "lance", leafIn: 3, bloom: "daisy", flowerIn: 1.6, blooms: 120, center: "#e0c04a",
    winterStalks: "#6a5848", growFrom: 0.15 },
  "iris-or-daylily": { leaf: "#5f8a45", flower: "#e0661f", shape: "fan", ft: 3, wide: 2, leaves: 0.6, foliage: "straps", bloom: "iris", flowerIn: 4.5, blooms: 8 },
  "unknown-perennial": { leaf: "#5f8f45", shape: "mound", ft: 1.5, wide: 1.5, foliage: "broad", leafIn: 3.5, growFrom: 0.3 },
  "wild-asters-goldenrod": { leafDensity: 2.2, leaf: "#4f7a3a", flower: "#f4f1e8", shape: "daisies", ft: 4, wide: 2, leaves: 0.7, // white wood asters: small white daisies with yellow middles
    foliage: "lance", leafIn: 4, bloom: "daisy", flowerIn: 2.2, blooms: 110, center: "#e3b51e", winterStalks: "#8a7458", growFrom: 0.15 },
  "balloon-flower": { leaf: "#6f8e64", flower: "#5b6fd0", shape: "mound", ft: 1, wide: 1.25, leaves: 0.75, habit: "stems", foliage: "broad", leafIn: 2, bloom: "star", flowerIn: 2.5, blooms: 10 },
  blueberry: { blooms: 30, bark: "#8a3b2e", leaf: "#4f7a4a", flower: "#f4ece6", fruit: "#3f4f9a", fall: "#c0392b", shrub: true, shape: "shrub", ft: 3.5, wide: 2.5, foliage: "broad", leafIn: 2.25, bloom: "bells", flowerIn: 2.5,
    stage: { leafing: { buds: "#e7a3b4" } }, months: { 5: { fruit: "#93ad62" } } }, // pink flower buds in April; June berries still green
  "raspberry-fall": { leafDensity: 2, bark: "#7a5a44", leaf: "#557a36", flower: "#f5f2ea", fruit: "#c0263b", fall: "#c9a63a", shrub: true, shape: "canes", ft: 5, wide: 1.5, foliage: "compound", leafIn: 6, annualCanes: true, growFrom: 0.15 },
  "panicle-hydrangea": { blooms: 30, bark: "#8c7a62", leaf: "#3f6b35", flower: "#e3ebc4", aging: "#c98a9a", shrub: true, shape: "shrub", ft: 6, wide: 2, foliage: "broad", leafIn: 4.5, flowerIn: 8 },
  hosta: { leaf: "#4f7d3a", flower: "#c9b8e0", fall: "#d4b44a", shape: "mound", habit: "crown", ft: 2.5, wide: 3, leaves: 0.7, foliage: "broad", leafIn: 8, bloom: "spike", flowerIn: 8, blooms: 8,
    stage: { emerging: { h: 0.3 } } },
  lilac: { leafDensity: 1.9, blooms: 120, bark: "#6f6a62", leaf: "#3a5f3a", flower: "#b48ccf", shrub: true, shape: "shrub", ft: 10, wide: 2.67, foliage: "broad", leafIn: 3.5, flowerIn: 7 },
  cosmos: { leafDensity: 1.5, leaf: "#5f8f3a", flower: "#e48fbf", shape: "daisies", ft: 4.5, wide: 2, leaves: 0.7, foliage: "thread", leafIn: 4.5, flowerIn: 3.5, blooms: 30, center: "#e8c23b" },
  "brussels-sprouts": { leaf: "#5e8578", fruit: "#8fb06a", pot: true, shape: "crop", ft: 2.5, wide: 1.75, stalk: true, foliage: "broad", leafIn: 12 },
  loofah: { climbsArch: true, leaf: "#4f8a34", flower: "#f5d327", fruit: "#6f8a3a", shape: "climber", ft: 7, wide: 2, support: false, foliage: "lobed", leafIn: 8, flowerIn: 3,
    fruitShape: "long", fruitSize: 0.2, fruitLen: 1.4 },
  honeydew: { habit: "vine", leaf: "#4a7a35", fruit: "#d9e3a0", shape: "sprawler", ft: 1.25, wide: 3, foliage: "round", leafIn: 4.5, fruitSize: 0.3 },
  cucumber: { leaf: "#5a8f3c", fruit: "#23461a", flower: "#f2d22e", bloom: "star", flowerIn: 1.5, shape: "climber", ft: 5, wide: 1.67, foliage: "lobed", leafIn: 6, fruitShape: "long", fruitSize: 0.13, fruitLen: 0.6 },
  zucchini: { leaf: "#3f6e2e", fruit: "#2f5a2a", shape: "sprawler", ft: 2.5, wide: 2.33, foliage: "lobed", leafIn: 13, fruitShape: "long", fruitSize: 0.18, fruitLen: 0.65 },
  squash: { leaf: "#4a7533", fruit: "#e39b2b", shape: "sprawler", ft: 2, wide: 3, foliage: "lobed", leafIn: 10, fruitSize: 0.28 },
  peas: { leaf: "#7fa877", fruit: "#8fc464", shape: "climber", ft: 3, wide: 1.25, foliage: "compound", leafIn: 5, fruitShape: "long", fruitSize: 0.05, fruitLen: 0.25 },
  radish: { leaf: "#5f9440", shape: "mound", habit: "basal", ft: 0.45, wide: 1.25, foliage: "broad", leafIn: 5, root: "#d0344a", rootIn: 1.3, rootUp: 0.75, leafDensity: 0.7 },
  eggplant: { habit: "stems", leafDensity: 1.6, fruitShape: "drop", leaf: "#567848", fruit: "#3b1f4a", shape: "crop", ft: 2.5, wide: 1.67, foliage: "broad", leafIn: 8, fruitSize: 0.2, fruitLen: 0.55 },
  tomato: { leaf: "#3f7a33", fruit: "#d9412b", shape: "crop", ft: 4.5, wide: 1.39, cage: true, foliage: "compound", leafIn: 12, fruitSize: 0.14,
    stage: { "frost-blackened": { h: 0.85 } } },
  beet: { leaf: "#3f6b3a", shape: "mound", habit: "basal", ft: 1.1, wide: 1.25, foliage: "broad", leafIn: 6, root: "#7a1f3d", rootIn: 2.5, upright: true },
  "ground-cherry": { habit: "branched", leaf: "#8fae7a", fruit: "#d8c08a", fruitSize: 0.06, shape: "mound", ft: 1.5, wide: 2.5, foliage: "broad", leafIn: 2.5 },
  nasturtium: { leaf: "#6fa34f", flower: "#f08a24", shape: "mound", habit: "trailing", leafDensity: 1.6, ft: 1, wide: 2, leaves: 0.85, foliage: "round", leafIn: 3, bloom: "star", flowerIn: 2, blooms: 30,
    stage: { seedling: { spread: 0.4 }, foliage: { spread: 0.7 } } }, // seedlings in May, young plants in June
  asparagus: { leaf: "#7fae55", fall: "#d8b44a", shape: "feathery", ft: 4, wide: 1.67, foliage: "thread", leafIn: 18, spears: true },
  dill: { leaf: "#7fa36a", flower: "#d8c83a", shape: "feathery", ft: 3.5, wide: 1.5, foliage: "thread", leafIn: 9, flowerIn: 4.5, stage: { seedling: { h: 0.12 } } },
  basil: { leafDensity: 2.5, leaf: "#3f8a35", shape: "mound", habit: "stems", ft: 1.5, wide: 1.56, foliage: "broad", leafIn: 2.75 },
};

// Per-plant touches where plants of one kind look different.
export const PLANT_LOOK = {
  "pb-39": { leaf: "#5e2350" },   // purple ruffled coral bells
  "pb-48": { leaf: "#a7b0a4" },   // silver-veined coral bells
  "pb-50": { leaf: "#b8577f" },   // pink/purple speckled coral bells
  "pb-hosta": { leaf: "#7fa3a8", flower: "#eeeaf0", ft: 2.5, wide: 4, leaves: 0.9, foliage: "round", leafIn: 12 }, // big blue-green hosta ('Elegans' type)
  "pb-14": { ft: 4 },   // tall dahlia with purple stems
  "is-hydrangea-limelight": { ft: 7, wide: 2.33, flowerIn: 10 },
  "is-hydrangea-littlelime": { ft: 4, wide: 2, flowerIn: 6 },
  // Named dahlias: flower colors from the Fivefork Farms order photos; heights and bloom sizes from the growers
  "ds-1": { flower: "#e8bfc0", ft: 4.5, flowerIn: 9 },   // Cafe Au Lait, dinnerplate
  "ds-2": { flower: "#f3d9bf", ft: 4.5, flowerIn: 5.5 },   // Bloomquist Alan
  "ds-3": { flower: "#f4c88f", ft: 4, flowerIn: 5 },   // Miss Amara
  "ds-4": { flower: "#f2a283", ft: 3.5, flowerIn: 4.5 },   // Henriette
  "ds-5": { flower: "#c8765a", ft: 4.5, flowerIn: 6.5 },   // Andy's Legacy
  "ds-6": { flower: "#ee9a78", ft: 3.75, flowerIn: 4 },   // Hapet Salmon, ball
  "ds-7": { flower: "#ec8a5a", ft: 4.5, flowerIn: 5 },   // Terracotta
  "pb-06b": { flower: "#f5dfae", ft: 5, flowerIn: 5 },   // Sheer Heaven
  "pb-09": { flower: "#e0245e", ft: 4.5, flowerIn: 4 },   // Ed Kuhn, ball
  "is-dahlia-1": { flower: "#d9a7c8", ft: 4.5, flowerIn: 3.5 },   // Wine Eyed Jill
  "is-dahlia-2": { flower: "#e0518a", ft: 3.5, flowerIn: 9 },   // Omega, dinnerplate
  "is-dahlia-3": { flower: "#e87f2d", ft: 4.5, flowerIn: 5 },   // Old Gold
  "is-dahlia-4": { flower: "#ee7a7a", ft: 4.5, flowerIn: 10 },   // Belle of Barmera, giant
  "is-dahlia-5": { flower: "#e8a090", ft: 4, flowerIn: 7 },   // Labyrinth
  "is-dahlia-6": { flower: "#c0302a", ft: 3.5, flowerIn: 7 },   // Ketchup and Mustard
  "is-dahlia-7": { flower: "#f3e2dc", ft: 3.5, flowerIn: 3 },   // Valley Porcupine
  "is-dahlia-8": { flower: "#5e1a2c", ft: 4.5, flowerIn: 5 },   // Lynn Slight
  "is-dahlia-9": { flower: "#a8274f", ft: 4.25, flowerIn: 6.5 },   // Patches
  "is-dahlia-10": { flower: "#b58ad0", ft: 3.5, flowerIn: 3 },   // Crazy Cleere's, miniature ball
};

const DAHLIA_COLORS = ["#f08a6a", "#f4b183", "#e85d75", "#f6efe6", "#c43d5a", "#f0a2b8", "#e87f2d", "#7a1f3d"];

export function lookFor(plant) {
  const base = LOOK[plant.speciesId] || {};
  const look = { leaf: LEAF, flower: "#e8e0f0", fruit: "#c0392b", fall: "#c9772e", aging: "#d9b3a3", h: 1, ...base, ...PLANT_LOOK[plant.id] };
  if (plant.speciesId === "dahlia" && !PLANT_LOOK[plant.id]?.flower) { // seed-grown dahlias without a name get a varied color
    let hash = 0;
    for (const ch of plant.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    look.flower = DAHLIA_COLORS[hash % DAHLIA_COLORS.length];
  }
  return look;
}

const feet = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
// How far a plant spreads from its middle, in feet, as the 3D yard draws it: half its "width" (feet across) in
// plants.json if it has one, or else its kind's usual width ("wide", or an old rough guess) scaled by "size".
export function plantRadius(plant, sp) {
  if (feet(plant.width)) return plant.width / 2;
  return usualRadius(plant, sp) * (plant.size || 1);
}
function usualRadius(plant, sp) {
  const look = lookFor(plant);
  if (feet(look.wide)) return look.wide / 2;
  return look.shrub || sp?.kind === "shrub" ? 1.1 : 0.75;
}
// How much bigger or smaller than usual a plant is drawn across (1 = usual), for the size of its leaves and flowers.
export function widthScale(plant, sp) {
  return plantRadius(plant, sp) / usualRadius(plant, sp);
}
// How tall a plant is when fully grown, in feet: "height" in plants.json if it's been set, or else worked out
// from its width and kind (so a plant made wider grows taller too, until it has a height of its own).
export function plantHeight(plant, sp) {
  if (feet(plant.height)) return plant.height;
  const look = lookFor(plant);
  if (feet(look.ft)) return look.ft;
  return Math.max(0.3, plantRadius(plant, sp) * 1.2 * look.h);
}

// The shape types a plant can be drawn as (app/shapes.js draws them), in the order they're offered on its card.
export const SHAPES = [
  { id: "spikes", name: "Spikes", about: "A leafy clump with upright flower spires." },
  { id: "daisies", name: "Daisies", about: "Upright stems topped with flat, daisy-like flowers." },
  { id: "pompons", name: "Big round blooms", about: "A bushy clump with big round flowers on top." },
  { id: "mound", name: "Low mound", about: "A low dome of leaves with small flowers on or just above it." },
  { id: "fan", name: "Strappy fan", about: "Sword- or strap-shaped leaves in a fan, with flowers on stalks." },
  { id: "grass", name: "Fountain grass", about: "Thin blades arching out like a fountain, with plumes." },
  { id: "shrub", name: "Rounded shrub", about: "Woody stems under a round canopy, with flower clusters or berries." },
  { id: "canes", name: "Canes", about: "A vase of long canes with leaves along them." },
  { id: "climber", name: "Climbing vine", about: "A column of leaves up a support, with hanging fruit." },
  { id: "sprawler", name: "Sprawling vine", about: "Big leaves spread low over the ground, with fruit underneath." },
  { id: "crop", name: "Upright crop", about: "A staked or caged stem with leaves and hanging fruit." },
  { id: "feathery", name: "Feathery", about: "Fine, ferny fronds, with flat flower heads on top." },
];
const SHAPE_IDS = new Set(SHAPES.map((s) => s.id));
// The shape a plant is drawn as: its own if one was chosen on its card, or else its kind's.
export function shapeFor(plant) {
  if (SHAPE_IDS.has(plant.shape)) return plant.shape;
  const k = LOOK[plant.speciesId]?.shape;
  return SHAPE_IDS.has(k) ? k : "mound";
}
const halfFeet = (ft) => Math.max(0.5, Math.round(ft * 2) / 2);
const tenth = (ft) => Math.round(ft * 10) / 10;
// "3 ft across" and "4.5 ft tall" for sizes that were entered, or "about 3 ft across" (to the nearest half
// foot) for ones worked out from the plant's kind.
export const acrossText = (plant, sp) => (feet(plant.width) ? `${tenth(plant.width)} ft across` : `about ${halfFeet(plantRadius(plant, sp) * 2)} ft across`);
export const tallText = (plant, sp) => (feet(plant.height) ? `${tenth(plant.height)} ft tall` : `about ${halfFeet(plantHeight(plant, sp))} ft tall`);
export const stemsText = (n) => `${n} main ${n === 1 ? "stem" : "stems"}`;

// What a vine can grow on, chosen per plant on its card ("support" in plants.json). Without a choice, a vine
// grows the way its kind usually does: luffa over the nearby arch, cucumbers and peas up a few stakes, melons
// and squash along the ground.
export const SUPPORTS = [
  { id: "arch", name: "The arch", about: "Up the nearest arch trellis and over the top." },
  { id: "trellis", name: "A trellis", about: "Straight up a flat trellis panel." },
  { id: "pole", name: "A pole", about: "Wound up a single pole or stake." },
  { id: "ground", name: "The ground", about: "Sprawling over the ground." },
];
const SUPPORT_IDS = new Set(SUPPORTS.map((s) => s.id));
export const isSupport = (v) => SUPPORT_IDS.has(v);
// Whether a plant is a vine that can be given something to grow on (climbing and sprawling vines).
export const isVine = (plant) => ["climber", "sprawler"].includes(shapeFor(plant));
// What a vine grows on: its own choice, or null for its kind's usual way.
export const supportFor = (plant) => (isVine(plant) && isSupport(plant.support) ? plant.support : null);
