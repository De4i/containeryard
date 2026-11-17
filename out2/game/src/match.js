// The match: the fighters, the mode's rules, the round clock and the kill feed. Four modes are run
// here for real — team deathmatch and free-for-all are won on downs with respawns, bomb site is won
// by planting or defusing the charge, and frontline is won by driving one contested line into the
// enemy end. This file owns the rules, the bots' behaviour and the cranes that redraw the map.
import * as THREE from 'three';
import { MATCH, MODES, PALETTE, TEAMS, WEAPONS, YARD, applyTeamNames, drawNames } from './config.js';
import { createBot, placeBody, muzzlePoint, stepBody } from './actors.js';
import { createEffects, hitscan, damageOf, createRocket, stepRocket } from './combat.js';
import { applyProfile } from './economy.js';

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

/** The mode table entry for a key, defaulting to team deathmatch. */
export function modeOf(key) {
  return MODES.find((entry) => entry.key === key) ?? MODES[0];
}

/**
 * Everything a match needs: the ten fighters, the names drawn for this match, the mode's rules and
 * the state each mode carries. `profile` is the player's market profile, and its purchased numbers
 * are written onto the player here.
 */
export function createMatch({ scene, yard, player, seed, audio, mode = 'bomb', profile = null }) {
  const random = createRandom(seed);
  const drawn = drawNames(random, MATCH.teamSize);
  applyTeamNames(drawn);
  const rules = modeOf(mode);
  const effects = createEffects(scene);
  const rockets = [];
  const bots = [];
  // The player takes the first callsign of the side they joined; the bots take the rest.
  const pool = { blue: [...drawn.callsigns.blue], red: [...drawn.callsigns.red] };
  const playerCallsign = pool[player.team].shift() ?? pool[player.team][0];
  player.callsign = playerCallsign;
  player.name = playerCallsign;
  if (profile) applyProfile(player, profile);
  for (const team of ['blue', 'red']) {
    for (let index = 0; index < MATCH.teamSize; index += 1) {
      if (team === player.team && index === 0) continue; // the player takes that slot
      const callsign = pool[team].shift() ?? `${team}-${index}`;
      const bot = createBot({ ...yard, halfX: YARD.halfX, halfZ: YARD.halfZ }, team, index, random, callsign);
      scene.add(bot.group);
      bots.push(bot);
    }
  }

  const match = {
    scene,
    phase: MATCH_PHASE.FREEZE,
    menu: 'title',
    rules,
    mode: rules.key,
    round: 1,
    score: { blue: 0, red: 0 },
    roundsToWin: rules.bomb ? MATCH.roundsToWin : 1,
    clock: rules.roundSeconds,
    freeze: MATCH.freezeSeconds,
    cap: 0,
    capTeam: null,
    player,
    bots,
    names: drawn.names,
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
    winner: null,
    craneSwings: 0,
    lastBotShotAt: -99,
    rockets,
    respawns: rules.bomb ? 0 : 4.5,
    earnings: { kills: 0, objectives: 0, roundsWon: 0 },
    // Bomb site state: which site is live this round, whether it is planted, and the fuse.
    bomb: { site: null, planted: false, fuse: 0, defuse: 0, carrier: null, exploded: false, defused: false },
    fuseSeconds: 30,
    defuseSeconds: 5,
    // Frontline: one line at zLine, driven towards whichever end a side is standing on.
    frontline: { z: 0, push: 0, reached: null },
    say(text, team = null) {
      match.feed.unshift({ text, team, life: 6 });
      if (match.feed.length > 7) match.feed.length = 7;
    },
    aliveCount(team) {
      const held = match.bots.filter((bot) => bot.team === team && bot.alive).length;
      return team === match.player.team ? held + (player.alive ? 1 : 0) : held;
    },
    /** Who a fighter may shoot: everyone but their own side, or everyone in free-for-all. */
    enemiesOf(actor) {
      if (!rules.teams) return [player, ...bots].filter((other) => other !== actor);
      return [player, ...bots].filter((other) => other.team !== actor.team);
    },
  };

  pickBombSite(match);
  placeAtSpawn(match);
  return match;
}

