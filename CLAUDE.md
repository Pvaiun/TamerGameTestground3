# Bloodlines — Codebase Map

A document-horror psychiatric roguelite. Vanilla ES modules, no build step, no deps. Open `index.html` to run.

## Premise in one paragraph
Patient 0413 is admitted to a hospital that is more than a hospital. Five descents below the admission desk, one corridor at a time. Each encounter is another patient — a person with a tragedy filed in their dossier and a behavioral pattern that drives them. Combat is not HP attrition. It's a **session** — back-and-forth between two people, with **composure** instead of HP, **rock-paper-scissors at the base** (press / hold / yield), and a **fixation** per patient that bends the rules. The dossier prose is the only source of strategic information.

## Architecture in one paragraph
`src/main.js` awaits `loadData()` (fetches `data/*.json` into named exports on `src/data.js`), then calls `render()`. The whole app is **state mutation + re-render**: modules import `state` from `src/state.js`, mutate it, then call `render()` from `src/ui/render.js`. `render()` clears `#app` and dispatches on `state.screen` to a screen renderer in `src/ui/screens.js` (or `src/ui/session.js` for the session screen). No virtual DOM, no framework, no router. UI builds DOM via the `el(tag, props, children)` helper in `src/ui/dom.js`. The visual aesthetic is **document horror** — every screen is a page in a corrupted testimony; patients are abstract 16×16 pixel-bitmap glyphs (`data/glyphs.json`) with prose dossiers. Persistence (archive of encountered patients, tells observed, unlocks) lives in `src/persist.js`, backed by `localStorage`.

## Tone (preserved)
Three voice registers, kept strictly separate.
- **Patient files**: third-person clinical, sentence case, [Bracketed] nicknames.
- **Session lines (tells, etc.)**: neutral they/them on the patient side.
- **Screen narration**: protagonist's first-person `I`.
- Inline corruption markup parsed in `src/ui/textCorrupt.js`: `~~strike~~`, `[[N]]` (red bar), `**gold**` (rare), `!!red!!`.

## Gameplay loop
1. **Admission** — pick an admission type (Patient 0413 is the only one unlocked from the start). Each admission has a starting composure, starting attachments, optional starting wards, and an intro scene.
2. **Corridor** — pick one of 2–3 doors per floor. 5 floors total. Floor types: PATIENT (session), KEEPER (mini-boss session on floors 2 and 4), QUIET (text event), CONSULT (pick an upgrade), WARDEN (final boss on floor 5).
3. **Session** — composure starts at the patient's max. Each beat you pick press / hold / yield; the patient does too. Rock-paper-scissors resolves. Damage is `round(3 × strength)` of the winner. Clash = both lose 1. Composure → 0 means that side is **reached** (you) or **overwhelmed** (you lose).
4. **Reached** — file the patient as a ward (if they have a ward ability), or let them rest (heal). Filing makes them available for the rest of the run AND marks them as filed in the persistent archive.
5. **Repeat** until the Warden is reached (win) or you fall (loss).

## File map

