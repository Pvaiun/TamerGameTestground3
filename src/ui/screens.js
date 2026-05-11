// All non-session screens. Each screen is a page of the same testimony
// document. The page opens with a // tag, has body prose, content, and a
// row of ▸ doc-button actions.

import { el, app } from './dom.js';
import { state, resetRun, resetToTitle, FLOORS_TOTAL } from '../state.js';
import { ADMISSIONS, PATIENTS, ATTACHMENTS, EVENTS, VOICE } from '../data.js';
import { sfx } from '../audio.js';
import { parseProse } from './textCorrupt.js';
import { renderGlyph } from './glyphs.js';
import { render } from './render.js';
import { VERSION } from '../version.js';
import {
  startRun, chooseNode, advanceCorridor, addAttachment, rollConsultOptions, applyEventEffect,
} from '../run.js';
import {
  getArchive, isAdmissionUnlocked, recordRunResult, patientArchive,
} from '../persist.js';

// ── start (title) ────────────────────────────────────────────────────
export function renderStart() {
  app().appendChild(el('div', { class: 'doc-version' }, `v${VERSION}`));
  const page = docPage('// admission · the front door');

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse([
    "I found the address on a card I do not remember writing. The road ended at the building.",
    "The nurse opened the door before I knocked. She handed me a file. She said it had been waiting for me.",
    "There are four floors below this one. ~~No record of patients leaving from the lowest.~~",
    "!!The door at the top is locked from this side.!!",
  ].join('\n\n'));
  page.appendChild(intro);

  page.appendChild(actionRow(
    docButton('Be admitted', () => { state.screen = 'admission_pick'; render(); }),
    docButton('The archive', () => { state.screen = 'archive'; render(); }, 'small'),
  ));
  app().appendChild(page);
}

// ── admission pick ───────────────────────────────────────────────────
export function renderAdmissionPick() {
  const page = docPage('// admission · choose a designation');
  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    "The nurse turns the page toward me. There are three lines on it. ~~Two~~ Some have not been written yet."
  );
  page.appendChild(intro);

  const list = el('div', { class: 'doc-card-list' });
  for (const id of Object.keys(ADMISSIONS)) {
    const a = ADMISSIONS[id];
    const unlocked = isAdmissionUnlocked(id);
    const card = el('div', { class: 'doc-card admission-card' + (unlocked ? ' selectable' : ' dimmed') });
    card.appendChild(el('div', { class: 'doc-card-marker' }, unlocked ? '▸' : '·'));
    const body = el('div', { class: 'doc-card-body' });
    body.appendChild(el('div', { class: 'doc-card-head' }, [
      el('span', { class: 'doc-card-name' }, a.name),
      el('span', { class: 'doc-card-meta' }, `designation · ${a.designation}`),
    ]));
    const sub = el('div', { class: 'doc-card-subtitle' });
    sub.innerHTML = parseProse(a.subtitle);
    body.appendChild(sub);
    const voice = el('div', { class: 'doc-card-voice' });
    voice.innerHTML = parseProse(a.voice);
    body.appendChild(voice);
    if (unlocked) {
      const kit = el('div', { class: 'doc-card-kit' });
      kit.appendChild(el('span', { class: 'kit-label' }, 'starting composure · '));
      kit.appendChild(el('span', { class: 'kit-val' }, String(a.composure)));
      if (a.startingAttachments && a.startingAttachments.length) {
        kit.appendChild(el('span', { class: 'kit-sep' }, ' · carries · '));
        kit.appendChild(el('span', { class: 'kit-val' }, a.startingAttachments.map(id => (ATTACHMENTS[id] || {}).name || id).join(', ')));
      }
      body.appendChild(kit);
    } else {
      const lock = el('div', { class: 'doc-card-locked' }, a.unlockHint);
      body.appendChild(lock);
    }
    card.appendChild(body);
    if (unlocked) {
      card.addEventListener('click', () => {
        sfx('select');
        state.admissionId = id;
        state.screen = 'admission_confirm';
        render();
      });
    }
    list.appendChild(card);
  }
  page.appendChild(list);

  page.appendChild(actionRow(
    docButton('〈 back', () => { state.screen = 'start'; render(); }, 'small'),
  ));
  app().appendChild(page);
}

