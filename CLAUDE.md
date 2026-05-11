# Bloodlines — Codebase Map

A document-horror psychiatric roguelite. Vanilla ES modules, no build step, no deps. Open `index.html` to run.

## Premise in one paragraph
Patient 0413 is admitted to a hospital that is more than a hospital. Four descents below the admission desk, one corridor at a time. Each encounter is another patient — a person with a tragedy filed in their dossier. Combat is **The Round**: a small deterministic tactical positioning puzzle. Each patient has a room — a graph of named positions. You and the patient are tokens on that graph. The patient moves deterministically per their pattern; their next move is **telegraphed** before you act. You move, act at a position (each action is a sentence written in the protagonist's voice), or wait. The puzzle is reaching them — solving the specific sequence of moves and acts that satisfies the patient's release condition — before the orderly arrives, before your composure breaks, or before the patient escapes.

## Architecture in one paragraph
`src/main.js` awaits `loadData()` (fetches `data/*.json` into named exports on `src/data.js`), then calls `render()`. The whole app is **state mutation + re-render**: modules import `state` from `src/state.js`, mutate it, then call `render()` from `src/ui/render.js`. `render()` clears `#app` and dispatches on `state.screen` to a screen renderer in `src/ui/screens.js` (or `src/ui/session.js` for the session screen). No virtual DOM, no framework, no router. UI builds DOM via the `el(tag, props, children)` helper in `src/ui/dom.js`. The visual aesthetic is **document horror** — every screen is a page in a corrupted testimony; patients are abstract 16×16 pixel-bitmap glyphs (`data/glyphs.json`) with prose dossiers. Persistence (archive of encountered patients, runs completed, admissions unlocked) lives in `src/persist.js`, backed by `localStorage`.

## Tone (preserved)
Three voice registers, kept strictly separate.
- **Patient files**: third-person clinical, sentence case, [Bracketed] nicknames.
- **Patient actions / room prose**: first-person, the protagonist describing what they do.
- **Screen narration**: protagonist's first-person `I`.
- Inline corruption markup parsed in `src/ui/textCorrupt.js`: `~~strike~~`, `[[N]]` (red bar), `**gold**` (rare), `!!red!!`.

## Gameplay loop
1. **Admission** — pick an admission type (Patient 0413 unlocked from start). Each admission has a starting composure, starting attachments, and an intro scene.
2. **Corridor** — pick one of 2–3 doors per floor. 4 floors total. Floor types: PATIENT (session), KEEPER (mini-boss session on floor 3), QUIET (text event), CONSULT (pick an upgrade), WARDEN (final boss on floor 4).
3. **Session** — the puzzle. The room is a graph of positions. The patient moves per a deterministic pattern (`still`, `toward(target)`, `cycle`, `follow_player`, `mirror_player`, `follow_item`, `stay_unless_seated`). The next move is telegraphed. You pick MOVE (to an adjacent position), ACT (one of the available actions at your current position), or WAIT. Win = trigger an action with `effect: "win"`. Lose = `composure ≤ 0` OR `turnsRemaining ≤ 0` OR a `loseIf` condition (e.g. patient reaches a forbidden position).
4. **Reached / Overwhelmed** — composure heals on a win; on a loss the run ends.
5. **Repeat** until the Warden is reached (win) or you fall (loss).

## File map

### Data (JSON, drives behavior — prefer adding params here over hardcoding in JS)
- `data/patients.json` — every patient. Fields: species (id), displayName (the [bracketed] file name), subtitle, notes[3], tier (1-5), intro (room-establishing prose shown at session start), room (positions, edges, items, playerStart, patientStart, patientPattern, turnLimit, playerComposureMax, optional loseIf, drainAdjacent, drainEachTurn), actions[] (id, at, requires, label, voice, effect, optional once), signature{onWin, onLoss}.
- `data/attachments.json` — player-carried modifiers (Resolve, Steady, Compose, Familiar, Patient, Remember, Open, Lock). Each has name, voice, desc, effect (a handler key consulted in `src/session.js`).
- `data/admissions.json` — starting kits. Composure, starting attachments, intro prose. `0413` unlocked from start; `0412` unlocks on first win; `0414` after filing 3 patients across all runs.
- `data/events.json` — quiet events: title, prose, choices[{label, voice, outcome, effects[]}]. Effects: `heal`, `damage`, `addAttachment` (id or `random`), `gainComposureMax`.
- `data/glyphs.json` — 16×16 hand-authored bitmap glyph per species. `#` filled, `.` empty. Rendered as crisp-edged SVG by `src/ui/glyphs.js`.
- `data/voiceprose.json` — system labels, protagonist narration, outcome wording.

### Core (`src/`)
- `state.js` — `state` singleton + constants (`FLOORS_TOTAL`, `MAX_ATTACHMENTS`), `resetRun`, `resetToTitle`. State is global and mutated directly.
- `data.js` — `loadData()` + named exports (`PATIENTS`, `ATTACHMENTS`, `ADMISSIONS`, `EVENTS`, `GLYPHS`, `VOICE`); helpers `patientIds()` and `tieredPatientIds(maxTier)`.
- `persist.js` — localStorage-backed archive. `getArchive`, `patientArchive(speciesId)`, `recordEncounter`, `recordReach`, `recordRunResult`, `isAdmissionUnlocked`, `resetArchive`. Schema key is `bloodlines/archive/v1`.
- `rng.js` — `rand`, `randi`, `pick`, `pickN`, `sleep`. (No RNG is used inside a session — the gameplay is deterministic.)
- `audio.js` — `sfx(type)` WebAudio bleeps.
- `patterns.js` — `nextPatientMove(session)` and `commitPatternState(session)`. Each pattern is a pure function (session, patientPos) → nextPositionId. Pattern types: `still`, `toward`, `cycle`, `follow_player`, `mirror_player`, `follow_item`, `stay_unless_seated`.
- `session.js` — the combat engine. `beginSession(speciesId)`, `move(toPosId)`, `wait()`, `act(actionId)`, `listActions()`, `listMoves()`, `sessionOutcome()`, `endSession()`. Session state hangs off `state.session` until cleared.
- `run.js` — the corridor engine. `generateCorridor()`, `placeKeepers(corridor)`, `startRun(admissionId)`, `chooseNode(floorIdx, nodeIdx)`, `advanceCorridor()`, `addAttachment(id)`, `rollConsultOptions()`, `applyEventEffect(effect)`.

### UI (`src/ui/`)
- `render.js` — `render()` dispatcher; routes on `state.screen`. Title strip on every screen except `'session'`.
- `screens.js` — every non-session screen: `renderStart`, `renderAdmissionPick`, `renderAdmissionConfirm`, `renderCorridor`, `renderQuiet`, `renderConsult`, `renderReached`, `renderOverwhelmed`, `renderVictory`, `renderGameover`, `renderArchive`.
- `session.js` — the session UI. Layout: engagement strip (turn / composure) → patient panel (glyph + dossier) → room map (positions, marker for player/patient, telegraph for patient's next move) → narrative log → action panel (acts + moves + wait).
- `glyphs.js` — `renderGlyph(speciesName)` returns SVG markup.
- `textCorrupt.js` — `parseProse(input)` consumes the corruption markup and returns HTML.
- `animations.js` — `spawnFloat`, `shakeNode`, `flashNode`.
- `dom.js` — `el(tag, props, children)`, `attachLongPress`, `app()`.

### Assets
- `index.html` — one page, `#app` + `#modal-root`, loads IBM Plex Mono and `src/main.js` as module.
- `styles.css` — all styles, layered: tokens → corruption text utilities → doc page → status strip → corridor + nodes → choice list → session (strip + grid + room map + actions + resolved) → reached/overwhelmed → archive → floats → responsive.

## Key data schemas

### Patient (`data/patients.json`)
```json
{
  "species": "Mosshorn",
  "displayName": "[Mosshorn]",
  "subtitle": "He has been still since 1972.",
  "notes": ["...", "...", "..."],
  "tier": 1,
  "intro": "He sits on the bed. He has not moved in fifty years. ...",
  "room": {
    "positions": {
      "door":   { "name": "the door",   "prose": "I am at the door. The room is cold." },
      "bed":    { "name": "the bed",    "prose": "I am beside the bed. He does not look up." },
      "chair":  { "name": "the chair",  "prose": "I am in the chair beside the bed." }
    },
    "edges": [["door","bed"],["door","chair"],["bed","chair"]],
    "items": [],
    "playerStart": "door",
    "patientStart": "bed",
    "patientPattern": { "type": "still" },
    "turnLimit": 8,
    "playerComposureMax": 6
  },
  "actions": [
    {
      "id": "sit_with_him",
      "at": "chair",
      "requires": { "patientAt": "bed" },
      "label": "Sit with him.",
      "voice": "I do not say anything. I sit. ~~He is somewhere else.~~",
      "effect": "win"
    }
  ],
  "signature": {
    "onWin": "He is the same as he was. I have just ~~understood~~ stood with him.",
    "onLoss": "I leave the room before he does. ~~I am not.~~"
  }
}
```

### Action effects
- `"win"` — session ends, player reaches the patient.
- `"narrative"` — text plays; no state change.
- `{ composure: -N }` — player loses N composure.
- `{ pickup: "itemId" }` — pick up item. If already carrying, the previous item is dropped at the current position.
- `{ drop: "itemId" }` — drop the named item at the current position.
- `{ tag: "tagName" }` / `{ untag: "tagName" }` — set/clear a session-scoped flag.
- `{ patientMoveTo: "posId" }` — force-move the patient to a specific position (overrides the pattern's next move).

### Action requires
- `patientAt: "posId"` — patient must be at the given position.
- `carrying: "itemId"` — player must be holding the named item.
- `notCarrying: true` — player must not be carrying anything.
- `itemAtPlayer: "itemId"` — the named item is at the player's current position.
- `itemAt: { itemId: "posId", ... }` — items are at specific positions.
- `tag: "tagName"` / `notTag: "tagName"` — a session-scoped flag is set / unset.

### Movement patterns (`src/patterns.js`)
- `still` — never moves.
- `toward(target)` — BFS-shortest-path one step toward the target position.
- `cycle(sequence)` — fixed loop through a sequence of positions.
- `follow_player(lag)` — step toward the player's current position. Optional `lag` delays the first move.
- `mirror_player` — same as follow_player without lag.
- `follow_item(item)` — step toward wherever the named item is. If carried by the player, stays still.
- `stay_unless_seated(seatTrigger, moveTo)` — stays at start until the player has occupied `seatTrigger`, then moves to `moveTo` permanently.

## Adding things — checklists

**New patient:** add an entry in `patients.json` with the room, items, pattern, actions, and signature. Add a glyph in `glyphs.json` (16×16 `#`/`.` rows). Verify solvability with `node /tmp/solver.mjs` (the BFS verifier).

**New pattern:** add a `case` to the switch in `src/patterns.js`'s `nextPatientMove`. Patterns must be pure functions of session state; no RNG.

**New attachment:** add to `attachments.json` (name, voice, desc, effect). Wire the effect in the `ATTACHMENT_HANDLERS` table in `src/session.js` (typically an `onSessionStart` callback) or directly in the relevant flow.

**New event:** add an entry in `events.json` with title, prose, choices, effects.

**New admission:** add an entry in `admissions.json`. Wire the unlock condition in `recordRunResult` (`src/persist.js`).

**New screen:** add a renderer to `src/ui/screens.js`, import in `src/ui/render.js`, register in the `switch`, set `state.screen` to enter.

## Conventions
- **Data over code.** New numbers and per-patient design belongs in JSON.
- **`state` is global and mutated directly.** Don't pass it as a parameter; import it.
- **Re-render after mutation.** Any user-visible change ends with `render()`.
- **No build step.** ES modules, browser-native.
- **No RNG inside a session.** The puzzle must be deterministic and solvable. Run generation is the only place RNG fires.
- **No comments unless non-obvious.** Identifiers carry intent.
- **Voice is sacred (the style; not the words).** Match the institutional patient-file register. Use the corruption markup sparingly and intentionally.

## Test / verify
No automated tests. Manual: open `index.html` in a browser, play through a run. The solver in `/tmp/solver.mjs` (BFS over session states) verifies that each patient puzzle is solvable within its turn budget — re-run it after editing room/actions.
