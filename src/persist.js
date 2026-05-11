// localStorage-backed archive that persists across runs. The archive is the
// game's only source of meta-progression: which patients have been encountered
// (and how many times), which tells have been observed, which fixations have
// been revealed, which admissions are unlocked, and how many patients have
// been filed across all runs.
//
// Shape:
//   {
//     runs: { completed, won, lost },
//     patients: {
//       <speciesId>: {
//         encounters: N,
//         reaches: N,         // times reduced to 0 composure
//         filed: bool,         // ever filed (and thus permanently a ward option)
//         tellsSeen: { press: [idx...], hold: [idx...], yield: [idx...] },
//         fixationRevealed: bool,
//       }
//     },
//     unlocks: { admissions: { 0413: true, 0412?: true, 0414?: true } },
//   }

const KEY = 'bloodlines/archive/v1';

function blank() {
  return {
    runs: { completed: 0, won: 0, lost: 0 },
    patients: {},
    unlocks: { admissions: { '0413': true } },
  };
}

let cached = null;

function load() {
  if (cached) return cached;
  try {
    const s = localStorage.getItem(KEY);
    if (!s) { cached = blank(); return cached; }
    const parsed = JSON.parse(s);
    cached = { ...blank(), ...parsed };
    cached.runs = { ...blank().runs, ...(parsed.runs || {}) };
    cached.patients = { ...(parsed.patients || {}) };
    cached.unlocks = { admissions: { '0413': true, ...((parsed.unlocks || {}).admissions || {}) } };
    return cached;
  } catch {
    cached = blank();
    return cached;
  }
}

function save() {
  if (!cached) return;
  try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch {}
}

export function getArchive() { return load(); }

export function patientArchive(speciesId) {
  const a = load();
  if (!a.patients[speciesId]) {
    a.patients[speciesId] = {
      encounters: 0, reaches: 0, filed: false,
      tellsSeen: { press: [], hold: [], yield: [] },
      fixationRevealed: false,
    };
  }
  return a.patients[speciesId];
}

export function recordEncounter(speciesId) {
  const p = patientArchive(speciesId);
  p.encounters++;
  save();
}

export function recordTellSeen(speciesId, move, idx) {
  const p = patientArchive(speciesId);
  const arr = p.tellsSeen[move];
  if (!arr.includes(idx)) arr.push(idx);
  save();
}

export function recordReach(speciesId) {
  const p = patientArchive(speciesId);
  p.reaches++;
  save();
}

export function recordFile(speciesId) {
  const p = patientArchive(speciesId);
  p.filed = true;
  save();
}

export function recordFixationRevealed(speciesId) {
  const p = patientArchive(speciesId);
  p.fixationRevealed = true;
  save();
}

export function isFixationKnown(speciesId, revealAt) {
  const p = patientArchive(speciesId);
  if (p.fixationRevealed) return true;
  return p.encounters >= revealAt;
}

export function recordRunResult(won) {
  const a = load();
  a.runs.completed++;
  if (won) a.runs.won++;
  else a.runs.lost++;

  // Unlock conditions, checked each time a run ends.
  if (a.runs.won >= 1) a.unlocks.admissions['0412'] = true;
  const totalFiled = Object.values(a.patients).reduce((n, p) => n + (p.filed ? 1 : 0), 0);
  if (totalFiled >= 3) a.unlocks.admissions['0414'] = true;

  save();
  return {
    newAdmissions: Object.keys(a.unlocks.admissions).filter(k => k !== '0413'),
  };
}

export function isAdmissionUnlocked(id) {
  return !!load().unlocks.admissions[id];
}

export function filedPatientIds() {
  const a = load();
  return Object.entries(a.patients).filter(([_, p]) => p.filed).map(([k]) => k);
}

export function tellsSeenForPatient(speciesId) {
  const p = patientArchive(speciesId);
  return p.tellsSeen;
}

export function resetArchive() {
  cached = blank();
  save();
}
