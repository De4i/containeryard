// The yard itself: a working quay of concrete, stacked freight, two gantry cranes and the water
// beyond. Everything here is built from boxes and given a collision volume, so what a player sees is
// what a bullet and a body meet. The two cranes are the yard's one moving part: between rounds they
// swing new containers across the lanes and the map is drawn again.
import * as THREE from 'three';
import { ATMOSPHERE, PALETTE, YARD, material } from './config.js';

/** A box solid: its centre, its half-extents, and whether it stops a body, a bullet, or both. */
function solid(x, y, z, sx, sy, sz, kind = 'both') {
  return { x, y, z, sx, sy, sz, kind };
}

/** One box in the world, optionally with its own colour rather than the palette's material. */
function box(scene, { x, y, z, sx, sy, sz, color, roughness = 0.9, receive = true, cast = true, rotate = 0 }) {
  const geometry = new THREE.BoxGeometry(sx, sy, sz);
  const mesh = new THREE.Mesh(geometry, material(color, { roughness }));
  mesh.position.set(x, y, z);
  if (rotate) mesh.rotation.y = rotate;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  scene.add(mesh);
  return mesh;
}

/** A shipping container: a body, a ribbed side and a pair of door posts, at `colour`. */
function container(scene, x, y, z, colour, rotate = 0, length = 12.2) {
  const group = new THREE.Group();
  const width = 2.6;
  const height = 2.9;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(length, height, width), material(colour, { roughness: 0.85 }));
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);
  const rib = new THREE.Mesh(new THREE.BoxGeometry(length * 0.98, height * 0.72, width + 0.08), material(colour, { roughness: 0.98 }));
  rib.position.y = -0.05;
  rib.castShadow = true;
  group.add(rib);
  for (const end of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.18, height * 0.94, width * 0.94), material(0x3d3a35, { roughness: 1 }));
    door.position.x = end * (length / 2 - 0.1);
    door.castShadow = true;
    group.add(door);
  }
  group.position.set(x, y, z);
  group.rotation.y = rotate;
  scene.add(group);
  return {
    group,
    solid: solid(x, y, z, rotate ? width / 2 : length / 2, height / 2, rotate ? length / 2 : width / 2),
  };
}

/** A gantry crane: two legs, a top beam, and a trolley that carries whatever hangs from it. */
function gantry(scene, x, z, span = 44) {
  const legs = [];
  for (const side of [-1, 1]) {
    const legZ = z + side * 8;
    box(scene, { x, y: 6.5, z: legZ, sx: 1.2, sy: 13, sz: 1.2, color: PALETTE.steelDark });
    box(scene, { x, y: 0.4, z: legZ, sx: 3.2, sy: 0.8, sz: 3.2, color: PALETTE.steel });
    legs.push(solid(x, 6.5, legZ, 0.6, 6.5, 0.6));
    legs.push(solid(x, 0.4, legZ, 1.6, 0.4, 1.6));
  }
  box(scene, { x, y: 13.2, z, sx: 2.4, sy: 1.1, sz: span + 3, color: PALETTE.rust });
  const trolley = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.6), material(PALETTE.steel, { metalness: 0.3 }));
  body.castShadow = true;
  trolley.add(body);
  trolley.position.set(x, 12.3, z);
  scene.add(trolley);
  return { x, z, trolley, legs };
}

/** Concrete paint: a few stripes of a road, drawn flat on the deck. */
function roadPaint(scene, halfX, halfZ) {
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.5, halfZ * 1.6), material(PALETTE.paint, { roughness: 1 }));
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0.05, 0.02, 0);
  scene.add(stripe);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.4, halfZ * 1.9), material(PALETTE.paint, { roughness: 1 }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(side * (halfX - 3), 0.02, 0);
    scene.add(edge);
  }
}

/** Light masts: the tall poles that make a working yard look worked. */
function lightMast(scene, x, z) {
  box(scene, { x, y: 5, z, sx: 0.5, sy: 10, sz: 0.5, color: PALETTE.steelDark });
  box(scene, { x: x + 1.1, y: 9.8, z, sx: 2.4, sy: 0.4, sz: 0.8, color: PALETTE.steel });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.7), material(PALETTE.beacon, { roughness: 0.4 }));
  lamp.position.set(x + 1.9, 9.5, z);
  scene.add(lamp);
  return solid(x, 5, z, 0.25, 5, 0.25);
}

/**
 * Build the whole yard into `scene`, and return what the game needs from it: the solids to collide
 * against, where each side starts, the objective at the middle, and the two cranes.
 */