// ── admission confirm (intro scene) ──────────────────────────────────
export function renderAdmissionConfirm() {
  const adm = ADMISSIONS[state.admissionId];
  const page = docPage(`// admission · ${adm.name} · day one`);

  const proseEl = el('div', { class: 'doc-prose' });
  proseEl.innerHTML = parseProse((adm.admissionProse || []).join('\n\n'));
  page.appendChild(proseEl);

  // How a session works — written in voice. The first time the player
  // descends, this is their tutorial.
  const rules = el('div', { class: 'doc-prose dim' });
  rules.innerHTML = parseProse([
    "I have been told how a session goes. Each room has a few places I can be. The patient is in one of them. They move on their own — but I can see where they will go next.",
    "I take turns. I can move to an adjacent place. I can act, if there is something to do where I am. I can wait.",
    "If I do not reach them before the orderly comes — or before my composure breaks — !!I will not leave the room the way I came in.!!"
  ].join('\n\n'));
  page.appendChild(rules);

  const kit = el('div', { class: 'doc-kit-block' });
  kit.appendChild(el('div', { class: 'sec-label-doc' }, '─ what I bring with me ─'));
  kit.appendChild(el('div', { class: 'kit-line' }, `composure · ${adm.composure}`));
  if (adm.startingAttachments && adm.startingAttachments.length) {
    const lst = el('div', { class: 'kit-attachments' });
    for (const id of adm.startingAttachments) {
      const a = ATTACHMENTS[id];
      if (!a) continue;
      const row = el('div', { class: 'kit-attachment' });
      row.appendChild(el('div', { class: 'kit-attachment-name' }, a.name));
      const voice = el('div', { class: 'kit-attachment-voice' });
      voice.innerHTML = parseProse(a.voice);
      row.appendChild(voice);
      row.appendChild(el('div', { class: 'kit-attachment-desc' }, a.desc));
      lst.appendChild(row);
    }
    kit.appendChild(lst);
  } else {
    kit.appendChild(el('div', { class: 'kit-line dim' }, 'nothing yet but the file.'));
  }
  page.appendChild(kit);

  page.appendChild(actionRow(
    docButton('〈 reconsider', () => { state.screen = 'admission_pick'; render(); }, 'small'),
    docButton('open the corridor', () => {
      sfx('select');
      startRun(adm.id);
      state.screen = 'corridor';
      render();
    }),
  ));
  app().appendChild(page);
}

// ── corridor (branching nodes per floor) ─────────────────────────────
export function renderCorridor() {
  const c = state.corridor;
  if (!c) { state.screen = 'start'; render(); return; }

  const floorIdx = c.currentFloor;
  const page = docPage(`// corridor · descent ${floorIdx + 1} of ${FLOORS_TOTAL}`);

  page.appendChild(statusStrip());

  const intro = el('div', { class: 'doc-prose' });
  const nodeCount = (c.floors[floorIdx] || []).length;
  let lines;
  if (floorIdx === 0) {
    lines = nodeCount === 1
      ? "The first corridor is short. There is one door ahead, and I do not have a choice. !!I go through.!!"
      : "The first corridor is short. The doors are not closed. I can take any of them. ~~All are open.~~ I pick one.";
  } else if (floorIdx === FLOORS_TOTAL - 1) {
    lines = "The stairs end at the lowest floor. The desk is ahead. !!Someone is sitting at it.!!";
  } else {
    if (nodeCount === 1) lines = "Stairs are behind me. One door ahead. ~~No others.~~";
    else if (nodeCount === 2) lines = "Stairs are behind me. Two doors ahead. I pick one. ~~The other closes anyway.~~";
    else lines = "Stairs are behind me. Three doors ahead. ~~Some close as I pass.~~ I pick one.";
  }
  intro.innerHTML = parseProse(lines);
  page.appendChild(intro);

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ the rooms ahead ─'));
  const row = el('div', { class: 'node-row' });
  const nodes = c.floors[floorIdx] || [];
  nodes.forEach((node, idx) => {
    row.appendChild(nodeCardEl(node, idx, floorIdx));
  });
  page.appendChild(row);

  if (floorIdx > 0) page.appendChild(pathBreadcrumb());

  page.appendChild(actionRow(
    docButton('forfeit · close my file', () => {
      sfx('faint');
      recordRunResult(false);
      state.endResult = { kind: 'lost', reason: 'forfeit' };
      state.screen = 'gameover';
      render();
    }, 'small'),
  ));
  app().appendChild(page);
}

