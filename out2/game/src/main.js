// Boot and the one loop. The world lives in arena.js, the fighters in actors.js, the shooting in
// combat.js, the rules in match.js, the money in economy.js, and this file joins them: it makes the
// renderer, runs the screens (title, briefing, market, match, result), steps the match at a fixed
// rate and paints what comes back. ?shot=<name> stages a reproducible frame for a screenshot;
// window.advanceTime steps the simulation without frames.
import * as THREE from 'three';
import { MATCH, MAPS, MODES, WEAPONS, drawNames } from './config.js';
import { buildYard, lightYard } from './arena.js';
import { aimCamera, createCameraRig, createPlayer, createViewmodel, stepPlayer } from './actors.js';
import { MATCH_PHASE, beginMatch, createMatch, createRandom, stepMatch } from './match.js';
import { createInput } from './input.js';
import { drawHud } from './hud.js';
import { drawBriefing, drawMarket, drawMenu, drawResult } from './screens.js';
import { createAudio } from './audio.js';
import { buy, loadProfile, marketRows, resetProfile, settle } from './economy.js';
import { stageScene } from './shots.js';

const canvas = document.getElementById('view');
const hudCanvas = document.getElementById('hud');
const status = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const fixedSeed = Number.isInteger(seedParam) ? seedParam : 1;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.1, 620);
const hud = hudCanvas.getContext('2d');
lightYard(scene);

const rig = createCameraRig(camera);
scene.add(camera);
const audio = createAudio();
const input = shot ? null : createInput(canvas);

/** The screens: title, briefing, the fight, the market, and the result panel. */
const game = {
  screen: 'title',
  profile: loadProfile(),
  lobby: { mode: MODES.findIndex((entry) => entry.key === 'bomb'), side: 0, map: 0, column: 0, market: 0 },
  drawn: drawNames(createRandom(fixedSeed), MATCH.teamSize),
  message: '',
  payout: null,
  world: null,
};

/**
 * Build the world for a map and mode, tearing the previous one down first. The map is a layout and
 * a surface, so choosing one really does lay different cover and different sight lines.
 */
function mountWorld({ modeKey, side, mapIndex, seed }) {
  if (game.world) {
    scene.remove(game.world.group);
    camera.remove(game.world.viewmodel.group);
    game.world = null;
  }
  const group = new THREE.Group();
  scene.add(group);
  const map = MAPS[mapIndex] ?? MAPS[0];
  const yard = buildYard(group, { layout: map.layout, surface: map.surface });
  const player = createPlayer(rig, yard, seed);
  player.team = side === 1 ? 'red' : 'blue';
  const match = createMatch({ scene: group, yard, player, seed, audio, mode: modeKey, profile: game.profile });
  const viewmodel = createViewmodel(camera, player.weapon);
  game.world = { group, yard, match, player, viewmodel, map };
  return game.world;
}

/** What a fighter carries into a match: the best thing they have bought, else the rifle. */
function loadoutFor(profile) {
  const order = ['minigun', 'rpg', 'sniper', 'shotgun', 'smg', 'rifle', 'pistol'];
  const owned = profile.owned ?? ['pistol', 'rifle'];
  const key = order.find((entry) => owned.includes(entry)) ?? 'rifle';
  const index = WEAPONS.findIndex((weapon) => weapon.key === key);
  return index >= 0 ? index : 1;
}

/** Begin a match from the lobby's own selections. */
function startMatch() {
  const mode = MODES[game.lobby.mode] ?? MODES[0];
  const world = mountWorld({ modeKey: mode.key, side: game.lobby.side, mapIndex: game.lobby.map, seed: fixedSeed });
  const { player } = world;
  player.weaponIndex = loadoutFor(game.profile);
  player.weapon = WEAPONS[player.weaponIndex];
  player.ammo = player.weapon.magazine;
  beginMatch(world.match);
  game.screen = 'playing';
  game.payout = null;
  game.message = '';
  return world;
}