/** Choose which site is live for the round, and move the objective ring and marker onto it. */
function pickBombSite(match) {
  const sites = match.yard.sites ?? [];
  if (!sites.length) return;
  const site = sites[Math.floor(match.random.next() * sites.length)];
  match.bomb.site = site;
  match.yard.objective = { x: site.x, y: 0, z: site.z, radius: site.radius };
  if (match.yard.ring) match.yard.ring.position.set(site.x, 0.06, site.z);
  if (match.yard.crate) match.yard.crate.position.set(site.x, 1.1, site.z);
  for (const entry of sites) if (entry.marker) entry.marker.visible = entry === site || !match.rules.bomb;
  const ringVisible = Boolean(match.rules.bomb);
  if (match.yard.ring) match.yard.ring.visible = ringVisible;
  if (match.yard.crate) match.yard.crate.visible = ringVisible;
}

/** Show or hide the objective dressing for the mode being played. */
function dressForMode(match) {
  const bombs = Boolean(match.rules.bomb);
  if (match.yard.ring) match.yard.ring.visible = bombs;
  if (match.yard.crate) match.yard.crate.visible = bombs;
  for (const site of match.yard.sites ?? []) if (site.marker) site.marker.visible = bombs;
}

/** Put every fighter back on its spawn line, with the armour its profile pays for. */
function placeAtSpawn(match) {
  const { player, bots, yard } = match;
  const spawns = yard.spawns;
  const own = spawns[player.team] ?? spawns.blue;
  player.position.set(own[0][0], 0.9, own[0][1]);
  player.velocity.set(0, 0, 0);
  player.health = 100;
  player.armorMax = player.armorMax ?? 100;
  player.armor = player.armorMax;
  player.alive = true;
  player.ammo = player.weapon.magazine;
  player.reloading = 0;
  player.cooldown = 0;
  player.respawn = 0;
  player.yaw = player.team === 'blue' ? Math.PI : 0;
  if (player.rig) player.rig.yaw = player.yaw;
  // Slot zero of the player's own line belongs to the player, so their crew-mates start at one.
  const cursor = { blue: 0, red: 0 };
  cursor[player.team] = 1;
  for (const bot of bots) {
    const line = spawns[bot.team] ?? spawns.blue;
    const spawn = line[cursor[bot.team]++ % line.length];
    bot.position.set(spawn[0], 0.9, spawn[1]);
    bot.velocity.set(0, 0, 0);
    bot.health = 100;
    bot.armor = bot.armorMax ?? 100;
    bot.alive = true;
    bot.ammo = bot.weapon.magazine;
    bot.reloading = 0;
    bot.cooldown = 0;
    bot.respawn = 0;
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
  match.clock = match.rules.roundSeconds;
  match.cap = 0;
  match.capTeam = null;
  match.bomb = { site: match.bomb.site, planted: false, fuse: 0, defuse: 0, carrier: null, exploded: false, defused: false };
  if (match.rules.bomb) pickBombSite(match);
  placeAtSpawn(match);
  if (shuffle && match.rules.bomb) swingCranes(match);
  match.say(`ROUND ${match.round}: ${TEAMS.blue.name} ${match.score.blue} — ${match.score.red} ${TEAMS.red.name}`);
  match.audio?.roundStart();
  return match;
}

/** Begin the match proper, from the menu. */
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
  match.winner = null;
  match.earnings = { kills: 0, objectives: 0, roundsWon: 0 };
  match.phase = MATCH_PHASE.FREEZE;
  match.freeze = MATCH.freezeSeconds;
  match.clock = match.rules.roundSeconds;
  match.frontline = { z: 0, push: 0, reached: null };
  match.bomb = { site: match.bomb.site, planted: false, fuse: 0, defuse: 0, carrier: null, exploded: false, defused: false };
  if (match.rules.bomb) pickBombSite(match);
  dressForMode(match);
  for (const bot of match.bots) bot.kills = 0;
  placeAtSpawn(match);
  match.say(`${match.rules.name}: ${match.rules.blurb}`);
  match.audio?.roundStart();
  return match;
}

/** End the match for `team`, with the reason on the feed and the winner recorded. */
function endMatch(match, team, why) {
  match.phase = MATCH_PHASE.MATCH_OVER;
  match.winner = team;
  const label = team === 'blue' ? TEAMS.blue.name : team === 'red' ? TEAMS.red.name : team;
  match.say(`${label} take the yard — ${why}`, team === 'ffa' ? null : team);
  match.audio?.matchEnd(team === match.player.team);
}