function nodeCardEl(node, idx, floorIdx) {
  const card = el('div', { class: 'node-card node-kind-' + node.kind });
  card.appendChild(el('div', { class: 'node-kind-tag' }, nodeKindLabel(node.kind)));

  if (node.kind === 'patient' || node.kind === 'keeper' || node.kind === 'warden') {
    const patient = PATIENTS[node.patientId];
    const arch = patientArchive(node.patientId);
    const seen = arch.encounters > 0;
    const glyphHost = el('div', { class: 'node-glyph' });
    if (seen) glyphHost.innerHTML = renderGlyph(patient.species);
    else glyphHost.innerHTML = unknownGlyphSvg();
    card.appendChild(glyphHost);
    const nameLine = el('div', { class: 'node-name' });
    nameLine.innerHTML = seen ? parseProse(patient.displayName) : '[a patient]';
    card.appendChild(nameLine);
    const subLine = el('div', { class: 'node-subtitle' });
    subLine.innerHTML = seen ? parseProse(patient.subtitle) : parseProse('~~unfamiliar~~ name not on the door.');
    card.appendChild(subLine);
  } else if (node.kind === 'quiet') {
    const ev = EVENTS[node.eventId];
    card.appendChild(el('div', { class: 'node-glyph quiet' }, '·'));
    card.appendChild(el('div', { class: 'node-name' }, 'a quiet room'));
    const sub = el('div', { class: 'node-subtitle' });
    const title = (ev && ev.title) ? ev.title.replace(/^\/\/\s*quiet\s*·\s*/, '') : 'a quiet room';
    sub.innerHTML = parseProse(title);
    card.appendChild(sub);
  } else if (node.kind === 'consult') {
    card.appendChild(el('div', { class: 'node-glyph consult' }, '─'));
    card.appendChild(el('div', { class: 'node-name' }, 'a consult'));
    const sub = el('div', { class: 'node-subtitle' });
    sub.innerHTML = parseProse('the staff have a moment.');
    card.appendChild(sub);
  }

  card.classList.add('selectable');
  card.addEventListener('click', () => {
    sfx('select');
    chooseNode(floorIdx, idx);
    render();
  });
  return card;
}

function nodeKindLabel(kind) {
  switch (kind) {
    case 'patient': return 'patient · session';
    case 'keeper':  return 'keeper · session';
    case 'warden':  return '!!warden!! · final';
    case 'quiet':   return 'quiet · event';
    case 'consult': return 'consult · respite';
    default: return kind;
  }
}

function pathBreadcrumb() {
  const c = state.corridor;
  const strip = el('div', { class: 'path-breadcrumb' });
  strip.appendChild(el('span', { class: 'breadcrumb-label' }, 'so far · '));
  for (let f = 0; f < c.currentFloor; f++) {
    const nodeIdx = c.path[f];
    const node = (c.floors[f] || [])[nodeIdx];
    if (!node) continue;
    const dot = node.kind === 'patient' ? '●' : node.kind === 'keeper' ? '◆' : node.kind === 'quiet' ? '○' : '─';
    strip.appendChild(el('span', { class: 'breadcrumb-step' }, `descent ${f + 1} · ${dot} ${nodeKindLabel(node.kind)}`));
    if (f < c.currentFloor - 1) strip.appendChild(el('span', { class: 'breadcrumb-sep' }, ' · '));
  }
  return strip;
}

