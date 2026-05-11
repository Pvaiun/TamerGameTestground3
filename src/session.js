// Session engine. A session is a single confrontation between Patient 0413
// and one other patient. Each "beat" both sides choose one of three moves:
// press, hold, yield. Resolution follows rock-paper-scissors with a damage
// model.
//
// Outline of a beat (driven by the session UI, not auto-played):
//   1. preBeat()  — pick the patient's move + tell, set state.session.tellText
//                    and state.session.patientMove (hidden from the player view)
//   2. UI shows the tell, waits for player to pick
//   3. resolveBeat(playerMove) — apply RPS, damage, attachments, tick
//   4. checkResolution() — session ends if either side hits 0 composure
//
// Damage model (base, before attachments):
//   - winner deals: round( 3 * strength ) damage
//   - loser deals:  0
//   - clash (tie): both take 1 damage (with strength applied to the patient's
//                  side: round(1 * strength) clamped to 1)
//   - YIELD vs PRESS where YIELD wins: attacker (presser) takes 0; defender
//     (yielder) gives no damage either. It's a slip — clean miss.
//
// Composure resolves to 0 ⇒ that side is overwhelmed/reached.

import { state } from './state.js';
import { PATIENTS, FIXATIONS, ATTACHMENTS, VOICE } from './data.js';
import { pick, randi } from './rng.js';
import { decideMove, tellMoveFor, pickTellPhrase, beats, counterTo } from './fixation.js';
import { recordEncounter, recordTellSeen, recordReach, isFixationKnown } from './persist.js';

export function beginSession(speciesId, opts = {}) {
  const patient = PATIENTS[speciesId];
  if (!patient) throw new Error('Unknown patient: ' + speciesId);
  recordEncounter(speciesId);

  const session = {
    patientId: speciesId,
    patient,
    patientComposureMax: patient.composure,
    patientComposure: patient.composure,
    patientStrength: patient.strength,
    playerComposureMax: state.composureMax,
    playerComposure: state.composure,
    log: [],
    beatIdx: 0,
    patientHistory: [],
    playerHistory: [],
    lastClash: false,
    lastPatientMove: null,
    lastPlayerMove: null,
    pendingPatientMove: null,
    pendingPatientTell: null,
    pendingTellLied: false,
    softenNext: 0,
    forceTruthNextN: 0,
    pendingObserve: false,
    fixationRevealedThisSession: false,
    revealedFixation: false,
    wardsUsedThisSession: new Set(),
    attachmentsUsedThisSession: new Set(),
    resolved: false,           // true once one side hits 0
    outcomePicked: null,       // 'reach_file' | 'reach_release' | 'overwhelmed'
    // For the very first session of a run, "familiar" attachment applies.
    isFirstSessionEver: opts.isFirstSession || false,
  };

  // Apply on_session_start attachments.
  for (const aId of state.attachments) {
    const a = ATTACHMENTS[aId];
    if (!a) continue;
    if (a.trigger === 'on_session_start') {
      if (a.effect === 'bonus_composure_2') {
        session.playerComposure = Math.min(session.playerComposure + 2, session.playerComposureMax + 2);
      } else if (a.effect === 'true_tells_first_session' && session.isFirstSessionEver) {
        session.forceTruthNextN = 3;
      }
    }
  }

  // If archive considers the fixation revealed, mark it.
  const revealAt = (FIXATIONS[patient.fixation.type] || {}).revealAt || 99;
  if (isFixationKnown(speciesId, revealAt)) {
    session.revealedFixation = true;
  }

  state.session = session;
  preBeat();
  return session;
}

// Internal helpers.
function getContext() {
  const s = state.session;
  return {
    patient: s.patient,
    fight: {
      beatIdx: s.beatIdx,
      patientComposure: s.patientComposure,
      playerComposure: s.playerComposure,
      patientHistory: s.patientHistory,
      playerHistory: s.playerHistory,
      lastClash: s.lastClash,
      lastPatientMove: s.lastPatientMove,
      lastPlayerMove: s.lastPlayerMove,
    },
    forceTruth: s.forceTruthNextN > 0,
  };
}

