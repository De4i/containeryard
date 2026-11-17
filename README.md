# CONTAINER YARD

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/De4i/containeryard/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/De4i/containeryard/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A five-a-side first-person match on a working container quay, for make.fun's "Make the best game"
bounty. Two crews of five fight over a yard of stacked freight, asphalt roads and cranes that swing
new containers across the lanes between rounds. Choose a mode, the crew you fight for and the map,
then fight it out: team deathmatch and free-for-all are won on downs, the bomb site is won by
planting or cutting the charge, and the frontline is won by driving one contested line into the
enemy end. Winning pays cash, and the market spends it on armour, weapons and attributes that carry
into the next match.

Every name is drawn per match — the crews and each fighter's callsign — and every map is laid
differently, so no two matches read the same.

## Run it

```sh
node serve.ts --port 8091        # serves game/ on http://localhost:8091/
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # what the grader runs
```

## Controls

WASD to move, the mouse to look (click to lock the pointer), SHIFT to sprint, CTRL to crouch,
SPACE to jump, 1-7 for weapons, R to reload, and ENTER on the briefing to take the quay.

## Layout

- `game/` — the playable game: static files, no build step, no network request.
  - `game/src/arena.js` — the yard itself: roads and pads, buildings with roofs and windows, pipe
    runs, signage, cranes, the two bomb sites and the moored ships.
  - `game/src/actors.js` — the fighters: the camera rig, bots with helmet, vest and rifle, movement
    and collision, and the first-person viewmodel.
  - `game/src/combat.js` — the shooting: hit-scan, damage, tracers, muzzle flashes, sparks, hit
    markers and the rocket projectile with its splash.
  - `game/src/match.js` — the rules of each mode, the round clock, bot behaviour, the kill feed and
    the money a match pays.
  - `game/src/economy.js` — the profile: cash, and the armour, weapon and attribute purchases the
    market applies to the numbers the simulation reads.
  - `game/src/screens.js`, `game/src/hud.js` — the briefing, market and result panels, and the
    in-match overlay with the radar, the kill feed and the rosters.
  - `game/src/shots.js` — the staged frames behind `?shot=`, played forward through the real rules.
- `main.ts` — hands `game/` and `screenshots/` in and writes `dossier.json`.
- `screenshots/` — four captures of the game running in desktop Chrome.

---

<sub>Entered on [make.fun](https://make.fun?utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
