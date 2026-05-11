// Session screen — the moment-to-moment confrontation between Patient 0413
// and another patient. Layout:
//
//   ┌─ engagement strip ─────────────────────────────────────────────┐
//   │  // session · descent N · their name · beat M                  │
//   └────────────────────────────────────────────────────────────────┘
//   ┌─ patient column ────────────────────────────────────────────────┐
//   │ [glyph]  [Patient name]                                         │
//   │          institutional subtitle                                 │
//   │                                                                 │
//   │          notes lines, dimmed except as they relate to fixation │
//   │                                                                 │
//   │          composure ████████░░ 8/10                              │
//   │          strength ░░░░░░ 1.0                                   │
//   │                                                                 │
//   │          fixation · KNOWN/UNKNOWN                              │
//   │          ─ they are about to ─                                  │
//   │              [tell text]                                        │
//   └────────────────────────────────────────────────────────────────┘
//   ┌─ my strip ──────────────────────────────────────────────────────┐
//   │ 0413 · composure ▓▓▓▓▓▓▓░░░ 11/14   ─ wards · attachments       │
//   └────────────────────────────────────────────────────────────────┘
//   ┌─ action box ────────────────────────────────────────────────────┐
//   │  ▸ I lean in.    ▸ I stand fast.    ▸ I step back.              │
//   │  ─ or ─                                                          │
//   │  ▸ call [Soothlick] · tend                                       │
//   │  ▸ observe (once per session)                                    │
//   │                                                                  │
//   │  [recent narration scroll]                                       │
//   └────────────────────────────────────────────────────────────────┘

import { el, app } from './dom.js';
import { state } from '../state.js';
import { PATIENTS, FIXATIONS, ATTACHMENTS, VOICE } from '../data.js';
import { sfx } from '../audio.js';
import { parseProse } from './textCorrupt.js';
import { renderGlyph } from './glyphs.js';
import { spawnFloat, shakeNode } from './animations.js';
import { resolveBeat, invokeWard, sessionOutcome, endSession, observe, rememberAction } from '../session.js';
import { render } from './render.js';
import { pick } from '../rng.js';

export function renderSession() {
  const s = state.session;
  if (!s) { state.screen = 'corridor'; render(); return; }

  const root = app();

  // Engagement strip.
  root.appendChild(engagementStrip(s));

  // Patient column.
  root.appendChild(patientPanel(s));

  // Player strip.
  root.appendChild(playerStrip(s));

  // Narrative + action box.
  root.appendChild(actionBox(s));
}

function engagementStrip(s) {
  const strip = el('div', { class: 'session-strip' });
  const floor = (state.corridor && state.corridor.currentFloor != null) ? (state.corridor.currentFloor + 1) : 1;
  strip.appendChild(el('span', { class: 'session-strip-cell' }, `// session`));
  strip.appendChild(el('span', { class: 'session-strip-cell' }, `descent ${floor}`));
  strip.appendChild(el('span', { class: 'session-strip-cell' }, `beat ${s.beatIdx + 1}`));
  const nameCell = el('span', { class: 'session-strip-cell session-strip-name' });
  nameCell.innerHTML = parseProse(s.patient.displayName);
  strip.appendChild(nameCell);
  return strip;
}

