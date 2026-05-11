// Session engine — version 2. Deterministic tactical positioning puzzle.
//
// Each session takes place in a room: a graph of named positions, with the
// player and the patient as tokens on it. Items live at positions (or in the
// player's hand). The patient moves each turn per a deterministic pattern;
// the next move is computed and shown BEFORE the player acts. The player
// chooses one of: MOVE (to an adjacent position), ACT (one of the actions
// available at the current position given the current state), or WAIT.
//
// Win = trigger an action with effect "win".
// Loss = composure <= 0 OR turnsRemaining <= 0 OR loseIf condition (e.g.
//        patient reaches a forbidden position).

import { state } from './state.js';
import { PATIENTS } from './data.js';
import { nextPatientMove, commitPatternState } from './patterns.js';
import { recordEncounter, recordReach } from './persist.js';

// ── lifecycle ────────────────────────────────────────────────────────
export function beginSession(speciesId, opts = {}) {
  const patient = PATIENTS[speciesId];
  if (!patient) throw new Error('Unknown patient: ' + speciesId);
  recordEncounter(speciesId);
  const room = patient.room;

  // Items start at their declared positions.
  const itemAt = {};
  for (const item of room.items || []) itemAt[item.id] = item.startAt;

  const session = {
    patientId: speciesId,
    patient,
    playerPos: room.playerStart,
    patientPos: room.patientStart,
    patientNextPos: null,        // telegraphed
    playerComposureMax: room.playerComposureMax || 6,
    playerComposure:    room.playerComposureMax || 6,
    turnLimit: room.turnLimit || 8,
    turnsTaken: 0,
    itemAt,                       // { itemId -> positionId }
    carrying: null,               // single item carried
    tags: new Set(),              // arbitrary boolean flags set by actions
    actionsUsed: new Set(),       // ids of actions that have been used (for `once`)
    log: [],
    resolved: false,
    outcome: null,                // 'win' | 'loss'
    lossReason: null,
  };

  // Initialize cycle pattern internal state so the first telegraph is the
  // NEXT position in the cycle after patientStart.
  const pat = room.patientPattern || {};
  if (pat.type === 'cycle' && Array.isArray(pat.sequence)) {
    const startIdx = pat.sequence.indexOf(session.patientStart != null ? session.patientStart : room.patientStart);
    session._cycleIdx = startIdx >= 0 ? startIdx : -1;
  }

  // Apply on_session_start attachments.
  for (const aId of state.attachments) {
    const a = ATTACHMENT_HANDLERS[aId];
    if (a && a.onSessionStart) a.onSessionStart(session, state);
  }

  // Compute the patient's first move.
  session.patientNextPos = nextPatientMove(session);

  state.session = session;
  appendLog(session, patient.intro, 'intro');
  return session;
}

export function endSession() {
  if (!state.session) return;
  // Carry over player composure as a fraction of max — between sessions, you
  // recover toward your run-wide composure max, but a bad session leaves you
  // weaker for the next.
  const frac = state.session.playerComposure / state.session.playerComposureMax;
  state.composure = Math.max(1, Math.round(state.composureMax * Math.max(frac, 0.4)));
  state.session = null;
}

export function sessionOutcome() {
  const s = state.session;
  if (!s || !s.resolved) return null;
  return { reached: s.outcome === 'win', overwhelmed: s.outcome === 'loss', reason: s.lossReason, patientId: s.patientId };
}

// ── available actions at the current state ───────────────────────────
// Returns a list of valid action objects keyed by id, each with a label,
// voice string, and effect description.
export function listActions() {
  const s = state.session;
  if (!s || s.resolved) return [];
  const acts = s.patient.actions || [];
  const out = [];
  for (const a of acts) {
    if (a.at && a.at !== s.playerPos) continue;
    if (a.once && s.actionsUsed.has(a.id)) continue;
    if (!checkRequires(s, a.requires)) continue;
    out.push(a);
  }
  return out;
}

function checkRequires(s, requires) {
  if (!requires) return true;
  if (requires.patientAt && s.patientPos !== requires.patientAt) return false;
  if (requires.carrying && s.carrying !== requires.carrying) return false;
  if (requires.notCarrying && s.carrying) return false;
  if (requires.itemAtPlayer && s.itemAt[requires.itemAtPlayer] !== s.playerPos) return false;
  if (requires.itemAt) {
    for (const [item, pos] of Object.entries(requires.itemAt)) {
      if (s.itemAt[item] !== pos) return false;
    }
  }
  if (requires.tag && !s.tags.has(requires.tag)) return false;
  if (requires.notTag && s.tags.has(requires.notTag)) return false;
  return true;
}

// ── available movement targets ───────────────────────────────────────
export function listMoves() {
  const s = state.session;
  if (!s || s.resolved) return [];
  const room = s.patient.room;
  const neighbors = [];
  for (const [a, b] of room.edges || []) {
    if (a === s.playerPos) neighbors.push(b);
    else if (b === s.playerPos) neighbors.push(a);
  }
  return neighbors;
}

// ── actions ──────────────────────────────────────────────────────────
export function move(toPosId) {
  const s = state.session;
  if (!s || s.resolved) return null;
  if (!listMoves().includes(toPosId)) return null;
  s.playerPos = toPosId;
  appendLog(s, positionProse(s, toPosId), 'move');
  resolveTurn(s);
  return s;
}

export function wait() {
  const s = state.session;
  if (!s || s.resolved) return null;
  appendLog(s, 'I wait. The room shifts a little around me.', 'wait');
  resolveTurn(s);
  return s;
}

