// The match: five a side, first to three rounds, and the two cranes that redraw the map between
// them. This file owns the round clock, the objective, the bots' behaviour, and the kill feed. It
// steps at a fixed rate and reads only the world, the fighters and the player's intent.
import * as THREE from 'three';
import { MATCH, PALETTE, TEAMS, WEAPONS, YARD } from './config.js';
import { createBot, placeBody, muzzlePoint, resolveSolids, clampToQuay, stepBody } from './actors.js';
import { createEffects, hitscan, damageOf, createRocket, stepRocket } from './combat.js';

export const MATCH_PHASE = { FREEZE: 'freeze', LIVE: 'live', ROUND_OVER: 'round_over', MATCH_OVER: 'match_over' };

/** A tiny seeded generator, so a match replays exactly from its seed. */
function createRandom(seed) {
  let state = (seed | 0) || 0x9e3779b9;
  return {
    next() {
      state ^= state << 13;
      state |= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state |= 0;
      return (state >>> 0) / 4294967296;
    },
    range(low, high) {
      return low + (high - low) * this.next();
    },
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    },
  };
}

/** Everything a match needs, plus the ten bodies that fight it and five spare containers for the cranes. */
export function createMatch({ scene, yard, player, seed, audio }) {
  const random = createRandom(seed);
  const effects = createEffects(scene);
  const rockets = [];
  const bots = [];
  for (const team of ['blue', 'red']) {
    for (let index = 0; index < MATCH.teamSize; index += 1) {
      if (team === 'blue' && index === 0) continue; // the player takes that slot
      const bot = createBot({ ...yard, halfX: YARD.halfX, halfZ: YARD.halfZ }, team, index, random);
      scene.add(bot.group);
      bots.push(bot);
    }
  }

  const match = {
    scene,
    phase: MATCH_PHASE.FREEZE,
    menu: 'title',
    round: 1,
    score: { blue: 0, red: 0 },
    clock: MATCH.roundSeconds,
    freeze: MATCH.freezeSeconds,
    cap: 0,
    capTeam: null,
    player,
    bots,
    yard: { ...yard, halfX: YARD.halfX, halfZ: YARD.halfZ, waterY: YARD.waterY },
    effects,
    audio,
    random,
    feed: [],
    shots: 0,
    hits: 0,
    kills: { blue: 0, red: 0 },
    elapsed: 0,
    intent: { fire: false, aim: false, reload: false, pause: false, confirm: false, weapon: null, holdFire: false, holdAim: false },
    lastRoundWinner: null,
    craneSwings: 0,
    lastBotShotAt: -99,
    rockets,
    say(text, team = null) {
      match.feed.unshift({ text, team, life: 6 });
      if (match.feed.length > 7) match.feed.length = 7;
    },
    aliveCount(team) {
      const held = match.bots.filter((bot) => bot.team === team && bot.alive).length;
      return team === 'blue' ? held + (player.alive ? 1 : 0) : held;
    },
  };

  placeAtSpawn(match);
  return match;
}

/** Put every fighter back on its spawn line, and hand the player their rifle again. */
function placeAtSpawn(match) {
  const { player, bots, yard } = match;
  const blueSpawns = yard.spawns.blue;
  const redSpawns = yard.spawns.red;
  player.position.set(blueSpawns[0][0], 0.9, blueSpawns[0][1]);
  player.velocity.set(0, 0, 0);
  player.health = 100;
  player.armor = 100;
  player.alive = true;
  player.ammo = player.weapon.magazine;
  player.reloading = 0;
  player.yaw = Math.PI;
  if (player.rig) player.rig.yaw = Math.PI;
  let blueIndex = 1;
  let redIndex = 0;
  for (const bot of bots) {
    const spawn = bot.team === 'blue' ? blueSpawns[blueIndex++] : redSpawns[redIndex++];
    bot.position.set(spawn[0], 0.9, spawn[1]);
    bot.velocity.set(0, 0, 0);
    bot.health = 100;
    bot.armor = 100;
    bot.alive = true;
    bot.ammo = bot.weapon.magazine;
    bot.reloading = 0;
    bot.target = null;
    bot.path.length = 0;
    bot.yaw = bot.team === 'blue' ? Math.PI : 0;
    bot.group.visible = true;
    placeBody(bot.body, bot.position, bot.yaw, false);
  }
}