function patientPanel(s) {
  const panel = el('div', { class: 'patient-panel' });

  // Top: glyph + identity.
  const head = el('div', { class: 'patient-head' });
  const glyphWrap = el('div', { class: 'patient-glyph' });
  glyphWrap.innerHTML = renderGlyph(s.patient.species);
  head.appendChild(glyphWrap);
  const ident = el('div', { class: 'patient-ident' });
  const nm = el('div', { class: 'patient-name' });
  nm.innerHTML = parseProse(s.patient.displayName);
  ident.appendChild(nm);
  const sub = el('div', { class: 'patient-subtitle' });
  sub.innerHTML = parseProse(s.patient.subtitle);
  ident.appendChild(sub);
  head.appendChild(ident);
  panel.appendChild(head);

  // Notes (collapsed — the dossier is a reference).
  const notes = el('div', { class: 'patient-notes' });
  for (const ln of s.patient.notes || []) {
    const node = el('div', { class: 'patient-note-line' });
    node.innerHTML = parseProse(ln);
    notes.appendChild(node);
  }
  panel.appendChild(notes);

  // Composure + strength.
  panel.appendChild(barRow('composure', s.patientComposure, s.patientComposureMax, 'comp'));
  panel.appendChild(barRow('strength', s.patientStrength, 1.6, 'str', `×${(+s.patientStrength).toFixed(2)}`));

  // Fixation.
  const fix = FIXATIONS[s.patient.fixation.type] || {};
  const fxWrap = el('div', { class: 'patient-fixation' });
  fxWrap.appendChild(el('div', { class: 'patient-fixation-label' }, 'fixation'));
  const fxBody = el('div', { class: 'patient-fixation-body' });
  if (s.revealedFixation) {
    fxBody.innerHTML = `<span class="fix-name">${escapeHtml(fix.name || '—')}</span><span class="fix-sep"> · </span><span class="fix-desc">${escapeHtml(fix.desc || '')}</span>`;
  } else {
    const hint = s.patient.fixation.hint || '—';
    fxBody.innerHTML = parseProse(hint);
  }
  fxWrap.appendChild(fxBody);
  panel.appendChild(fxWrap);

  // About to.
  const tellWrap = el('div', { class: 'patient-about' });
  tellWrap.appendChild(el('div', { class: 'patient-about-label' }, 'about to'));
  const tellBody = el('div', { class: 'patient-about-body' });
  if (s.resolved) {
    tellBody.innerHTML = '<span class="tell-done">─</span>';
  } else if (s.pendingPatientTell && s.pendingPatientTell.text) {
    tellBody.innerHTML = parseProse(s.pendingPatientTell.text);
  } else {
    tellBody.innerHTML = '<span class="tell-pending">─ they are reading the room ─</span>';
  }
  tellWrap.appendChild(tellBody);
  panel.appendChild(tellWrap);

  return panel;
}

function barRow(label, cur, max, kind, overrideRight) {
  const row = el('div', { class: 'bar-row ' + kind });
  row.appendChild(el('div', { class: 'bar-label' }, label));
  const bar = el('div', { class: 'bar-track' });
  const fill = el('div', { class: 'bar-fill ' + kind });
  fill.style.width = Math.max(0, Math.min(100, (cur / max) * 100)) + '%';
  bar.appendChild(fill);
  row.appendChild(bar);
  row.appendChild(el('div', { class: 'bar-num' }, overrideRight || `${cur}/${max}`));
  return row;
}

function playerStrip(s) {
  const lowComp = s.playerComposure <= 4 && s.playerComposure > 0;
  const strip = el('div', { class: 'player-strip' + (lowComp ? ' low' : '') });

  const left = el('div', { class: 'player-strip-left' });
  left.appendChild(el('span', { class: 'player-id' }, '0413'));
  const compWrap = el('div', { class: 'player-comp' });
  const bar = el('div', { class: 'bar-track' });
  const fill = el('div', { class: 'bar-fill player' + (lowComp ? ' low' : '') });
  fill.style.width = Math.max(0, Math.min(100, (s.playerComposure / s.playerComposureMax) * 100)) + '%';
  bar.appendChild(fill);
  compWrap.appendChild(el('span', { class: 'player-comp-label' }, 'composure'));
  compWrap.appendChild(bar);
  compWrap.appendChild(el('span', { class: 'player-comp-num' + (lowComp ? ' low' : '') }, `${s.playerComposure}/${s.playerComposureMax}`));
  left.appendChild(compWrap);
  strip.appendChild(left);

  const right = el('div', { class: 'player-strip-right' });
  // Wards.
  const wardsWrap = el('div', { class: 'player-wards' });
  wardsWrap.appendChild(el('span', { class: 'player-strip-label' }, 'with me · '));
  if (!state.wards.length) {
    wardsWrap.appendChild(el('span', { class: 'player-strip-dim' }, 'alone'));
  } else {
    for (const w of state.wards) {
      const p = PATIENTS[w.speciesId];
      const lbl = p ? p.displayName.replace(/^\[|\]$/g, '') : w.speciesId;
      const pill = el('span', { class: 'player-pill ward' + (w.used ? ' used' : '') }, `[${lbl}]`);
      wardsWrap.appendChild(pill);
    }
  }
  right.appendChild(wardsWrap);
  // Attachments.
  const attWrap = el('div', { class: 'player-attachments' });
  attWrap.appendChild(el('span', { class: 'player-strip-label' }, 'I carry · '));
  if (!state.attachments.length) {
    attWrap.appendChild(el('span', { class: 'player-strip-dim' }, '—'));
  } else {
    for (const id of state.attachments) {
      const a = ATTACHMENTS[id];
      const pill = el('span', { class: 'player-pill', title: a && a.desc }, a ? a.name : id);
      attWrap.appendChild(pill);
    }
  }
  right.appendChild(attWrap);
  strip.appendChild(right);

  return strip;
}

