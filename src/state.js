// Global run-scoped game state. Persistent state lives in src/persist.js.

export const FLOORS_TOTAL = 4;
export const MAX_ATTACHMENTS = 4;

export const state = {
  screen: 'start',

  // run-scoped:
  admissionId: '0413',
  composureMax: 14,
  composure: 14,
  attachments: [],          // attachment ids carried by the protagonist
  protagonistFile: [],

  // corridor:
  corridor: null,

  // session-scoped:
  session: null,

  // event-scoped:
  event: null,

  // results:
  endResult: null,
};

export function resetRun() {
  state.admissionId = '0413';
  state.composureMax = 14;
  state.composure = 14;
  state.attachments = [];
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