/** The cranes move a container: new freight at one of the lane slots, so the map is redrawn. */
function swingCranes(match) {
  const slots = [
    [-28, 0], [-14, 0], [14, 0], [28, 0],
    [-16, -8.5], [0, -8.5], [16, -8.5],
    [-16, 8.5], [0, 8.5], [16, 8.5],
  ];
  for (let index = 0; index < 2; index += 1) {
    const slot = slots[Math.floor(match.random.next() * slots.length)];
    const crane = match.yard.cranes[index % match.yard.cranes.length];
    crane.trolley.userData.target = new THREE.Vector3(slot[0], 12.3, slot[1]);
    match.craneSwings += 1;
  }
  match.say('CRANES MOVING: the lanes change', null);
}

/** Start the next round: fresh positions, fresh clock, and the cranes at work in between. */
export function startRound(match, { shuffle = true } = {}) {
  match.round += 1;
  match.phase = MATCH_PHASE.FREEZE;
  match.freeze = MATCH.freezeSeconds;
  match.clock = MATCH.roundSeconds;
  match.cap = 0;
  match.capTeam = null;
  placeAtSpawn(match);
  if (shuffle) swingCranes(match);
  match.say(`ROUND ${match.round}: ${TEAMS.blue.name} ${match.score.blue} — ${match.score.red} ${TEAMS.red.name}`);
  match.audio?.roundStart();
  return match;
}

/** Begin the match proper, from the title screen. */
export function beginMatch(match) {
  match.menu = 'playing';
  match.round = 1;
  match.score.blue = 0;
  match.score.red = 0;
  match.kills.blue = 0;
  match.kills.red = 0;
  match.shots = 0;
  match.hits = 0;
  match.feed.length = 0;
  match.phase = MATCH_PHASE.FREEZE;
  match.freeze = MATCH.freezeSeconds;
  match.clock = MATCH.roundSeconds;
  placeAtSpawn(match);
  match.say('ROUND 1 — first to three rounds, five a side');
  match.audio?.roundStart();
  return match;
}

/** End the round for `team`: the score, the feed line, and the wait before the next one. */
function endRound(match, team, why) {
  match.phase = MATCH_PHASE.ROUND_OVER;
  match.score[team] += 1;
  match.lastRoundWinner = team;
  match.roundOverTimer = 3.2;
  match.say(`${team === 'blue' ? TEAMS.blue.name : TEAMS.red.name} take round ${match.round} — ${why}`, team);
  match.audio?.roundEnd(team === match.player.team);
  if (match.score[team] >= MATCH.roundsToWin) {
    match.phase = MATCH_PHASE.MATCH_OVER;
    match.say(`${team === 'blue' ? TEAMS.blue.name : TEAMS.red.name} win the match ${match.score.blue}—${match.score.red}`, team);
    match.audio?.matchEnd(team === match.player.team);
  }
}

/** Would a fighter at `from` see `to` without a container in the way? */
function lineClear(solids, from, to) {
  const dir = to.clone().sub(from);
  const distance = dir.length();
  if (distance < 0.001) return true;
  dir.divideScalar(distance);
  for (const box of solids) {
    if (box.kind === 'bullet') continue;
    let tmin = 0;
    let tmax = distance;
    for (const axis of ['x', 'y', 'z']) {
      const half = axis === 'x' ? box.sx : axis === 'y' ? box.sy : box.sz;
      const inv = 1 / (dir[axis] || 1e-6);
      let t1 = (box[axis] + half - from[axis]) * inv;
      let t2 = (box[axis] - half - from[axis]) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return true;
    }
  }
  return false;
}

