// Session screen — the room puzzle. Layout:
//
//   ┌─ engagement strip ─────────────────────────────────────────────┐
//   │  // session · [Patient name] · turn N of M · composure X/Y     │
//   └────────────────────────────────────────────────────────────────┘
//   ┌─ patient column (left) ───┬─ room map (right) ──────────────────┐
//   │ glyph                     │   the door     ── I am here         │
//   │ [Name]                    │   the bed      ── (P) they are here │
//   │ subtitle                  │   the chair                          │
//   │ notes ...                 │   the window                         │
//   │                           │                                      │
//   │                           │   they are about to move to: the bed │
//   └───────────────────────────┴──────────────────────────────────────┘
//   ┌─ narrative scroll ──────────────────────────────────────────────┐
//   │  recent prose, oldest faded                                      │
//   └─────────────────────────────────────────────────────────────────┘
//   ┌─ actions ───────────────────────────────────────────────────────┐
//   │  ▸ move to · the bed       ▸ move to · the chair                 │
//   │  ▸ sit with him            ▸ wait                                │
//   └─────────────────────────────────────────────────────────────────┘

import { el, app } from './dom.js';
import { state } from '../state.js';
import { ATTACHMENTS, VOICE } from '../data.js';
import { sfx } from '../audio.js';
import { parseProse } from './textCorrupt.js';
import { renderGlyph } from './glyphs.js';
import {
  move, wait, act, listActions, listMoves,
  sessionOutcome, endSession, positionAt, itemsAtPosition, itemName,
} from '../session.js';
import { render } from './render.js';

export function renderSession() {
  const s = state.session;
  if (!s) { state.screen = 'corridor'; render(); return; }

  const root = app();
  root.appendChild(engagementStrip(s));

  const grid = el('div', { class: 'session-grid' });
  grid.appendChild(patientPanel(s));
  grid.appendChild(roomMap(s));
  root.appendChild(grid);

  root.appendChild(narrativeBlock(s));

  if (s.resolved) {
    root.appendChild(resolvedPanel(s));
  } else {
    root.appendChild(actionsPanel(s));
  }
}

function engagementStrip(s) {
  const strip = el('div', { class: 'session-strip' });
  strip.appendChild(el('span', { class: 'session-strip-cell' }, '// session'));
  const nameCell = el('span', { class: 'session-strip-cell session-strip-name' });
  nameCell.innerHTML = parseProse(s.patient.displayName);
  strip.appendChild(nameCell);
  strip.appendChild(el('span', { class: 'session-strip-cell' }, `turn ${s.turnsTaken + 1} of ${s.turnLimit}`));
  const compCls = s.playerComposure <= 2 ? ' low' : '';
  strip.appendChild(el('span', { class: 'session-strip-cell session-strip-comp' + compCls }, `composure ${s.playerComposure}/${s.playerComposureMax}`));
  return strip;
}

function patientPanel(s) {
  const panel = el('div', { class: 'patient-panel' });

  const head = el('div', { class: 'patient-head' });
  const glyph = el('div', { class: 'patient-glyph' });
  glyph.innerHTML = renderGlyph(s.patient.species);
  head.appendChild(glyph);
  const ident = el('div', { class: 'patient-ident' });
  const nm = el('div', { class: 'patient-name' });
  nm.innerHTML = parseProse(s.patient.displayName);
  ident.appendChild(nm);
  const sub = el('div', { class: 'patient-subtitle' });
  sub.innerHTML = parseProse(s.patient.subtitle);
  ident.appendChild(sub);
  head.appendChild(ident);
  panel.appendChild(head);

  const notes = el('div', { class: 'patient-notes' });
  for (const ln of s.patient.notes || []) {
    const node = el('div', { class: 'patient-note-line' });
    node.innerHTML = parseProse(ln);
    notes.appendChild(node);
  }
  panel.appendChild(notes);

  return panel;
}

function roomMap(s) {
  const wrap = el('div', { class: 'room-map' });
  wrap.appendChild(el('div', { class: 'room-map-label' }, '─ the room ─'));

  const positions = s.patient.room.positions;
  for (const [posId, posData] of Object.entries(positions)) {
    const row = el('div', { class: 'room-pos-row' });
    const cur = posId === s.playerPos ? ' player-here' : '';
    const pat = posId === s.patientPos ? ' patient-here' : '';
    const next = posId === s.patientNextPos && posId !== s.patientPos ? ' patient-next' : '';
    row.className += cur + pat + next;

    // Marker column.
    const marker = el('span', { class: 'room-pos-marker' });
    if (posId === s.playerPos && posId === s.patientPos) marker.textContent = '(@P)';
    else if (posId === s.playerPos) marker.textContent = '(@)';
    else if (posId === s.patientPos) marker.textContent = '(P)';
    else if (posId === s.patientNextPos) marker.textContent = '(→)';
    else marker.textContent = '   ';
    row.appendChild(marker);

    // Name column.
    const name = el('span', { class: 'room-pos-name' }, posData.name || posId);
    row.appendChild(name);

    // Items column.
    const items = itemsAtPosition(s, posId);
    if (items.length) {
      const itemNames = items.map(i => i.name).join(', ');
      row.appendChild(el('span', { class: 'room-pos-items' }, ` · ${itemNames}`));
    }
    if (s.carrying && posId === s.playerPos) {
      const it = itemName(s, s.carrying);
      row.appendChild(el('span', { class: 'room-pos-items carrying' }, ` · I am holding ${it}`));
    }

    wrap.appendChild(row);
  }

  // Telegraph footer.
  const next = el('div', { class: 'telegraph-row' });
  if (s.patientNextPos == null || s.patientNextPos === s.patientPos) {
    next.appendChild(el('span', { class: 'telegraph-text' }, 'they do not move next turn.'));
  } else {
    next.appendChild(el('span', { class: 'telegraph-text' }, `they are about to move to · `));
    next.appendChild(el('span', { class: 'telegraph-pos' }, positions[s.patientNextPos]?.name || s.patientNextPos));
  }
  wrap.appendChild(next);

  return wrap;
}

