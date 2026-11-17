// CONTAINER YARD: the numbers, the palette and the tables that decide a match — the weapons, the
// modes, the maps and the two sides. Names are drawn from pools per match, so no two matches read
// the same: the sides are still keyed blue and red internally, but nothing on screen says "BLUE".
import * as THREE from 'three';

/** The quay: how far the concrete runs, how high the walls are, and where the water sits. */
export const YARD = {
  halfX: 40,
  halfZ: 26,
  quayY: 0,
  waterY: -3.2,
  wallHeight: 7,
  deckThickness: 0.6,
};

/** How many rounds a match is, how many fighters a side, and the clock on one round. */
export const MATCH = {
  roundsToWin: 3,
  teamSize: 5,
  roundSeconds: 150,
  capSeconds: 7,
  respawnSeconds: 0,
  freezeSeconds: 3,
  step: 1 / 60,
  maxFrameDt: 0.05,
};

/** The seven weapons, as a table: what they hit for, how fast, how far they reach, how they sound. */
export const WEAPONS = [
  { key: 'pistol', name: 'MK9 SIDEARM', damage: 22, rpm: 320, spread: 0.012, range: 90, fire: 'semi', magazine: 15, reload: 1.5, tracer: '#ffe9a8', pitch: 620, kick: 0.6 },
  { key: 'rifle', name: 'AR-14 RIFLE', damage: 26, rpm: 620, spread: 0.02, range: 110, fire: 'auto', magazine: 30, reload: 2.2, tracer: '#ffd98a', pitch: 480, kick: 0.5 },
  { key: 'smg', name: 'VX-4 SMG', damage: 17, rpm: 900, spread: 0.032, range: 60, fire: 'auto', magazine: 34, reload: 1.9, tracer: '#ffe0b0', pitch: 700, kick: 0.35 },
  { key: 'shotgun', name: 'BREACHER 12', damage: 12, pellets: 8, rpm: 75, spread: 0.09, range: 26, fire: 'semi', magazine: 6, reload: 2.6, tracer: '#ffcf7a', pitch: 300, kick: 1.4 },
  { key: 'sniper', name: 'LONGVIEW .338', damage: 92, rpm: 45, spread: 0.002, range: 200, fire: 'semi', magazine: 5, reload: 3, tracer: '#fff3c4', pitch: 240, kick: 2.1 },
  { key: 'rpg', name: 'SALVO 84', damage: 120, splash: 6, rpm: 30, spread: 0.01, range: 150, fire: 'semi', magazine: 1, reload: 3.6, tracer: '#ff9a5a', pitch: 180, kick: 2.6 },
  { key: 'minigun', name: 'HORNET CHAIN', damage: 14, rpm: 1000, spread: 0.05, range: 80, fire: 'auto', magazine: 120, reload: 4.5, tracer: '#ffe27a', pitch: 560, kick: 0.3 },
];

/** Which weapons a fighter may carry: the market sells the others, the free ones start owned. */
export const FREE_WEAPONS = ['pistol', 'rifle', 'smg', 'shotgun'];
export const MARKET_WEAPONS = ['sniper', 'rpg', 'minigun'];

/** The two sides: uniform colours, so a silhouette says whose it is from the far side of the yard. */
export const TEAMS = {
  blue: { key: 'blue', name: 'QUAY CREW', uniform: 0x2f6ea8, vest: 0x24405c, helmet: 0x1d3350, helmetTint: 0x9fd0ff, accent: '#8fd0ff' },
  red: { key: 'red', name: 'SALVAGE GANG', uniform: 0xa8442f, vest: 0x5c2a20, helmet: 0x50201a, helmetTint: 0xffb0a0, accent: '#ff9c86' },
};

/**
 * The pools the names come from. A match draws one name per side and one callsign per fighter, so
 * the roster reads as people rather than as colour codes: no name on screen says "blue" or "red".
 */
export const TEAM_NAME_POOL = [
  'KESTREL HAUL', 'RUSTLINE', 'SALT HOUNDS', 'IRON TIDE', 'GRIT HARBOUR', 'COLD STACK',
  'BRINE WOLVES', 'TALLOW UNION', 'PIER NINE', 'BLACK DERRICK', 'ASH WORKS', 'COPPER CAY',
  'DEADWEIGHT', 'LANTERN ROW', 'STORM QUAY',
];

export const CALLSIGN_POOL = [
  'MAGPIE', 'TALLOW', 'BRICK', 'CINDER', 'HALYARD', 'GULL', 'PILOT', 'RATCHET', 'SLING',
  'TIDE', 'VULCAN', 'WARDEN', 'ANCHOR', 'BALLAST', 'CHALK', 'DIESEL', 'EBB', 'FLINT',
  'GANTRY', 'HOOK', 'JACKAL', 'KERB', 'LANTERN', 'MOOR', 'NITRO', 'OSPREY', 'PALLET',
  'QUARRY', 'RIG', 'SPAR', 'TUG', 'UMBER', 'VESSEL', 'WINCH', 'YARDARM', 'ZINC',
];

/**
 * The four modes. Each one changes how a match is won, in the rules rather than in the dressing —
 * `winKills` ends a match on team kills, `objective` decides whether the ring loads a manifest,
 * `bomb` runs the plant/defuse round, and `frontline` pushes a single contested line.
 */
