// The fighters: one camera rig for the player, one body for every bot, and the movement and collision
// that both share. A body is built from boxes and capsules with a helmet, a vest and a rifle in its
// hands, because a silhouette has to say whose it is from across the yard.
import * as THREE from 'three';
import { MATCH, PALETTE, TEAMS, WEAPONS, material } from './config.js';

const RADIUS = 0.45;
const EYE = 1.62;
const CROUCH_EYE = 1.08;
const SPEED = { walk: 5.6, sprint: 8.2, crouch: 2.8, air: 0.35 };
const GRAVITY = 24;
const JUMP = 7.4;

/** The player's view: yaw and pitch, applied to the camera every frame. */
export function createCameraRig(camera) {
  return { camera, yaw: Math.PI, pitch: 0, bob: 0, shake: 0 };
}

/** Aim the camera from `position` along the rig's yaw and pitch, with a little walk bob. */
export function aimCamera(rig, position, crouching) {
  const eye = crouching ? CROUCH_EYE : EYE;
  const bob = Math.sin(rig.bob) * (crouching ? 0.02 : 0.045);
  const recoil = rig.shake ?? 0;
  rig.camera.position.set(position.x, position.y + eye + bob, position.z);
  // A shot throws the view up and rolls it a little: that kick is the recoil, and it decays away.
  rig.camera.rotation.set(rig.pitch + recoil * 0.16, rig.yaw, Math.sin(rig.bob * 0.5) * 0.006 + recoil * 0.05, 'YXZ');
  rig.camera.updateMatrixWorld();
}

/** The player's own state: where they stand, what they carry, and how they are doing. */
export function createPlayer(rig, yard, seed) {
  const spawn = yard.spawns.blue[0];
  return {
    yard,
    name: 'you',
    team: 'blue',
    isPlayer: true,
    rig,
    position: new THREE.Vector3(spawn[0], 0.9, spawn[1]),
    velocity: new THREE.Vector3(),
    yaw: Math.PI,
    onGround: true,
    crouching: false,
    health: 100,
    armor: 100,
    alive: true,
    weapon: WEAPONS[0],
    weaponIndex: 0,
    ammo: WEAPONS[0].magazine,
    reserve: 90,
    reloading: 0,
    cooldown: 0,
    lastShot: -99,
    trail: [],
    kills: 0,
    deaths: 0,
    damageDealt: 0,
  };
}

/** Push a body out of any solid it overlaps, in the horizontal plane, at its radius. */
export function resolveSolids(position, solids, radius = RADIUS) {
  for (const box of solids) {
    if (box.kind === 'bullet') continue;
    if (position.y - 0.9 > box.y + box.sy || position.y + 0.9 < box.y - box.sy) continue;
    const dx = position.x - box.x;
    const dz = position.z - box.z;
    const overlapX = box.sx + radius - Math.abs(dx);
    const overlapZ = box.sz + radius - Math.abs(dz);
    if (overlapX <= 0 || overlapZ <= 0) continue;
    if (overlapX < overlapZ) position.x += Math.sign(dx || 1) * overlapX;
    else position.z += Math.sign(dz || 1) * overlapZ;
  }
  return position;
}

/** Keep a body inside the quay: the sea is not a place to walk. */
export function clampToQuay(position, halfX, halfZ) {
  position.x = Math.max(-halfX + 1.2, Math.min(halfX - 1.2, position.x));
  position.z = Math.max(-halfZ + 1.2, Math.min(halfZ - 1.2, position.z));
  return position;
}

