# CONTAINER YARD — handoff

A 5v5 first-person match on a working container quay, for make.fun's **best-game-01**
("Make the best game"). Original in every part that can be copied: our own name, map, weapons,
uniforms, palette and code. The concept only — a browser arena shooter with modes, teams and cash —
is shared with anothershooter.lol; nothing of its code, art or names is used.

## Run it

```sh
cd /home/ade_rian/makefun/containeryard
node serve.ts --port 8091          # serves game/ (a dev server was left running on 8091)
# then open http://localhost:8091/           for the game
#           http://localhost:8091/?shot=<name>&seed=N   for a staged frame
```
Screenshot scenes: `menu`, `firefight`, `objective`, `result` (`src/shots.js`).

## Where things stand

**Working, verified in a real browser (zero console errors):**
- `src/arena.js` — the yard: concrete quay, 5 freight rows, two gantry cranes, warehouse, fence,
  light masts, bollards, drums, palette, objective ring, spawn lines. Brighter daylight now
  (hemisphere 1.7, sun 2.6, fog pushed back) — vision check called it "relatively bright".
- `src/actors.js` — bodies with helmet/vest/goggles/rifle, camera rig, movement + AABB collision,
  armour pool, and a first-person viewmodel with bob and recoil kick.
- `src/combat.js` — hit-scan (sphere/box ray casts), damage table, tracers as thin boxes, muzzle
  flashes with a point light, sparks, hit markers, **and a real rocket projectile** (`createRocket`,
  `stepRocket`) with 7 m splash.
- `src/match.js` — rounds (first to 3), freeze/live/round-over/match-over, per-round reset, crane
  shuffle between rounds, bot behaviour (targeting, line-of-sight, burst discipline, cover),
  armour-aware damage, team-safe targeting, kill feed naming killer + weapon + victim.
- `src/hud.js` — zoned layout with measured/trimmed text: crew rosters left, score+clock centre,
  kill feed right, health+armour+weapon bottom, radar "YARD" bottom-right, cap bar, down overlay.
- `src/input.js`, `src/audio.js`, `src/screens.js` (menu + results), `src/config.js` (weapons, teams,
  palette), `src/main.js` (loop, ?shot= staging, `window.render_game_to_text`, `window.advanceTime`,
  `window.__yardDebug`).

**Known open bug — the blocker for the play screenshot:**
The frame that `capture_screenshot()` saves does not match the state read by `js()` a moment earlier
in the same call. Example: state said player alive at 100 HP with five enemies in the frustum; the
saved image showed "YOU ARE DOWN", health 0, ROUND 1, 64 s, and a single tiny soldier. Until the
capture and the measurement are provably the same target and the same frame, there is no honest
"during play, with enemies" screenshot. **Fix this first.**
Also: the last frames show soldiers only 1–2 % of the screen; the vantage needs to be closer to the
objective where the fight actually happens.
Third: the bots' lethality is real but low (≈4 % of shots land); fights resolve slowly.

**Not built yet (the user's checklist):**
1. Random names for teams and fighters (currently QUAY CREW / SALVAGE GANG and BLUE-2, RED-5).
2. Menu flow: mode select (Team Deathmatch, Free-For-All, 5v5 Bomb Site, Frontline), team select,
   map select — no UI or state for modes/maps exists.
3. Economy: cash earned per win/kill/objective, persisted; a market screen to buy armour, weapons
   and attributes.
4. End-game screen: winner, total kills, deaths, cash earned for the player.
5. Map architecture: the yard is still containers on a slab; add real buildings, roofs, gantries,
   signage, varied silhouettes (the user's "jangan kotak-kotak").
6. Radar to the top-left and the kill feed to the top-right (radar is bottom-right today; the roster
   owns the top-left, so the roster needs a new home or a scoreboard toggle).
7. Tidy the briefing screen's text after the layout changes.

**No entry infrastructure yet:** no `main.ts` for this project, no gate validation, no commit, no
push, **and no submission.** Nothing may be submitted before the user has seen the final screenshots.

## Constraints that bind the build (from the bounty's RULES)

- `game/` is static: no build step, no network request at play time, `index.html` opens in Chrome.
- A vendored library must be `*.min.js` — three.js r169 is vendored at `game/vendor/three.module.min.js`
  (687 KB, referenced through the single import map in `index.html`). `*.min.js` is left out of the
  transcript gate's line count, which is why it must stay minified.
- Screenshots: 3 or 4, each ≤256 KiB, long side ≤1280, short side ≥480. Capture at 1280×720 with a
  CDP device-metrics override and **assert the size** — the override is lost across tabs/reloads.
- `dossier.json` ≤1.5 MiB; `game/` ≤993 entries and ≤48 MiB; `main.ts` must write identical bytes on
  two runs.
- Entry: repo `github.com/De4i/silkspan` pattern — new public repo created after the opening, commit
  pushed, `.makefun/owner.json` with an account wallet, transcripts bundled from the building session
  (`bundle --repo <entry> --no-family --hermes-dir ~/.hermes --harness hermes-agent
  --harness-version 0.20.5 --model gpt-6.1-sol --effort default --mcp none`), then the kit's `check`.

## Also on this machine

`~/makefun/best-game-01/entry` (repo `De4i/silkspan`) is **already submitted** to best-game-01:
submission `01a1e841-d8b2-74f6-9551-b0079b49697c`, commit `f09c1de`, dev rate **0.7906**
(valid 1, 7W-3L-2D). Rank ~545 of 8.4k; paid line is ~0.92, screening line ~0.86, so it will be
screened out. One attempt was left for 17 Nov, three more after the 00:00 UTC reset; the deadline is
**18 Nov 18:00 UTC (19 Nov 01:00 WIB)**. The current entry is the latest, and `final_pick` is null.