function actionBox(s) {
  const box = el('div', { class: 'session-action-box' });

  if (s.resolved) {
    box.appendChild(resolvedPanel(s));
    return box;
  }

  // The three base moves.
  const moves = el('div', { class: 'move-row' });
  moves.appendChild(moveBtn(s, 'press', 'I lean in.', 'press'));
  moves.appendChild(moveBtn(s, 'hold',  'I stand fast.', 'hold'));
  moves.appendChild(moveBtn(s, 'yield', 'I step back.', 'yield'));
  box.appendChild(moves);

  // Optional actions row: wards, observe, remember.
  const extras = [];
  for (const w of state.wards) {
    const p = PATIENTS[w.speciesId];
    if (!p || !p.ward) continue;
    if (w.used) continue;
    extras.push(extraBtn(`call · [${p.displayName.replace(/^\[|\]$/g, '')}] · ${p.ward.name}`, p.ward.desc, () => {
      sfx('select');
      const r = invokeWard(w.speciesId);
      if (r) {
        appendLog(s, `${p.ward.voice}`, 'ward');
      }
      render();
    }));
  }
  if (state.attachments.includes('patient') && !s.attachmentsUsedThisSession.has('patient')) {
    extras.push(extraBtn('observe · once per session', 'I take 1 damage but learn their next move truthfully.', () => {
      sfx('select');
      observe();
      appendLog(s, VOICE.session.observe || 'I watch.', 'observe');
      render();
    }));
  }
  if (state.attachments.includes('remember') && !s.attachmentsUsedThisSession.has('remember') && !s.revealedFixation) {
    extras.push(extraBtn('remember · once per session', 'reveal their fixation.', () => {
      sfx('select');
      rememberAction();
      render();
    }));
  }
  if (extras.length) {
    box.appendChild(el('div', { class: 'extras-sep' }, '─ or ─'));
    const extrasRow = el('div', { class: 'extras-row' });
    for (const x of extras) extrasRow.appendChild(x);
    box.appendChild(extrasRow);
  }

  // Rules cheatsheet — small RPS reminder beneath the buttons.
  if (VOICE.session && VOICE.session.rules_brief) {
    box.appendChild(el('div', { class: 'rps-reminder' }, VOICE.session.rules_brief));
  }

  // Narration log — last few beats.
  box.appendChild(narrativePanel(s));

  return box;
}

function moveBtn(s, key, label, cls) {
  const btn = el('button', { class: 'move-btn move-' + cls });
  btn.appendChild(el('div', { class: 'move-btn-label' }, label));
  btn.appendChild(el('div', { class: 'move-btn-sub' }, `(${VOICE.system[key + '_label'] || key})`));
  btn.addEventListener('click', () => {
    if (s.resolved) return;
    sfx('select');
    const result = resolveBeat(key);
    // Floating damage numbers.
    if (result) {
      requestAnimationFrame(() => {
        const patientGlyph = document.querySelector('.patient-glyph');
        const playerStripEl = document.querySelector('.player-strip');
        if (result.patientDamage > 0 && patientGlyph) {
          spawnFloat(patientGlyph, `−${result.patientDamage}`, 'dmg');
          shakeNode(document.querySelector('.patient-panel'));
        }
        if (result.playerDamage > 0 && playerStripEl) {
          spawnFloat(playerStripEl, `−${result.playerDamage}`, 'dmg');
          shakeNode(playerStripEl);
        }
        if (result.playerHeal > 0 && playerStripEl) {
          spawnFloat(playerStripEl, `+${result.playerHeal}`, 'heal');
        }
      });
      // Play sounds.
      if (result.outcome === 'win') sfx('hit');
      else if (result.outcome === 'loss') sfx('hit');
      else if (result.outcome === 'clash') sfx('select');
      // Log line.
      appendLog(s, resultNarrative(s, result, key), 'beat ' + result.outcome);
    }
    if (s.resolved) {
      const outc = sessionOutcome();
      finalizeSession(outc);
      return;
    }
    render();
  });
  return btn;
}