export const MODES = [
  {
    key: 'tdm',
    name: 'TEAM DEATHMATCH',
    blurb: 'Two crews, no objective. First to 40 downs wins the match.',
    teams: true,
    winKills: 40,
    objective: false,
    bomb: false,
    frontline: false,
    roundSeconds: 300,
  },
  {
    key: 'ffa',
    name: 'FREE-FOR-ALL',
    blurb: 'Every fighter for themselves. First to 25 downs takes the yard.',
    teams: false,
    winKills: 25,
    objective: false,
    bomb: false,
    frontline: false,
    roundSeconds: 360,
  },
  {
    key: 'bomb',
    name: '5v5 BOMB SITE',
    blurb: 'Attackers plant the charge at the site; defenders hold it out or defuse. First to 3 rounds.',
    teams: true,
    winKills: 0,
    objective: true,
    bomb: true,
    frontline: false,
    roundSeconds: 120,
  },
  {
    key: 'frontline',
    name: 'FRONTLINE',
    blurb: 'One line, two pushes. Stand on the line to drive it into the enemy end.',
    teams: true,
    winKills: 0,
    objective: false,
    bomb: false,
    frontline: true,
    roundSeconds: 240,
  },
];

/**
 * The maps: the same quay re-laid three ways. Each entry reshapes the freight rows, the buildings
 * and the surface, so the cover and the sight lines differ — not a colour swap.
 */
export const MAPS = [
  {
    key: 'north',
    name: 'NORTH QUAY',
    blurb: 'Container lanes and two gantry cranes over an open apron.',
    layout: 'lanes',
    surface: 'concrete',
  },
  {
    key: 'depot',
    name: 'FREIGHT DEPOT',
    blurb: 'Tight stacked blocks, a low roof line, and asphalt roads between the pads.',
    layout: 'blocks',
    surface: 'asphalt',
  },
  {
    key: 'terminal',
    name: 'TERMINAL 4',
    blurb: 'Long warehouse frontage, a yard office, and a wide open loading apron.',
    layout: 'terminal',
    surface: 'mixed',
  },
];

/** Money: what a fighter takes home, and what the market charges for it. */
export const CASH = {
  start: 0,
  perKill: 40,
  perObjective: 120,
  perRoundWin: 200,
  perMatchWin: 500,
  lossConsolation: 120,
  market: {
    armor: [0, 250, 500, 900],          // the cost of each armour tier, index 0 is what you start with
    attributes: { speed: 300, armour: 350, damage: 450 },  // per level, level 1 is owned
    maxLevel: 5,
  },
};

/** What a market purchase does to a fighter, in real numbers the simulation reads. */
export const ATTRIBUTES = [
  { key: 'speed', name: 'BOOTS', blurb: '+4% walk speed per level', perLevel: 0.04 },
  { key: 'armour', name: 'PLATING', blurb: '+12 armour pool per level', perLevel: 12 },
  { key: 'damage', name: 'BARREL WORK', blurb: '+3% weapon damage per level', perLevel: 0.03 },
];

/** The market's own names for those attributes, so the shop and the rules agree. */
export const MARKET_NAMES = { speed: 'BOOTS', armour: 'PLATING', damage: 'BARREL WORK' };

/** The dock's own palette: concrete, asphalt, rust, containers and the sea beyond the quay. */
export const PALETTE = {
  sky: 0xa8e0f2,
  horizon: 0xe4f3f7,
  sun: 0xfff6dd,
  concrete: 0xc8c3b8,
  concreteDark: 0xa09a8e,
  asphalt: 0x585c60,
  asphaltDark: 0x46494d,
  gravel: 0xa89c86,
  paint: 0xf2ecd8,
  rust: 0x9a6438,
  steel: 0x7b838c,
  steelDark: 0x545c64,
  fence: 0xa8b1b6,
  water: 0x3d8fac,
  waterLight: 0x7fc9dd,
  warehouse: 0xd6d0c1,
  warehouseRoof: 0x8b9296,
  office: 0xe0d8c6,
  glass: 0x6fa8c4,
  containers: [0xb5563c, 0x2f7f7c, 0xd9c79a, 0x6f7f52, 0x8c5b6b, 0x3f6a93, 0xc08442, 0x7a8b93],
  beacon: 0xffcf5c,
  beaconHot: 0xff7a4d,
};

/** Fog: how far the yard stays crisp before the haze takes it. Pushed back for a bright, open day. */
export const ATMOSPHERE = { fogNear: 110, fogFar: 320 };

/** A shared colour lookup so materials are created once, not per box. */
const materials = new Map();
export function material(color, { roughness = 0.9, metalness = 0.05, flat = false } = {}) {
  const key = `${color}-${roughness}-${metalness}-${flat}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: flat }));
  }
  return materials.get(key);
}

/**
 * Draw a name per side and a callsign per fighter out of the pools, without repeats inside a match.
 * The sides keep their internal keys; only what a player reads changes.
 */
export function drawNames(random, teamSize) {
  const teams = [...TEAM_NAME_POOL];
  const fighters = [...CALLSIGN_POOL];
  const take = (list) => {
    const index = Math.floor(random.next() * list.length);
    return list.splice(index, 1)[0];
  };
  const names = { blue: take(teams), red: take(teams) };
  const callsigns = { blue: [], red: [] };
  for (const side of ['blue', 'red']) {
    for (let index = 0; index < teamSize; index += 1) callsigns[side].push(take(fighters));
  }
  return { names, callsigns };
}

/** Put the drawn names onto the team table so every existing message reads them. */
export function applyTeamNames(drawn) {
  TEAMS.blue.name = drawn.names.blue;
  TEAMS.red.name = drawn.names.red;
  return TEAMS;
}

/** The side a fighter's team key belongs to, for the cases that read by name. */
export function teamLabel(key) {
  return TEAMS[key]?.name ?? key;
}