// ── quiet event ──────────────────────────────────────────────────────
export function renderQuiet() {
  const ev = EVENTS[state.event.id];
  if (!ev) { advanceCorridor(); render(); return; }
  const page = docPage(ev.title);

  const last = state.event.lastChoiceOutcome;
  if (last) {
    const outcome = el('div', { class: 'doc-prose' });
    outcome.innerHTML = parseProse(last);
    page.appendChild(outcome);
    page.appendChild(actionRow(
      docButton('continue', () => { advanceCorridor(); render(); })
    ));
    app().appendChild(page);
    return;
  }

  const proseEl = el('div', { class: 'doc-prose' });
  proseEl.innerHTML = parseProse((ev.prose || []).join('\n\n'));
  page.appendChild(proseEl);

  page.appendChild(statusStrip());

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ I can ─'));
  const list = el('div', { class: 'choice-list' });
  for (const choice of ev.choices || []) {
    const row = el('button', { class: 'choice-row' });
    row.appendChild(el('span', { class: 'choice-marker' }, '▸ '));
    const lab = el('div', { class: 'choice-label' });
    lab.innerHTML = parseProse(choice.label);
    row.appendChild(lab);
    const voice = el('div', { class: 'choice-voice' });
    voice.innerHTML = parseProse(choice.voice);
    row.appendChild(voice);
    row.addEventListener('click', () => {
      sfx('select');
      for (const eff of choice.effects || []) applyEventEffect(eff);
      state.event.lastChoiceOutcome = choice.outcome;
      if (state.endResult && state.endResult.kind === 'lost') {
        recordRunResult(false);
        state.screen = 'gameover';
        render();
        return;
      }
      render();
    });
    list.appendChild(row);
  }
  page.appendChild(list);
  app().appendChild(page);
}

// ── consult node ─────────────────────────────────────────────────────
export function renderConsult() {
  if (!state._consultRoll) state._consultRoll = rollConsultOptions();
  const opts = state._consultRoll;

  const page = docPage('// consult · the staff have a moment');

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    "The nurse waves me into the small office. She does not sit. She offers ~~three things~~ what they have on hand."
  );
  page.appendChild(intro);

  page.appendChild(statusStrip());

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ I can take ─'));
  const list = el('div', { class: 'choice-list' });
  for (const id of opts) {
    const a = ATTACHMENTS[id];
    if (!a) continue;
    const row = el('button', { class: 'choice-row consult-row' });
    row.appendChild(el('span', { class: 'choice-marker' }, '▸ '));
    row.appendChild(el('div', { class: 'choice-label' }, a.name));
    const voice = el('div', { class: 'choice-voice' });
    voice.innerHTML = parseProse(a.voice);
    row.appendChild(voice);
    row.appendChild(el('div', { class: 'choice-desc' }, a.desc));
    row.addEventListener('click', () => {
      if (state.attachments.length >= 4) {
        state._consultPendingAddId = id;
        render();
        return;
      }
      sfx('select');
      addAttachment(id);
      state._consultRoll = null;
      advanceCorridor();
      render();
    });
    list.appendChild(row);
  }
  const rest = el('button', { class: 'choice-row consult-row consult-rest' });
  rest.appendChild(el('span', { class: 'choice-marker' }, '▸ '));
  rest.appendChild(el('div', { class: 'choice-label' }, 'rest'));
  const restVoice = el('div', { class: 'choice-voice' });
  restVoice.innerHTML = parseProse('I sit. ~~For the length of a corridor.~~ For a moment.');
  rest.appendChild(restVoice);
  rest.appendChild(el('div', { class: 'choice-desc' }, 'recover 5 composure.'));
  rest.addEventListener('click', () => {
    sfx('heal');
    state.composure = Math.min(state.composureMax, state.composure + 5);
    state._consultRoll = null;
    advanceCorridor();
    render();
  });
  list.appendChild(rest);

  page.appendChild(list);

  if (state._consultPendingAddId) {
    page.appendChild(el('div', { class: 'sec-label-doc' }, '─ I am already carrying four. swap one ─'));
    const swap = el('div', { class: 'choice-list' });
    for (const cur of state.attachments) {
      const a = ATTACHMENTS[cur];
      const row = el('button', { class: 'choice-row consult-row' });
      row.appendChild(el('span', { class: 'choice-marker' }, '▸ '));
      row.appendChild(el('div', { class: 'choice-label' }, `drop · ${a.name}`));
      const v = el('div', { class: 'choice-voice' });
      v.innerHTML = parseProse(a.voice);
      row.appendChild(v);
      row.addEventListener('click', () => {
        state.attachments = state.attachments.filter(x => x !== cur);
        addAttachment(state._consultPendingAddId);
        state._consultPendingAddId = null;
        state._consultRoll = null;
        advanceCorridor();
        render();
      });
      swap.appendChild(row);
    }
    const cancel = el('button', { class: 'choice-row consult-row' });
    cancel.appendChild(el('span', { class: 'choice-marker' }, '▸ '));
    cancel.appendChild(el('div', { class: 'choice-label' }, 'keep what I have'));
    cancel.addEventListener('click', () => {
      state._consultPendingAddId = null;
      render();
    });
    swap.appendChild(cancel);
    page.appendChild(swap);
  }

  app().appendChild(page);
}

