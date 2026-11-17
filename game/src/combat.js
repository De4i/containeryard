// The shooting: one hitscan per pellet, the damage it does, and every effect that makes a shot
// visible — tracer, muzzle flash, impact spark and hit marker. Effects are pooled lists with
// lifetimes, so a firefight costs allocations only when a shot actually lands.
import * as THREE from 'three';
import { MATCH } from './config.js';

/** Where a shot from `shooter`, aimed with `spread` radians of slop, ends and who it hit. */
export function hitscan(shooter, targets, solids, spread, random, origin, direction) {
  const dir = direction.clone();
  dir.x += (random.next() - 0.5) * spread * 2;
  dir.y += (random.next() - 0.5) * spread * 2;
  dir.z += (random.next() - 0.5) * spread * 2;
  dir.normalize();
  let best = { distance: shooter.weapon.range, point: null, target: null, body: null, solid: null };
  for (const target of targets) {
    if (!target.alive || target === shooter) continue;
    const hit = raySphere(origin, dir, target.position, 1.05, 0.5);
    if (hit && hit.distance < best.distance) {
      const head = raySphere(origin, dir, target.position, 1.78, 0.26);
      best = head
        ? { distance: head.distance, point: head.point, target, body: 'head', solid: null }
        : { distance: hit.distance, point: hit.point, target, body: 'body', solid: null };
    }
  }
  for (const box of solids) {
    const hit = rayBox(origin, dir, box, best.distance);
    if (hit && hit.distance < best.distance) best = { distance: hit.distance, point: hit.point, target: null, body: null, solid: box };
  }
  if (!best.point) best.point = origin.clone().add(dir.clone().multiplyScalar(best.distance));
  best.direction = dir;
  return best;
}

/** Ray against a sphere of `radius` centred at `centre`, or null when it misses. */
function raySphere(origin, dir, centre, height, radius) {
  const toCentre = new THREE.Vector3(centre.x, centre.y + (height - 0.9), centre.z).sub(origin);
  const along = toCentre.dot(dir);
  if (along < 0) return null;
  const perpendicular = toCentre.lengthSq() - along * along;
  if (perpendicular > radius * radius) return null;
  const distance = along - Math.sqrt(radius * radius - perpendicular);
  if (distance < 0) return null;
  return { distance, point: origin.clone().add(dir.clone().multiplyScalar(distance)) };
}

/** Ray against an axis-aligned box, using the slab method, ignoring boxes beyond `limit`. */
function rayBox(origin, dir, box, limit) {
  let tmin = 0;
  let tmax = limit;
  const axes = ['x', 'y', 'z'];
  const half = { x: box.sx, y: box.sy, z: box.sz };
  for (const axis of axes) {
    const inv = 1 / (dir[axis] || 1e-6);
    let t1 = (box[axis] - half[axis] - origin[axis]) * inv;
    let t2 = (box[axis] + half[axis] - origin[axis]) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return { distance: tmin, point: origin.clone().add(dir.clone().multiplyScalar(tmin)) };
}

/** The damage a hit does, before any falloff: a head shot counts for more than a body shot. */
export function damageOf(weapon, body) {
  const base = weapon.damage;
  return body === 'head' ? Math.round(base * 1.8) : base;
}

/**
 * A rocket in flight: a body, a flame and a smoke trail, moving on its own until it meets something.
 * It is a real projectile with real splash, not a hit-scan with a longer line.
 */
export function createRocket(scene, from, direction, speed = 46) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.62, 10), new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5, metalness: 0.4 }));
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const flare = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 10), new THREE.MeshBasicMaterial({ color: 0xffb14a }));
  flare.rotation.x = -Math.PI / 2;
  flare.position.z = 0.5;
  group.add(flare);
  group.position.copy(from);
  group.lookAt(from.clone().add(direction));
  scene.add(group);
  return { group, velocity: direction.clone().multiplyScalar(speed), life: 4, trailTimer: 0 };
}