function preBeat() {
  const s = state.session;
  if (s.resolved) return;
  const ctx = getContext();
  const { move } = decideMove(ctx);
  const shownMove = tellMoveFor(ctx, move);
  const { idx, text } = pickTellPhrase(s.patient, shownMove);
  s.pendingPatientMove = move;
  s.pendingPatientTell = { move: shownMove, idx, text };
  s.pendingTellLied = (shownMove !== move);
  if (idx >= 0) recordTellSeen(s.patientId, shownMove, idx);
}

// Player chooses a move. Resolves the beat.
export function resolveBeat(playerMove) {
  const s = state.session;
  if (s.resolved) return null;
  const patientMove = s.pendingPatientMove;
  const result = computeBeat(s, playerMove, patientMove);
  s.log.push(result);

  // Apply damage to both sides.
  if (result.playerDamage > 0) s.playerComposure = Math.max(0, s.playerComposure - result.playerDamage);
  if (result.patientDamage > 0) s.patientComposure = Math.max(0, s.patientComposure - result.patientDamage);
  if (result.playerHeal > 0) s.playerComposure = Math.min(s.playerComposureMax + 4, s.playerComposure + result.playerHeal);

  // History.
  s.patientHistory.push(patientMove);
  s.playerHistory.push(playerMove);
  s.lastPatientMove = patientMove;
  s.lastPlayerMove = playerMove;
  s.lastClash = result.clash;
  s.beatIdx++;

  // Tick down per-beat effects.
  if (s.forceTruthNextN > 0) s.forceTruthNextN--;
  s.softenNext = result.softenAppliedThisBeat || s.softenNext;

  // Check resolution.
  if (s.patientComposure <= 0 || s.playerComposure <= 0) {
    s.resolved = true;
    s.pendingPatientMove = null;
    s.pendingPatientTell = null;
    if (s.patientComposure <= 0 && s.playerComposure > 0) recordReach(s.patientId);
    return result;
  }

  // Prepare next beat.
  preBeat();
  return result;
}

// Pure computation of one beat's effects — separated so the UI can preview
// or replay. Mutates session for stateful attachments (softenNext, forceTruth).
function computeBeat(s, playerMove, patientMove) {
  const ATKS = state.attachments;
  const baseHit = (str) => Math.max(1, Math.round(3 * str));
  const cmp = beats(playerMove, patientMove);
  let playerDamage = 0;
  let patientDamage = 0;
  let playerHeal = 0;
  let clash = false;
  let outcome = '';   // 'win'|'loss'|'clash'

  // Apply softenNext (queued by 'reach' attachment): the patient's strength
  // is reduced by 1 for damage this beat.
  let effectiveStr = s.patientStrength;
  if (s.softenNext > 0) {
    effectiveStr = Math.max(0.5, effectiveStr - 0.4);
    s.softenNext--;
  }

  // Apply patient's per-beat strength growth (grow_each_beat fixation).
  if (s.patient.fixation && s.patient.fixation.type === 'grow_each_beat') {
    s.patientStrength = +(s.patientStrength + 0.1).toFixed(2);
  }

  if (cmp === 1) {
    // Player wins the RPS. They lose composure based on player's pressure (1.0).
    outcome = 'win';
    let dmg = baseHit(1.0);
    // 'insist' attachment: +1 PRESS damage.
    if (playerMove === 'press' && ATKS.includes('insist')) dmg += 1;
    patientDamage = dmg;
  } else if (cmp === -1) {
    // Player loses. They lose composure based on the patient's strength.
    outcome = 'loss';
    let dmg = Math.max(1, Math.round(3 * effectiveStr));
    if (ATKS.includes('brace')) dmg = Math.max(1, dmg - 1);
    playerDamage = dmg;
  } else {
    // Clash (tie).
    clash = true;
    outcome = 'clash';
    if (playerMove === 'yield' && patientMove === 'yield') {
      // Mutual step-back. 'open' attachment: heal 2.
      if (ATKS.includes('open')) playerHeal += 2;
    } else {
      // Mutual press, or mutual hold.
      let dmgToPlayer = 1;
      let dmgToPatient = 1;
      if (ATKS.includes('lock')) dmgToPlayer = 0;
      if (ATKS.includes('insist')) dmgToPlayer += 1; // insist clash penalty
      playerDamage += dmgToPlayer;
      patientDamage += dmgToPatient;
    }
  }

  // Trigger-driven attachments fired on win.
  let softenApplied = 0;
  let trueNextTell = false;
  if (outcome === 'win') {
    if (playerMove === 'press' && ATKS.includes('reach')) softenApplied = 1;
    if (playerMove === 'hold'  && ATKS.includes('steady')) playerHeal += 1;
    if (playerMove === 'yield' && ATKS.includes('listen')) trueNextTell = true;
  }

  // Pull fixation: patient drains player composure 1 each beat.
  if (s.patient.fixation && s.patient.fixation.type === 'pull_drain') {
    playerDamage += 1;
  }

  if (softenApplied > 0) s.softenNext = (s.softenNext || 0) + softenApplied;
  if (trueNextTell) s.forceTruthNextN = Math.max(s.forceTruthNextN, 1);

  return {
    playerMove, patientMove,
    outcome,          // 'win'|'loss'|'clash'|'slip'
    clash,
    playerDamage, patientDamage,
    playerHeal,
    softenAppliedThisBeat: softenApplied,
  };
}