/** Fire a weapon for `shooter`, at `aim` direction, and put the result in the feed. */
function shoot(match, shooter, aimDirection, origin) {
  const weapon = shooter.weapon;
  if (shooter.reloading > 0 || shooter.cooldown > 0 || shooter.ammo <= 0 || !shooter.alive) return false;
  // The launcher sends a rocket: it travels, and what it meets is what it hurts.
  if (weapon.key === 'rpg') {
    shooter.cooldown = 60 / weapon.rpm;
    shooter.ammo -= 1;
    shooter.lastShot = match.elapsed;
    if (shooter !== match.player) match.lastBotShotAt = match.elapsed;
    match.rockets.push({ owner: shooter, rocket: createRocket(match.scene, origin, aimDirection) });
    match.effects.addFlash(origin, shooter.rig ? shooter.rig.yaw : shooter.yaw, 1.6);
    match.audio?.shot(weapon, shooter === match.player ? 0 : match.player.position.distanceTo(origin));
    return true;
  }
  // Bots shoot a little tighter than the raw table: they are trained, the player is the novice.
  const spread = weapon.spread * (shooter.spread ?? 1) * (shooter.isPlayer ? 1 : 0.55);
  const targets = [match.player, ...match.bots].filter((actor) => actor.team !== shooter.team);
  const result = hitscan(shooter, targets, match.yard.solids, spread, match.random, origin, aimDirection);
  match.shots += 1;
  shooter.cooldown = 60 / weapon.rpm;
  shooter.ammo -= 1;
  shooter.lastShot = match.elapsed;
  if (shooter !== match.player) match.lastBotShotAt = match.elapsed;
  match.effects.addTracer(origin, result.point, weapon.tracer);
  const isPlayerShooting = shooter === match.player;
  if (isPlayerShooting) {
    match.effects.addFlash(origin, shooter.rig ? shooter.rig.yaw : 0, 1.1);
    if (shooter.rig) shooter.rig.shake = Math.min(0.35, (shooter.rig.shake ?? 0) + weapon.kick * 0.06);
  } else {
    match.effects.addFlash(origin, shooter.yaw, 0.9);
  }
  const heard = match.player.position.distanceTo(origin);
  match.audio?.shot(weapon, isPlayerShooting ? 0 : heard);
  if (result.target) {
    const damage = damageOf(weapon, result.body);
    // Armour takes half of every hit until it runs out: a vest buys time, not immunity.
    const absorbed = Math.min(result.target.armor, Math.round(damage * 0.5));
    result.target.armor -= absorbed;
    result.target.health -= damage - absorbed;
    match.hits += 1;
    shooter.damageDealt += damage;
    result.target.lastHitAt = match.elapsed;
    match.effects.addSpark(result.point);
    match.audio?.hit();
    if (isPlayerShooting) match.effects.addMarker();
    if (weapon.splash) {
      for (const other of targets) {
        if (other === shooter || !other.alive) continue;
        if (other.position.distanceTo(result.point) < weapon.splash) {
          const splash = Math.round(weapon.damage * 0.5);
          const soaked = Math.min(other.armor, Math.round(splash * 0.5));
          other.armor -= soaked;
          other.health -= splash - soaked;
        }
      }
    }
    if (result.target.health <= 0) {
      result.target.alive = false;
      result.target.deaths += 1;
      shooter.kills += 1;
      match.kills[shooter.team] += 1;
      const killerName = isPlayerShooting ? 'YOU' : shooter.name;
      match.say(`${killerName}  [${weapon.name}]  ${result.target.isPlayer ? 'YOU' : result.target.name}`, shooter.team);
      if (!result.target.isPlayer) result.target.group.visible = false;
    }
  } else {
    match.effects.addSpark(result.point);
    match.audio?.impact();
  }
  return true;
}