function narrativeBlock(s) {
  const wrap = el('div', { class: 'narrative-block' });
  const recent = s.log.slice(-5);
  for (let i = 0; i < recent.length; i++) {
    const entry = recent[i];
    const ageCls = i === recent.length - 1 ? ' fresh' : (i === 0 ? ' faded' : '');
    const ln = el('div', { class: 'narr-line ' + (entry.cls || '') + ageCls });
    ln.innerHTML = parseProse(entry.text || '');
    wrap.appendChild(ln);
  }
  return wrap;
}

function actionsPanel(s) {
  const wrap = el('div', { class: 'actions-panel' });

  // ACT options (position-specific actions).
  const acts = listActions();
  if (acts.length) {
    wrap.appendChild(el('div', { class: 'actions-label' }, '─ I can ─'));
    const actCol = el('div', { class: 'actions-col' });
    for (const a of acts) {
      const btn = el('button', { class: 'action-btn' });
      btn.appendChild(el('span', { class: 'action-marker' }, '▸ '));
      btn.appendChild(el('span', { class: 'action-label' }, a.label));
      btn.addEventListener('click', () => {
        sfx('select');
        act(a.id);
        if (state.session && state.session.resolved) {
          finalizeSession();
          return;
        }
        render();
      });
      actCol.appendChild(btn);
    }
    wrap.appendChild(actCol);
  }

  // MOVE options.
  const moves = listMoves();
  if (moves.length) {
    wrap.appendChild(el('div', { class: 'actions-label' }, '─ or move to ─'));
    const moveCol = el('div', { class: 'actions-col moves' });
    for (const m of moves) {
      const posData = positionAt(s, m);
      const btn = el('button', { class: 'action-btn move-btn' });
      btn.appendChild(el('span', { class: 'action-marker' }, '▸ '));
      btn.appendChild(el('span', { class: 'action-label' }, posData.name || m));
      btn.addEventListener('click', () => {
        sfx('select');
        move(m);
        if (state.session && state.session.resolved) {
          finalizeSession();
          return;
        }
        render();
      });
      moveCol.appendChild(btn);
    }
    wrap.appendChild(moveCol);
  }

  // WAIT.
  const waitRow = el('div', { class: 'actions-col wait' });
  const waitBtn = el('button', { class: 'action-btn wait-btn' });
  waitBtn.appendChild(el('span', { class: 'action-marker' }, '▸ '));
  waitBtn.appendChild(el('span', { class: 'action-label' }, 'wait — let the turn pass'));
  waitBtn.addEventListener('click', () => {
    sfx('select');
    wait();
    if (state.session && state.session.resolved) {
      finalizeSession();
      return;
    }
    render();
  });
  waitRow.appendChild(waitBtn);
  wrap.appendChild(waitRow);

  return wrap;
}

function resolvedPanel(s) {
  const wrap = el('div', { class: 'resolved-panel' });
  const won = s.outcome === 'win';
  const head = el('div', { class: 'resolved-head ' + (won ? 'win' : 'loss') });
  head.textContent = won ? 'I reached them.' : 'They got past me.';
  wrap.appendChild(head);

  // Signature line.
  const sig = el('div', { class: 'resolved-signature' });
  const line = won ? s.patient.signature.onWin : s.patient.signature.onLoss;
  sig.innerHTML = parseProse(line || '');
  wrap.appendChild(sig);

  const btn = el('button', { class: 'doc-button' });
  btn.appendChild(el('span', { class: 'doc-button-marker' }, '▸ '));
  btn.appendChild(el('span', { class: 'doc-button-label' }, 'continue'));
  btn.addEventListener('click', () => finalizeSession());
  const row = el('div', { class: 'doc-action-row' });
  row.appendChild(btn);
  wrap.appendChild(row);
  return wrap;
}

function finalizeSession() {
  const outc = sessionOutcome();
  const speciesId = state.session.patientId;
  endSession();
  if (outc.reached) {
    if (speciesId === 'Warden') {
      state.endResult = { kind: 'won' };
      state.screen = 'victory';
      render();
      return;
    }
    state._reachInfo = { patientId: speciesId };
    state.screen = 'reached';
    render();
    return;
  }
  state._reachInfo = { patientId: speciesId };
  state.screen = 'overwhelmed';
  render();
}
