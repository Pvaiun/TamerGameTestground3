// Run engine. A "run" is one descent: 5 floors, each with 2-3 nodes in a
// branching corridor. The player picks one node per floor row. Nodes:
//
//   patient → triggers a session against a randomly chosen patient at the
//             floor's tier band
//   quiet   → a non-combat event with text choices
//   consult → an upgrade (pick an attachment OR heal)
//   keeper  → at the end of floor 2 and floor 4: a tougher patient
//   warden  → only on floor 5: the final boss
//
// Generation places nodes per-floor (always 2 nodes per row → branching choice).

import { state, FLOORS_TOTAL, NODES_PER_FLOOR, MAX_WARDS, MAX_ATTACHMENTS } from './state.js';
import { PATIENTS, FIXATIONS, ATTACHMENTS, EVENTS, ADMISSIONS, tieredPatientIds } from './data.js';
import { pick, pickN, randi } from './rng.js';
import { filedPatientIds } from './persist.js';
import { beginSession } from './session.js';

// Tier band per floor (which patient tier shows up on which floor).
function floorTierBand(floorIdx) {
  // 1-indexed floor: 1 → tier 1-2, 2 → tier 2-3, 3 → tier 3, 4 → tier 3-4, 5 → tier 4-warden
  // We will treat 'maxTier' as max allowed.
  return [2, 3, 3, 4, 4][Math.max(0, Math.min(4, floorIdx))];
}

// Build a corridor of `FLOORS_TOTAL` floors. Each floor has 2 nodes side-by-side.
// The final floor has a single WARDEN node.
export function generateCorridor() {
  const floors = [];
  const usedPatients = new Set();

  for (let f = 0; f < FLOORS_TOTAL; f++) {
    if (f === FLOORS_TOTAL - 1) {
      // Final floor — single Warden node.
      floors.push([{ kind: 'warden', patientId: 'Warden' }]);
      continue;
    }
    const row = [];
    // 2 nodes per row, sometimes 3 on middle floors.
    const count = (f === 1 || f === 2) ? 3 : 2;
    for (let n = 0; n < count; n++) {
      row.push(generateNode(f, usedPatients));
    }
    floors.push(row);
  }
  return { floors, path: [], currentFloor: 0, currentNode: null };
}

function generateNode(floorIdx, usedPatients) {
  // Roll node type with weights that vary by floor.
  // Quiet events are scarcer near the bottom. Consult nodes are rare overall.
  const roll = Math.random();
  let kind;
  if (floorIdx === 0) {
    // First floor — bias toward patient encounters to teach combat.
    kind = roll < 0.75 ? 'patient' : (roll < 0.9 ? 'quiet' : 'consult');
  } else if (floorIdx === 1 || floorIdx === 2) {
    kind = roll < 0.55 ? 'patient' : (roll < 0.80 ? 'quiet' : 'consult');
  } else {
    // Floor 4: keeper guaranteed somewhere, but we keep simple.
    kind = roll < 0.65 ? 'patient' : (roll < 0.90 ? 'quiet' : 'consult');
  }

  // Keeper nodes: at the END of floor 1 and floor 3 (0-indexed), place a keeper
  // by replacing one node post-generation. Done in postPlace.

  if (kind === 'patient') {
    const tier = floorTierBand(floorIdx);
    const pool = tieredPatientIds(tier).filter(id => !usedPatients.has(id));
    const speciesId = pool.length ? pick(pool) : pick(tieredPatientIds(tier));
    usedPatients.add(speciesId);
    return { kind: 'patient', patientId: speciesId };
  }
  if (kind === 'quiet') {
    const eventIds = Object.keys(EVENTS);
    const id = pick(eventIds);
    return { kind: 'quiet', eventId: id };
  }
  return { kind: 'consult' };
}

// Promote one node per keeper floor into a keeper encounter. Keeper floors:
// floor 1 (0-indexed) and floor 3.
export function placeKeepers(corridor) {
  const keeperFloors = [1, 3];
  for (const f of keeperFloors) {
    if (f >= corridor.floors.length - 1) continue;
    const row = corridor.floors[f];
    // Pick a high-tier patient from the next tier band.
    const tier = floorTierBand(f) + 1;
    const pool = tieredPatientIds(tier).filter(id => id !== 'Warden');
    const speciesId = pick(pool);
    // Replace the middle node, or 0 if only 2 nodes.
    const idx = Math.min(row.length - 1, Math.floor(row.length / 2));
    row[idx] = { kind: 'keeper', patientId: speciesId };
  }
}

// ── lifecycle ─────────────────────────────────────────────────────────
export function startRun(admissionId) {
  const adm = ADMISSIONS[admissionId];
  state.admissionId = adm.id;
  state.composureMax = adm.composure;
  state.composure = adm.composure;
  state.attachments = [...(adm.startingAttachments || [])];
  state.wards = (adm.startingWards || []).map(speciesId => ({ speciesId, used: false }));
  state.protagonistFile = [...(adm.admissionProse || [])];
  state.endResult = null;
  state.event = null;
  state.session = null;
  state.corridor = generateCorridor();
  placeKeepers(state.corridor);
}