export function act(actionId) {
  const s = state.session;
  if (!s || s.resolved) return null;
  const actions = listActions();
  const a = actions.find(x => x.id === actionId);
  if (!a) return null;
  s.actionsUsed.add(a.id);
  appendLog(s, a.voice, 'act');
  applyEffect(s, a.effect);
  // Some actions resolve into win immediately; in that case the turn does
  // not advance further.
  if (s.resolved) return s;
  resolveTurn(s);
  return s;
}

function applyEffect(s, effect) {
  if (effect == null) return;
  if (effect === 'win')        { s.resolved = true; s.outcome = 'win';  return; }
  if (effect === 'narrative')  return;
  if (typeof effect !== 'object') return;
  if (effect.composure != null) {
    s.playerComposure = Math.max(0, s.playerComposure + effect.composure);
    if (effect.composure < 0) appendLog(s, composureLine(effect.composure), 'damage');
  }
  if (effect.pickup) {
    // Can only carry one thing. If already carrying something, that item is
    // dropped where the player stands (kept in the world) and the new item
    // picked up.
    if (s.carrying && s.carrying !== effect.pickup) s.itemAt[s.carrying] = s.playerPos;
    s.carrying = effect.pickup;
    delete s.itemAt[effect.pickup];
  }
  if (effect.drop)   { s.itemAt[effect.drop] = s.playerPos; if (s.carrying === effect.drop) s.carrying = null; }
  if (effect.tag)    { s.tags.add(effect.tag); }
  if (effect.untag)  { s.tags.delete(effect.untag); }
  if (effect.patientMoveTo) {
    // Override both current and pre-telegraphed pattern move so the
    // explicit positioning sticks. The pattern's next move will be
    // recomputed at the end of this turn.
    s.patientPos = effect.patientMoveTo;
    s.patientNextPos = effect.patientMoveTo;
  }
}

function composureLine(delta) {
  if (delta <= -2) return '!!It costs me to be here.!!';
  return 'I lose a little of myself here.';
}

// ── turn resolution ──────────────────────────────────────────────────
function resolveTurn(s) {
  s.turnsTaken++;

  // Patient moves to the previously-telegraphed next position.
  if (s.patientNextPos != null) {
    s.patientPos = s.patientNextPos;
    commitPatternState(s);
  }

  // Drain effects.
  const room = s.patient.room;
  if (room.drainAdjacent && s.playerPos === s.patientPos) {
    const ok = !room.drainAdjacent.afterTurn || s.turnsTaken > room.drainAdjacent.afterTurn;
    if (ok) {
      s.playerComposure = Math.max(0, s.playerComposure - (room.drainAdjacent.amount || 1));
      appendLog(s, 'The cold of being beside them deepens.', 'damage');
    }
  }
  if (room.drainEachTurn) {
    const ok = !room.drainEachTurn.after || s.turnsTaken > room.drainEachTurn.after;
    if (ok) {
      s.playerComposure = Math.max(0, s.playerComposure - (room.drainEachTurn.amount || 1));
      appendLog(s, 'The room takes a little of me each turn.', 'damage');
    }
  }

  // Lose conditions.
  if (room.loseIf) {
    if (room.loseIf.patientAt && s.patientPos === room.loseIf.patientAt) {
      s.resolved = true; s.outcome = 'loss'; s.lossReason = 'patient_escaped';
      return;
    }
  }
  if (s.playerComposure <= 0) {
    s.resolved = true; s.outcome = 'loss'; s.lossReason = 'composure';
    return;
  }
  if (s.turnsTaken >= s.turnLimit) {
    s.resolved = true; s.outcome = 'loss'; s.lossReason = 'time';
    return;
  }

  // Compute next telegraph.
  s.patientNextPos = nextPatientMove(s);
}

// ── logging ──────────────────────────────────────────────────────────
function appendLog(s, text, cls) {
  if (!text) return;
  s.log.push({ text, cls });
  if (s.log.length > 40) s.log.shift();
}

function positionProse(s, posId) {
  const p = s.patient.room.positions[posId];
  if (!p) return '';
  return p.prose || `I am at ${p.name || posId}.`;
}

// ── attachments (lightweight, since most affect the new mechanic differently) ─
const ATTACHMENT_HANDLERS = {
  resolve: {
    onSessionStart(session) {
      session.playerComposure = Math.min(session.playerComposureMax + 2, session.playerComposure + 2);
    },
  },
  steady: {
    onSessionStart(session) {
      session.turnLimit++;
    },
  },
  brace: {
    onSessionStart(session) {
      session._braceActive = true;
    },
  },
  compose: {
    onSessionStart(session) {
      session.playerComposure = Math.min(session.playerComposureMax + 1, session.playerComposure + 1);
    },
  },
  remember: {
    onSessionStart() { /* enables an action; handled separately */ },
  },
};

// Public: position metadata helper for UI.
export function positionAt(s, posId) {
  return s.patient.room.positions[posId] || { name: posId };
}

// Public: items at a given position (excluding player-held).
export function itemsAtPosition(s, posId) {
  const out = [];
  for (const item of s.patient.room.items || []) {
    if (s.itemAt[item.id] === posId) out.push(item);
  }
  return out;
}

// Public: name of an item by id.
export function itemName(s, itemId) {
  const it = (s.patient.room.items || []).find(x => x.id === itemId);
  return it ? it.name : itemId;
}
