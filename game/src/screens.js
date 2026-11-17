// The two screens that are not the fight: the title card that says what this is and how to play it,
// and the panel that closes a round or a match with the numbers. Drawn on the same overlay canvas.
import { MATCH, PALETTE, TEAMS } from './config.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function label(ctx, text, x, y, size, color, align = 'left', weight = '600') {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function card(ctx, x, y, width, height) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,24,30,0.9)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

export function drawMenu(ctx, { state, match }) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  ctx.save();
  ctx.fillStyle = 'rgba(6,18,22,0.45)';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  const cardWidth = 760;
  const cardHeight = 430;
  const x = width / 2 - cardWidth / 2;
  const y = height / 2 - cardHeight / 2 - 20;
  card(ctx, x, y, cardWidth, cardHeight);
  label(ctx, 'CONTAINER YARD', width / 2, y + 72, 54, '#ffffff', 'center', '800');
  label(ctx, 'FIVE A SIDE ON A WORKING QUAY', width / 2, y + 104, 17, '#ffcf5c', 'center');
  const lines = [
    `${MATCH.teamSize}v${MATCH.teamSize} against yard bots. First to ${MATCH.roundsToWin} rounds takes the match.`,
    'Load the manifest: hold the marked circle at the middle of the yard for 7 seconds,',
    'or put the other crew down. Between rounds the cranes swing new freight across the lanes,',
    'so the cover you used last round may not be there for the next one.',
    '',
    'WASD move · mouse to look · click to lock the pointer · SHIFT sprint · CTRL crouch · SPACE jump',
    '1-7 weapons · hold click to fire · R reload · P pause',
  ];
  lines.forEach((line, index) => label(ctx, line, width / 2, y + 142 + index * 26, 17, 'rgba(255,255,255,0.86)', 'center', '500'));
  label(ctx, 'PRESS ENTER TO TAKE THE QUAY', width / 2, y + cardHeight - 34, 22, '#ffcf5c', 'center', '700');

  // Both crews, named on one line of their own, so the sides are readable before the first shot.
  label(ctx, `${TEAMS.blue.name}  vs  ${TEAMS.red.name}`, width / 2, y + 348, 19, '#ffffff', 'center', '700');
}

export function drawResult(ctx, { state, match }) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const over = match.phase === 'match_over';
  const won = match.lastRoundWinner === match.player.team;
  const cardWidth = 660;
  const cardHeight = over ? 400 : 260;
  const x = width / 2 - cardWidth / 2;
  const y = height / 2 - cardHeight / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(6,18,22,0.4)';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  card(ctx, x, y, cardWidth, cardHeight);
  const heading = over
    ? match.score.blue > match.score.red
      ? `${TEAMS.blue.name} TAKE THE YARD`
      : `${TEAMS.red.name} TAKE THE YARD`
    : won
      ? `ROUND ${match.round} IS YOURS`
      : `ROUND ${match.round} LOST`;
  label(ctx, heading, width / 2, y + 74, 38, over ? (match.score.blue > match.score.red ? TEAMS.blue.accent : TEAMS.red.accent) : won ? '#8fe08a' : PALETTE.beaconHot, 'center', '800');
  label(ctx, `ROUNDS ${match.score.blue} — ${match.score.red}`, width / 2, y + 112, 22, '#ffffff', 'center');
  const accuracy = match.shots ? Math.round((match.hits / match.shots) * 100) : 0;
  const stats = [
    `Your rifle: ${match.player.kills} down · ${match.player.deaths} lost · ${Math.round(match.player.damageDealt)} damage`,
    `The yard: ${match.shots} shots fired · ${match.hits} on target · ${accuracy}% hits`,
    `Crane swings so far: ${match.craneSwings}`,
  ];
  stats.forEach((line, index) => label(ctx, line, width / 2, y + 156 + index * 28, 17, 'rgba(255,255,255,0.85)', 'center', '500'));
  if (over) {
    const best = match.bots.slice().sort((a, b) => b.kills - a.kills)[0];
    label(ctx, `Best on the yard: ${best ? `${best.name} with ${best.kills}` : 'nobody stood out'}`, width / 2, y + 252, 17, 'rgba(255,255,255,0.75)', 'center', '500');
  }
  label(ctx, over ? 'PRESS ENTER FOR A NEW MATCH' : 'THE NEXT ROUND IS LOADING', width / 2, y + cardHeight - 34, 21, '#ffcf5c', 'center', '700');
}