/** One bot's thinking: find a target, close the distance, shoot, and keep moving. */
function stepBot(match, bot, dt) {
  const { player, bots, yard } = match;
  const enemies = [player, ...bots].filter((actor) => actor.team !== bot.team && actor.alive);
  bot.think -= dt;
  if (bot.think <= 0) {
    bot.think = 0.18 + match.random.next() * 0.12;
    let best = null;
    let bestDistance = Infinity;
    for (const enemy of enemies) {
      const distance = bot.position.distanceTo(enemy.position);
      if (distance < bestDistance && lineClear(yard.solids, bot.position, enemy.position)) {
        best = enemy;
        bestDistance = distance;
      }
    }
    bot.target = best;
    bot.strafeTimer -= 0.3;
    if (bot.strafeTimer <= 0) {
      bot.strafe = match.random.next() > 0.5 ? 1 : -1;
      bot.strafeTimer = 0.5 + match.random.next() * 1.4;
    }
  }
  const goal = bot.target ? bot.target.position : new THREE.Vector3(yard.objective.x, 0.9, yard.objective.z);
  const toGoal = new THREE.Vector3(goal.x - bot.position.x, 0, goal.z - bot.position.z);
  const distance = toGoal.length();
  const facing = Math.atan2(-toGoal.x, -toGoal.z);
  bot.yaw += Math.atan2(Math.sin(facing - bot.yaw), Math.cos(facing - bot.yaw)) * Math.min(1, dt * 6);
  const wantDistance = bot.target ? 16 : 2.5;
  let forward = 0;
  let strafe = 0;
  if (bot.target) {
    forward = distance > wantDistance + 3 ? 1 : distance < wantDistance - 3 ? -1 : 0;
    strafe = bot.strafe;
    if (bot.coverTimer > 0) forward = -1;
  } else {
    forward = distance > 3 ? 1 : 0;
  }
  bot.coverTimer = Math.max(0, bot.coverTimer - dt);
  if (bot.health < 45 && bot.coverTimer <= 0 && match.random.next() < 0.02) bot.coverTimer = 1.4;
  stepBody(bot, dt, { forward, strafe, sprint: !bot.target, crouch: Boolean(bot.coverTimer > 0.9) }, yard);
  if (bot.reloading > 0) {
    bot.reloading -= dt;
    if (bot.reloading <= 0) bot.ammo = bot.weapon.magazine;
  } else if (bot.ammo <= 0) {
    bot.reloading = bot.weapon.reload;
    match.audio?.reload();
  }
  bot.cooldown = Math.max(0, bot.cooldown - dt);
  const muzzleEye = new THREE.Vector3(bot.position.x, bot.position.y + 1.3, bot.position.z);
  const targetEye = bot.target ? new THREE.Vector3(bot.target.position.x, bot.target.position.y + 1.2, bot.target.position.z) : null;
  const visible = bot.target ? lineClear(yard.solids, muzzleEye, targetEye) : false;
  bot.burst = Math.max(0, (bot.burst ?? 0) - dt);
  if (bot.target && visible && bot.cooldown <= 0 && bot.reloading <= 0 && bot.burst <= 0) {
    const aim = new THREE.Vector3(
      bot.target.position.x - bot.position.x,
      bot.target.position.y + 1.1 - (bot.position.y + 1.3),
      bot.target.position.z - bot.position.z,
    ).normalize();
    // A bot's aim wanders by a fixed angle, not by a distance: the further the target, the more
    // that angle costs, which is what makes range a real advantage rather than a lottery.
    aim.x += (match.random.next() - 0.5) * 0.018;
    aim.y += (match.random.next() - 0.5) * 0.012;
    const muzzle = muzzlePoint(bot.body);
    if (shoot(match, bot, aim.normalize(), muzzle)) {
      bot.burstCount = (bot.burstCount ?? 0) + 1;
      if (bot.burstCount >= (bot.weapon.fire === 'auto' ? 5 : 1)) {
        bot.burstCount = 0;
        bot.burst = 0.35 + match.random.next() * 0.7;
      }
    }
  }
  placeBody(bot.body, bot.position, bot.yaw, bot.crouching);
}

/** The player's own trigger, reload and weapon switching. */
function stepPlayerWeapon(match, dt) {
  const { player, intent } = match;
  player.cooldown = Math.max(0, player.cooldown - dt);
  player.lastShot += dt;
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) {
      player.ammo = player.weapon.magazine;
      match.audio?.reload();
    }
    return;
  }
  if (intent.reload) {
    player.reloading = player.weapon.reload;
    intent.reload = false;
    return;
  }
  if (intent.weapon !== null && intent.weapon !== undefined) {
    player.weaponIndex = intent.weapon % WEAPONS.length;
    player.weapon = WEAPONS[player.weaponIndex];
    player.ammo = player.weapon.magazine;
    player.reloading = 0;
    match.say(`You take the ${player.weapon.name}`);
    intent.weapon = null;
  }
  const wantsFire = intent.holdFire || intent.fire;
  const canFire = player.weapon.fire === 'auto' ? wantsFire : intent.fire;
  if (player.ammo <= 0 && wantsFire) {
    player.reloading = player.weapon.reload;
    intent.fire = false;
    return;
  }
  if (canFire && player.cooldown <= 0 && player.ammo > 0) {
    const yaw = player.rig ? player.rig.yaw : player.yaw;
    const pitch = player.rig ? player.rig.pitch : 0;
    const direction = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    ).normalize();
    const origin = new THREE.Vector3(player.position.x, player.position.y + 1.24, player.position.z)
      .addScaledVector(direction, 0.7);
    const pellets = player.weapon.pellets ?? 1;
    for (let pellet = 0; pellet < pellets; pellet += 1) shoot(match, player, direction, origin);
  }
  intent.fire = false;
}

