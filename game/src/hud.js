// The overlay, in fixed zones so nothing drifts and nothing leaves its panel: the two crews on the
// left, the round and the clock at the top, the kill feed on the right, the player's own health,
// armour and weapon along the bottom, and the radar above the weapon. Every string is measured and
// trimmed to its panel before it is drawn.
import { MATCH, PALETTE, TEAMS } from './config.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PANEL = 'rgba(9,26,32,0.66)';
const EDGE = 'rgba(255,255,255,0.14)';

/** The zones, so every panel has one owner and a fixed place: radar top-left, feed top-right. */
const ZONE = {
  radar: { x: 16, y: 16, size: 168 },
  roster: { x: 16, y: 228, width: 200 },
  score: { width: 380, y: 14, height: 72 },
  feed: { x: -16, y: 16, width: 340 },
  vitals: { x: 16, width: 330, height: 96 },
  weapon: { x: -16, width: 300, height: 118 },
};

function panel(ctx, x, y, width, height, radius = 10) {
  ctx.save();
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** Text that is trimmed with an ellipsis rather than allowed out of its panel. */
function text(ctx, value, x, y, size, color, align = 'left', weight = '600', maxWidth = Infinity) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  let shown = String(value);
  if (Number.isFinite(maxWidth)) {
    if (ctx.measureText(shown).width > maxWidth) {
      let cut = shown;
      while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
      shown = `${cut}…`;
    }
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(shown, x, y);
  ctx.restore();
}

/** A bar with a track, a fill and a reading that always sits inside its panel. */
function bar(ctx, x, y, width, height, share, color, label, reading) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fill();
  const filled = Math.max(0, Math.min(1, share)) * width;
  if (filled > 0.5) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, filled, height, height / 2);
    ctx.fill();
  }
  ctx.restore();
  text(ctx, label, x, y - 5, 12, 'rgba(255,255,255,0.72)', 'left', '700');
  text(ctx, reading, x + width, y - 5, 12, '#ffffff', 'right', '700');
}

/** The crosshair: four ticks that open with the spread, plus the hit marker. */
function crosshair(ctx, width, height, spread, marker) {
  const cx = width / 2;
  const cy = height / 2;
  const gap = 5 + spread * 240;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 2;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * gap, cy + dy * gap);
    ctx.lineTo(cx + dx * (gap + 8), cy + dy * (gap + 8));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(cx - 1, cy - 1, 2, 2);
  if (marker > 0) {
    ctx.strokeStyle = `rgba(255,240,190,${marker})`;
    ctx.lineWidth = 2.5;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * 4, cy + sy * 4);
      ctx.lineTo(cx + sx * 10, cy + sy * 10);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The two crews, one block each: who is up, who is down, and what they have done. */
function rosters(ctx, match, player) {
  const you = { name: 'YOU', callsign: 'YOU', alive: player.alive, kills: player.kills, isPlayer: true };
  const side = (key) => match.bots.filter((bot) => bot.team === key);
  const rows = match.rules?.teams === false
    ? [{ label: 'FIGHTERS', accent: PALETTE.beacon, fighters: [player, ...match.bots].slice().sort((a, b) => b.kills - a.kills) }]
    : [
        { label: TEAMS.blue.name, accent: TEAMS.blue.accent, fighters: player.team === 'blue' ? [you, ...side('blue')] : side('blue') },
        { label: TEAMS.red.name, accent: TEAMS.red.accent, fighters: player.team === 'red' ? [you, ...side('red')] : side('red') },
      ];
  let y = ZONE.roster.y;
  for (const row of rows) {
    const alive = row.fighters.filter((fighter) => fighter.alive).length;
    panel(ctx, ZONE.roster.x, y, ZONE.roster.width, 32);
    ctx.fillStyle = row.accent;
    ctx.fillRect(ZONE.roster.x, y, 4, 32);
    text(ctx, `${row.label}  ${alive}/${row.fighters.length}`, ZONE.roster.x + 12, y + 21, 13, row.accent, 'left', '800', ZONE.roster.width - 22);
    y += 38;
    for (const fighter of row.fighters) {
      const name = fighter.isPlayer ? 'YOU' : fighter.callsign ?? fighter.name;
      text(ctx, name, ZONE.roster.x + 20, y + 16, 14, fighter.alive ? '#ffffff' : 'rgba(255,255,255,0.38)', 'left', '600', 110);
      text(ctx, fighter.alive ? `${fighter.kills} down` : 'out', ZONE.roster.x + ZONE.roster.width - 12, y + 16, 12, fighter.alive ? 'rgba(255,255,255,0.66)' : 'rgba(255,120,90,0.85)', 'right', '600', 92);
      y += 20;
    }
    y += 10;
  }
}

