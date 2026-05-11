// Run engine. A "run" is one descent: FLOORS_TOTAL floors, each with 2-3
// nodes in a branching corridor. The player picks one node per floor row.
// Node kinds:
//   patient → triggers a session (positioning puzzle) with a tier-appropriate patient
//   quiet   → a non-combat event with text choices
//   consult → an upgrade (pick an attachment OR rest)
//   keeper  → at the end of certain floors: a tougher patient
//   warden  → only on the last floor: the final puzzle

import { state, FLOORS_TOTAL, MAX_ATTACHMENTS } from './state.js';
import { PATIENTS, ATTACHMENTS, EVENTS, ADMISSIONS, tieredPatientIds } from './data.js';
import { pick, pickN } from './rng.js';
import { beginSession } from './session.js';

// Tier band per floor (which patient tier shows up on which floor).
function floorTierBand(floorIdx) {
  return [2, 3, 3, 4][Math.max(0, Math.min(FLOORS_TOTAL - 2, floorIdx))];
}

// Build the full corridor of FLOORS_TOTAL floors. The final floor is a single Warden node.
export function generateCorridor() {
  const floors = [];
  const usedPatients = new Set();

  for (let f = 0; f < FLOORS_TOTAL; f++) {
    if (f === FLOORS_TOTAL - 1) {
      floors.push([{ kind: 'warden', patientId: 'Warden' }]);
      continue;
    }
    const row = [];
    const count = (f === 0) ? 2 : (f === FLOORS_TOTAL - 2 ? 2 : 3);
    for (let n = 0; n < count; n++) {
      row.push(generateNode(f, usedPatients));
    }
    floors.push(row);
  }
  return { floors, path: [], currentFloor: 0, currentNode: null };
}

function generateNode(floorIdx, usedPatients) {
  const roll = Math.random();
  let kind;
  if (floorIdx === 0) {
    // First floor — bias toward patient encounters to teach the mechanic.
    kind = roll < 0.70 ? 'patient' : (roll < 0.90 ? 'quiet' : 'consult');
  } else {
    kind = roll < 0.55 ? 'patient' : (roll < 0.80 ? 'quiet' : 'consult');
  }

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

// Place keeper patients at the end of the second-to-last non-warden floor.
export function placeKeepers(corridor) {
  if (FLOORS_TOTAL < 3) return;
  const f = Math.max(0, FLOORS_TOTAL - 2);
  const row = corridor.floors[f];
  if (!row) return;
  const tier = floorTierBand(f) + 1;
  const pool = tieredPatientIds(tier).filter(id => id !== 'Warden');
  if (!pool.length) return;
  const speciesId = pick(pool);
  const idx = Math.min(row.length - 1, Math.floor(row.length / 2));
  row[idx] = { kind: 'keeper', patientId: speciesId };
}

// ── lifecycle ────────────────────────────────────────────────────────
export function startRun(admissionId) {
  const adm = ADMISSIONS[admissionId];
  state.admissionId = adm.id;
  state.composureMax = adm.composure;
  state.composure = adm.composure;
  state.attachments = [...(adm.startingAttachments || [])];
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
    beginSession(node.patientId);
    state.screen = 'session';
  } else if (node.kind === 'quiet') {
    state.event = { id: node.eventId, lastChoiceOutcome: null };
    state.screen = 'quiet';
  } else if (node.kind === 'consult') {
    state.screen = 'consult';
  }
}

export function advanceCorridor() {
  if (!state.corridor) return;
  const cur = state.corridor.currentFloor;
  if (cur >= FLOORS_TOTAL - 1) {
    if (state.corridor.path[FLOORS_TOTAL - 1] != null) {
      state.endResult = { kind: 'won' };
      state.screen = 'victory';
      return;
    }
  }
  betweenRoomsRest();
  state.corridor.currentFloor++;
  state.corridor.currentNode = null;
  if (state.corridor.currentFloor >= FLOORS_TOTAL) {
    state.endResult = { kind: 'won' };
    state.screen = 'victory';
    return;
  }
  state.screen = 'corridor';
}

function betweenRoomsRest() {
  const restAmount = 2 + (state.attachments.includes('compose') ? 2 : 0);
  state.composure = Math.min(state.composureMax, state.composure + restAmount);
}

export function addAttachment(id) {
  if (!ATTACHMENTS[id]) return false;
  if (state.attachments.includes(id)) return false;
  if (state.attachments.length >= MAX_ATTACHMENTS) return false;
  state.attachments.push(id);
  return true;
}

export function rollConsultOptions() {
  const taken = new Set(state.attachments);
  const pool = Object.keys(ATTACHMENTS).filter(k => !taken.has(k));
  const options = pickN(pool, Math.min(3, pool.length));
  return options;
}

export function applyEventEffect(effect) {
  if ('heal' in effect) {
    state.composure = Math.min(state.composureMax, state.composure + effect.heal);
  }
  if ('damage' in effect) {
    state.composure = Math.max(0, state.composure - effect.damage);
    if (state.composure <= 0) state.endResult = { kind: 'lost', reason: 'event_collapse' };
  }
  if ('addAttachment' in effect) {
    if (effect.addAttachment === 'random') {
      const opts = rollConsultOptions();
      if (opts.length) addAttachment(opts[0]);
    } else {
      addAttachment(effect.addAttachment);
    }
  }
  if ('gainComposureMax' in effect) {
    state.composureMax += effect.gainComposureMax;
    state.composure += effect.gainComposureMax;
  }
}