function extraBtn(label, desc, onclick) {
  const b = el('button', { class: 'extra-btn' });
  b.appendChild(el('span', { class: 'extra-btn-marker' }, '▸ '));
  b.appendChild(el('span', { class: 'extra-btn-label' }, label));
  if (desc) b.appendChild(el('span', { class: 'extra-btn-desc' }, ` — ${desc}`));
  b.addEventListener('click', onclick);
  return b;
}

function resolvedPanel(s) {
  const wrap = el('div', { class: 'resolved-panel' });
  const reached = s.patientComposure <= 0;
  const head = el('div', { class: 'resolved-head' }, reached ? 'I reached them.' : 'They overcame me.');
  wrap.appendChild(head);

  // Recap log line.
  const log = el('div', { class: 'narrative-block' });
  for (const ln of recentLog(s, 4)) {
    const lnEl = el('div', { class: 'narr-line ' + (ln.cls || '') });
    lnEl.innerHTML = parseProse(ln.text);
    log.appendChild(lnEl);
  }
  wrap.appendChild(log);

  // Continue button.
  wrap.appendChild(el('div', { class: 'doc-action-row' }, [
    el('button', { class: 'doc-button', onclick: () => {
      const outc = sessionOutcome();
      finalizeSession(outc);
    } }, [
      el('span', { class: 'doc-button-marker' }, '▸ '),
      el('span', { class: 'doc-button-label' }, 'continue'),
    ]),
  ]));
  return wrap;
}

function narrativePanel(s) {
  const wrap = el('div', { class: 'narrative-block' });
  const recent = recentLog(s, 4);
  if (!recent.length) {
    const ln = el('div', { class: 'narr-line dim' });
    ln.innerHTML = parseProse('I am at the threshold. ~~They are at the door.~~');
    wrap.appendChild(ln);
    return wrap;
  }
  for (let i = 0; i < recent.length; i++) {
    const entry = recent[i];
    // Older lines dim further.
    const ageCls = i === recent.length - 1 ? ' fresh' : (i === 0 ? ' faded' : '');
    const ln = el('div', { class: 'narr-line ' + (entry.cls || '') + ageCls });
    ln.innerHTML = parseProse(entry.text);
    wrap.appendChild(ln);
  }
  return wrap;
}

function recentLog(s, n) {
  const logs = s._narrLog || [];
  return logs.slice(-n);
}

function appendLog(s, text, cls) {
  if (!s._narrLog) s._narrLog = [];
  s._narrLog.push({ text, cls });
  if (s._narrLog.length > 30) s._narrLog.shift();
}

function resultNarrative(s, result, playerMove) {
  const op = pickOpening(playerMove);
  const key = `${result.outcome}_${playerMove}_vs_${result.patientMove}`;
  const tableKey = result.outcome === 'clash' ? `clash_${playerMove}` : key;
  const table = (VOICE.session && VOICE.session.resolutions) || {};
  const variants = table[tableKey] || [];
  const tail = variants.length ? pick(variants) : '';
  if (tail) return `${op} ${tail}`;
  // Fall back to a clinical line if no variant is wired.
  return op;
}

function pickOpening(playerMove) {
  const ops = (VOICE.session && VOICE.session.openings && VOICE.session.openings[playerMove]) || null;
  if (ops && ops.length) return pick(ops);
  if (playerMove === 'press') return 'I lean in.';
  if (playerMove === 'hold')  return 'I stand fast.';
  if (playerMove === 'yield') return 'I step back.';
  return '';
}

function patientName(p) {
  return (p.displayName || '[them]').toString();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Move out of the session and into reached/overwhelmed screens.
function finalizeSession(outc) {
  const speciesId = state.session.patientId;
  // For non-warden sessions, branch on reach/overwhelmed. Warden reach → victory.
  endSession();
  if (outc.reached) {
    if (speciesId === 'Warden') {
      // Mark as reached the door.
      state.endResult = { kind: 'won', reason: 'warden_reached' };
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