/** Advance the whole match one fixed step. */
export function stepMatch(match, dt, input) {
  match.elapsed += dt;
  if (match.player.rig) match.player.rig.shake = Math.max(0, (match.player.rig.shake ?? 0) - dt * (1.2 + (match.player.rig.shake ?? 0) * 5));
  match.effects.step(dt);
  // Rockets in the air: fly them, and burst them where they land.
  for (let index = match.rockets.length - 1; index >= 0; index -= 1) {
    const entry = match.rockets[index];
    const { hit, at } = stepRocket(entry.rocket, dt, match.yard.solids, (point, normal, colour, count) => match.effects.addSpark(point, normal, colour, count));
    if (!hit) continue;
    match.effects.addSpark(at.clone(), new THREE.Vector3(0, 1, 0), null, 18);
    match.audio?.impact();
    for (const actor of [match.player, ...match.bots]) {
      if (!actor.alive || actor.team === entry.owner.team) continue;
      const distance = actor.position.distanceTo(at);
      if (distance > 7) continue;
      const damage = Math.round(entry.owner.weapon.damage * (1 - distance / 7));
      const soaked = Math.min(actor.armor, Math.round(damage * 0.5));
      actor.armor -= soaked;
      actor.health -= damage - soaked;
      if (actor.health <= 0) {
        actor.alive = false;
        actor.deaths += 1;
        entry.owner.kills += 1;
        match.kills[entry.owner.team] += 1;
        if (!actor.isPlayer) actor.group.visible = false;
        match.say(`${entry.owner === match.player ? 'YOU' : entry.owner.name}  [${entry.owner.weapon.name}]  ${actor.isPlayer ? 'YOU' : actor.name}`, entry.owner.team);
      }
    }
    match.scene.remove(entry.rocket.group);
    match.rockets.splice(index, 1);
  }
  for (const line of match.feed) line.life -= dt;
  match.feed = match.feed.filter((line) => line.life > 0);
  for (const crane of match.yard.cranes) {
    const trolley = crane.trolley;
    if (trolley.userData.target) {
      trolley.position.lerp(trolley.userData.target, Math.min(1, dt * 0.9));
      if (trolley.position.distanceTo(trolley.userData.target) < 0.4) trolley.userData.target = null;
    }
  }
  if (match.menu === 'title') return match;
  if (match.phase === MATCH_PHASE.MATCH_OVER) {
    match.intent.confirm = false;
    return match;
  }
  if (match.phase === MATCH_PHASE.ROUND_OVER) {
    match.roundOverTimer -= dt;
    if (match.roundOverTimer <= 0) startRound(match);
    match.intent.confirm = false;
    return match;
  }
  if (match.phase === MATCH_PHASE.FREEZE) {
    match.freeze -= dt;
    for (const bot of match.bots) placeBody(bot.body, bot.position, bot.yaw, false);
    if (match.freeze <= 0) match.phase = MATCH_PHASE.LIVE;
    return match;
  }

  match.clock = Math.max(0, match.clock - dt);
  stepPlayerWeapon(match, dt);
  for (const bot of match.bots) {
    if (bot.alive) stepBot(match, bot, dt);
  }

  // The objective: standing in the ring loads the manifest. One side at a time.
  const onPoint = [];
  if (match.player.alive && Math.hypot(match.player.position.x - match.yard.objective.x, match.player.position.z - match.yard.objective.z) < match.yard.objective.radius) onPoint.push('blue');
  for (const bot of match.bots) {
    if (!bot.alive) continue;
    if (Math.hypot(bot.position.x - match.yard.objective.x, bot.position.z - match.yard.objective.z) < match.yard.objective.radius) onPoint.push(bot.team);
  }
  const blue = onPoint.filter((team) => team === 'blue').length;
  const red = onPoint.filter((team) => team === 'red').length;
  if (blue > 0 && red === 0) {
    match.capTeam = 'blue';
    match.cap += (dt / MATCH.capSeconds) * blue;
  } else if (red > 0 && blue === 0) {
    match.capTeam = 'red';
    match.cap += (dt / MATCH.capSeconds) * red;
  } else {
    match.cap = Math.max(0, match.cap - dt * 0.35);
    match.capTeam = null;
  }

  if (match.cap >= 1) endRound(match, match.capTeam, 'the manifest is loaded');
  else if (match.aliveCount('red') === 0) endRound(match, 'blue', 'yard cleared');
  else if (match.aliveCount('blue') === 0) endRound(match, 'red', 'your side is down');
  else if (match.clock <= 0) {
    const winner = match.aliveCount('blue') === match.aliveCount('red') ? match.capTeam : match.aliveCount('blue') > match.aliveCount('red') ? 'blue' : 'red';
    endRound(match, winner ?? 'red', 'the clock ran out');
  }
  match.intent.confirm = false;
  return match;
}

export { createRandom };