// ── reached (post-session win) ───────────────────────────────────────
export function renderReached() {
  const r = state._reachInfo;
  if (!r) { advanceCorridor(); render(); return; }
  const patient = PATIENTS[r.patientId];

  const page = docPage(`// session · ${patient.displayName} · reached`);

  const dossier = el('div', { class: 'reached-dossier' });
  const glyph = el('div', { class: 'reached-glyph' });
  glyph.innerHTML = renderGlyph(patient.species);
  dossier.appendChild(glyph);
  const right = el('div', { class: 'reached-right' });
  const nm = el('div', { class: 'reached-name' });
  nm.innerHTML = parseProse(patient.displayName);
  right.appendChild(nm);
  const sub = el('div', { class: 'reached-subtitle' });
  sub.innerHTML = parseProse(patient.subtitle);
  right.appendChild(sub);
  const signature = el('div', { class: 'reached-signature' });
  signature.innerHTML = parseProse(patient.signature.onWin);
  right.appendChild(signature);
  dossier.appendChild(right);
  page.appendChild(dossier);

  // Reach rewards: recover composure.
  const heal = 4;
  state.composure = Math.min(state.composureMax, state.composure + heal);

  const restLine = el('div', { class: 'doc-prose dim' });
  restLine.innerHTML = parseProse(`I sit in their room a little longer. My composure returns. ~~Some of it.~~`);
  page.appendChild(restLine);

  page.appendChild(actionRow(
    docButton('descend', () => {
      sfx('select');
      state._reachInfo = null;
      advanceCorridor();
      render();
    })
  ));
  app().appendChild(page);
}

// ── overwhelmed (post-session loss) ──────────────────────────────────
export function renderOverwhelmed() {
  const r = state._reachInfo;
  if (!r) { advanceCorridor(); render(); return; }
  const patient = PATIENTS[r.patientId];

  const page = docPage(`// session · ${patient.displayName} · overcame`);

  const dossier = el('div', { class: 'reached-dossier' });
  const glyph = el('div', { class: 'reached-glyph' });
  glyph.innerHTML = renderGlyph(patient.species);
  dossier.appendChild(glyph);
  const right = el('div', { class: 'reached-right' });
  const nm = el('div', { class: 'reached-name' });
  nm.innerHTML = parseProse(patient.displayName);
  right.appendChild(nm);
  const sub = el('div', { class: 'reached-subtitle' });
  sub.innerHTML = parseProse(patient.subtitle);
  right.appendChild(sub);
  const signature = el('div', { class: 'reached-signature' });
  signature.innerHTML = parseProse(patient.signature.onLoss);
  right.appendChild(signature);
  dossier.appendChild(right);
  page.appendChild(dossier);

  const lossProse = el('div', { class: 'doc-prose' });
  lossProse.innerHTML = parseProse((VOICE.outcomes && VOICE.outcomes.loss_intro) || 'I leave the room with less in me than I came with.');
  page.appendChild(lossProse);

  page.appendChild(actionRow(
    docButton('close the file', () => {
      sfx('faint');
      recordRunResult(false);
      state.endResult = { kind: 'lost', reason: 'overwhelmed' };
      state.screen = 'gameover';
      render();
    })
  ));
  app().appendChild(page);
}

