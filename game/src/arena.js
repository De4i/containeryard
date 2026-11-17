// The yard itself: a working quay of asphalt roads, concrete pads, gravel aprons, real buildings with
// roofs and windows, pipe runs, stair towers, railings, signage and the water beyond. Everything is
// built from geometry and given a collision volume, so what a player sees is what a bullet and a body
// meet. Three layouts are laid here — lanes, blocks and terminal — so choosing a map changes the
// cover and the sight lines rather than the colours.
import * as THREE from 'three';
import { ATMOSPHERE, PALETTE, YARD, material } from './config.js';

/** A box solid: its centre, its half-extents, and whether it stops a body, a bullet, or both. */
function solid(x, y, z, sx, sy, sz, kind = 'both') {
  return { x, y, z, sx, sy, sz, kind };
}

/** One box in the world, optionally with its own colour rather than the palette's material. */
function box(scene, { x, y, z, sx, sy, sz, color, roughness = 0.9, metalness = 0.05, receive = true, cast = true, rotate = 0, noSolid = true }) {
  const geometry = new THREE.BoxGeometry(sx, sy, sz);
  const mesh = new THREE.Mesh(geometry, material(color, { roughness, metalness }));
  mesh.position.set(x, y, z);
  if (rotate) mesh.rotation.y = rotate;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  scene.add(mesh);
  if (!noSolid) return mesh;
  return mesh;
}