/** Move a rocket, drop its smoke, and report whether it has met the world or run out of flight. */
export function stepRocket(rocket, dt, solids, spark) {
  rocket.life -= dt;
  rocket.group.position.addScaledVector(rocket.velocity, dt);
  rocket.trailTimer -= dt;
  if (rocket.trailTimer <= 0) {
    rocket.trailTimer = 0.035;
    spark(rocket.group.position, new THREE.Vector3(0, 1, 0), 0x555555, 2);
  }
  const at = rocket.group.position;
  let hit = rocket.life <= 0 || at.y < 0.1;
  for (const box of solids) {
    if (box.kind === 'bullet') continue;
    if (Math.abs(at.x - box.x) < box.sx + 0.2 && Math.abs(at.y - box.y) < box.sy + 0.2 && Math.abs(at.z - box.z) < box.sz + 0.2) {
      hit = true;
      break;
    }
  }
  return { hit, at };
}

/** The list of effects a match draws: tracers, muzzle flashes, sparks and hit markers. */
export function createEffects(scene) {
  const tracers = [];
  const flashes = [];
  const sparks = [];
  const markers = [];
  const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffe8a8, transparent: true, opacity: 0.85 });
  const flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, side: THREE.DoubleSide, depthWrite: false }));

  /** Draw a tracer from `from` to `to` as a thin lit box, and light the muzzle for a moment. */
  function addTracer(from, to, colour) {
    const length = from.distanceTo(to) || 0.1;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, length), new THREE.MeshBasicMaterial({ color: colour ?? 0xffe8a8, transparent: true, opacity: 0.95 }));
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.lookAt(to);
    scene.add(mesh);
    tracers.push({ line: mesh, life: 0.12, max: 0.12 });
  }

  /** A muzzle flash at `at`, facing `yaw`, with a point light for the frame or two it burns. */
  function addFlash(at, yaw, scale = 1) {
    const mesh = flashMesh.clone();
    mesh.scale.setScalar(scale);
    mesh.position.copy(at);
    mesh.rotation.y = yaw;
    scene.add(mesh);
    const light = new THREE.PointLight(0xffd27a, 9, 9, 2);
    light.position.copy(at);
    scene.add(light);
    flashes.push({ mesh, light, life: 0.16, max: 0.16 });
  }

  /** Sparks where a bullet met the world, plus a puff of dust. */
  function addSpark(at, normal = null, colour = null, count = 6) {
    for (let index = 0; index < count; index += 1) {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: colour ?? (index % 2 ? 0xffd9a0 : 0xfff4d2) }));
      cube.position.copy(at);
      scene.add(cube);
      const dir = normal ? normal.clone() : new THREE.Vector3(0, 1, 0);
      sparks.push({
        mesh: cube,
        velocity: dir.multiplyScalar(2.4).add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4)),
        life: 0.32,
        max: 0.32,
      });
    }
  }

  /** The little cross that says a shot landed on a body. */
  function addMarker() {
    markers.push({ life: 0.18, max: 0.18 });
  }

  /** Advance every effect, and retire the finished ones. */
  function step(dt) {
    for (let index = tracers.length - 1; index >= 0; index -= 1) {
      const tracer = tracers[index];
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / tracer.max) * 0.85;
      if (tracer.life <= 0) {
        scene.remove(tracer.line);
        tracer.line.geometry.dispose();
        tracers.splice(index, 1);
      }
    }
    for (let index = flashes.length - 1; index >= 0; index -= 1) {
      const flash = flashes[index];
      flash.life -= dt;
      flash.light.intensity = Math.max(0, flash.life / flash.max) * 9;
      flash.mesh.material.opacity = Math.max(0, flash.life / flash.max);
      if (flash.life <= 0) {
        scene.remove(flash.mesh);
        scene.remove(flash.light);
        flashes.splice(index, 1);
      }
    }
    for (let index = sparks.length - 1; index >= 0; index -= 1) {
      const spark = sparks[index];
      spark.life -= dt;
      spark.velocity.y -= 14 * dt;
      spark.mesh.position.addScaledVector(spark.velocity, dt);
      if (spark.life <= 0) {
        scene.remove(spark.mesh);
        spark.mesh.geometry.dispose();
        sparks.splice(index, 1);
      }
    }
    for (let index = markers.length - 1; index >= 0; index -= 1) {
      markers[index].life -= dt;
      if (markers[index].life <= 0) markers.splice(index, 1);
    }
  }

  return {
    addTracer,
    addFlash,
    addSpark,
    addMarker,
    step,
    get markerStrength() {
      return markers.length ? markers[0].life / markers[0].max : 0;
    },
    get counts() {
      return { tracers: tracers.length, flashes: flashes.length, sparks: sparks.length };
    },
  };
}
