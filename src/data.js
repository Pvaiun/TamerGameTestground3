// Loads game data from data/*.json. Call await loadData() once at startup.
// All other modules import from this file (named exports populated at load time).

export const PATIENTS = {};
export const FIXATIONS = {};
export const ATTACHMENTS = {};
export const ADMISSIONS = {};
export const EVENTS = {};
export const GLYPHS = {};
export const VOICE = {
  system: {},
  protagonist: {},
  session: {},
  outcomes: {},
  system_messages: {},
};

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
  return r.json();
}

function copyExcludingFormat(src, dst) {
  for (const [k, v] of Object.entries(src)) {
    if (k.startsWith('_')) continue;
    dst[k] = v;
  }
}

export async function loadData() {
  const [patients, fixations, attachments, admissions, events, glyphs, voice] = await Promise.all([
    fetchJson('data/patients.json'),
    fetchJson('data/fixations.json'),
    fetchJson('data/attachments.json'),
    fetchJson('data/admissions.json'),
    fetchJson('data/events.json'),
    fetchJson('data/glyphs.json'),
    fetchJson('data/voiceprose.json'),
  ]);
  copyExcludingFormat(patients, PATIENTS);
  copyExcludingFormat(fixations, FIXATIONS);
  copyExcludingFormat(attachments, ATTACHMENTS);
  copyExcludingFormat(admissions, ADMISSIONS);
  copyExcludingFormat(events, EVENTS);
  copyExcludingFormat(glyphs, GLYPHS);
  Object.assign(VOICE.system, voice.system || {});
  Object.assign(VOICE.protagonist, voice.protagonist || {});
  Object.assign(VOICE.session, voice.session || {});
  Object.assign(VOICE.outcomes, voice.outcomes || {});
  Object.assign(VOICE.system_messages, voice.system_messages || {});
}

export function patientIds() {
  return Object.keys(PATIENTS).filter(id => id !== 'Warden');
}
export function tieredPatientIds(maxTier) {
  return patientIds().filter(id => (PATIENTS[id].tier || 1) <= maxTier);
}
