// The money: what a fighter takes off the yard and what the market charges for it. A profile is
// kept in the browser's own storage, so cash earned in one match is there in the next, and every
// purchase writes real numbers onto the fighter the simulation moves and shoots with — armour pool,
// walk speed and weapon damage — rather than a cosmetic label.
import { CASH, FREE_WEAPONS, MARKET_WEAPONS, MARKET_NAMES, WEAPONS } from './config.js';

const STORAGE_KEY = 'containeryard.profile.v1';

/** A brand new fighter: no cash, the starting armour, every attribute at level one. */
export function newProfile() {
  return {
    cash: CASH.start,
    armorTier: 0,
    attributes: { speed: 1, armour: 1, damage: 1 },
    owned: [...FREE_WEAPONS],
    career: { matches: 0, wins: 0, losses: 0, kills: 0, deaths: 0, earned: 0, objectives: 0 },
  };
}

/** Read the profile back, or start one when there is nothing stored or it cannot be trusted. */
export function loadProfile(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return newProfile();
    const parsed = JSON.parse(raw);
    const fresh = newProfile();
    return {
      ...fresh,
      ...parsed,
      attributes: { ...fresh.attributes, ...(parsed.attributes ?? {}) },
      career: { ...fresh.career, ...(parsed.career ?? {}) },
      owned: Array.isArray(parsed.owned) && parsed.owned.length ? parsed.owned : fresh.owned,
    };
  } catch {
    return newProfile();
  }
}

