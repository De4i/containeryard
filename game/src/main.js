// Boot and the one loop. The world lives in arena.js, the fighters in actors.js, the shooting in
// combat.js, the match in match.js, and this file joins them: it makes the renderer, reads the
// controls, steps the match at a fixed rate and paints what comes back. ?shot=<name> stages a
// reproducible frame for a screenshot; window.advanceTime steps the simulation without frames.
import * as THREE from 'three';
import { MATCH, PALETTE } from './config.js';
import { buildYard, lightYard } from './arena.js';
import { aimCamera, createCameraRig, createPlayer, createViewmodel, stepPlayer } from './actors.js';
import { createMatch, stepMatch, MATCH_PHASE } from './match.js';
import { createInput } from './input.js';
import { drawHud } from './hud.js';
import { drawMenu, drawResult } from './screens.js';
import { createAudio } from './audio.js';
import { stageScene } from './shots.js';

const canvas = document.getElementById('view');
const hudCanvas = document.getElementById('hud');
const status = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const fixedSeed = Number.isInteger(seedParam) ? seedParam : null;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.1, 420);
const hud = hudCanvas.getContext('2d');

lightYard(scene);
const yard = buildYard(scene);
const rig = createCameraRig(camera);
const player = createPlayer(rig, yard, fixedSeed ?? 1);
// The camera lives in the scene so the weapon it carries is drawn with it.
scene.add(camera);
const viewmodel = createViewmodel(camera, player.weapon);
const match = createMatch({ scene, yard, player, seed: fixedSeed ?? 1, audio: createAudio() });
const input = shot ? null : createInput(canvas);

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
  return {
    phase: match.phase,
    menu: match.menu,
    round: match.round,
    score: match.score,
    clock: Number(match.clock.toFixed(1)),
    cap: Number(match.cap.toFixed(2)),
    objective: match.yard.objective,
    player: {
      x: Number(player.position.x.toFixed(2)),
      y: Number(player.position.y.toFixed(2)),
      z: Number(player.position.z.toFixed(2)),
      yaw: Number(rig.yaw.toFixed(3)),
      pitch: Number(rig.pitch.toFixed(3)),
      health: player.health,
      armor: player.armor,
      weapon: player.weapon.key,
      ammo: player.ammo,
      alive: player.alive,
    },
    bots: match.bots.map((bot) => ({
      team: bot.team,
      alive: bot.alive,
      health: bot.health,
      x: Number(bot.position.x.toFixed(1)),
      z: Number(bot.position.z.toFixed(1)),
      weapon: bot.weapon.key,
      target: bot.target ? bot.target.name : null,
    })),
    alive: { blue: match.aliveCount('blue'), red: match.aliveCount('red') },
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
  return {
    player: { x: player.position.x, y: player.position.y, z: player.position.z, yaw: rig.yaw, pitch: rig.pitch },
    camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    bots: match.bots.map((bot) => {
      const screen = new THREE.Vector3(bot.position.x, bot.position.y + 0.9, bot.position.z).project(camera);
      return {
        name: bot.name,
        team: bot.team,
        alive: bot.alive,
        visible: bot.group.visible,
        x: Number(bot.position.x.toFixed(1)),
        y: Number(bot.position.y.toFixed(2)),
        z: Number(bot.position.z.toFixed(1)),
        groupY: Number(bot.group.position.y.toFixed(2)),
        inFront: screen.z < 1 && screen.z > -1,
        screenX: Number(screen.x.toFixed(2)),
        screenY: Number(screen.y.toFixed(2)),
        distance: Number(bot.position.distanceTo(player.position).toFixed(1)),
        vx: Number(bot.velocity.x.toFixed(2)),
        vz: Number(bot.velocity.z.toFixed(2)),
        forward: bot.target ? 'engaging' : 'advancing',
      };
    }),
    children: scene.children.length,
    tracers: match.effects.counts,
  };
};
window.advanceTime = (milliseconds) => {
  const steps = Math.max(1, Math.round(milliseconds / 1000 / MATCH.step));
  for (let index = 0; index < steps; index += 1) stepMatch(match, MATCH.step, null);
  paint();
  return match.elapsed;
};

/** Paint one frame: the world, then the overlay for whatever screen the match is on. */
function paint() {
  // Put the eye where the player stands before every frame: without this the camera sits at the
  // origin and the shot is of nothing.
  aimCamera(rig, player.position, player.crouching);
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  const sinceShot = Math.max(0, (match.elapsed ?? 0) - player.lastShot);
  viewmodel.weapon = player.weapon;
  viewmodel.group.visible = player.alive;
  viewmodel.step(0.016, Math.min(1, speed / 6), Math.max(0, 0.14 - sinceShot) * 6);
  renderer.render(scene, camera);
  hud.setTransform(1, 0, 0, 1, 0, 0);
  hud.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  const ratio = hudCanvas.width / window.innerWidth;
  hud.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (match.menu === 'title') drawMenu(hud, { state: textState(), match });
  else {
    drawHud(hud, player, match, yard);
    if (match.phase === MATCH_PHASE.ROUND_OVER || match.phase === MATCH_PHASE.MATCH_OVER) drawResult(hud, { state: textState(), match });
  }
}

if (shot) {
  stageScene(shot, { match, player, rig, scene, yard, seed: fixedSeed ?? 1 });
  let painted = 0;
  const clean = () => {
    paint();
    painted += 1;
    if (painted < 2) requestAnimationFrame(clean);
    else window.__shotReady = true;
  };
  requestAnimationFrame(clean);
} else {
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MATCH.maxFrameDt);
    last = now;
    accumulator += dt;
    input.read(match);
    while (accumulator >= MATCH.step) {
      stepPlayer(player, MATCH.step, input.movement(), yard);
      stepMatch(match, MATCH.step, input);
      input.consume();
      accumulator -= MATCH.step;
    }
    paint();
    if (status && match.feed[0] && status.textContent !== match.feed[0].text) status.textContent = match.feed[0].text;
  }
  requestAnimationFrame(frame);
}

export { scene, camera, match, player, yard };