/** The wallet: what the player is carrying, and what this match has paid so far. */
function wallet(ctx, match, player) {
  const y = ZONE.radar.y + ZONE.radar.size + 8;
  panel(ctx, ZONE.roster.x, y, ZONE.roster.width, 28);
  text(ctx, `CASH $${player.profile?.cash ?? 0}`, ZONE.roster.x + 12, y + 19, 14, '#ffcf5c', 'left', '800', 100);
  text(ctx, `+$${(match.earnings?.kills ?? 0) * 40}`, ZONE.roster.x + ZONE.roster.width - 12, y + 19, 13, 'rgba(255,255,255,0.8)', 'right', '700', 80);
}

/** The round, the clock and who is left. */
function scoreline(ctx, view, match) {
  const x = view.width / 2 - ZONE.score.width / 2;
  panel(ctx, x, ZONE.score.y, ZONE.score.width, ZONE.score.height);
  text(ctx, TEAMS.blue.name, x + 16, ZONE.score.y + 24, 13, TEAMS.blue.accent, 'left', '800', 150);
  text(ctx, TEAMS.red.name, x + ZONE.score.width - 16, ZONE.score.y + 24, 13, TEAMS.red.accent, 'right', '800', 150);
  text(ctx, `${match.score.blue}`, view.width / 2 - 30, ZONE.score.y + 56, 26, '#ffffff', 'center', '800');
  text(ctx, '—', view.width / 2, ZONE.score.y + 54, 20, 'rgba(255,255,255,0.55)', 'center');
  text(ctx, `${match.score.red}`, view.width / 2 + 30, ZONE.score.y + 56, 26, '#ffffff', 'center', '800');
  const target = match.rules?.winKills ? `FIRST TO ${match.rules.winKills}` : match.rules?.bomb ? `FIRST TO ${match.roundsToWin}` : match.rules?.frontline ? 'PUSH THE LINE' : '';
  const subtitle = match.rules?.bomb
    ? `ROUND ${match.round} · ${target}`
    : `${match.rules?.name ?? ''}${target ? ` · ${target}` : ''}`;
  text(ctx, subtitle, view.width / 2, ZONE.score.y + 72, 12, 'rgba(255,255,255,0.75)', 'center', '700', ZONE.score.width - 24);
  const clock = match.phase === 'freeze' ? `STARTS ${Math.ceil(match.freeze)}` : `${Math.max(0, Math.ceil(match.clock))}s`;
  text(ctx, clock, x + ZONE.score.width + 12, ZONE.score.y + 40, 20, match.clock < 20 && match.phase === 'live' ? PALETTE.beaconHot : '#ffffff', 'left', '800', 100);
  const downs = match.rules?.teams === false
    ? `DOWNS ${match.player.kills}`
    : `UP ${match.aliveCount('blue')} · ENEMY ${match.aliveCount('red')}`;
  text(ctx, downs, x - 12, ZONE.score.y + 40, 14, '#ffffff', 'right', '700', 150);
}

/** The kill feed: killer, the weapon between them, and the fighter who went down. */
function killFeed(ctx, view, match) {
  const x = view.width + ZONE.feed.x;
  match.feed.slice(0, 6).forEach((line, index) => {
    const y = ZONE.feed.y + index * 26;
    const colour = line.team === 'blue' ? TEAMS.blue.accent : line.team === 'red' ? TEAMS.red.accent : '#ffffff';
    ctx.save();
    ctx.globalAlpha = Math.min(1, line.life / 1.5);
    text(ctx, line.text, x, y + 16, 15, colour, 'right', '700', ZONE.feed.width);
    ctx.restore();
  });
}