export function chooseNode(floorIdx, nodeIdx) {
  if (!state.corridor) return;
  if (floorIdx !== state.corridor.currentFloor) return;
  const row = state.corridor.floors[floorIdx];
  if (!row || nodeIdx < 0 || nodeIdx >= row.length) return;
  state.corridor.path[floorIdx] = nodeIdx;
  state.corridor.currentNode = nodeIdx;
  const node = row[nodeIdx];
  if (node.kind === 'patient' || node.kind === 'keeper' || node.kind === 'warden') {
    const isFirst = state.corridor.currentFloor === 0 && state.corridor.path.length === 1;
    beginSession(node.patientId, { isFirstSession: isFirst });
    state.screen = 'session';
  } else if (node.kind === 'quiet') {
    state.event = { id: node.eventId, lastChoiceOutcome: null };
    state.screen = 'quiet';
  } else if (node.kind === 'consult') {
    state.screen = 'consult';
  }
}

// Advance the corridor after a node resolves. Called after each successful
// node completion. Heals partial composure between rooms (small).
export function advanceCorridor() {
  if (!state.corridor) return;
  const cur = state.corridor.currentFloor;
  if (cur >= FLOORS_TOTAL - 1) {
    // Just finished the warden node? Check victory.
    if (state.corridor.path[FLOORS_TOTAL - 1] != null) {
      state.endResult = { kind: 'won' };
      state.screen = 'victory';
      return;
    }
  }
  // Small rest between rooms.
  betweenRoomsRest();
  state.corridor.currentFloor++;
  state.corridor.currentNode = null;
  if (state.corridor.currentFloor >= FLOORS_TOTAL) {
    // Cannot happen — the warden node above triggers it. Safety.
    state.endResult = { kind: 'won' };
    state.screen = 'victory';
    return;
  }
  state.screen = 'corridor';
}

function betweenRoomsRest() {
  const restAmount = 2 + (state.attachments.includes('compose') ? 3 : 0);
  state.composure = Math.min(state.composureMax, state.composure + restAmount);
}

// Add an attachment to the player's loadout. Returns true if added.
export function addAttachment(id) {
  if (!ATTACHMENTS[id]) return false;
  if (state.attachments.includes(id)) return false;
  if (state.attachments.length >= MAX_ATTACHMENTS) return false;
  state.attachments.push(id);
  return true;
}

export function addWard(speciesId) {
  if (!PATIENTS[speciesId]) return false;
  if (!PATIENTS[speciesId].ward) return false;
  if (state.wards.find(w => w.speciesId === speciesId)) return false;
  if (state.wards.length >= MAX_WARDS) return false;
  state.wards.push({ speciesId, used: false });
  return true;
}

export function loseAttachment() {
  if (!state.attachments.length) return null;
  return state.attachments.pop();
}

// Pick a consult upgrade. Returns possible options.
export function rollConsultOptions() {
  const taken = new Set(state.attachments);
  const pool = Object.keys(ATTACHMENTS).filter(k => !taken.has(k));
  const options = pickN(pool, Math.min(3, pool.length));
  return options;
}

// Apply event effects.
export function applyEventEffect(effect) {
  if ('heal' in effect) {
    state.composure = Math.min(state.composureMax, state.composure + effect.heal);
  }
  if ('damage' in effect) {
    state.composure = Math.max(0, state.composure - effect.damage);
    if (state.composure <= 0) {
      state.endResult = { kind: 'lost', reason: 'event_collapse' };
    }
  }
  if ('addAttachment' in effect) {
    if (effect.addAttachment === 'random') {
      const opts = rollConsultOptions();
      if (opts.length) addAttachment(opts[0]);
    } else {
      addAttachment(effect.addAttachment);
    }
  }
  if ('addWard' in effect) {
    let target = effect.addWard;
    if (target === 'random' || target === 'random_filed') {
      const pool = filedPatientIds().filter(id => PATIENTS[id] && PATIENTS[id].ward && !state.wards.find(w => w.speciesId === id));
      if (pool.length && state.wards.length < MAX_WARDS) {
        addWard(pick(pool));
      } else if (target === 'random' || target === 'random_unfiled') {
        // No filed wards available — fall through to random_unfiled
        const wPool = Object.keys(PATIENTS).filter(id => PATIENTS[id].ward && !state.wards.find(w => w.speciesId === id));
        if (wPool.length && state.wards.length < MAX_WARDS) addWard(pick(wPool));
      }
    } else if (target === 'random_unfiled') {
      const wPool = Object.keys(PATIENTS).filter(id => PATIENTS[id].ward && !state.wards.find(w => w.speciesId === id));
      if (wPool.length && state.wards.length < MAX_WARDS) addWard(pick(wPool));
    } else {
      addWard(target);
    }
  }
  if ('revealFixation' in effect) {
    state.pendingFixationReveal = effect.revealFixation;
  }
  if ('gainComposureMax' in effect) {
    state.composureMax += effect.gainComposureMax;
    state.composure += effect.gainComposureMax;
  }
}