/** One fixed step of a body: intent in, movement and collision out. */
export function stepBody(body, dt, intent, yard) {
  const speed = intent.crouch ? SPEED.crouch : intent.sprint ? SPEED.sprint : SPEED.walk;
  const yaw = body.rig ? body.rig.yaw : body.yaw;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // Forward is -Z in the camera's frame, so the world direction is derived from yaw directly.
  const wishX = intent.strafe * cos - intent.forward * sin;
  const wishZ = -intent.strafe * sin - intent.forward * cos;
  const length = Math.hypot(wishX, wishZ) || 1;
  const targetX = (wishX / length) * speed * (intent.forward || intent.strafe ? 1 : 0);
  const targetZ = (wishZ / length) * speed * (intent.forward || intent.strafe ? 1 : 0);
  body.velocity.x += (targetX - body.velocity.x) * Math.min(1, dt * (body.onGround ? 14 : 2.5));
  body.velocity.z += (targetZ - body.velocity.z) * Math.min(1, dt * (body.onGround ? 14 : 2.5));
  if (intent.jump && body.onGround) {
    body.velocity.y = JUMP;
    body.onGround = false;
  }
  body.velocity.y -= GRAVITY * dt;
  body.position.x += body.velocity.x * dt;
  body.position.z += body.velocity.z * dt;
  body.position.y += body.velocity.y * dt;
  if (body.position.y <= 0.9) {
    body.position.y = 0.9;
    body.velocity.y = 0;
    body.onGround = true;
  }
  resolveSolids(body.position, yard.solids);
  clampToQuay(body.position, yard.halfX ?? 40, yard.halfZ ?? 26);
  body.crouching = Boolean(intent.crouch);
  if (body.onGround) {
    const moving = Math.hypot(body.velocity.x, body.velocity.z);
    if (body.rig) body.rig.bob += dt * moving * 1.6;
    body.walkPhase = (body.walkPhase ?? 0) + dt * moving * 1.4;
  }
  return body;
}

/** Step the player: read the intent, move the body, and let the rig follow it. */
export function stepPlayer(player, dt, movement, yard) {
  stepBody(player, dt, { ...movement, jump: movement.jump ?? false }, yard ?? player.yard ?? { solids: [], halfX: 40, halfZ: 26 });
  return player;
}

/**
 * A bot's body: a box torso in the team's uniform, a helmet, a vest with pouches, arms and a rifle.
 * Built once and then only turned and translated, so a five-a-side match costs nothing to draw.
 */
export function createBody(teamKey, name) {
  const team = TEAMS[teamKey];
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), material(team.uniform, { roughness: 0.85 }));
  torso.position.y = 1.16;
  torso.castShadow = true;
  group.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.44), material(team.vest, { roughness: 0.9 }));
  vest.position.y = 1.2;
  vest.castShadow = true;
  group.add(vest);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), material(0xd8b48c, { roughness: 0.9 }));
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), material(team.helmet, { roughness: 0.6, metalness: 0.1 }));
  helmet.position.y = 1.8;
  helmet.castShadow = true;
  group.add(helmet);
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.06), material(team.helmetTint, { roughness: 0.35, metalness: 0.4 }));
  goggles.position.set(0, 1.74, -0.17);
  group.add(goggles);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.26), material(team.vest, { roughness: 0.9 }));
    leg.position.set(side * 0.16, 0.39, 0);
    leg.castShadow = true;
    group.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), material(team.uniform, { roughness: 0.9 }));
    arm.position.set(side * 0.4, 1.2, -0.06);
    arm.castShadow = true;
    group.add(arm);
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.12), material(0x3b3a36, { roughness: 1 }));
    pouch.position.set(side * 0.22, 1.06, -0.26);
    group.add(pouch);
  }
  // The rifle: a receiver, a barrel and a magazine, held forward at chest height.
  const rifle = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.72), material(0x2c2c2c, { roughness: 0.6, metalness: 0.3 }));
  rifle.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.5, 8), material(0x1f1f1f, { roughness: 0.5, metalness: 0.5 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.56;
  rifle.add(barrel);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.16), material(0x3a3a3a, { roughness: 0.8 }));
  magazine.position.set(0, -0.16, 0.06);
  rifle.add(magazine);
  rifle.position.set(0.24, 1.22, -0.36);
  group.add(rifle);
  group.name = name;
  return { group, rifle, torso, head, helmet };
}

