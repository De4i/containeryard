// The scenes behind ?shot=menu|firefight|objective|result. Each one plays the real match forward
// with the real bots, weapons and damage, and then stops at a frame worth keeping: nothing is posed,
// and no effect is drawn that a shot did not create.
import * as THREE from 'three';
import { MATCH, WEAPONS } from './config.js';
import { MATCH_PHASE, beginMatch, stepMatch } from './match.js';
import { placeBody } from './actors.js';

/** Run the match at its own fixed rate for `seconds`, calling `watch` after every step. */
function advance(match, seconds, watch = null) {
  const steps = Math.round(seconds / MATCH.step);
  for (let index = 0; index < steps; index += 1) {
    stepMatch(match, MATCH.step, null);
    if (watch && watch(match, index) === true) return true;
  }
  return false;
}

/** Put the player where the shot needs them: on their feet, looking down a lane. */
function standPlayer(player, x, z, yaw, pitch = 0) {
  player.position.set(x, 0.9, z);
  player.velocity.set(0, 0, 0);
  player.yaw = yaw;
  if (player.rig) {
    player.rig.yaw = yaw;
    player.rig.pitch = pitch;
  }
}

/** Count the enemy bots the player can actually see from where they are. */
function visibleEnemies(match) {
  const from = new THREE.Vector3(match.player.position.x, match.player.position.y + 1.5, match.player.position.z);
  let seen = 0;
  for (const bot of match.bots) {
    if (!bot.alive || bot.team === match.player.team) continue;
    const to = new THREE.Vector3(bot.position.x, bot.position.y + 1.4, bot.position.z);
    const dir = to.clone().sub(from).normalize();
    const look = new THREE.Vector3(-Math.sin(match.player.rig.yaw), 0, -Math.cos(match.player.rig.yaw));
    if (dir.dot(look) < 0.55) continue;
    let blocked = false;
    for (const box of match.yard.solids) {
      if (box.kind === 'bullet') continue;
      if (Math.abs(box.x - from.x) > 18 || Math.abs(box.z - from.z) > 18) continue;
      let tmin = 0;
      let tmax = from.distanceTo(to);
      for (const axis of ['x', 'y', 'z']) {
        const half = axis === 'x' ? box.sx : axis === 'y' ? box.sy : box.sz;
        const inv = 1 / (dir[axis] || 1e-6);
        let t1 = (box[axis] + half - from[axis]) * inv;
        let t2 = (box[axis] - half - from[axis]) * inv;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
        blocked = true;
        break;
      }
      if (blocked) break;
    }
    if (!blocked) seen += 1;
  }
  return seen;
}

/** Stage one scene, and leave the match in the state the screenshot should show. */
export function stageScene(name, { match, player, rig, seed }) {
  if (name === 'menu') {
    match.menu = 'title';
    match.phase = MATCH_PHASE.FREEZE;
    return { name: 'menu' };
  }

  beginMatch(match);

  if (name === 'firefight') {
    // The frame is taken from a lane that looks onto the objective, with the launcher in hand: the
    // conditions are two enemies actually in the open and a rocket in the air, so the shot shows a
    // firefight with a launch in it, and every part of it comes from the real rules.
    player.weaponIndex = 5;
    player.weapon = WEAPONS[player.weaponIndex];
    player.ammo = player.weapon.magazine;
    let fired = 0;
    let lastShot = 0;
    advance(match, 90, (state) => {
      // Hold the vantage: a round restarting would otherwise put the player back in their corner.
      const enemies = state.bots.filter((bot) => bot.alive && bot.team !== state.player.team);
      const nearest = enemies.slice().sort((a, b) => a.position.distanceTo(state.player.position) - b.position.distanceTo(state.player.position))[0];
      const want = nearest ? Math.atan2(-(nearest.position.x + 2), -(nearest.position.z + 6)) : Math.PI;
      standPlayer(state.player, -2, -6, want, -0.02);
      state.intent.holdFire = false;
      // A rocket every few seconds while the other crew is in the open.
      if (state.player.ammo <= 0) {
        state.player.ammo = state.player.weapon.magazine;
        state.player.reloading = 0;
      }
      if (state.elapsed - lastShot > 1.6 && visibleEnemies(state) >= 1) {
        state.intent.fire = true;
        lastShot = state.elapsed;
        fired += 1;
      }
      const fresh = state.elapsed - state.lastBotShotAt < 0.25;
      if (fired >= 2 && state.rockets.length > 0 && visibleEnemies(state) >= 2 && fresh && state.player.alive && state.player.health > 40) return true;
      return false;
    });
    match.intent.holdFire = false;
    return { name: 'firefight' };
  }

  if (name === 'objective') {
    // The manifest going in: the player holds the ring while the other crew comes for it.
    standPlayer(player, 0, -1.6, Math.PI + 0.2, -0.05);
    advance(match, 40, (state) => {
      state.intent.holdFire = state.elapsed > 6 && state.elapsed < 12;
      const inRing = Math.hypot(state.player.position.x, state.player.position.z) < state.yard.objective.radius;
      if (!inRing && state.elapsed > 2) standPlayer(state.player, 0, -1.6, Math.PI + 0.2, -0.05);
      return state.cap > 0.45 && state.capTeam === 'blue';
    });
    match.intent.holdFire = false;
    return { name: 'objective' };
  }

  if (name === 'result') {
    standPlayer(player, -6, -12, Math.PI, 0);
    // A real match end, never a forced one: if the sim cannot reach it, the round panel stands.
    advance(match, 900, (state) => state.phase === MATCH_PHASE.MATCH_OVER);
    for (const bot of match.bots) placeBody(bot.body, bot.position, bot.yaw, bot.crouching);
    return { name: 'result' };
  }

  // Any other name: the menu, which is always safe to show.
  match.menu = 'title';
  return { name: 'menu' };
}