/** Write the profile back. Storage can be unavailable, and a match must not fall over for it. */
export function saveProfile(profile, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

/** The armour pool this profile takes into a match: the tier bought, plus the plating attribute. */
export function armorPool(profile) {
  return 100 + (profile.armorTier ?? 0) * 25 + ((profile.attributes?.armour ?? 1) - 1) * 12;
}

/** How much faster this profile walks, from the boots attribute. */
export function speedScale(profile) {
  return 1 + ((profile.attributes?.speed ?? 1) - 1) * 0.04;
}

/** How much harder this profile's weapons hit, from the barrel work attribute. */
export function damageScale(profile) {
  return 1 + ((profile.attributes?.damage ?? 1) - 1) * 0.03;
}

/**
 * Write a profile's purchases onto a fighter. This is the join between the market and the match:
 * every number the simulation reads about the player comes through here.
 */
export function applyProfile(fighter, profile) {
  fighter.armorMax = armorPool(profile);
  fighter.armor = fighter.armorMax;
  fighter.speedScale = speedScale(profile);
  fighter.damageScale = damageScale(profile);
  fighter.profile = profile;
  return fighter;
}

/** What the market sells, as rows the screen can draw and the buyer can act on. */
export function marketRows(profile) {
  const rows = [];
  const tier = profile.armorTier ?? 0;
  const nextArmor = CASH.market.armor[tier + 1];
  rows.push({
    id: 'armor',
    section: 'ARMOUR',
    name: `BALLISTIC PLATE ${['I', 'II', 'III', 'IV'][tier] ?? 'IV'}`,
    detail: `Armour pool ${armorPool(profile)} → ${100 + (tier + 1) * 25 + ((profile.attributes?.armour ?? 1) - 1) * 12}`,
    cost: nextArmor ?? null,
    owned: nextArmor === undefined,
  });
  for (const [key, cost] of Object.entries(CASH.market.attributes)) {
    const level = profile.attributes?.[key] ?? 1;
    const maxed = level >= CASH.market.maxLevel;
    rows.push({
      id: `attr:${key}`,
      section: 'ATTRIBUTES',
      name: `${MARKET_NAMES[key] ?? key.toUpperCase()}  ${level}/${CASH.market.maxLevel}`,
      detail: marketAttributeBlurb(key, level),
      cost: maxed ? null : cost * level,
      owned: maxed,
    });
  }
  for (const key of MARKET_WEAPONS) {
    const weapon = WEAPONS.find((entry) => entry.key === key);
    const owned = profile.owned?.includes(key);
    rows.push({
      id: `weapon:${key}`,
      section: 'WEAPONS',
      name: weapon?.name ?? key.toUpperCase(),
      detail: owned ? 'in your loadout — press its slot in a match' : `damage ${weapon?.damage ?? '?'} · range ${weapon?.range ?? '?'} m`,
      cost: owned ? null : MARKET_PRICES[key],
      owned,
    });
  }
  return rows;
}

const MARKET_PRICES = { sniper: 900, rpg: 1400, minigun: 1800 };

function marketAttributeBlurb(key, level) {
  const next = level + 1;
  if (key === 'speed') return `Walk speed +${(level - 1) * 4}% → +${(next - 1) * 4}%`;
  if (key === 'armour') return `Plating +${(level - 1) * 12} → +${(next - 1) * 12} armour`;
  return `Weapon damage +${(level - 1) * 3}% → +${(next - 1) * 3}%`;
}

/** Buy a row by id. Returns what happened, so the screen can say it rather than guess. */
export function buy(profile, id) {
  const rows = marketRows(profile);
  const row = rows.find((entry) => entry.id === id);
  if (!row) return { ok: false, reason: 'nothing by that name on the shelf' };
  if (row.owned || row.cost === null) return { ok: false, reason: `${row.name} is already yours` };
  if ((profile.cash ?? 0) < row.cost) return { ok: false, reason: `you need $${row.cost - profile.cash} more` };
  profile.cash -= row.cost;
  if (id === 'armor') profile.armorTier = (profile.armorTier ?? 0) + 1;
  else if (id.startsWith('attr:')) {
    const key = id.slice(5);
    profile.attributes[key] = Math.min(CASH.market.maxLevel, (profile.attributes[key] ?? 1) + 1);
  } else if (id.startsWith('weapon:')) {
    const key = id.slice(7);
    profile.owned = [...new Set([...(profile.owned ?? []), key])];
  }
  saveProfile(profile);
  return { ok: true, reason: `bought ${row.name} for $${row.cost}`, cost: row.cost };
}

/** The cash a finished match pays out, and the career totals that go with it. */
export function settle(profile, result) {
  const won = result.won;
  const earned = (result.kills ?? 0) * CASH.perKill
    + (result.objectives ?? 0) * CASH.perObjective
    + (result.roundsWon ?? 0) * CASH.perRoundWin
    + (won ? CASH.perMatchWin : CASH.lossConsolation);
  profile.cash = (profile.cash ?? 0) + earned;
  profile.career.matches += 1;
  profile.career.wins += won ? 1 : 0;
  profile.career.losses += won ? 0 : 1;
  profile.career.kills += result.kills ?? 0;
  profile.career.deaths += result.deaths ?? 0;
  profile.career.objectives += result.objectives ?? 0;
  profile.career.earned += earned;
  saveProfile(profile);
  return { earned, breakdown: breakdown(result) };
}

/** The payout written out line by line, so the end screen can show where the money came from. */
export function breakdown(result) {
  const lines = [
    { label: `Downs × ${result.kills ?? 0}`, amount: (result.kills ?? 0) * CASH.perKill },
    { label: `Objectives × ${result.objectives ?? 0}`, amount: (result.objectives ?? 0) * CASH.perObjective },
    { label: `Rounds won × ${result.roundsWon ?? 0}`, amount: (result.roundsWon ?? 0) * CASH.perRoundWin },
    { label: result.won ? 'Match won' : 'Match lost — consolation', amount: result.won ? CASH.perMatchWin : CASH.lossConsolation },
  ];
  return lines.filter((line) => line.amount > 0);
}

/** Clear the profile: the market screen offers it so a run can start over. */
export function resetProfile(storage = globalThis.localStorage) {
  const fresh = newProfile();
  saveProfile(fresh, storage);
  return fresh;
}