// ── victory ──────────────────────────────────────────────────────────
export function renderVictory() {
  const page = docPage('// admission · the door at the top');

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse([
    "The Warden hands me the pen. The log is empty from here on.",
    "I climb back up the stairs. The corridors are the same. ~~Most are.~~",
    "!!The door at the top is open.!!"
  ].join('\n\n'));
  page.appendChild(intro);

  if (!state._winRecorded) {
    state._winRecorded = true;
    const r = recordRunResult(true);
    if (r.newAdmissions && r.newAdmissions.length > 0) {
      const unlockProse = el('div', { class: 'doc-prose dim' });
      unlockProse.innerHTML = parseProse(`new admissions in the cabinet: ${r.newAdmissions.join(', ')}.`);
      page.appendChild(unlockProse);
    }
  }

  page.appendChild(actionRow(
    docButton('the archive', () => { state.screen = 'archive'; render(); }, 'small'),
    docButton('be admitted again', () => {
      state._winRecorded = false;
      resetToTitle();
      render();
    }),
  ));
  app().appendChild(page);
}

// ── gameover ─────────────────────────────────────────────────────────
export function renderGameover() {
  const page = docPage('// admission · the file is closed');

  const intro = el('div', { class: 'doc-prose' });
  const reason = state.endResult && state.endResult.reason;
  let body = "The file closes. ~~Someone is signing me out.~~ The pen is not mine.";
  if (reason === 'forfeit') body = "I close the file myself. ~~I do not remember opening it.~~ The desk is empty.";
  if (reason === 'event_collapse') body = "I do not leave the room. The page fills in without me.";
  intro.innerHTML = parseProse(body);
  page.appendChild(intro);

  page.appendChild(actionRow(
    docButton('the archive', () => { state.screen = 'archive'; render(); }, 'small'),
    docButton('be admitted again', () => {
      resetToTitle();
      render();
    }),
  ));
  app().appendChild(page);
}

// ── archive ──────────────────────────────────────────────────────────
export function renderArchive() {
  const a = getArchive();
  const page = docPage('// the archive');

  const intro = el('div', { class: 'doc-prose dim' });
  intro.innerHTML = parseProse('every patient I have read. ~~Some I cannot stop reading.~~');
  page.appendChild(intro);

  const runs = el('div', { class: 'archive-summary' });
  runs.appendChild(el('span', { class: 'archive-summary-cell' }, `descents · ${a.runs.completed}`));
  runs.appendChild(el('span', { class: 'archive-summary-cell' }, `reached the door · ${a.runs.won}`));
  runs.appendChild(el('span', { class: 'archive-summary-cell' }, `closed against · ${a.runs.lost}`));
  page.appendChild(runs);

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ patient files ─'));
  const patientIds = Object.keys(PATIENTS);
  const list = el('div', { class: 'archive-list' });
  for (const id of patientIds) {
    const p = PATIENTS[id];
    const data = a.patients[id];
    if (!data || data.encounters === 0) continue;
    list.appendChild(archivePatientCard(p, data));
  }
  if (list.children.length === 0) {
    page.appendChild(el('div', { class: 'doc-prose dim' }, 'no files. ~~not yet.~~'));
  } else {
    page.appendChild(list);
  }

  const unseen = patientIds.filter(id => !a.patients[id] || a.patients[id].encounters === 0).length;
  if (unseen > 0) {
    const dim = el('div', { class: 'doc-prose dim' });
    dim.innerHTML = parseProse(`${unseen} files remain unopened.`);
    page.appendChild(dim);
  }

  page.appendChild(actionRow(
    docButton('〈 back', () => { state.screen = 'start'; render(); }, 'small'),
  ));
  app().appendChild(page);
}

