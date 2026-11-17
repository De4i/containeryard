// CONTAINER YARD: the numbers, the palette and the two tables that decide a fight — the weapons and
// the teams. Bright daylight on a working quay, everything drawn from boxes and simple materials, so
// the game is a static build with no asset files at all.
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

/** The two sides: uniform colours, so a silhouette says whose it is from the far side of the yard. */
export const TEAMS = {
  blue: { key: 'blue', name: 'QUAY CREW', uniform: 0x2f6ea8, vest: 0x24405c, helmet: 0x1d3350, helmetTint: 0x9fd0ff, accent: '#8fd0ff' },
  red: { key: 'red', name: 'SALVAGE GANG', uniform: 0xa8442f, vest: 0x5c2a20, helmet: 0x50201a, helmetTint: 0xffb0a0, accent: '#ff9c86' },
};

/** The dock's own palette: concrete, rust, containers and the sea beyond the quay. */
export const PALETTE = {
  sky: 0x8ecfe6,
  horizon: 0xd8ecf2,
  sun: 0xfff2cf,
  concrete: 0xb8b3a8,
  concreteDark: 0x8f8a80,
  paint: 0xe6e0cf,
  rust: 0x8a5a34,
  steel: 0x6f7780,
  steelDark: 0x4c545c,
  fence: 0x9aa3a8,
  water: 0x2f7f9c,
  waterLight: 0x6fbdd4,
  warehouse: 0xc9c3b4,
  warehouseRoof: 0x7d8488,
  containers: [0xb5563c, 0x2f7f7c, 0xd9c79a, 0x6f7f52, 0x8c5b6b, 0x3f6a93, 0xc08442, 0x7a8b93],
  beacon: 0xffcf5c,
  beaconHot: 0xff7a4d,
};

/** Fog: how far the yard stays crisp before the haze takes it. */
export const ATMOSPHERE = { fogNear: 70, fogFar: 210 };

/** A shared colour lookup so materials are created once, not per box. */
const materials = new Map();
export function material(color, { roughness = 0.9, metalness = 0.05, flat = false } = {}) {
  const key = `${color}-${roughness}-${metalness}-${flat}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: flat }));
  }
  return materials.get(key);
}
