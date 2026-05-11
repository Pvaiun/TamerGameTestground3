// Main render dispatcher. Clears #app and routes to a screen renderer.
// Called after every state mutation that should produce a visible change.

import { el, app } from './dom.js';
import { state } from '../state.js';
import { renderSession } from './session.js';
import {
  renderStart, renderAdmissionPick, renderAdmissionConfirm,
  renderCorridor, renderQuiet, renderConsult,
  renderReached, renderOverwhelmed,
  renderVictory, renderGameover,
  renderArchive,
} from './screens.js';

export function render() {
  const root = app();
  root.innerHTML = '';

  // Title strip — every screen except the session itself.
  if (state.screen !== 'session') {
    root.appendChild(titleStrip());
  }

  switch (state.screen) {
    case 'start':         renderStart(); break;
    case 'admission_pick': renderAdmissionPick(); break;
    case 'admission_confirm': renderAdmissionConfirm(); break;
    case 'corridor':      renderCorridor(); break;
    case 'session':       renderSession(); break;
    case 'reached':       renderReached(); break;
    case 'overwhelmed':   renderOverwhelmed(); break;
    case 'quiet':         renderQuiet(); break;
    case 'consult':       renderConsult(); break;
    case 'victory':       renderVictory(); break;
    case 'gameover':      renderGameover(); break;
    case 'archive':       renderArchive(); break;
    default:
      root.appendChild(el('div', { class: 'doc-prose' }, `Unknown screen: ${state.screen}`));
  }
}

function titleStrip() {
  const strip = el('div', { class: 'title-strip' });
  strip.appendChild(el('h1', {}, 'BLOODLINES'));
  strip.appendChild(el('div', { class: 'subtitle' }, 'Five descents · one file'));
  return strip;
}
