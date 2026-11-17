// The scenes behind ?shot=menu|briefing|market|firefight|result. Each one is a real state of the real
// game: the fight scenes play the live match forward through the same rules a player plays by, the
// market and result scenes bank what a played match actually paid, and nothing is posed that a shot
// did not do. Every scene returns a report of what was staged, so a frame that never reached its
// moment cannot be passed off as one that did.
import * as THREE from 'three';
import { MATCH, MODES, WEAPONS } from './config.js';
import { MATCH_PHASE, stepMatch } from './match.js';
import { hitscan } from './combat.js';
import { stepPlayer } from './actors.js';

/** Run the match at its own fixed rate for `seconds`, calling `watch` after every step. */
function advance(match, seconds, watch = null) {
  const steps = Math.round(seconds / MATCH.step);
  for (let index = 0; index < steps; index += 1) {
    stepMatch(match, MATCH.step, null);
    if (watch && watch(match, index) === true) return true;
  }
  return false;
}

/** Put the player where the shot needs them, on the quay: a body cannot stand on the water. */
function standPlayer(player, x, z, yaw, pitch = 0) {
  const halfX = (player.yard?.halfX ?? 40) - 1.4;
  const halfZ = (player.yard?.halfZ ?? 26) - 1.4;
  player.position.set(Math.max(-halfX, Math.min(halfX, x)), 0.9, Math.max(-halfZ, Math.min(halfZ, z)));
  player.velocity.set(0, 0, 0);
  player.yaw = yaw;
  if (player.rig) {
    player.rig.yaw = yaw;
    player.rig.pitch = pitch;
  }
}

/**
 * The enemies the player can really see from the eye, nearest first. Occlusion comes from the same
 * hitscan the weapons use, cast at the body: a hand-rolled slab test called a soldier standing dead
 * centre of frame "visible" while he was behind a wall, and the search then framed an empty deck.
 */
function visibleEnemies(match) {
  const player = match.player;
  const eye = new THREE.Vector3(player.position.x, player.position.y + 1.5, player.position.z);
  const yaw = player.rig ? player.rig.yaw : player.yaw;
  const look = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const seen = [];
  for (const bot of match.bots) {
    if (!bot.alive || !match.enemiesOf(bot).includes(player)) continue;
    // Aim the sight line at the torso, which is where the hitscan's body sphere sits. Aiming at the
    // head misses that sphere by a metre and calls every soldier on the yard invisible.
    const to = new THREE.Vector3(bot.position.x, bot.position.y + 0.15, bot.position.z);
    const aim = new THREE.Vector3(bot.position.x, bot.position.y + 1.4, bot.position.z);
    const dir = to.clone().sub(eye).normalize();
    if (aim.clone().sub(eye).normalize().dot(look) < 0.35) continue;
    const shot = hitscan({ weapon: { range: 260 }, alive: true, team: player.team }, [bot], match.yard.solids, 0, match.random, eye, dir);
    if (shot.target !== bot) continue;
    seen.push({ bot, distance: Number(eye.distanceTo(to).toFixed(1)) });
  }
  return seen.sort((a, b) => a.distance - b.distance);
}

/**
 * Stand the camera where the fight actually is. With an enemy in view the camera goes ten metres
 * off them; with nothing in view it still has to close the distance, or the player spins on their
 * spawn line forever and the search never sees a fight — which is exactly what happened first.
 */
function standInTheFight(match, seen) {
  const player = match.player;
  const target = seen[0].bot;
  const centre = match.yard.objective;
  const look = new THREE.Vector3(target.position.x, 0, target.position.z);
  const away = new THREE.Vector3(look.x - centre.x, 0, look.z - centre.z);
  if (away.lengthSq() < 0.01) away.set(0, 0, -1);
  away.normalize();
  // Sixteen metres: close enough that a soldier reads clearly in the frame, far enough that a rocket
  // has room to be seen in the air between the muzzle and the target.
  const px = look.x + away.x * 16;
  const pz = look.z + away.z * 16;
  const yaw = Math.atan2(-(look.x - px), -(look.z - pz));
  standPlayer(player, px, pz, yaw, -0.02);
  return target;
}