/** The player's own state: who they are, what is left of them, and their armour. */
function vitals(ctx, view, player) {
  const y = view.height - ZONE.vitals.height - 16;
  panel(ctx, ZONE.vitals.x, y, ZONE.vitals.width, ZONE.vitals.height);
  text(ctx, `YOU · ${TEAMS[player.team].name}`, ZONE.vitals.x + 16, y + 24, 14, TEAMS[player.team].accent, 'left', '800', 170);
  text(ctx, player.alive ? (player.crouching ? 'CROUCHED' : player.onGround ? 'ON THE DECK' : 'IN THE AIR') : 'DOWN', ZONE.vitals.x + ZONE.vitals.width - 16, y + 24, 12, 'rgba(255,255,255,0.7)', 'right', '700', 130);
  bar(ctx, ZONE.vitals.x + 16, y + 44, ZONE.vitals.width - 32, 14, player.health / 100, player.health > 55 ? '#8fe08a' : player.health > 25 ? PALETTE.beacon : PALETTE.beaconHot, 'HEALTH', `${Math.max(0, Math.round(player.health))}`);
  bar(ctx, ZONE.vitals.x + 16, y + 76, ZONE.vitals.width - 32, 14, player.armor / (player.armorMax ?? 100), '#8fd0ff', 'ARMOR', `${Math.max(0, Math.round(player.armor))}`);
}

/** Which weapon, what is in it, and the seven slots. */
function weaponPanel(ctx, view, player) {
  const y = view.height - ZONE.weapon.height - 16;
  const x = view.width + ZONE.weapon.x - ZONE.weapon.width;
  panel(ctx, x, y, ZONE.weapon.width, ZONE.weapon.height);
  text(ctx, 'WEAPON', x + 16, y + 22, 12, 'rgba(255,255,255,0.7)', 'left', '700');
  text(ctx, player.weapon.name, x + ZONE.weapon.width - 16, y + 26, 18, '#ffffff', 'right', '800', ZONE.weapon.width - 90);
  text(ctx, player.reloading > 0 ? 'RELOADING' : `${player.ammo}`, x + ZONE.weapon.width - 16, y + 68, 34, player.ammo <= 5 && player.reloading <= 0 ? PALETTE.beaconHot : '#ffffff', 'right', '800', 150);
  if (player.reloading <= 0) text(ctx, `of ${player.reserve ?? 90}`, x + ZONE.weapon.width - 16, y + 88, 13, 'rgba(255,255,255,0.7)', 'right', '600', 150);
  ['1', '2', '3', '4', '5', '6', '7'].forEach((slot, index) => {
    const bx = x + 16 + index * 26;
    const active = index === player.weaponIndex;
    ctx.save();
    ctx.fillStyle = active ? 'rgba(255,207,92,0.95)' : 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.roundRect(bx, y + ZONE.weapon.height - 30, 21, 18, 4);
    ctx.fill();
    ctx.restore();
    text(ctx, slot, bx + 10.5, y + ZONE.weapon.height - 17, 12, active ? '#123840' : 'rgba(255,255,255,0.85)', 'center', '800');
  });
}