/** A flat painted surface laid on the deck: road, pad, hatch or marking. */
function paint(scene, { x, z, sx, sz, color, y = 0.02, opacity = 1, rotate = 0 }) {
  const geometry = new THREE.PlaneGeometry(sx, sz);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color, roughness: 1, metalness: 0, transparent: opacity < 1, opacity,
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rotate;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/** A sign board: a painted face on a frame, drawn from a canvas so no asset file is needed. */
function sign(scene, { x, y, z, width = 6, height = 2, text, fg = '#fff6d8', bg = '#12333d', rotate = 0, post = true }) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round(512 * (height / width));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.fillStyle = fg;
  ctx.font = `800 ${Math.round(canvas.height * 0.42)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }));
  const group = new THREE.Group();
  face.position.set(0, 0, 0.06);
  group.add(face);
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.12), material(PALETTE.steelDark));
  group.add(back);
  if (post) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, y, 0.14), material(PALETTE.steelDark));
      leg.position.set(side * (width / 2 - 0.5), -y / 2, 0);
      leg.castShadow = true;
      group.add(leg);
    }
  }
  group.position.set(x, y, z);
  group.rotation.y = rotate;
  scene.add(group);
  return group;
}

/** A shipping container: a ribbed body, corner posts and a pair of doors, at `colour`. */
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
  // Corner posts, so a stack reads as containers rather than as one long box.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, height, 0.22), material(0x4a4640, { roughness: 0.95 }));
      post.position.set(sx * (length / 2 - 0.11), 0, sz * (width / 2 - 0.11));
      post.castShadow = true;
      group.add(post);
    }
  }
  group.position.set(x, y, z);
  group.rotation.y = rotate;
  scene.add(group);
  return {
    group,
    solid: solid(x, y, z, rotate ? width / 2 : length / 2, height / 2, rotate ? length / 2 : width / 2),
  };
}

/**
 * A building: a walled block with a roof that overhangs, a band of windows, a roller door and a sign.
 * `depth` runs along z, `width` along x; the roof sits above the walls so the silhouette is stepped.
 */
function building(scene, { x, z, width, depth, height, color = PALETTE.warehouse, roof = PALETTE.warehouseRoof, signText, rotate = 0, windows = true, door = true }) {
  const group = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color, { roughness: 0.95 }));
  walls.position.y = height / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.9, 0.7, depth + 0.9), material(roof, { roughness: 0.9 }));
  cap.position.y = height + 0.35;
  cap.castShadow = true;
  group.add(cap);
  // A parapet lip, so the roofline is not a flat plane.
  const lip = new THREE.Mesh(new THREE.BoxGeometry(width + 1.4, 0.35, depth + 1.4), material(roof, { roughness: 0.9 }));
  lip.position.y = height + 0.85;
  group.add(lip);
  if (windows) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, height * 0.16, 0.14), material(PALETTE.glass, { roughness: 0.3, metalness: 0.2 }));
    band.position.set(0, height * 0.72, depth / 2 + 0.06);
    group.add(band);
    const bandBack = band.clone();
    bandBack.position.z = -depth / 2 - 0.06;
    group.add(bandBack);
  }
  if (door) {
    const roller = new THREE.Mesh(new THREE.BoxGeometry(width * 0.3, height * 0.42, 0.2), material(PALETTE.rust, { roughness: 0.95 }));
    roller.position.set(0, height * 0.21, depth / 2 + 0.08);
    group.add(roller);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotate;
  scene.add(group);
  if (signText) {
    sign(scene, { x, y: height + 1.9, z: z + depth / 2 + 0.4, width: Math.min(width * 0.7, 10), height: 1.9, text: signText, post: false });
  }
  const half = rotate ? { x: depth / 2, z: width / 2 } : { x: width / 2, z: depth / 2 };
  return solid(x, height / 2, z, half.x, height / 2, half.z);
}

/** A stair tower against a wall: steps, a landing and a handrail, so roofs are reachable to read. */
function stairTower(scene, x, z, height) {
  const steps = Math.round(height / 0.32);
  for (let index = 0; index < steps; index += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.24, 0.5), material(PALETTE.steel, { metalness: 0.2 }));
    step.position.set(x, 0.12 + index * 0.32, z + index * 0.5);
    step.castShadow = true;
    scene.add(step);
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1, height), material(PALETTE.steelDark, { metalness: 0.3 }));
    rail.position.set(x + side * 0.8, height / 2 + 0.5, z + steps * 0.25);
    scene.add(rail);
  }
  return solid(x, height / 2, z + steps * 0.25, 1.0, height / 2, steps * 0.3);
}

/** A run of pipes on brackets along a wall face: dressing that reads as plant, not as a box. */
function pipeRun(scene, { x, z, length, height = 3.4, count = 3, along = 'x', color = PALETTE.steel }) {
  for (let index = 0; index < count; index += 1) {
    const radius = 0.16 - index * 0.02;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material(color, { roughness: 0.55, metalness: 0.35 }));
    pipe.rotation.z = Math.PI / 2;
    if (along === 'z') pipe.rotation.y = Math.PI / 2;
    const offset = 0.45 + index * 0.42;
    pipe.position.set(x + (along === 'x' ? 0 : offset), height + index * 0.05, z + (along === 'x' ? offset : 0));
    pipe.castShadow = true;
    scene.add(pipe);
  }
}

/** A gantry crane: legs, a top beam, a trolley and a hoist that carries whatever hangs from it. */
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
  // Cross bracing, so the frame reads as a crane rather than two poles and a stick.
  for (let index = -2; index <= 2; index += 1) {
    box(scene, { x, y: 10.5, z: z + index * 3, sx: 0.4, sy: 0.4, sz: 3.4, color: PALETTE.rust, rotate: 0 });
  }
  const trolley = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.6), material(PALETTE.steel, { metalness: 0.3 }));
  body.castShadow = true;
  trolley.add(body);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 6), material(PALETTE.steelDark));
  cable.position.y = -3.6;
  trolley.add(cable);
  trolley.position.set(x, 12.3, z);
  scene.add(trolley);
  return { x, z, trolley, legs };
}

/** A quay light mast: a tall pole with a head at the top, brighter than the old blocks. */
function lightMast(scene, x, z) {
  box(scene, { x, y: 5, z, sx: 0.5, sy: 10, sz: 0.5, color: PALETTE.steelDark });
  box(scene, { x: x + 1.1, y: 9.8, z, sx: 2.4, sy: 0.4, sz: 0.8, color: PALETTE.steel });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.7), material(PALETTE.beacon, { roughness: 0.4 }));
  lamp.position.set(x + 1.9, 9.5, z);
  scene.add(lamp);
  return solid(x, 5, z, 0.25, 5, 0.25);
}

/** A moored ship along the far side: a hull, a deckhouse and a crane of its own, for the skyline. */
function ship(scene, x, z, rotate = 0) {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 62), material(0x35566b, { roughness: 0.8 }));
  hull.position.y = 1.4;
  hull.castShadow = true;
  group.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.5, 60), material(PALETTE.steelDark));
  deck.position.y = 4.1;
  group.add(deck);
  const house = new THREE.Mesh(new THREE.BoxGeometry(6, 4.4, 9), material(PALETTE.warehouse, { roughness: 0.9 }));
  house.position.set(0, 6.4, -20);
  house.castShadow = true;
  group.add(house);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3, 10), material(0x2a2f33));
  funnel.position.set(0, 10, -22);
  group.add(funnel);
  for (let index = 0; index < 4; index += 1) {
    const hold = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 6), material(PALETTE.containers[index % PALETTE.containers.length]));
    hold.position.set(0, 4.7, -6 + index * 7);
    group.add(hold);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotate;
  scene.add(group);
  return group;
}

/** The apron: asphalt roads, concrete pads, gravel margins and painted markings, laid on the deck. */
function surfaces(scene, { halfX, halfZ, surface, layout }) {
  // The base layer: the whole deck gets a surface before anything is drawn on it.
  const base = surface === 'asphalt' ? PALETTE.asphalt : surface === 'mixed' ? PALETTE.concreteDark : PALETTE.concrete;
  paint(scene, { x: 0, z: 0, sx: halfX * 2, sz: halfZ * 2, color: base, y: 0.012 });

  if (surface === 'asphalt' || surface === 'mixed') {
    // A road down the middle and two cross roads, kerbed.
    paint(scene, { x: 0, z: 0, sx: 9, sz: halfZ * 2, color: PALETTE.asphalt, y: 0.02 });
    paint(scene, { x: 0, z: -10, sx: halfX * 2, sz: 7, color: PALETTE.asphalt, y: 0.02 });
    paint(scene, { x: 0, z: 12, sx: halfX * 2, sz: 7, color: PALETTE.asphalt, y: 0.02 });
    for (const side of [-1, 1]) {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2, 0.18, 0.5), material(PALETTE.concrete));
      kerb.position.set(0, 0.09, side * 13.5);
      scene.add(kerb);
    }
  }
  if (surface === 'concrete' || surface === 'mixed') {
    // Concrete pads under the freight and around the objective.
    paint(scene, { x: 0, z: 0, sx: 16, sz: 16, color: PALETTE.concrete, y: 0.016 });
    paint(scene, { x: -20, z: 0, sx: 14, sz: 16, color: PALETTE.concrete, y: 0.016, opacity: 0.7 });
    paint(scene, { x: 20, z: 0, sx: 14, sz: 16, color: PALETTE.concrete, y: 0.016, opacity: 0.7 });
  }
  if (layout === 'blocks') {
    paint(scene, { x: -26, z: -18, sx: 18, sz: 12, color: PALETTE.gravel, y: 0.016, opacity: 0.85 });
    paint(scene, { x: 26, z: 18, sx: 18, sz: 12, color: PALETTE.gravel, y: 0.016, opacity: 0.85 });
  }

  // Painted markings: the centre line, lane edges and a hatched apron by the warehouse.
  paint(scene, { x: 0.05, z: 0, sx: 0.33, sz: halfZ * 1.8, color: PALETTE.paint, y: 0.026 });
  for (const side of [-1, 1]) {
    paint(scene, { x: side * (halfX - 3), z: 0, sx: 0.3, sz: halfZ * 1.9, color: PALETTE.paint, y: 0.026 });
  }
  for (let index = -2; index <= 2; index += 1) {
    paint(scene, { x: -halfX + 14, z: index * 7, sx: 7, sz: 0.28, color: PALETTE.paint, y: 0.028, opacity: 0.9 });
  }
}

/**
 * Build the whole yard into `scene` and return what the game needs: the solids to collide against,
 * where each side starts, the objective and the bomb sites, the cranes, and the water line.
 */
export function buildYard(scene, { layout = 'lanes', surface = 'concrete' } = {}) {
  const solids = [];
  const { halfX, halfZ } = YARD;

  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.horizon, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(520, 24, 16),
    new THREE.MeshBasicMaterial({ color: PALETTE.sky, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Sea, then the quay deck on top of it.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.22, metalness: 0.12 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = YARD.waterY;
  scene.add(sea);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2, YARD.deckThickness, halfZ * 2), material(PALETTE.concrete, { roughness: 1 }));
  deck.position.y = -YARD.deckThickness / 2;
  deck.receiveShadow = true;
  scene.add(deck);
  solids.push(solid(0, -0.5, 0, halfX, 0.5, halfZ, 'bullet'));

  surfaces(scene, { halfX, halfZ, surface, layout });

  // The quay edge: bollards, so the water has a lip instead of a line.
  for (let index = -3; index <= 3; index += 1) {
    for (const side of [-1, 1]) {
      box(scene, { x: side * (halfX - 1.2), y: 0.5, z: index * 6, sx: 0.9, sy: 1, sz: 0.9, color: PALETTE.rust });
      solids.push(solid(side * (halfX - 1.2), 0.5, index * 6, 0.45, 0.5, 0.45));
    }
  }

  // The ships alongside: outside the playfield, but they carry the skyline.
  ship(scene, -halfX - 16, -6, 0);
  ship(scene, -halfX - 16, 30, 0);

  // The long side: real buildings with roofs, windows, doors and signs, and a pipe run along them.
  const buildings = [];
  if (layout === 'terminal') {
    buildings.push(building(scene, { x: -halfX + 9, z: 0, width: 18, depth: 40, height: 9, signText: 'TERMINAL 4', color: PALETTE.warehouse }));
    building(scene, { x: -halfX + 10, z: -22, width: 12, depth: 10, height: 6.5, signText: 'YARD OFFICE', color: PALETTE.office, roof: PALETTE.warehouseRoof });
    building(scene, { x: -halfX + 10, z: 22, width: 12, depth: 10, height: 6.5, signText: 'CUSTOMS', color: PALETTE.office, roof: PALETTE.warehouseRoof });
    pipeRun(scene, { x: -halfX + 18.4, z: 0, length: 34, height: 3.2, along: 'z' });
  } else if (layout === 'blocks') {
    buildings.push(building(scene, { x: -halfX + 7, z: -14, width: 12, depth: 16, height: 7.5, signText: 'DEPOT 2', color: PALETTE.warehouse }));
    building(scene, { x: -halfX + 7, z: 14, width: 12, depth: 16, height: 7.5, signText: 'DEPOT 3', color: PALETTE.warehouse });
    building(scene, { x: halfX - 9, z: 0, width: 10, depth: 14, height: 5.5, signText: 'FUEL', color: PALETTE.office, roof: PALETTE.rust });
    stairTower(scene, -halfX + 13.4, -8, 7.5);
  } else {
    buildings.push(building(scene, { x: -halfX + 7, z: -12, width: 12, depth: 18, height: 8, signText: 'NORTH QUAY', color: PALETTE.warehouse }));
    building(scene, { x: -halfX + 7, z: 12, width: 12, depth: 18, height: 8, signText: 'BONDED', color: PALETTE.warehouse });
    building(scene, { x: -halfX + 8, z: 0, width: 10, depth: 8, height: 5, signText: 'OFFICE', color: PALETTE.office, roof: PALETTE.warehouseRoof });
    pipeRun(scene, { x: -halfX + 13.4, z: -12, length: 16, height: 3.4, along: 'z' });
    stairTower(scene, -halfX + 13.4, 18, 8);
  }
  for (const built of buildings) solids.push(built);

  // The opposite side: a fence with a gate, and a couple of stacked reefer boxes against it.
  for (let index = -3; index <= 3; index += 1) {
    const z = index * 7;
    box(scene, { x: halfX - 1.4, y: 1.6, z, sx: 0.18, sy: 3.2, sz: 7, color: PALETTE.fence, cast: false });
    solids.push(solid(halfX - 1.4, 1.6, z, 0.1, 1.6, 3.5));
  }
  for (const [x, z] of [[-halfX + 3, -halfZ + 4], [-halfX + 3, halfZ - 4], [halfX - 3, -halfZ + 4], [halfX - 3, halfZ - 4], [0, -halfZ + 2], [0, halfZ - 2]]) {
    solids.push(lightMast(scene, x, z));
  }

  // Freight, laid three ways. The gaps are the battle lines, so they are on purpose and repeat.
  const rows = layout === 'blocks'
    ? [
        { z: -17, xs: [-26, -13, 13, 26], rotate: 0 },
        { z: -10, xs: [-20, -6, 6, 20], rotate: 0 },
        { z: -3, xs: [-26, -13, 13, 26], rotate: 0 },
        { z: 4, xs: [-20, -6, 6, 20], rotate: 0 },
        { z: 11, xs: [-26, -13, 13, 26], rotate: 0 },
        { z: 18, xs: [-20, -6, 6, 20], rotate: 0 },
      ]
    : layout === 'terminal'
      ? [
          { z: -18, xs: [-22, -4, 14, 30], rotate: 0 },
          { z: -6, xs: [-30, -12, 8, 26], rotate: 0 },
          { z: 6, xs: [-26, -8, 12, 30], rotate: 0 },
          { z: 18, xs: [-16, 2, 20, 34], rotate: 0 },
        ]
      : [
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

  // Pallets, drums, a parked tractor and cable reels: small dressing that reads as a working quay.
  for (const [x, z] of [[-20, -21], [6, -21.5], [22, -20.5], [-12, 21], [10, 20.5], [26, 21.5]]) {
    box(scene, { x, y: 0.45, z, sx: 2.2, sy: 0.9, sz: 1.6, color: PALETTE.rust });
    solids.push(solid(x, 0.45, z, 1.1, 0.45, 0.8));
  }
  for (const [x, z] of [[-4, -21], [4, 21], [-30, 6], [30, -6], [-24, 19], [24, -19]]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.7, 12), material(PALETTE.steel, { metalness: 0.2 }));
    drum.position.set(x, 0.85, z);
    drum.castShadow = true;
    scene.add(drum);
    solids.push(solid(x, 0.85, z, 0.6, 0.85, 0.6));
  }
  for (const [x, z] of [[-8, 23], [8, -23]]) {
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.2, 16), material(0x6b5a44, { roughness: 0.95 }));
    reel.rotation.z = Math.PI / 2;
    reel.position.set(x, 1.5, z);
    reel.castShadow = true;
    scene.add(reel);
    solids.push(solid(x, 1.5, z, 0.6, 1.5, 1.5));
  }

  const cranes = [gantry(scene, -18, 0), gantry(scene, 18, 0)];
  for (const crane of cranes) solids.push(...crane.legs);

  // The objective: a marked circle at the middle of the yard with a lit crate inside it.
  const objective = { x: 0, y: 0, z: 0, radius: 4.2 };
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(objective.radius - 0.35, objective.radius, 48),
    new THREE.MeshBasicMaterial({ color: PALETTE.beacon, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(objective.x, 0.05, objective.z);
  scene.add(ring);
  const crate = box(scene, { x: objective.x, y: 1.1, z: objective.z, sx: 2.4, sy: 2.2, sz: 2.4, color: PALETTE.beacon });
  solids.push(solid(objective.x, 1.1, objective.z, 1.2, 1.1, 1.2));

  // Bomb sites: two marked pads with a stack to plant against, one at each end of the yard.
  const sites = [
    { key: 'A', x: -18, z: 0, radius: 4, label: 'SITE A' },
    { key: 'B', x: 18, z: 0, radius: 4, label: 'SITE B' },
  ];
  for (const site of sites) {
    const pad = paint(scene, { x: site.x, z: site.z, sx: site.radius * 2, sz: site.radius * 2, color: 0x9a4a3a, y: 0.03, opacity: 0.55 });
    pad.add(new THREE.Object3D());
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.3, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: 0xff8a5a, side: THREE.DoubleSide }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(site.x, 0.05, site.z);
    scene.add(marker);
    site.marker = marker;
  }

  // Frontline: a single contested line across the yard that a push drives end to end.
  const frontline = { x: 0, z: 0, axis: 'z', half: halfZ, span: halfX * 0.8 };

  // Spawns: each side gets its own end, clear of the freight rows.
  const spawns = {
    blue: [[-26, -22], [-19, -22], [-12, -22], [-5, -22], [2, -22]],
    red: [[26, 22], [19, 22], [12, 22], [5, 22], [-2, 22]],
  };

  return { solids, spawns, objective, sites, frontline, cranes, craneContainers, ring, crate, halfX, halfZ, layout, surface };
}

/** The sun and the sky's light: bright, high and warm, with a long shadow across the yard. */
export function lightYard(scene) {
  const hemi = new THREE.HemisphereLight(0xdff2ff, PALETTE.gravel, 2.5);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(PALETTE.sun, 3.4);
  sun.position.set(-48, 82, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const span = 68;
  sun.shadow.camera.left = -span;
  sun.shadow.camera.right = span;
  sun.shadow.camera.top = span;
  sun.shadow.camera.bottom = -span;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  // A fill from the opposite side, so the shaded faces of the buildings are not black.
  const fill = new THREE.DirectionalLight(0xd8ecff, 0.7);
  fill.position.set(46, 30, -38);
  scene.add(fill);
  return { hemi, sun, fill };
}