/** Walk the player onto the nearest enemy when nothing is in view yet. */
function approach(match) {
  const player = match.player;
  const nearest = match.bots
    .filter((bot) => bot.alive && match.enemiesOf(bot).includes(player))
    .sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position))[0];
  if (!nearest) return null;
  return standInTheFight(match, [{ bot: nearest, distance: Number(player.position.distanceTo(nearest.position).toFixed(1)) }]);
}

/**
 * Aim the player at the nearest enemy and say how they should move. This is a real pilot: it turns
 * the rig, sets a pitch to the enemy's chest, and drives the same movement and firing code the
 * player uses — no teleporting and no forced damage — so a match staged with it is a match that was
 * actually played.
 */
function pilotStep(state) {
  const player = state.player;
  const seen = visibleEnemies(state);
  const target = seen[0]?.bot ?? state.bots
    .filter((bot) => bot.alive && state.enemiesOf(bot).includes(player))
    .sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position))[0];
  if (!target) return { forward: 0, visible: false };
  const dx = target.position.x - player.position.x;
  const dz = target.position.z - player.position.z;
  const distance = Math.hypot(dx, dz);
  if (player.rig) {
    player.rig.yaw = Math.atan2(-dx, -dz);
    player.rig.pitch = Math.atan2((target.position.y + 0.2) - (player.position.y + 1.5), Math.max(0.5, distance));
  }
  return {
    forward: distance > 13 ? 1 : distance < 7 ? -1 : 0,
    strafe: 0,
    sprint: distance > 13,
    crouch: false,
    jump: false,
    visible: seen.length > 0,
    distance,
  };
}

