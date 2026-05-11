// Lightweight DOM animation helpers. Spawn a float over an anchor, flash a
// node, shake it. No state held in module scope.

import { el } from './dom.js';

export function spawnFloat(anchor, text, kind = 'dmg') {
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const div = el('div', { class: 'floating ' + kind }, text);
  div.style.position = 'fixed';
  div.style.textAlign = 'center';
  div.style.minWidth = '80px';
  div.style.left = `${r.left + r.width / 2 - 40}px`;
  div.style.top  = `${r.top + r.height / 2 - 24}px`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 950);
}

export function shakeNode(node) {
  if (!node) return;
  node.classList.remove('shake-pulse');
  void node.offsetWidth;
  node.classList.add('shake-pulse');
  setTimeout(() => node.classList.remove('shake-pulse'), 500);
}

export function flashNode(node, cls = 'flash') {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  setTimeout(() => node.classList.remove(cls), 600);
}