/** The radar: the yard from above, in the top-left corner, turned with the view. */
function radar(ctx, view, player, match, yard) {
  const size = ZONE.radar.size;
  const x = ZONE.radar.x;
  const y = ZONE.radar.y;
  panel(ctx, x, y, size, size, 10);
  text(ctx, 'YARD', x + 10, y + 17, 11, 'rgba(255,255,255,0.7)', 'left', '800');
  const cx = x + size / 2;
  const cy = y + size / 2 + 6;
  const scale = size / 62;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, size - 2, size - 2, 10);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(player.rig ? player.rig.yaw : 0);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(-size, -size, size * 2, size * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-yard.halfX * scale, -yard.halfZ * scale, yard.halfX * 2 * scale, yard.halfZ * 2 * scale);
  for (const box of yard.solids) {
    if (box.kind === 'bullet' || box.sy > 2.2) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect((box.x - player.position.x) * scale - box.sx * scale, (box.z - player.position.z) * scale - box.sz * scale, box.sx * 2 * scale, box.sz * 2 * scale);
  }
  ctx.strokeStyle = '#ffcf5c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc((yard.objective.x - player.position.x) * scale, (yard.objective.z - player.position.z) * scale, yard.objective.radius * scale, 0, Math.PI * 2);
  ctx.stroke();
  if (match.rules?.frontline) {
    ctx.strokeStyle = '#ff8a5a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-size, (match.frontline.z - player.position.z) * scale);
    ctx.lineTo(size, (match.frontline.z - player.position.z) * scale);
    ctx.stroke();
  }
  for (const bot of match.bots) {
    if (!bot.alive) continue;
    const friend = match.rules?.teams !== false && bot.team === player.team;
    ctx.fillStyle = friend ? TEAMS.blue.accent : TEAMS.red.accent;
    ctx.beginPath();
    ctx.arc((bot.position.x - player.position.x) * scale, (bot.position.z - player.position.z) * scale, friend ? 3 : 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawHud(ctx, player, match, yard) {
  const view = { width: window.innerWidth, height: window.innerHeight };
  const spreads = { pistol: 0.012, rifle: 0.02, smg: 0.032, shotgun: 0.09, sniper: 0.002, rpg: 0.01, minigun: 0.05 };
  crosshair(ctx, view.width, view.height, (spreads[player.weapon.key] ?? 0.02) * (player.crouching ? 0.6 : 1), match.effects.markerStrength);
  scoreline(ctx, view, match);
  rosters(ctx, match, player);
  wallet(ctx, match, player);
  killFeed(ctx, view, match);
  vitals(ctx, view, player);
  weaponPanel(ctx, view, player);
  radar(ctx, view, player, match, yard);

  if (match.rules?.bomb) {
    // The charge: planting progress, then the fuse the defending crew has to cut.
    const width = 260;
    const x = view.width / 2 - width / 2;
    const y = view.height / 2 + 58;
    const bomb = match.bomb ?? {};
    if (!bomb.planted && match.cap > 0.02) {
      panel(ctx, x, y, width, 26, 6);
      ctx.fillStyle = TEAMS.blue.accent;
      ctx.fillRect(x + 6, y + 14, (width - 12) * Math.min(1, match.cap), 8);
      text(ctx, `PLANTING AT ${bomb.site?.label ?? ''}`, view.width / 2, y + 12, 11, 'rgba(255,255,255,0.92)', 'center', '800', width - 12);
    } else if (bomb.planted) {
      panel(ctx, x, y, width, 30, 6);
      text(ctx, `CHARGE ARMED — ${Math.max(0, Math.ceil(bomb.fuse))}s`, view.width / 2, y + 14, 12, PALETTE.beaconHot, 'center', '800', width - 12);
      ctx.fillStyle = bomb.defuse > 0 ? '#8fe08a' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(x + 6, y + 19, (width - 12) * Math.min(1, bomb.defuse), 5);
    }
  } else if (match.rules?.frontline) {
    const width = 300;
    const x = view.width / 2 - width / 2;
    const y = view.height / 2 + 58;
    panel(ctx, x, y, width, 26, 6);
    const share = Math.min(1, Math.abs(match.frontline.z) / (match.yard.halfZ - 3));
    ctx.fillStyle = match.frontline.z < 0 ? TEAMS.blue.accent : TEAMS.red.accent;
    ctx.fillRect(x + 6, y + 14, (width - 12) * share, 8);
    text(ctx, `FRONTLINE ${match.frontline.push > 0 ? 'ADVANCING' : match.frontline.push < 0 ? 'FALLING BACK' : 'HELD'}`, view.width / 2, y + 12, 11, 'rgba(255,255,255,0.92)', 'center', '800', width - 12);
  } else if (match.cap > 0.02) {
    const width = 220;
    const x = view.width / 2 - width / 2;
    const y = view.height / 2 + 58;
    panel(ctx, x, y, width, 26, 6);
    ctx.fillStyle = match.capTeam === 'blue' ? TEAMS.blue.accent : TEAMS.red.accent;
    ctx.fillRect(x + 6, y + 14, (width - 12) * Math.min(1, match.cap), 8);
    text(ctx, 'LOADING THE MANIFEST', view.width / 2, y + 12, 11, 'rgba(255,255,255,0.9)', 'center', '800', width - 12);
  }

  if (player.health <= 30 && player.alive) {
    const vignette = ctx.createRadialGradient(view.width / 2, view.height / 2, view.height * 0.32, view.width / 2, view.height / 2, view.height * 0.78);
    vignette.addColorStop(0, 'rgba(200,30,20,0)');
    vignette.addColorStop(1, `rgba(200,30,20,${0.5 * (1 - player.health / 30)})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, view.width, view.height);
  }

  if (!player.alive) {
    ctx.fillStyle = 'rgba(10,20,25,0.55)';
    ctx.fillRect(0, 0, view.width, view.height);
    text(ctx, 'YOU ARE DOWN', view.width / 2, view.height / 2 - 6, 40, '#ffffff', 'center', '800');
    text(ctx, 'your crew fights on', view.width / 2, view.height / 2 + 30, 18, 'rgba(255,255,255,0.82)', 'center', '600');
  }
}