function archivePatientCard(p, data) {
  const card = el('div', { class: 'archive-card' });

  const head = el('div', { class: 'archive-card-head' });
  const glyph = el('div', { class: 'archive-glyph' });
  glyph.innerHTML = renderGlyph(p.species);
  head.appendChild(glyph);
  const headRight = el('div', { class: 'archive-headright' });
  const nm = el('div', { class: 'archive-name' });
  nm.innerHTML = parseProse(p.displayName);
  headRight.appendChild(nm);
  const sub = el('div', { class: 'archive-subtitle' });
  sub.innerHTML = parseProse(p.subtitle);
  headRight.appendChild(sub);
  const meta = el('div', { class: 'archive-meta' });
  meta.appendChild(el('span', { class: 'meta-cell' }, `encounters · ${data.encounters}`));
  meta.appendChild(el('span', { class: 'meta-cell' }, `reached · ${data.reaches}`));
  headRight.appendChild(meta);
  head.appendChild(headRight);
  card.appendChild(head);

  const notes = el('div', { class: 'archive-notes' });
  for (const line of p.notes || []) {
    const ln = el('div', { class: 'archive-note-line' });
    ln.innerHTML = parseProse(line);
    notes.appendChild(ln);
  }
  card.appendChild(notes);

  // For patients reached at least once, show their win signature.
  if (data.reaches > 0) {
    const sig = el('div', { class: 'archive-signature' });
    sig.innerHTML = parseProse(p.signature.onWin);
    card.appendChild(sig);
  }

  return card;
}

// ── shared helpers ───────────────────────────────────────────────────
function docPage(tag) {
  const wrap = el('div', { class: 'doc-page' });
  wrap.appendChild(el('div', { class: 'doc-page-tag' }, tag));
  return wrap;
}

function actionRow(...children) {
  const row = el('div', { class: 'doc-action-row' });
  for (const c of children) if (c) row.appendChild(c);
  return row;
}

function docButton(label, onclick, variant) {
  const cls = 'doc-button' + (variant ? ' ' + variant : '');
  return el('button', { class: cls, onclick }, [
    el('span', { class: 'doc-button-marker' }, '▸ '),
    el('span', { class: 'doc-button-label' }, label),
  ]);
}

function statusStrip() {
  const wrap = el('div', { class: 'status-strip' });

  const compCell = el('div', { class: 'status-cell composure' });
  compCell.appendChild(el('div', { class: 'status-cell-label' }, 'composure'));
  const bar = el('div', { class: 'status-bar' });
  const fill = el('div', { class: 'status-bar-fill' });
  const pct = Math.max(0, Math.min(100, (state.composure / state.composureMax) * 100));
  fill.style.width = pct + '%';
  bar.appendChild(fill);
  compCell.appendChild(bar);
  compCell.appendChild(el('div', { class: 'status-cell-val' }, `${state.composure}/${state.composureMax}`));
  wrap.appendChild(compCell);

  const attCell = el('div', { class: 'status-cell attachments' });
  attCell.appendChild(el('div', { class: 'status-cell-label' }, 'I carry'));
  const attList = el('div', { class: 'status-pill-list' });
  if (state.attachments.length === 0) {
    attList.appendChild(el('span', { class: 'status-pill empty' }, '— nothing yet —'));
  } else {
    for (const id of state.attachments) {
      const a = ATTACHMENTS[id];
      attList.appendChild(el('span', { class: 'status-pill', title: a && a.desc }, a ? a.name : id));
    }
  }
  attCell.appendChild(attList);
  wrap.appendChild(attCell);

  return wrap;
}

function unknownGlyphSvg() {
  return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" fill="currentColor"><rect x="13" y="14" width="2" height="2"/><rect x="17" y="13" width="2" height="2"/><rect x="15" y="17" width="2" height="2"/></svg>`;
}
