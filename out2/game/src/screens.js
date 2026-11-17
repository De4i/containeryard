// The screens that are not the fight: the title, the briefing where mode, crew and map are chosen,
// the market where cash is spent, and the panel that closes a match with the numbers. All drawn on
// the same overlay canvas as the HUD, and every string is measured against its panel before it is
// drawn, because canvas text does not reflow.
import { MATCH, MODES, MAPS, PALETTE, TEAMS } from './config.js';
import { armorPool, marketRows, speedScale, damageScale } from './economy.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const CARD = 'rgba(9,26,32,0.92)';

function label(ctx, text, x, y, size, color, align = 'left', weight = '600') {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Trim a string to fit its panel: a line a few pixels too long spills over the card's edge. */
function fitText(ctx, text, maxWidth, size, weight = '500') {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  let out = String(text);
  if (ctx.measureText(out).width > maxWidth) {
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
    out = `${out.trimEnd()}…`;
  }
  ctx.restore();
  return out;
}

function text(ctx, value, x, y, size, color, align, weight, maxWidth) {
  label(ctx, maxWidth ? fitText(ctx, value, maxWidth, size, weight) : value, x, y, size, color, align, weight);
}

function card(ctx, x, y, width, height, radius = 16) {
  ctx.save();
  ctx.fillStyle = CARD;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function dim(ctx, width, height, alpha = 0.5) {
  ctx.save();
  ctx.fillStyle = `rgba(6,18,22,${alpha})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function body(ctx, text, x, y, width, size = 17, color = 'rgba(255,255,255,0.86)') {
  label(ctx, fitText(ctx, text, width, size), x, y, size, color, 'left', '500');
}

/** One selectable row: the highlight says which option the keyboard is on. */
function row(ctx, { x, y, width, height, title, detail, active, accent = PALETTE.beacon, right = null }) {
  ctx.save();
  ctx.fillStyle = active ? 'rgba(255,207,92,0.16)' : 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.strokeStyle = active ? accent : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = active ? 2 : 1;
  ctx.stroke();
  ctx.fillStyle = active ? accent : 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, 4, height);
  ctx.restore();
  text(ctx, title, x + 14, y + 22, 16, active ? '#ffffff' : 'rgba(255,255,255,0.82)', 'left', '800', width - (right ? 120 : 28));
  if (detail) text(ctx, detail, x + 14, y + height - 10, 13, 'rgba(255,255,255,0.6)', 'left', '500', width - (right ? 130 : 28));
  if (right) text(ctx, right, x + width - 14, y + height / 2 + 5, 15, active ? accent : 'rgba(255,255,255,0.7)', 'right', '800', 110);
}

export function drawMenu(ctx, { drawn, profile }) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  dim(ctx, width, height, 0.45);
  const cardWidth = 780;
  const cardHeight = 452;
  const x = width / 2 - cardWidth / 2;
  const y = height / 2 - cardHeight / 2 - 20;
  card(ctx, x, y, cardWidth, cardHeight);
  const usable = cardWidth - 56;
  label(ctx, 'CONTAINER YARD', width / 2, y + 72, 54, '#ffffff', 'center', '800');
  label(ctx, 'FIVE A SIDE ON A WORKING QUAY', width / 2, y + 104, 17, '#ffcf5c', 'center');
  const lines = [
    'Load the manifest: hold the marked circle at the middle of the yard for seven seconds,',
    'or put the other crew down. Between rounds the cranes swing new freight across, so the',
    'cover you used last round may not be there for the next one.',
    '',
    'Next: pick a mode, the crew you fight for, and the map. Cash you win buys armour,',
    'weapons and attributes in the market — those numbers carry into the next match.',
  ];
  lines.forEach((line, index) => body(ctx, line, x + 28, y + 142 + index * 26, usable, 17));
  label(ctx, `${drawn.names.blue}  vs  ${drawn.names.red}`, width / 2, y + 320, 19, '#ffffff', 'center', '800');
  label(ctx, `CASH $${profile.cash ?? 0}   ·   ARMOUR ${armorPool(profile)}   ·   SPEED ${Math.round((speedScale(profile) - 1) * 100)}%   ·   DAMAGE +${Math.round((damageScale(profile) - 1) * 100)}%`,
    width / 2, y + 348, 14, 'rgba(255,255,255,0.75)', 'center', '600');
  label(ctx, 'PRESS ENTER FOR THE BRIEFING', width / 2, y + cardHeight - 34, 22, '#ffcf5c', 'center', '700');
}

/**
 * The briefing: mode, crew and map on one screen, because they are one decision. The focused column
 * is driven by left/right, the focused option by up/down, and ENTER takes the quay.
 */
export function drawBriefing(ctx, { drawn, profile, modeIndex, sideIndex, mapIndex, column }) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  dim(ctx, width, height, 0.62);
  const pad = 28;
  const cardHeight = Math.min(560, height - 120);
  const y = height / 2 - cardHeight / 2 - 10;
  label(ctx, 'BRIEFING', width / 2, y - 26, 30, '#ffffff', 'center', '800');

  const columns = [
    { key: 'mode', title: 'MODE', items: MODES.map((mode) => ({ title: mode.name, detail: mode.blurb })) },
    {
      key: 'side',
      title: 'CREW',
      items: [
        { title: `${drawn.names.blue}  (north end)`, detail: `you join this crew · ${drawn.callsigns.blue[0]} is your callsign` },
        { title: `${drawn.names.red}  (south end)`, detail: `you join this crew · ${drawn.callsigns.red[0]} is your callsign` },
      ],
    },
    { key: 'map', title: 'MAP', items: MAPS.map((map) => ({ title: map.name, detail: map.blurb })) },
  ];
  const selected = [modeIndex, sideIndex, mapIndex];
  const columnWidth = Math.min(400, (width - pad * 4) / 3);
  columns.forEach((entry, columnIndex) => {
    const x = pad + columnIndex * (columnWidth + pad);
    label(ctx, entry.title, x, y + 18, 15, column === columnIndex ? '#ffcf5c' : 'rgba(255,255,255,0.65)', 'left', '800');
    card(ctx, x - 8, y + 28, columnWidth + 16, cardHeight - 128, 12);
    entry.items.forEach((item, index) => {
      row(ctx, {
        x,
        y: y + 40 + index * 62,
        width: columnWidth,
        height: 56,
        title: item.title,
        detail: item.detail,
        active: selected[columnIndex] === index && column === columnIndex,
        accent: columnIndex === 1 ? TEAMS[selected[1] === 0 ? 'blue' : 'red'].accent : PALETTE.beacon,
      });
    });
  });

  const summary = `MODE ${MODES[modeIndex].name}  ·  CREW ${selected[1] === 0 ? drawn.names.blue : drawn.names.red}  ·  MAP ${MAPS[mapIndex].name}`;
  label(ctx, fitText(ctx, summary, width - 80, 16), width / 2, y + cardHeight - 46, 16, 'rgba(255,255,255,0.85)', 'center', '700');
  label(ctx, `← → column   ↑ ↓ option   ENTER to take the quay   ·   CASH $${profile.cash ?? 0}`, width / 2, y + cardHeight - 16, 15, '#ffcf5c', 'center', '700');
}

/**
 * The market: armour, attributes and weapons, priced, with the cash on the counter. Buying applies
 * the purchase to the profile immediately, which is what makes the numbers carry into a match.
 */
export function drawMarket(ctx, { profile, rows, selection, message }) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  dim(ctx, width, height, 0.55);
  // Size the card to its contents rather than guessing: the row list grows with the catalogue, and
  // a fixed height put the last row on top of the footer text.
  const cardWidth = Math.min(920, width - 80);
  const headerTop = 100;
  const footerHeight = 46;
  const sections = rows.filter((entry, index) => index === 0 || entry.section !== rows[index - 1].section).length;
  const gap = 8;
  const maxCard = height - 64;
  const wanted = headerTop + rows.length * (54 + gap) + sections * 26 + footerHeight + 16;
  const cardHeight = Math.min(maxCard, wanted);
  const rowHeight = Math.max(38, Math.min(54, (cardHeight - headerTop - sections * 26 - footerHeight - 16) / rows.length - gap));
  const x = width / 2 - cardWidth / 2;
  const y = height / 2 - cardHeight / 2;
  card(ctx, x, y, cardWidth, cardHeight);
  label(ctx, 'YARD MARKET', x + 28, y + 48, 34, '#ffffff', 'left', '800');
  label(ctx, `CASH  $${profile.cash ?? 0}`, x + cardWidth - 28, y + 46, 26, '#ffcf5c', 'right', '800');
  label(ctx, `ARMOUR ${armorPool(profile)}  ·  SPEED +${Math.round((speedScale(profile) - 1) * 100)}%  ·  DAMAGE +${Math.round((damageScale(profile) - 1) * 100)}%  ·  OWNED ${(profile.owned ?? []).length} weapons`,
    x + 28, y + 76, 14, 'rgba(255,255,255,0.7)', 'left', '600', cardWidth - 56);

  const rowWidth = cardWidth - 56;
  let lastSection = null;
  let cursor = y + headerTop;
  const positions = [];
  rows.forEach((entry, index) => {
    if (entry.section !== lastSection) {
      label(ctx, entry.section, x + 28, cursor + 15, 13, 'rgba(255,255,255,0.55)', 'left', '800');
      cursor += 26;
      lastSection = entry.section;
    }
    row(ctx, {
      x: x + 28,
      y: cursor,
      width: rowWidth,
      height: rowHeight,
      title: entry.name,
      detail: entry.detail,
      active: selection === index,
      right: entry.owned ? 'OWNED' : `$${entry.cost}`,
    });
    positions.push({ id: entry.id, y: cursor, index });
    cursor += rowHeight + gap;
  });

  const footerY = y + cardHeight - 18;
  const half = (cardWidth - 56) / 2;
  if (message) label(ctx, fitText(ctx, message, half - 10, 16), x + 28, footerY, 16, '#9fe6a0', 'left', '700');
  label(ctx, fitText(ctx, '↑ ↓ choose   ENTER buy   M market   ESC briefing', half - 10, 15), x + cardWidth - 28, footerY, 15, '#ffcf5c', 'right', '700');
  return { positions };
}

/** The end of a match: who won, what the player did, and what the yard paid them. */
export function drawResult(ctx, { match, payout, profile, career }) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const over = match.phase === 'match_over';
  const won = match.winner === match.player.team;
  dim(ctx, width, height, 0.45);
  const cardWidth = 720;
  const cardHeight = over ? 470 : 260;
  const x = width / 2 - cardWidth / 2;
  const y = height / 2 - cardHeight / 2;
  card(ctx, x, y, cardWidth, cardHeight);
  const headline = over
    ? `${match.winner === 'blue' ? TEAMS.blue.name : match.winner === 'red' ? TEAMS.red.name : match.winner} TAKE THE YARD`
    : won ? `ROUND ${match.round} IS YOURS` : `ROUND ${match.round} LOST`;
  const accent = over
    ? (match.winner === 'blue' ? TEAMS.blue.accent : TEAMS.red.accent)
    : won ? '#8fe08a' : PALETTE.beaconHot;
  // Shrink the headline until it fits rather than ellipsising a crew's name off the end of it.
  let headSize = 38;
  ctx.save();
  while (headSize > 20) {
    ctx.font = `800 ${headSize}px ${FONT}`;
    if (ctx.measureText(headline).width <= cardWidth - 60) break;
    headSize -= 2;
  }
  ctx.restore();
  label(ctx, headline, width / 2, y + 74, headSize, accent, 'center', '800');
  label(ctx, `${match.rules.name}  ·  ${match.score.blue} — ${match.score.red}  ·  ROUND ${match.round}`, width / 2, y + 110, 20, '#ffffff', 'center', '700');

  const accuracy = match.shots ? Math.round((match.hits / match.shots) * 100) : 0;
  const stats = [
    `Your match: ${match.player.kills} down · ${match.player.deaths} lost · ${Math.round(match.player.damageDealt)} damage · ${accuracy}% hits`,
    `Team winner: ${match.winner === 'blue' ? TEAMS.blue.name : match.winner === 'red' ? TEAMS.red.name : '—'}  ·  ${match.kills.blue} — ${match.kills.red} team downs`,
    `Objectives taken: ${match.earnings.objectives}  ·  rounds won: ${match.earnings.roundsWon}  ·  crane swings: ${match.craneSwings}`,
  ];
  stats.forEach((line, index) => body(ctx, line, x + 30, y + 152 + index * 30, cardWidth - 60, 17));

  if (over && payout) {
    label(ctx, `CASH EARNED  $${payout.earned}`, x + 30, y + 262, 24, '#ffcf5c', 'left', '800');
    label(ctx, `BALANCE  $${profile.cash ?? 0}`, x + cardWidth - 30, y + 262, 20, '#ffffff', 'right', '800');
    payout.breakdown.forEach((line, index) => {
      body(ctx, line.label, x + 30, y + 294 + index * 24, cardWidth - 200, 15);
      label(ctx, `+$${line.amount}`, x + cardWidth - 30, y + 294 + index * 24, 15, 'rgba(255,255,255,0.85)', 'right', '700');
    });
    label(ctx, `CAREER: ${career.wins}W · ${career.losses}L · ${career.kills} downs · $${career.earned} earned`,
      width / 2, y + cardHeight - 74, 14, 'rgba(255,255,255,0.72)', 'center', '600', cardWidth - 60);
  }
  label(ctx, over ? 'ENTER — MARKET   ·   R — REMATCH' : 'THE NEXT ROUND IS LOADING', width / 2, y + cardHeight - 34, 21, '#ffcf5c', 'center', '700');
}