// Use a ward. Returns { applied, voiceLine } or null.
export function invokeWard(speciesId) {
  const s = state.session;
  if (!s || s.resolved) return null;
  const w = state.wards.find(w => w.speciesId === speciesId);
  if (!w || w.used) return null;
  const patientData = PATIENTS[speciesId];
  if (!patientData || !patientData.ward) return null;
  const eff = patientData.ward.effect;
  if (eff === 'skip_beat') {
    // The patient does not act this beat. Beat is consumed with no damage.
    s.beatIdx++;
    s.patientHistory.push(null);
    s.playerHistory.push(null);
    s.lastPatientMove = null;
    s.lastPlayerMove = null;
    s.lastClash = false;
    preBeat();
  } else if (eff === 'true_tells_2') {
    s.forceTruthNextN = Math.max(s.forceTruthNextN, 2);
    // Re-prep the tell for current beat (truth this time).
    preBeat();
  } else if (eff === 'reveal_fixation') {
    s.revealedFixation = true;
    s.fixationRevealedThisSession = true;
  }
  w.used = true;
  s.wardsUsedThisSession.add(speciesId);
  return {
    applied: true,
    voiceLine: patientData.ward.voice,
  };
}

// Player chooses to OBSERVE (via 'patient' attachment). Patient still acts;
// player auto-yields and learns the next tell truthfully.
export function observe() {
  const s = state.session;
  if (!s || s.resolved) return null;
  if (!state.attachments.includes('patient')) return null;
  if (s.attachmentsUsedThisSession.has('patient')) return null;
  s.attachmentsUsedThisSession.add('patient');
  // Force the player's move to YIELD this beat. The patient's move is whatever
  // they were going to play. Then the next tell is truthful.
  const r = resolveBeat('yield');
  if (!s.resolved) s.forceTruthNextN = Math.max(s.forceTruthNextN, 1);
  return r;
}

// Player reveals fixation via 'remember' attachment.
export function rememberAction() {
  const s = state.session;
  if (!s || s.resolved) return null;
  if (!state.attachments.includes('remember')) return null;
  if (s.attachmentsUsedThisSession.has('remember')) return null;
  s.attachmentsUsedThisSession.add('remember');
  s.revealedFixation = true;
  s.fixationRevealedThisSession = true;
  return true;
}

// Compute the result of a session — to be called after resolved.
export function sessionOutcome() {
  const s = state.session;
  if (!s.resolved) return null;
  const reached = s.patientComposure <= 0;
  return {
    reached,
    overwhelmed: !reached,
    patientId: s.patientId,
    leftoverComposure: s.playerComposure,
  };
}

// End the session: writes composure back to state, clears session.
export function endSession() {
  const s = state.session;
  if (!s) return;
  state.composure = Math.max(0, Math.min(state.composureMax, s.playerComposure));
  state.session = null;
}