export function buildYard(scene) {
  const solids = [];
  const { halfX, halfZ } = YARD;

  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.horizon, ATMOSPHERE.fogNear * 1.5, ATMOSPHERE.fogFar * 1.4);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 16),
    new THREE.MeshBasicMaterial({ color: PALETTE.sky, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Sea, then the quay slab on top of it.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.25, metalness: 0.1 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = YARD.waterY;
  scene.add(sea);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2, YARD.deckThickness, halfZ * 2), material(PALETTE.concrete, { roughness: 1 }));
  deck.position.y = -YARD.deckThickness / 2;
  deck.receiveShadow = true;
  scene.add(deck);
  solids.push(solid(0, -0.5, 0, halfX, 0.5, halfZ, 'bullet'));
  roadPaint(scene, halfX, halfZ);

  // The quay's edge: bollards, so the water has a lip instead of a line.
  for (let index = -3; index <= 3; index += 1) {
    for (const side of [-1, 1]) {
      box(scene, { x: side * (halfX - 1.2), y: 0.5, z: index * 6, sx: 0.9, sy: 1, sz: 0.9, color: PALETTE.rust });
      solids.push(solid(side * (halfX - 1.2), 0.5, index * 6, 0.45, 0.5, 0.45));
    }
  }

  // Warehouse along one long side, with a roller door and a few crates against it.
  for (let index = 0; index < 3; index += 1) {
    const z = -halfZ + 6 + index * 16;
    box(scene, { x: -halfX + 6, y: 4, z, sx: 12, sy: 8, sz: 15, color: PALETTE.warehouse });
    box(scene, { x: -halfX + 6, y: 8.3, z, sx: 12.6, sy: 0.6, sz: 15.6, color: PALETTE.warehouseRoof });
    solids.push(solid(-halfX + 6, 4, z, 6, 4, 7.5));
    box(scene, { x: -halfX + 12.2, y: 1.6, z: z + 3, sx: 1.2, sy: 3.2, sz: 3.4, color: PALETTE.rust });
  }

  // The fence with its gate, on the opposite side, and the light masts down the yard.
  for (let index = -3; index <= 3; index += 1) {
    const z = index * 7;
    box(scene, { x: halfX - 1.4, y: 1.6, z, sx: 0.18, sy: 3.2, sz: 7, color: PALETTE.fence, cast: false });
    solids.push(solid(halfX - 1.4, 1.6, z, 0.1, 1.6, 3.5));
  }
  for (const [x, z] of [[-halfX + 3, -halfZ + 4], [-halfX + 3, halfZ - 4], [halfX - 3, -halfZ + 4], [halfX - 3, halfZ - 4], [0, -halfZ + 2], [0, halfZ - 2]]) {
    solids.push(lightMast(scene, x, z));
  }

  // Freight: rows of containers with lanes between them. The lanes are the battle lines, so the
  // gaps are on purpose and the same every match.
  const rows = [
    { z: -16, xs: [-24, -8, 8, 24], rotate: 0 },
    { z: -8.5, xs: [-16, 0, 16], rotate: 0 },
    { z: 0, xs: [-28, -14, 14, 28], rotate: 0 },
    { z: 8.5, xs: [-16, 0, 16], rotate: 0 },
    { z: 16, xs: [-24, -8, 8, 24], rotate: 0 },
  ];
  const craneContainers = [];
  for (const row of rows) {
    for (const x of row.xs) {
      const colour = PALETTE.containers[(Math.abs(Math.round(x + row.z)) % PALETTE.containers.length)];
      const built = container(scene, x, 1.45, row.z, colour, row.rotate);
      solids.push(built.solid);
      // A second container on top on some stacks: cover that also blocks the long sight lines.
      if (Math.abs(x) > 10 && Math.random() > 0.55) {
        const higher = container(scene, x, 4.35, row.z, PALETTE.containers[(Math.abs(Math.round(x)) + 3) % PALETTE.containers.length], row.rotate);
        solids.push(higher.solid);
      }
    }
  }

  // Pallets, drums and a parked yard tractor: small dressing that reads as a working quay.
  for (const [x, z] of [[-20, -21], [6, -21.5], [22, -20.5], [-12, 21], [10, 20.5], [26, 21.5]]) {
    box(scene, { x, y: 0.45, z, sx: 2.2, sy: 0.9, sz: 1.6, color: PALETTE.rust });
    solids.push(solid(x, 0.45, z, 1.1, 0.45, 0.8));
  }
  for (const [x, z] of [[-4, -21], [4, 21], [-30, 6], [30, -6]]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.7, 12), material(PALETTE.steel, { metalness: 0.2 }));
    drum.position.set(x, 0.85, z);
    drum.castShadow = true;
    scene.add(drum);
    solids.push(solid(x, 0.85, z, 0.6, 0.85, 0.6));
  }

  const cranes = [gantry(scene, -18, 0), gantry(scene, 18, 0)];
  for (const crane of cranes) solids.push(...crane.legs);

  // The objective: a marked circle at the middle of the yard with a beacon crate inside it.
  const objective = { x: 0, y: 0, z: 0, radius: 4.2 };
  const ring = new THREE.Mesh(new THREE.RingGeometry(objective.radius - 0.35, objective.radius, 48), new THREE.MeshBasicMaterial({ color: PALETTE.beacon, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(objective.x, 0.05, objective.z);
  scene.add(ring);
  const crate = box(scene, { x: objective.x, y: 1.1, z: objective.z, sx: 2.4, sy: 2.2, sz: 2.4, color: PALETTE.beacon });
  solids.push(solid(objective.x, 1.1, objective.z, 1.2, 1.1, 1.2));

  // Spawns: each side gets a corner of its own end, clear of the freight rows.
  const spawns = {
    blue: [[-26, -22], [-19, -22], [-12, -22], [-5, -22], [2, -22]],
    red: [[26, 22], [19, 22], [12, 22], [5, 22], [-2, 22]],
  };

  return { solids, spawns, objective, cranes, craneContainers, ring, crate, halfX, halfZ };
}

/** The sun and the sky's light: bright, high and slightly warm, with a long shadow across the yard. */
export function lightYard(scene) {
  const hemi = new THREE.HemisphereLight(PALETTE.sky, PALETTE.concrete, 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-52, 78, 44);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const span = 62;
  sun.shadow.camera.left = -span;
  sun.shadow.camera.right = span;
  sun.shadow.camera.top = span;
  sun.shadow.camera.bottom = -span;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}