/** Keep both canvases matched to the window in device pixels. */
function resize() {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(window.innerWidth * ratio);
  const height = Math.round(window.innerHeight * ratio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  hudCanvas.width = width;
  hudCanvas.height = height;
  hud.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

/** Where the player stands and what the frame shows, as plain numbers, for tests and screenshots. */
function textState() {
  const world = game.world;
  const base = {
    screen: game.screen,
    mode: MODES[game.lobby.mode]?.key ?? null,
    map: MAPS[game.lobby.map]?.key ?? null,
    side: game.lobby.side,
    cash: game.profile.cash,
    crew: game.drawn.names,
  };
  if (!world) return base;
  const { match, player, map, yard } = world;
  return {
    ...base,
    mode: match.mode,
    modeName: match.rules.name,
    map: map.key,
    mapName: map.name,
    playerTeam: player.team,
    callsign: player.callsign,
    armorMax: player.armorMax,
    phase: match.phase,
    round: match.round,
    score: match.score,
    clock: Number(match.clock.toFixed(1)),
    objective: yard.objective,
    bomb: {
      site: match.bomb.site?.key ?? null,
      planted: match.bomb.planted,
      fuse: Number((match.bomb.fuse ?? 0).toFixed(1)),
      defuse: Number((match.bomb.defuse ?? 0).toFixed(2)),
    },
    frontline: { z: Number((match.frontline?.z ?? 0).toFixed(2)), push: match.frontline?.push ?? 0 },
    winner: match.winner,
    player: {
      x: Number(player.position.x.toFixed(2)),
      y: Number(player.position.y.toFixed(2)),
      z: Number(player.position.z.toFixed(2)),
      yaw: Number(rig.yaw.toFixed(3)),
      pitch: Number(rig.pitch.toFixed(3)),
      health: Math.round(player.health),
      armor: Math.round(player.armor),
      weapon: player.weapon.key,
      ammo: player.ammo,
      alive: player.alive,
      kills: player.kills,
      deaths: player.deaths,
    },
    bots: match.bots.map((bot) => ({
      name: bot.callsign,
      team: bot.team,
      alive: bot.alive,
      health: Math.round(bot.health),
      kills: bot.kills,
      x: Number(bot.position.x.toFixed(1)),
      z: Number(bot.position.z.toFixed(1)),
      weapon: bot.weapon.key,
      target: bot.target ? (bot.target.isPlayer ? 'YOU' : bot.target.callsign) : null,
    })),
    kills: match.kills,
    earnings: match.earnings,
    feed: match.feed.slice(0, 6).map((line) => line.text),
    shots: match.shots,
    hits: match.hits,
    controls: 'WASD move, mouse look (click to lock), shift sprint, ctrl crouch, space jump, 1-7 weapons, R reload',
  };
}

window.render_game_to_text = () => JSON.stringify(textState());

/** A test door onto the live objects: positions, the camera, and what the player can see. */
window.__yardDebug = () => {
  camera.updateMatrixWorld();
  const world = game.world;
  if (!world) return { screen: game.screen, world: null };
  const { player, match } = world;
  return {
    screen: game.screen,
    mode: match.mode,
    map: world.map.key,
    player: { x: player.position.x, y: player.position.y, z: player.position.z, yaw: rig.yaw, pitch: rig.pitch, team: player.team },
    camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    bots: match.bots.map((bot) => {
      const screen = new THREE.Vector3(bot.position.x, bot.position.y + 0.9, bot.position.z).project(camera);
      return {
        name: bot.callsign,
        team: bot.team,
        alive: bot.alive,
        visible: bot.group.visible,
        x: Number(bot.position.x.toFixed(1)),
        y: Number(bot.position.y.toFixed(2)),
        z: Number(bot.position.z.toFixed(1)),
        inFront: screen.z < 1 && screen.z > -1,
        screenX: Number(screen.x.toFixed(2)),
        screenY: Number(screen.y.toFixed(2)),
        distance: Number(bot.position.distanceTo(player.position).toFixed(1)),
        kills: bot.kills,
      };
    }),
    children: scene.children.length,
    tracers: match.effects.counts,
    rockets: match.rockets.map((entry) => {
      const point = new THREE.Vector3(entry.rocket.group.position.x, entry.rocket.group.position.y, entry.rocket.group.position.z).project(camera);
      return {
        owner: entry.owner === player ? 'YOU' : entry.owner.callsign,
        x: Number(entry.rocket.group.position.x.toFixed(2)),
        y: Number(entry.rocket.group.position.y.toFixed(2)),
        z: Number(entry.rocket.group.position.z.toFixed(2)),
        ndcX: Number(point.x.toFixed(3)),
        ndcY: Number(point.y.toFixed(3)),
        distanceFromPlayer: Number(entry.rocket.group.position.distanceTo(player.position).toFixed(2)),
      };
    }),
  };
};

window.advanceTime = (milliseconds) => {
  const world = game.world;
  if (!world) return 0;
  const steps = Math.max(1, Math.round(milliseconds / 1000 / MATCH.step));
  for (let index = 0; index < steps; index += 1) stepMatch(world.match, MATCH.step, null);
  paint();
  return world.match.elapsed;
};

/**
 * A test door onto a pixel: cast through it and say what the renderer actually put there. This is
 * how a stray object on screen is identified by its real geometry and colour instead of guessed at.
 */
window.__pick = (ndcX, ndcY) => {
  const world = game.world;
  if (!world) return null;
  camera.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const targets = [];
  scene.traverse((node) => {
    if (node.isMesh) targets.push(node);
  });
  const hits = raycaster.intersectObjects(targets, false).slice(0, 4);
  return hits.map((hit) => ({
    distance: Number(hit.distance.toFixed(2)),
    geometry: hit.object.geometry?.type ?? '?',
    size: hit.object.geometry?.parameters
      ? ['width', 'height', 'depth', 'radiusTop', 'radius', 'radiusBottom'].reduce((acc, key) => {
          if (hit.object.geometry.parameters[key] !== undefined) acc[key] = hit.object.geometry.parameters[key];
          return acc;
        }, {})
      : null,
    colour: hit.object.material?.color ? `#${hit.object.material.color.getHexString()}` : null,
    point: { x: Number(hit.point.x.toFixed(2)), y: Number(hit.point.y.toFixed(2)), z: Number(hit.point.z.toFixed(2)) },
    parentAt: { x: Number(hit.object.parent.position.x.toFixed(2)), y: Number(hit.object.parent.position.y.toFixed(2)), z: Number(hit.object.parent.position.z.toFixed(2)) },
  }));
};

/** Paint one frame: the world, then the overlay for whatever screen is up. */
function paint() {
  const world = game.world;
  const view = { width: window.innerWidth, height: window.innerHeight };
  hud.setTransform(1, 0, 0, 1, 0, 0);
  hud.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  const ratio = hudCanvas.width / Math.max(1, window.innerWidth);
  hud.setTransform(ratio, 0, 0, ratio, 0, 0);

  if (world) {
    const { player, match, yard, viewmodel } = world;
    // Put the eye where the player stands before every frame: without this the camera sits at the
    // origin and the shot is of nothing.
    aimCamera(rig, player.position, player.crouching);
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const sinceShot = Math.max(0, (match.elapsed ?? 0) - player.lastShot);
    viewmodel.weapon = player.weapon;
    viewmodel.group.visible = player.alive;
    viewmodel.step(0.016, Math.min(1, speed / 6), Math.max(0, 0.14 - sinceShot) * 6);
    renderer.render(scene, camera);
    if (game.screen === 'playing') drawHud(hud, player, match, yard);
    if (game.screen === 'playing' && (match.phase === MATCH_PHASE.ROUND_OVER || match.phase === MATCH_PHASE.MATCH_OVER)) {
      drawResult(hud, { match, payout: null, profile: game.profile, career: game.profile.career });
    }
    if (game.screen === 'result') {
      drawResult(hud, { match, payout: game.payout, profile: game.profile, career: game.profile.career });
    }
  } else {
    renderer.render(scene, camera);
  }

  if (game.screen === 'title') drawMenu(hud, { drawn: game.drawn, profile: game.profile });
  if (game.screen === 'briefing') {
    drawBriefing(hud, {
      drawn: game.drawn,
      profile: game.profile,
      modeIndex: game.lobby.mode,
      sideIndex: game.lobby.side,
      mapIndex: game.lobby.map,
      column: game.lobby.column,
    });
  }
  if (game.screen === 'market') {
    drawMarket(hud, { profile: game.profile, rows: marketRows(game.profile), selection: game.lobby.market, message: game.message });
  }
}

/** Settle a finished match once: the payout, the career totals, and the result screen. */
function settleMatch() {
  if (game.payout) return;
  const { match, player } = game.world;
  const result = settle(game.profile, {
    won: match.winner === player.team,
    kills: player.kills,
    deaths: player.deaths,
    objectives: match.earnings.objectives,
    roundsWon: match.earnings.roundsWon,
  });
  game.payout = result;
  game.screen = 'result';
  game.message = `Payout: $${result.earned}`;
}

/** The keyboard, read as screens rather than as a fight. */
function stepScreens(taps) {
  const { lobby } = game;
  for (const code of taps) {
    if (game.screen === 'title') {
      if (code === 'Enter' || code === 'Space') game.screen = 'briefing';
      continue;
    }
    if (game.screen === 'briefing') {
      if (code === 'ArrowLeft') lobby.column = (lobby.column + 2) % 3;
      else if (code === 'ArrowRight') lobby.column = (lobby.column + 1) % 3;
      else if (code === 'ArrowUp' || code === 'ArrowDown') {
        const delta = code === 'ArrowUp' ? -1 : 1;
        if (lobby.column === 0) lobby.mode = (lobby.mode + delta + MODES.length) % MODES.length;
        else if (lobby.column === 1) lobby.side = (lobby.side + delta + 2) % 2;
        else lobby.map = (lobby.map + delta + MAPS.length) % MAPS.length;
      } else if (code === 'Enter' || code === 'Space') {
        startMatch();
      } else if (code === 'KeyM') {
        game.screen = 'market';
        game.message = 'spend it on armour, attributes or a weapon';
      }
      continue;
    }
    if (game.screen === 'market') {
      const rows = marketRows(game.profile);
      if (code === 'ArrowDown') lobby.market = (lobby.market + 1) % rows.length;
      else if (code === 'ArrowUp') lobby.market = (lobby.market - 1 + rows.length) % rows.length;
      else if (code === 'Enter' || code === 'Space') {
        const outcome = buy(game.profile, rows[lobby.market]?.id);
        game.message = outcome.reason;
      } else if (code === 'KeyR') {
        game.profile = resetProfile();
        lobby.market = 0;
        game.message = 'profile cleared';
      } else if (code === 'Escape') game.screen = 'briefing';
      continue;
    }
    if (game.screen === 'result') {
      if (code === 'Enter') {
        game.screen = 'market';
        game.message = 'spend it on armour, attributes or a weapon';
      } else if (code === 'KeyR') startMatch();
    }
  }
}

// A world is built at boot so the title card has the yard behind it, on the default map and mode.
mountWorld({ modeKey: MODES[game.lobby.mode].key, side: game.lobby.side, mapIndex: game.lobby.map, seed: fixedSeed });

if (shot) {
  window.__shotReport = stageScene(shot, { game, startMatch, mountWorld, settleMatch, seed: fixedSeed, maps: MAPS, marketRows });
  // Keep painting instead of painting twice and stopping: resizing the window (a screenshot harness
  // setting the viewport) calls renderer.setSize, which empties the canvas drawing buffer, so a
  // one-shot paint leaves the capture with the clear colour and nothing in it. The match is not
  // stepped here, so the staged frame stays frozen while the buffer stays fresh.
  const hold = () => {
    paint();
    window.__shotReady = true;
    requestAnimationFrame(hold);
  };
  requestAnimationFrame(hold);
} else {
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MATCH.maxFrameDt);
    last = now;
    if (game.screen !== 'playing') {
      stepScreens(input.takeTaps());
      accumulator = 0;
    } else {
      accumulator += dt;
      input.read(game.world.match);
      while (accumulator >= MATCH.step) {
        stepPlayer(game.world.player, MATCH.step, input.movement(), game.world.yard);
        stepMatch(game.world.match, MATCH.step, input);
        input.consume();
        accumulator -= MATCH.step;
      }
      const { match } = game.world;
      if (match.phase === MATCH_PHASE.MATCH_OVER) settleMatch();
      if (status && match.feed[0] && status.textContent !== match.feed[0].text) status.textContent = match.feed[0].text;
    }
    paint();
  }
  requestAnimationFrame(frame);
}

export { scene, camera, game };