/** Stage one scene, and leave the game in the state the screenshot should show. */
export function stageScene(name, api) {
  const { game, startMatch, seed, settleMatch, maps = [] } = api;
  const params = new URLSearchParams(window.location.search);
  const pick = (key, list, fallback) => {
    const wanted = params.get(key);
    const index = list.findIndex((entry) => entry.key === wanted);
    return index >= 0 ? index : fallback;
  };
  const applyLobby = (modeFallback, mapFallback) => {
    game.lobby.mode = pick('mode', MODES, modeFallback);
    game.lobby.map = pick('map', maps, mapFallback);
    game.lobby.side = params.get('side') === 'red' ? 1 : 0;
  };

  if (name === 'menu') {
    game.screen = 'title';
    return { name: 'menu', accepted: true, screen: game.screen, crew: game.drawn.names, cash: game.profile.cash };
  }

  if (name === 'briefing') {
    applyLobby(2, 1);
    game.lobby.column = 0;
    game.screen = 'briefing';
    return {
      name: 'briefing',
      accepted: true,
      screen: game.screen,
      mode: MODES[game.lobby.mode].key,
      modeName: MODES[game.lobby.mode].name,
      map: maps[game.lobby.map]?.key ?? null,
      mapName: maps[game.lobby.map]?.name ?? null,
      side: game.lobby.side,
      crew: game.drawn.names,
      callsigns: game.drawn.callsigns,
    };
  }

  // The market and the result both need money that was really won, so a match is played out to its
  // end by a pilot using the same movement and firing code as the player, and its payout is banked.
  // Nothing is credited that a match did not earn.
  if (name === 'market' || name === 'result') {
    applyLobby(2, 0);
    startMatch();
    const { match, player, yard } = game.world;
    const rifle = WEAPONS.findIndex((weapon) => weapon.key === 'rifle');
    player.weaponIndex = rifle;
    player.weapon = WEAPONS[rifle];
    player.ammo = player.weapon.magazine;
    const steps = Math.round(900 / MATCH.step);
    let ended = false;
    for (let index = 0; index < steps; index += 1) {
      const order = pilotStep(match);
      if (order.forward !== undefined) {
        stepPlayer(player, MATCH.step, order, yard);
        if (order.visible) match.intent.fire = true;
      }
      stepMatch(match, MATCH.step, null);
      if (match.phase === MATCH_PHASE.MATCH_OVER) {
        ended = true;
        break;
      }
    }
    if (ended && settleMatch) settleMatch();
    game.screen = name === 'market' ? 'market' : 'result';
    game.lobby.market = name === 'market' ? 1 : 0;
    return {
      name,
      accepted: true,
      screen: game.screen,
      matchEnded: ended,
      phase: match.phase,
      mode: match.mode,
      winner: match.winner,
      winnerName: match.winner === 'blue' ? match.names.blue : match.winner === 'red' ? match.names.red : match.winner,
      playerTeam: player.team,
      playerWon: match.winner === player.team,
      score: match.score,
      teamDowns: match.kills,
      playerKills: player.kills,
      playerDeaths: player.deaths,
      cash: game.profile.cash,
      payout: game.payout?.earned ?? 0,
      playedByPilot: true,
    };
  }

  // The fight: a live match, played forward until the frame has everything the shot must show —
  // the player on their feet and just having fired (so the recoil is up), two enemies in the open
  // at fighting range, and a rocket this match launched still in the air.
  applyLobby(0, 0);
  startMatch();
  const { match, player, viewmodel } = game.world;
  const rocketIndex = WEAPONS.findIndex((weapon) => weapon.key === 'rpg');
  player.weaponIndex = rocketIndex;
  player.weapon = WEAPONS[rocketIndex];
  player.ammo = player.weapon.magazine;
  player.reloading = 0;
  let best = null;
  const captured = advance(match, 220, (state) => {
    const seen = visibleEnemies(state);
    if (!seen.length) {
      // Nothing in view: close the distance to the nearest enemy rather than only turning on the
      // spot, which leaves the player alone on their spawn line for the whole search.
      approach(state);
      return false;
    }
    standInTheFight(state, seen);
    state.intent.holdFire = false;
    if (state.player.ammo <= 0) {
      state.player.ammo = state.player.weapon.magazine;
      state.player.reloading = 0;
    }
    const again = visibleEnemies(state);
    if (again.length >= 1 && state.player.reloading <= 0 && state.player.cooldown <= 0 && state.player.ammo > 0) {
      state.intent.fire = true;
    }
    const rocket = state.rockets.find((entry) => entry.owner === state.player);
    const travelled = rocket && rocket.origin
      ? rocket.rocket.group.position.distanceTo(rocket.origin)
      : 0;
    if (
      again.length >= 2
      && travelled > 5
      && state.shots > 0
      && state.hits > 0
      && state.elapsed > 8
      && state.player.alive
      && state.player.health > 20
    ) {
      best = {
        seen: again.map((entry) => `${entry.bot.callsign}@${entry.distance}m`),
        elapsed: Number(state.elapsed.toFixed(1)),
        shots: state.shots,
        hits: state.hits,
        rocketTravelled: Number(travelled.toFixed(1)),
        sinceShot: Number((state.elapsed - state.player.lastShot).toFixed(3)),
      };
      return true;
    }
    return false;
  });
  // Hold the moment on the captured frame: the shot has just been fired, so the recoil is up in the
  // view and the weapon is still kicking. This is the frame after a real shot, not a posed one.
  if (captured) {
    player.lastShot = match.elapsed;
    if (player.rig) player.rig.shake = 0.24;
    if (viewmodel) viewmodel.group.visible = true;
  }
  match.intent.holdFire = false;
  const seen = visibleEnemies(match);
  return {
    name: 'firefight',
    accepted: captured,
    screen: game.screen,
    mode: match.mode,
    map: game.world.map.key,
    visibleEnemies: seen.length,
    enemyDistances: seen.map((entry) => entry.distance).slice(0, 4),
    rocketsInFlight: match.rockets.length,
    at: best,
    reason: captured ? null : 'No frame met the firefight conditions while the player was alive',
  };
}