### Data (JSON, drives behavior — prefer adding params here over hardcoding in JS)
- `data/patients.json` — every patient (id, displayName, subtitle, notes[3], composure, strength, fixation{type,hint}, tells{press[],hold[],yield[]}, signature{onWin,onLoss}, tier, optional ward{name,desc,voice,effect}).
- `data/fixations.json` — behavioral rules. Each entry has name, desc, revealAt (encounters before the archive reveals the fixation), tellLies (whether the patient's tell can lie). The matching decider lives in `src/fixation.js`.
- `data/attachments.json` — player move modifiers (Resolve, Steady, Reach, Listen, Insist, Lock, Open, Familiar, Brace, Patient, Compose, Remember). Trigger types: `on_session_start`, `on_win_press`, `on_win_hold`, `on_win_yield`, `on_clash`, `passive`, `session_action`.
- `data/admissions.json` — starting kits. Composure, starting attachments, starting wards, intro prose. `0413` is unlocked from the start; `0412` unlocks on first win; `0414` unlocks after filing 3 patients across all runs.
- `data/events.json` — quiet events: title, prose, choices[{label, voice, outcome, effects[]}]. Effects: `heal`, `damage`, `addAttachment` (id or `random`), `addWard` (`random_filed`, `random_unfiled`, or species id), `revealFixation`, `gainComposureMax`.
- `data/glyphs.json` — 16×16 hand-authored bitmap glyph per species. `#` filled, `.` empty. Rendered as crisp-edged SVG by `src/ui/glyphs.js`.
- `data/voiceprose.json` — system labels, protagonist narration, session resolutions (per-outcome variants), RPS rules brief, outcome wording.

### Core (`src/`)
- `state.js` — `state` singleton + constants (`FLOORS_TOTAL`, `MAX_WARDS`, `MAX_ATTACHMENTS`), `resetRun`, `resetToTitle`. State is global and mutated directly.
- `data.js` — `loadData()` + named exports (`PATIENTS`, `FIXATIONS`, `ATTACHMENTS`, `ADMISSIONS`, `EVENTS`, `GLYPHS`, `VOICE`); helpers `patientIds()` and `tieredPatientIds(maxTier)`.
- `persist.js` — localStorage-backed archive. `getArchive`, `patientArchive(speciesId)`, `recordEncounter`, `recordTellSeen`, `recordReach`, `recordFile`, `recordFixationRevealed`, `recordRunResult`, `isFixationKnown(speciesId, revealAt)`, `isAdmissionUnlocked`, `filedPatientIds`, `tellsSeenForPatient`, `resetArchive`. Schema key is `bloodlines/archive/v1`.
- `rng.js` — `rand`, `randi`, `pick`, `pickN`, `sleep`.
- `audio.js` — `sfx(type)` WebAudio bleeps.
- `fixation.js` — `beats(a, b)`, `counterTo(m)`, `decideMove(ctx)`, `tellMoveFor(ctx, actualMove)`, `pickTellPhrase(patient, move)`. Houses the deciders for every fixation key (locked_hold, refuse_yield, compulsion_press, sink_hold, bound_hold_then, bound_until_low, echo_last, drift_cycle, mirror, counter_last, forget_tell, invert_tell, watch_no_lie, pull_drain, grow_each_beat, climb_on_clash, anchor_press, warden_shift).
- `session.js` — the combat engine. `beginSession(speciesId)`, `resolveBeat(playerMove)`, `invokeWard(speciesId)`, `observe()`, `rememberAction()`, `sessionOutcome()`, `endSession()`. One beat: `preBeat()` selects the patient's move + tell, the player picks, `resolveBeat` computes damage with attachments applied. Session state hangs off `state.session` until cleared.
- `run.js` — the corridor engine. `generateCorridor()`, `placeKeepers(corridor)`, `startRun(admissionId)`, `chooseNode(floorIdx, nodeIdx)`, `advanceCorridor()`, `addAttachment(id)`, `addWard(speciesId)`, `rollConsultOptions()`, `applyEventEffect(effect)`.

### UI (`src/ui/`)
- `render.js` — `render()` dispatcher; routes on `state.screen`. Title strip on every screen except `'session'`.
- `screens.js` — every non-session screen: `renderStart`, `renderAdmissionPick`, `renderAdmissionConfirm`, `renderCorridor`, `renderQuiet`, `renderConsult`, `renderReached`, `renderOverwhelmed`, `renderVictory`, `renderGameover`, `renderArchive`. Helpers: `docPage(tag)`, `docButton(label, onclick, variant)`, `actionRow(...)`, `statusStrip()` (composure + carried attachments + wards).
- `session.js` — the session UI. Layout: engagement strip → patient panel (glyph + notes + composure/strength bars + fixation + "about to" tell) → player strip (composure + wards + attachments) → action box (3 move buttons + optional ward/observe/remember rows + RPS reminder footer + narrative log of last 4 lines).
- `glyphs.js` — `renderGlyph(speciesName)` returns SVG markup. 2×2 cells with `shape-rendering=crispEdges`. Color is `currentColor`; size via CSS.
- `textCorrupt.js` — `parseProse(input)` consumes the `~~strike~~ / [[N]] / **gold** / !!red!!` markup and returns HTML.
- `animations.js` — `spawnFloat(anchor, text, kind)`, `shakeNode(node)`, `flashNode(node, cls)`.
- `dom.js` — `el(tag, props, children)`, `attachLongPress`, `app()`.

### Assets
- `index.html` — one page, `#app` + `#modal-root`, loads IBM Plex Mono and `src/main.js` as module. No canvas, no framework.
- `styles.css` — all styles. Layered: tokens (`:root`) → corruption text utilities → body/app shell → document page → status strip → corridor + nodes → choice list → session screen → reached/overwhelmed → archive → floats/shakes → responsive.

## Key data schemas

### Patient (`data/patients.json`)
```json
{
  "species": "Cinderling",
  "displayName": "[Cinderling]",
  "subtitle": "The rest of the family was indoors.",
  "notes": ["...", "...", "..."],
  "composure": 8,
  "strength": 0.9,
  "fixation": { "type": "refuse_yield", "hint": "She does not give ground..." },
  "tells": {
    "press": ["She runs at the door.", "..."],
    "hold":  ["...", "...", "..."],
    "yield": []
  },
  "signature": { "onWin": "...", "onLoss": "..." },
  "tier": 1,
  "ward": { "name": "Witness", "desc": "...", "voice": "...", "effect": "true_tells_2" }
}
```

### Fixation (`data/fixations.json`)
Each entry has `name`, `desc`, `revealAt` (encounter count before archive reveals it), `tellLies` (and optionally `lieRate`). The matching decider in `src/fixation.js` (keyed by the same name) returns `{ move }`.

### Attachment (`data/attachments.json`)
```json
{
  "name": "Reach",
  "voice": "When I lean in, they hear me a moment longer.",
  "desc": "When PRESS beats HOLD, the patient's next move deals -1 damage to you.",
  "trigger": "on_win_press",
  "effect": "soften_next"
}
```
Triggers fire from `computeBeat` in `session.js`. Effect names are handler keys consulted there.

### Admission (`data/admissions.json`)
Composure, starting attachments, starting wards, intro prose. Unlock conditions live in `recordRunResult` in `src/persist.js`.

### Event (`data/events.json`)
Title, prose paragraphs, 2–3 choices each with label / voice / outcome / effects.

### Session (state.session — in-memory only)
```
{
  patientId, patient, patientComposureMax, patientComposure, patientStrength,
  playerComposureMax, playerComposure,
  log, beatIdx, patientHistory, playerHistory,
  lastClash, lastPatientMove, lastPlayerMove,
  pendingPatientMove, pendingPatientTell, pendingTellLied,
  softenNext, forceTruthNextN,
  attachmentsUsedThisSession, wardsUsedThisSession,
  revealedFixation, fixationRevealedThisSession,
  resolved, _narrLog
}
```

## Adding things — checklists

**New patient:** add an entry in `patients.json` with composure/strength/fixation/tells/signature/tier. If they should be fileable, include a `ward` block. Add a glyph in `glyphs.json`. The encounter generator (`src/run.js`) picks patients by tier band automatically.

**New fixation:** add the entry to `fixations.json` (name, desc, revealAt). Add a decider function in `src/fixation.js` under `DECIDERS` keyed by the same id, returning `{ move }`. If it lies, add lying logic in `tellMoveFor`.

**New attachment:** add to `attachments.json` (name, voice, desc, trigger, effect). Wire up the effect in `computeBeat` (or `beginSession` for `on_session_start`) in `src/session.js`.

**New event:** add an entry in `events.json` with title, prose, choices, effects. The corridor generator picks events at random for quiet nodes.

**New admission:** add an entry in `admissions.json`. Wire the unlock condition in `recordRunResult` (`src/persist.js`).

**New screen:** add a renderer to `src/ui/screens.js` (or a new module), import in `src/ui/render.js`, register in the `switch`, set `state.screen` to enter.

## Conventions
- **Data over code.** New numbers belong in JSON. JSON entry → JS handler reads params.
- **`state` is global and mutated directly.** Don't pass it as a parameter; import it.
- **Re-render after mutation.** Any user-visible change ends with `render()`.
- **No build step.** ES modules, browser-native.
- **No comments unless non-obvious.** Identifiers carry intent.
- **Voice is sacred (the style; not the words).** Match the institutional patient-file register. Use the corruption markup sparingly and intentionally.

## Test / verify
No automated tests. Manual: open `index.html` in a browser, play through a run. The narrative log inside the session carries the most diagnostic information.