/** A whole bot: its body, its state, and the little memory its officer needs to behave. */
export function createBot(yard, teamKey, index, seed) {
  const team = TEAMS[teamKey];
  const spawn = yard.spawns[teamKey][index % yard.spawns[teamKey].length];
  const body = createBody(teamKey, `${team.key}-${index}`);
  const weapon = WEAPONS[(index + (teamKey === 'red' ? 1 : 0)) % WEAPONS.length];
  return {
    name: `${team.key.toUpperCase()}-${index + 1}`,
    team: teamKey,
    isPlayer: false,
    position: new THREE.Vector3(spawn[0], 0.9, spawn[1]),
    velocity: new THREE.Vector3(),
    yaw: teamKey === 'blue' ? 0 : Math.PI,
    onGround: true,
    crouching: false,
    health: 100,
    armor: 100,
    alive: true,
    weapon,
    ammo: weapon.magazine,
    reloading: 0,
    cooldown: seed.range(0, 0.4),
    lastShot: -99,
    group: body.group,
    body,
    kills: 0,
    deaths: 0,
    damageDealt: 0,
    target: null,
    think: seed.range(0, 0.2),
    path: [],
    pathIndex: 0,
    node: null,
    strafe: seed.range(0, 1) > 0.5 ? 1 : -1,
    strafeTimer: seed.range(0.4, 1.4),
    coverTimer: 0,
    spread: 1,
  };
}

/** Show or hide a bot's body, and lay it down when it is out of the round. */
export function setBotVisible(bot, visible) {
  bot.group.visible = visible;
}

/** Turn a body's group to its yaw and put it where its position says. */
export function placeBody(body, position, yaw, crouching) {
  body.group.position.set(position.x, position.y - 0.9, position.z);
  body.group.rotation.y = yaw + Math.PI;
  body.group.scale.y = crouching ? 0.82 : 1;
}

/**
 * The player's own weapon, seen from their eyes: a receiver, a barrel, a magazine and a stock,
 * held low right and drawn after everything else so it never clips into a container. It bobs with
 * the walk and kicks with each shot, which is the only feedback a first-person shot needs.
 */
export function createViewmodel(camera, weapon) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.55, metalness: 0.35, depthTest: false, fog: false });
  const grip = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9, depthTest: false, fog: false });
  const parts = [
    { size: [0.13, 0.15, 0.62], at: [0, 0, -0.18], mat: skin },
    { size: [0.07, 0.07, 0.42], at: [0, 0.02, -0.62], mat: skin },
    { size: [0.1, 0.22, 0.14], at: [0, -0.14, -0.12], mat: grip },
    { size: [0.11, 0.12, 0.3], at: [0, -0.02, 0.18], mat: grip },
    { size: [0.05, 0.09, 0.05], at: [0, 0.11, -0.34], mat: skin },
  ];
  for (const part of parts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), part.mat);
    mesh.position.set(...part.at);
    mesh.renderOrder = 999;
    group.add(mesh);
  }
  group.position.set(0.26, -0.24, -0.5);
  group.renderOrder = 999;
  camera.add(group);
  return {
    group,
    weapon,
    /** Bob with the walk and settle after a shot. */
    step(dt, moving, kick) {
      group.position.x = 0.26 + Math.sin(performance.now() / 260) * 0.012 * moving;
      group.position.y = -0.24 + Math.abs(Math.cos(performance.now() / 260)) * 0.014 * moving - kick * 0.05;
      group.position.z = -0.5 + kick * 0.09;
      group.rotation.x = -kick * 0.35;
    },
  };
}

/** The muzzle of a body's rifle, in world space, which is where a tracer starts. */
export function muzzlePoint(body, out = new THREE.Vector3()) {
  const offset = new THREE.Vector3(0.24, 1.22, -0.86);
  return out.copy(offset).applyEuler(new THREE.Euler(0, body.group.rotation.y, 0)).add(body.group.position);
}

export { EYE, CROUCH_EYE, RADIUS, SPEED };