/** End the round for `team`: the score, the feed line, and the wait before the next one. */
function endRound(match, team, why) {
  match.phase = MATCH_PHASE.ROUND_OVER;
  match.score[team] += 1;
  match.lastRoundWinner = team;
  match.roundOverTimer = 3.2;
  if (team === match.player.team) match.earnings.roundsWon += 1;
  match.say(`${team === 'blue' ? TEAMS.blue.name : TEAMS.red.name} take round ${match.round} — ${why}`, team);
  match.audio?.roundEnd(team === match.player.team);
  if (match.score[team] >= match.roundsToWin) {
    match.phase = MATCH_PHASE.MATCH_OVER;
    match.winner = team;
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

/** A name for the feed: the player reads as YOU, a bot as its callsign. */
function labelOf(actor) {
  return actor.isPlayer ? 'YOU' : actor.callsign ?? actor.name;
}

/** Kill a fighter: the tally, the feed line, and the money the player just earned. */
function killFighter(match, victim, killer, weapon) {
  victim.alive = false;
  victim.deaths += 1;
  victim.respawn = match.respawns;
  if (!victim.isPlayer) victim.group.visible = false;
  if (killer) {
    killer.kills += 1;
    if (killer.team) match.kills[killer.team] = (match.kills[killer.team] ?? 0) + 1;
    if (killer.isPlayer) match.earnings.kills += 1;
    match.say(`${labelOf(killer)}  [${weapon.name}]  ${labelOf(victim)}`, killer.team ?? null);
  } else {
    match.say(`${labelOf(victim)}  went down`, null);
  }
}

/** Fire a weapon for `shooter`, at `aimDirection`, and put the result in the feed. */
function shoot(match, shooter, aimDirection, origin) {
  const weapon = shooter.weapon;
  if (shooter.reloading > 0 || shooter.cooldown > 0 || shooter.ammo <= 0 || !shooter.alive) return false;
  // The launcher sends a rocket: it travels, and what it meets is what it hurts.
  if (weapon.key === 'rpg') {
    shooter.cooldown = 60 / weapon.rpm;
    shooter.ammo -= 1;
    shooter.lastShot = match.elapsed;
    if (shooter !== match.player) match.lastBotShotAt = match.elapsed;
    match.rockets.push({ owner: shooter, rocket: createRocket(match.scene, origin, aimDirection), origin: origin.clone() });
    // The launcher's flash sits out along the tube and stays modest, for the same reason as a rifle's.
    const launchFlash = origin.clone().addScaledVector(aimDirection, 1.6);
    match.effects.addFlash(launchFlash, shooter.rig ? shooter.rig.yaw : shooter.yaw, shooter === match.player ? 0.7 : 1.2);
    match.audio?.shot(weapon, shooter === match.player ? 0 : match.player.position.distanceTo(origin));
    return true;
  }
  // Bots shoot a little tighter than the raw table: they are trained, the player is the novice.
  const spread = weapon.spread * (shooter.spread ?? 1) * (shooter.isPlayer ? 1 : 0.55);
  const targets = match.enemiesOf(shooter);
  const result = hitscan(shooter, targets, match.yard.solids, spread, match.random, origin, aimDirection);
  match.shots += 1;
  shooter.cooldown = 60 / weapon.rpm;
  shooter.ammo -= 1;
  shooter.lastShot = match.elapsed;
  if (shooter !== match.player) match.lastBotShotAt = match.elapsed;
  match.effects.addTracer(origin, result.point, weapon.tracer);
  const isPlayerShooting = shooter === match.player;
  if (isPlayerShooting) {
    // The player's own flash goes out along the barrel and stays small. Placed at the muzzle — half
    // a metre from the eye — a full-size quad covers most of the view and reads as a wash over the
    // screen rather than as a muzzle flash.
    const flashAt = origin.clone().addScaledVector(aimDirection, 1.5);
    match.effects.addFlash(flashAt, shooter.rig ? shooter.rig.yaw : 0, 0.5);
    if (shooter.rig) shooter.rig.shake = Math.min(0.35, (shooter.rig.shake ?? 0) + weapon.kick * 0.06);
  } else {
    match.effects.addFlash(origin, shooter.yaw, 0.9);
  }
  const heard = match.player.position.distanceTo(origin);
  match.audio?.shot(weapon, isPlayerShooting ? 0 : heard);
  if (result.target) {
    // The barrel work bought in the market scales the damage the table hands out.
    const damage = Math.round(damageOf(weapon, result.body) * (shooter.damageScale ?? 1));
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
    if (result.target.health <= 0) killFighter(match, result.target, shooter, weapon);
  } else if (result.solid) {
    // An impact belongs to a shot that met the world. A round that flew out over the water and hit
    // nothing must leave nothing: the old branch spawned a spark at the end of its range, which hung
    // in mid-air above the quay and read as a floating block on screen.
    match.effects.addSpark(result.point);
    match.audio?.impact();
  }
  return true;
}

/** One bot's thinking: find a target, close the distance, shoot, and keep moving. */
function stepBot(match, bot, dt) {
  const { yard } = match;
  const enemies = match.enemiesOf(bot).filter((actor) => actor.alive);
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
  // Where a bot wants to be when it has no target depends on the mode: the bomb site, the line, or
  // simply the nearest enemy. This is what makes each mode play differently rather than just score
  // differently.
  let goal = new THREE.Vector3(yard.objective.x, 0.9, yard.objective.z);
  if (match.rules.frontline) goal = new THREE.Vector3((bot.team === 'blue' ? -1 : 1) * 8, 0.9, match.frontline.z);
  else if (!match.rules.bomb) {
    // Deathmatch: with nothing to take, a bot with no target walks into the enemy half to find one.
    const push = bot.team === 'blue' ? 1 : -1;
    goal = new THREE.Vector3(bot.position.x * 0.4, 0.9, push * yard.halfZ * 0.55);
  }
  if (bot.target) goal = bot.target.position;
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
  if (!player.alive) return;
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
    const owned = player.profile?.owned ?? WEAPONS.map((entry) => entry.key);
    const wanted = WEAPONS[intent.weapon % WEAPONS.length];
    if (owned.includes(wanted.key)) {
      player.weaponIndex = intent.weapon % WEAPONS.length;
      player.weapon = wanted;
      player.ammo = player.weapon.magazine;
      player.reloading = 0;
      match.say(`You take the ${player.weapon.name}`);
    } else {
      match.say(`${wanted.name} is not in your loadout — buy it in the market`);
    }
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

/** Bring a dead fighter back, in the modes that use respawns. */
function stepRespawns(match, dt) {
  if (!match.respawns) return;
  for (const actor of [match.player, ...match.bots]) {
    if (actor.alive || actor.respawn <= 0) continue;
    actor.respawn -= dt;
    if (actor.respawn > 0) continue;
    const spawns = match.yard.spawns[actor.team] ?? match.yard.spawns.blue;
    const spawn = spawns[Math.floor(match.random.next() * spawns.length)];
    actor.position.set(spawn[0], 0.9, spawn[1]);
    actor.velocity.set(0, 0, 0);
    actor.health = 100;
    actor.armor = actor.armorMax ?? 100;
    actor.alive = true;
    actor.ammo = actor.weapon.magazine;
    actor.reloading = 0;
    actor.respawn = 0;
    if (!actor.isPlayer) {
      actor.group.visible = true;
      placeBody(actor.body, actor.position, actor.yaw, false);
    }
  }
}

/** Team deathmatch and free-for-all: the first side, or fighter, to the kill target takes it. */
function stepKillTarget(match) {
  const target = match.rules.winKills;
  if (!target) return false;
  if (!match.rules.teams) {
    const leaders = [match.player, ...match.bots].slice().sort((a, b) => b.kills - a.kills);
    const top = leaders[0];
    if (top && top.kills >= target) {
      endMatch(match, top.isPlayer ? match.player.team : top.team, `${labelOf(top)} reached ${target} downs`);
      return true;
    }
    return false;
  }
  for (const team of ['blue', 'red']) {
    const downs = match.bots.filter((bot) => bot.team === team).reduce((sum, bot) => sum + bot.kills, 0)
      + (team === match.player.team ? match.player.kills : 0);
    const total = (match.kills[team] ?? 0);
    if (downs >= target || total >= target) {
      endMatch(match, team, `${target} downs`);
      return true;
    }
  }
  return false;
}

/** Bomb site: plant, hold the fuse, defuse, or clear the other crew. */
function stepBomb(match, dt) {
  const bomb = match.bomb;
  const site = bomb.site;
  if (!site) return;
  const inSite = (actor) => actor.alive
    && Math.hypot(actor.position.x - site.x, actor.position.z - site.z) < site.radius;
  if (!bomb.planted) {
    const attackers = match.player.team === 'blue'
      ? [match.player, ...match.bots.filter((bot) => bot.team === 'blue')]
      : match.bots.filter((bot) => bot.team === 'red');
    const onSite = attackers.filter(inSite).length;
    if (onSite > 0) {
      match.capTeam = 'blue';
      match.cap += (dt / MATCH.capSeconds) * onSite;
      if (match.cap >= 1) {
        bomb.planted = true;
        bomb.fuse = match.fuseSeconds;
        match.earnings.objectives += 1;
        match.say(`${TEAMS.blue.name} plant the charge at ${site.label ?? site.key}`, 'blue');
        match.audio?.roundStart();
      }
    } else {
      match.cap = Math.max(0, match.cap - dt * 0.35);
      match.capTeam = null;
    }
    return;
  }
  // Planted: the fuse runs, and the other crew can cut it by standing on the charge.
  const defenders = match.player.team === 'red'
    ? [match.player, ...match.bots.filter((bot) => bot.team === 'red')]
    : match.bots.filter((bot) => bot.team === 'red');
  const cutting = defenders.filter(inSite).length;
  bomb.fuse -= dt;
  if (cutting > 0) {
    bomb.defuse += (dt / match.defuseSeconds) * cutting;
    if (bomb.defuse >= 1) {
      bomb.defused = true;
      endRound(match, 'red', 'the charge was cut');
      return;
    }
  }
  if (bomb.fuse <= 0) {
    bomb.exploded = true;
    match.effects.addSpark(new THREE.Vector3(site.x, 1.4, site.z), new THREE.Vector3(0, 1, 0), '#ffb066', 60);
    match.audio?.matchEnd(true);
    endRound(match, 'blue', 'the charge went off');
  }
}

/** Frontline: one line, and whoever stands on it drives it into the other end. */
function stepFrontline(match, dt) {
  const line = match.frontline;
  const near = (actor) => actor.alive && Math.abs(actor.position.z - line.z) < 6;
  const bluePush = (match.player.alive && match.player.team === 'blue' && near(match.player) ? 1 : 0)
    + match.bots.filter((bot) => bot.team === 'blue' && near(bot)).length;
  const redPush = match.bots.filter((bot) => bot.team === 'red' && near(bot)).length;
  const net = bluePush - redPush;
  line.push = net;
  line.z += net * dt * 0.55;
  line.z = Math.max(-match.yard.halfZ + 3, Math.min(match.yard.halfZ - 3, line.z));
  match.cap = Math.min(1, Math.abs(line.z) / (match.yard.halfZ - 3));
  match.capTeam = line.z < 0 ? 'blue' : 'red';
  if (Math.abs(line.z) >= match.yard.halfZ - 3.5) {
    endMatch(match, line.z < 0 ? 'blue' : 'red', 'the line was driven home');
  }
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
      if (!actor.alive || match.enemiesOf(entry.owner).indexOf(actor) === -1) continue;
      const distance = actor.position.distanceTo(at);
      if (distance > 7) continue;
      const damage = Math.round(entry.owner.weapon.damage * (1 - distance / 7) * (entry.owner.damageScale ?? 1));
      const soaked = Math.min(actor.armor, Math.round(damage * 0.5));
      actor.armor -= soaked;
      actor.health -= damage - soaked;
      if (actor.health <= 0) killFighter(match, actor, entry.owner, entry.owner.weapon);
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
  if (match.rules.bomb && match.bomb.planted) match.clock = Math.max(match.clock, match.bomb.fuse);
  stepPlayerWeapon(match, dt);
  for (const bot of match.bots) {
    if (bot.alive) stepBot(match, bot, dt);
  }
  stepRespawns(match, dt);

  // The rules of the mode being played, one branch each, so a mode is a rule not a skin.
  if (match.rules.bomb) {
    stepBomb(match, dt);
    if (match.phase !== MATCH_PHASE.LIVE) return match;
    if (match.aliveCount('red') === 0) endRound(match, 'blue', 'the site was cleared');
    else if (match.aliveCount('blue') === 0) endRound(match, 'red', 'the attack was held');
    else if (match.clock <= 0 && !match.bomb.planted) endRound(match, 'red', 'the clock ran out');
    return match;
  }
  if (match.rules.frontline) {
    stepFrontline(match, dt);
    return match;
  }
  if (stepKillTarget(match)) return match;
  if (match.clock <= 0) {
    const blue = match.aliveCount('blue');
    const red = match.aliveCount('red');
    endMatch(match, blue === red ? 'blue' : blue > red ? 'blue' : 'red', 'the clock ran out');
    return match;
  }
  match.intent.confirm = false;
  return match;
}

export { createRandom };
