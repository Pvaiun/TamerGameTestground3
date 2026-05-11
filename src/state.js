// Global game state. Most modules import `state` and mutate it directly. The
// renderer reads `state.screen` to dispatch to a screen renderer. Most data
// that persists across runs lives in src/persist.js (localStorage); state.js
// holds the current run only.

export const FLOORS_TOTAL = 5;
export const NODES_PER_FLOOR = 3;
export const MAX_WARDS = 2;
export const MAX_ATTACHMENTS = 4;

export const state = {
  screen: 'start',

  // run-scoped:
  admissionId: '0413',
  composureMax: 14,
  composure: 14,
  attachments: [],          // attachment ids carried by the protagonist
  wards: [],                // { speciesId, used:bool } — once-per-session abilities
  protagonistFile: [],      // narrative lines appended to the protagonist's file across the run

  // corridor:
  corridor: null,           // { floors: [[node, node, ...], ...], path: [floorIdx → pickedNodeIdx], currentFloor, currentNode }

  // session-scoped (populated when entering a session):
  session: null,

  // event-scoped:
  event: null,              // { id, lastChoiceOutcome? }

  // results:
  endResult: null,          // { kind: 'won'|'lost', meta }
};

export function resetRun() {
  state.admissionId = '0413';
  state.composureMax = 14;
  state.composure = 14;
  state.attachments = [];
  state.wards = [];
  state.protagonistFile = [];
  state.corridor = null;
  state.session = null;
  state.event = null;
  state.endResult = null;
}

export function resetToTitle() {
  resetRun();
  state.screen = 'start';
}
