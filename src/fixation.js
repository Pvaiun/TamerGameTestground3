// Patient AI: given the session state and patient context, decide the move
// the patient WILL play on the upcoming beat (one of 'press' | 'hold' | 'yield').
// The 'tell' (shown to the player before the beat resolves) is derived from
// this decision — sometimes truthfully, sometimes lying, depending on fixation.
//
// Each fixation key matches an entry in data/fixations.json and one of the
// functions in DECIDERS below.

import { pick } from './rng.js';
import { FIXATIONS } from './data.js';

const MOVES = ['press', 'hold', 'yield'];

// Rock-paper-scissors: PRESS beats HOLD, HOLD beats YIELD, YIELD beats PRESS.
// beats(a, b) returns 1 if a wins, -1 if a loses, 0 on tie (clash).
export function beats(a, b) {
  if (a === b) return 0;
  if (a === 'press' && b === 'hold')  return 1;
  if (a === 'hold'  && b === 'yield') return 1;
  if (a === 'yield' && b === 'press') return 1;
  return -1;
}

// counterTo(m) returns the move that BEATS m.
export function counterTo(m) {
  if (m === 'press') return 'yield';
  if (m === 'hold')  return 'press';
  if (m === 'yield') return 'hold';
  return 'press';
}

// Each decider returns { move, lied? }.
// `ctx` includes: { patient, fight }
//   fight: { beatIdx, patientComposure, playerComposure, patientHistory:['press',...], playerHistory:[...], lastClash:bool, lastPatientMove, lastPlayerMove }
const DECIDERS = {
  locked_hold: (ctx) => ({ move: 'hold' }),

  refuse_yield: (ctx) => {
    // Weight 60% press / 40% hold.
    const r = Math.random();
    return { move: r < 0.6 ? 'press' : 'hold' };
  },

  compulsion_press: (ctx) => {
    if (ctx.fight.lastPatientMove === 'press') return { move: 'press' };
    return { move: pick(MOVES) };
  },

  sink_hold: (ctx) => {
    if (ctx.fight.patientComposure <= ctx.patient.composure / 2) {
      return { move: 'hold' };
    }
    return { move: pick(MOVES) };
  },

  bound_hold_then: (ctx) => {
    if (ctx.fight.beatIdx < 3) return { move: 'hold' };
    return { move: Math.random() < 0.55 ? 'press' : 'yield' };
  },

  bound_until_low: (ctx) => {
    if (ctx.fight.patientComposure > ctx.patient.composure / 3) return { move: 'hold' };
    return { move: 'press' };
  },

  echo_last: (ctx) => {
    const last = ctx.fight.lastPatientMove;
    if (last) return { move: last };
    return { move: pick(MOVES) };
  },

  drift_cycle: (ctx) => {
    const cycle = ['yield', 'hold', 'press'];
    return { move: cycle[ctx.fight.beatIdx % 3] };
  },

  mirror: (ctx) => {
    const last = ctx.fight.lastPlayerMove;
    if (last) return { move: counterTo(last) };
    return { move: pick(MOVES) };
  },

  counter_last: (ctx) => {
    const last = ctx.fight.lastPlayerMove;
    if (!last) return { move: pick(MOVES) };
    if (Math.random() < 0.25) return { move: last };
    return { move: counterTo(last) };
  },

  forget_tell: (ctx) => {
    // Pure random move; the LYING happens in tellFor.
    return { move: pick(MOVES) };
  },

  invert_tell: (ctx) => {
    return { move: pick(MOVES) };
  },

  watch_no_lie: (ctx) => {
    if ((ctx.fight.beatIdx + 1) % 3 === 0) return { move: 'press' };
    return { move: pick(MOVES) };
  },

  pull_drain: (ctx) => {
    return { move: pick(MOVES) };
  },

  grow_each_beat: (ctx) => {
    return { move: pick(MOVES) };
  },

  climb_on_clash: (ctx) => {
    if (ctx.fight.lastClash) return { move: 'press' };
    return { move: pick(MOVES) };
  },

  anchor_press: (ctx) => {
    if ((ctx.fight.beatIdx + 1) % 4 === 0) return { move: 'press' };
    return { move: pick(MOVES) };
  },

  warden_shift: (ctx) => {
    const ratio = ctx.fight.patientComposure / ctx.patient.composure;
    if (ratio > 0.66) return DECIDERS.bound_hold_then(ctx);
    if (ratio > 0.33) return DECIDERS.mirror(ctx);
    return DECIDERS.climb_on_clash(ctx);
  },
};

export function decideMove(ctx) {
  const fixKey = ctx.patient.fixation && ctx.patient.fixation.type;
  const fn = DECIDERS[fixKey];
  if (!fn) return { move: pick(MOVES) };
  const out = fn(ctx);
  return out;
}

// Given a chosen move, decide what the visible tell SAYS — usually the same
// move, but some fixations lie or invert.
export function tellMoveFor(ctx, actualMove) {
  const fixKey = ctx.patient.fixation && ctx.patient.fixation.type;
  const fix = FIXATIONS[fixKey] || {};
  if (ctx.forceTruth) return actualMove;
  if (fixKey === 'invert_tell') {
    // tell shows a move; actual play is what beats THAT move.
    // The actualMove is what they will play; what they SHOW is the move that
    // actualMove beats. Press beats Hold → if actual is Press, tell shows Hold.
    if (actualMove === 'press') return 'hold';
    if (actualMove === 'hold')  return 'yield';
    if (actualMove === 'yield') return 'press';
  }
  if (fix.tellLies && fix.lieRate && Math.random() < fix.lieRate) {
    const others = MOVES.filter(m => m !== actualMove);
    return pick(others);
  }
  return actualMove;
}

export function pickTellPhrase(patient, move) {
  const list = (patient.tells && patient.tells[move]) || [];
  if (!list.length) return { idx: -1, text: '' };
  const idx = Math.floor(Math.random() * list.length);
  return { idx, text: list[idx] };
}
