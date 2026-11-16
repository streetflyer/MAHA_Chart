# State machines in MAHA Chart

Every place where the app can be "in" one of several states, where it lives, and how to
read or change it. Keep this file in step with the code: when you add a mode, a busy flag
or a multi-step flow, add it here and give it one owner.

Rule of thumb: **one owner per machine, states as a named union, transitions as
functions, and a `data-*` attribute on the DOM** so tests and agents can see the state
without guessing from pixels.

## 1. Interaction mode (explicit, `src/state/mode.ts`)

Which edit mode the sheet is in. One at a time.

| State       | Entered by                                                       | Data lives in                                                       |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `idle`      | Esc, Done, a click outside the panel                             |                                                                     |
| `drawing`   | double-click the plan view                                       | `useDrawingEdit`                                                    |
| `cp`        | double-click the CP panel                                        | `useCpEdit`                                                         |
| `events`    | double-click an Engineering Events panel                         | `useEventEdit`                                                      |
| `smooth`    | "Smooth tool" in the profile properties                          | `useSmoothTool`                                                     |
| `keyview` | Double-click the key plan, or "Zoom and move the map" in the key plan properties | `useKeyplanView` (panel; `rotating` keeps a chart's rotation grip on screen while dragged) |
| `matchline` | "Pick matchline" / "Draw a matchline" in the key plan properties | `useMatchPick` (tool `pick` or `draw`, first point of a drawn line) |

- Read: `currentMode()`, `useMode()`, or `[data-mode]` on `.editor`.
- Change: `enterMode(mode, { panelId, datasetId })`, `exitMode()`.
- Guarantees (enforced by `installModeMachine()`, tested in `mode.test.ts`):
  - entering a mode leaves the one that was on, also when a store's own
    `enter()` / `start()` is called directly;
  - a mode ends when its panel or data disappears (file removed, folder switched,
    chart closed);
  - exporting to PDF / DXF leaves the mode first, so edit outlines are never printed.
- The user sees the mode in the bar at the top of the sheet (`ModeBar`, and
  `EventEditBar` for `events`).
- `keyview` needs its key plan panel; wheel zooms, a drag on the map moves it, a click outside the key plan ends it. The view stays on the panel (`keyplan.view`) after the mode ends; "Fit line and charts" clears it.
- `matchline` needs its key plan panel and a route; a click outside the key plan ends it,
  Esc drops a half-drawn line first. Chosen lines are saved in the plan view's
  `plan.match.pairs` (boundary index → `{ kp, a?, b? }`).
- "Hover info" (`usePrefs.hoverInfo`, shortcut `usePrefs.hoverKey`, F3 by default) is a
  browser setting, not a mode: the sheet asks `hoverSources` (`state/hoverInfo.ts`) what
  lies under the pointer; `[data-hover-info]` on its toolbar button shows it.
- "Pan map" (`useEditor.panMap`) is a separate on/off toggle, not a mode: it only changes
  what a plain drag in the plan view does.

## 2. Pointer gesture (explicit, `SheetView.tsx`)

What a drag is doing between pointer down and pointer up: the `Drag` union
(`move`, `edge`, `pan`, `mapPan`, `frame`, `frameFree`, `rotate`, `imgResize`, `callout`,
`cpMove`, `cpBox`, `evlabel`, ...). `null` is "no gesture". Pointer down picks the variant
(by mode first, then by what is under the pointer), pointer move reads it, pointer up
clears it. Add a new gesture as a new variant, never as a loose flag.

## 3. Questions to the user (explicit, `Dialog.tsx`)

`askText`, `askConfirm`, `askChoice`, `askPair`, `askCodes` return a promise. One question
is open at a time; one asked meanwhile waits in a queue and comes up when the first is
answered, so no caller waits forever. `dialogsPending()` gives the count.

## 4. Busy work (explicit, `Editor.tsx`)

`[data-busy]` on `.editor`: `export` while a PDF / DXF is written (the charts flip through
on screen; a second export is refused), `save` while a project file is written (progress
bar). Absent when idle. The import window has its own `busy` text while files are read.

## 5. Project folder (explicit, `src/state/project.ts`)

- `folderStatus(state, path, fileCount)`: `empty` → `files` → `onScreen` ⇄ `charted`.
  `onScreen` is the folder whose data is on the chart; `charted` keeps its chart as it was
  left (`useProject.charts`). On each tree row as `[data-folder-status]`.
- `projectLink(state)`: `none`, `linked` (folder handle, files can be re-read and
  written), `readOnly` (plain folder picker), `reconnect` (project file loaded, folder
  still to be opened). On the project panel as `[data-project-link]`.

## 6. Runline copied from the survey line (explicit, `src/model/datasets.ts`)

`isCopiedRunline(d)` and `isRunlineOf(d, surveyLine)` are the only places that know how a
runline is tied to its survey line (`fromSurvey`, or the old name convention). While a
copy exists the survey line is not drawn; deleting the survey line deletes the copy.
`kpMatch` on the survey line (`none | start | end | both`) is the KP match setting.

## 7. Charts along the line (explicit, `src/model/scale.ts`)

`scale.sheets` unset: charts are laid out automatically (`autoSheets`). Any hand edit
(`editSheet`, `insertSheet`, `deleteSheet`, `splitSheet`) turns them into an explicit list
(`materializeSheets`). A frame with `part: true` is one straight part of a fitted curve:
its KP panels cover only `start`..`end`, and moving it keeps its neighbours joined.

## 8. Smaller ones, already named unions

- Text being typed on the sheet: `useEditor.editing` (`null` = none). Pointer input is
  ignored while it is set.
- Video row source: `videoSource` (`events | timing | user`).
- Legend code scope: `codeScope` (`all | chart`).
- CP style: `style` (`line | ticks`), `yMode` (`fixed | value`).
- Save kind: `mode` (`settings | full`) in the project file header.

## Still implicit (known, left alone on purpose)

- The properties panel scrolls to the top on selection unless a callout text box was
  focused in the last 1.5 s: a timer stands in for "the user is editing a text box".
- The import window's steps (files listed → columns mapped → reading → done / failed) are
  spread over `items`, `current`, `busy` and the failed list.
- Loading a project file runs in order (read → restore charts → recall folder handle →
  maybe `reconnect`) without a named phase.

These work and are covered by end-to-end checks; make them explicit the next time they
need a change.

## Data on the chart (`src/state/chartData.ts`)

The chart draws only what the user put there. Taking data off (the × in the data list,
right-click a file chip → "Remove from the chart", the toolbar's "Clear data…")
also forgets the file's import recipe and settings (`FolderState.off` keeps it from being
offered as new). "Check imported data" offers only files that are not on the chart and
were not taken off on purpose. A folder's chart is kept when you leave it even if empty,
so emptied data does not come back when the folder is opened again.
