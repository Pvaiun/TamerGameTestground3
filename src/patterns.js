// Movement patterns for patients. Each pattern is a pure function
//   (session, patientPos) -> nextPositionId
// driven by deterministic state — no RNG. The patient's "next move" is
// computed at the end of each player turn and telegraphed in the UI.

// ── helpers ──────────────────────────────────────────────────────────
function neighbors(room, posId) {
  const out = [];
  for (const [a, b] of room.edges || []) {
    if (a === posId) out.push(b);
    else if (b === posId) out.push(a);
  }
  return out;
}

// BFS shortest-path next step from `from` toward `to`. Returns the FIRST
// position on the path (or `from` if already there or no path).
function stepToward(room, from, to) {
  if (from === to) return from;
  const visited = new Set([from]);
  const queue = [{ id: from, first: null }];
  while (queue.length) {
    const node = queue.shift();
    for (const n of neighbors(room, node.id)) {
      if (visited.has(n)) continue;
      visited.add(n);
      const first = node.first || n;
      if (n === to) return first;
      queue.push({ id: n, first });
    }
  }
  return from;
}

// Where is a given item right now (which position id, or 'PLAYER' if carried).
function itemLocation(session, itemId) {
  if (session.carrying === itemId) return 'PLAYER';
  return session.itemAt[itemId];
}

// Public: compute the next intended position for the patient.
export function nextPatientMove(session) {
  const room = session.patient.room;
  const pattern = room.patientPattern || { type: 'still' };
  const pos = session.patientPos;

  switch (pattern.type) {
    case 'still':
      return pos;

    case 'toward': {
      const target = pattern.target;
      return stepToward(room, pos, target);
    }

    case 'cycle': {
      const seq = pattern.sequence || [];
      if (!seq.length) return pos;
      const idx = (session._cycleIdx ?? -1) + 1;
      session._cycleIdxNext = idx % seq.length;
      return seq[session._cycleIdxNext];
    }

    case 'follow_player': {
      // Move toward where the player is RIGHT NOW (one step closer each turn).
      const lag = pattern.lag || 0;
      if (session.turnsTaken < lag) return pos;
      return stepToward(room, pos, session.playerPos);
    }

    case 'mirror_player': {
      // Move to where the player IS this turn.
      // If already there, stay.
      return session.playerPos === pos ? pos : stepToward(room, pos, session.playerPos);
    }

    case 'follow_item': {
      // Move toward whichever position holds the named item.
      const target = itemLocation(session, pattern.item);
      if (!target || target === 'PLAYER') {
        // Item is being carried — patient stays still until item lands again.
        return pos;
      }
      return stepToward(room, pos, target);
    }

    case 'stay_unless_seated': {
      // Stay at start. If the player has occupied `seatTrigger`, move to `moveTo` permanently.
      if (session._triggered) return pattern.moveTo;
      if (session.playerPos === pattern.seatTrigger) {
        session._triggered = true;
        return pattern.moveTo;
      }
      return pos;
    }

    default:
      return pos;
  }
}

// Public: commit pattern-internal state mutations after a move resolves.
// Some patterns (cycle, stay_unless_seated) update internal counters as side
// effects of nextPatientMove. This finalizes those.
export function commitPatternState(session) {
  if (session._cycleIdxNext != null) {
    session._cycleIdx = session._cycleIdxNext;
    session._cycleIdxNext = null;
  }
}
