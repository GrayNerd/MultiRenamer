# MultiRenamer

Bulk-rename files and folders in place, in a grid of names you can type in.

Load a folder (or drop one on the window), edit names the way you would in a
spreadsheet, and press Save to rename what is on disk. It is a desktop app: a Wails
v3 window (Go backend) around a Tabulator grid.

## What it does

- **A grid of names.** Load lists what is directly inside a folder — files and
  subfolders, one level only, never into the subfolders — with extension, type,
  created/modified time and size beside each name.
- **Edit the name, keep the extension.** The Name column holds a file's name
  without its extension — `/archive.tar.gz` is edited as `archive.tar`, with `gz`
  shown in the Ext column — so the extension cannot be typed away. Folders keep
  their whole name.
- **Highlight and type once.** Highlight several rows (shift-click a range,
  ctrl/cmd-click to toggle one), then type into any of them: every keystroke goes
  into all of them. Cut, copy and paste act on each row's own characters.
- **Macros.** Record the keys that rename one row, then Play them into a single row
  or Play All into every row on screen (or just the highlighted ones).
- **Undo.** The button or Ctrl/Cmd+Z, from anywhere. One edit is one step, a
  multi-row edit is one step per keystroke, and a macro press is one step per row it
  changed. Undo never closes an editor you are typing in.
- **Filter and hide.** Every column has a header filter: the name, the extension,
  `dir`/`file`, or part of a date. Dotfiles stay out of the way until Ctrl/Cmd+H.
- **Save is all or nothing.** Every name is checked before anything moves, and if a
  rename fails the ones already done are put back.

## Requirements

- Go 1.26 or newer
- Node.js 20.19 or newer (or 22.12+) with npm — what Vite 8 requires
- Linux: GTK 4 and WebKitGTK 6.0 headers for cgo (the binary links
  `libgtk-4.so.1` and `libwebkitgtk-6.0.so.4` at runtime)

  ```sh
  sudo apt install libgtk-4-dev libwebkitgtk-6.0-dev pkg-config gcc libc6-dev
  ```

- Optional, for the task shortcuts and hot reload: the Wails v3 CLI and go-task

  ```sh
  go install github.com/wailsapp/wails/v3/cmd/wails3@latest
  go install github.com/go-task/task/v3/cmd/task@latest
  ```

## Build

The frontend is embedded in the binary (`//go:embed all:frontend/dist`), so it has
to be built first:

```sh
cd frontend
npm ci
npm run build          # writes frontend/dist
cd ..
go build -o bin/MultiRenamer .
```

The binary is `bin/MultiRenamer`.

With the task shortcuts installed, the same thing (plus `go mod tidy`, regenerated
bindings and the platform icon/desktop steps) is:

```sh
task build             # -> bin/MultiRenamer
task package           # installers for this platform: AppImage and .deb on Linux
```

## Run

```sh
./bin/MultiRenamer
```

For development, with hot reload of the frontend:

```sh
task dev               # or: wails3 dev -config ./build/config.yml -port 9245
```

Linux is what this has been built and driven on; the packaging metadata for the
other platforms comes from the Wails template.

## Using it

1. **Load a folder.** Press `Load` and pick one, or drag a folder onto the window.
   One dropped folder stands for what is inside it; drop several folders and the
   folders themselves are listed, so they can be renamed. Dropped files are added as
   themselves.
2. **Narrow the list** if it helps: each column has its own `Filter` box — the name,
   the extension, `dir`/`file`, or part of a date. Save still saves every row in the
   grid, not only the visible ones.
3. **Rename.** Click a row to select it, click it again to edit the name where the
   mouse is. Enter or Tab commits; Escape cancels and puts back any rows the edit had
   already reached.
4. **Rename several at once.** Highlight a range with shift-click, or toggle rows with
   ctrl/cmd-click, then type into one of them: every highlighted row gets the same
   edit, keystroke by keystroke. While editing, up and down commit and move the edit
   to the row above or below, taking the highlight with it.
5. **Repeat a rename.** `Record`, make the edit in a row, then `Record` again to stop.
   `Play` repeats it on one row; `Play All` on every row on screen, or only on the
   highlighted rows if any are highlighted.
6. **Undo.** `Undo` or Ctrl/Cmd+Z, from the grid or from inside an edit. One press
   takes one edit back; in a multi-row edit one press takes a keystroke off every row
   and leaves the editor open, so the next key carries on editing.
7. **Save.** Every row whose name changed is renamed on disk.

## Keyboard

| Where | Keys | What happens |
| --- | --- | --- |
| Grid | Up / Down | move the highlight |
| Grid | Shift + Up / Down | extend or shrink the highlight |
| Grid | Click, then click again | select the row, then edit the name at that point |
| Grid | Shift-click, Ctrl/Cmd-click | highlight a range, add or remove one row |
| Grid | Ctrl/Cmd + H | show or hide dotfiles |
| Grid | Ctrl/Cmd + Z | undo |
| Editing | Enter, Tab | commit the name |
| Editing | Insert | switch between inserting and overtyping |
| Editing | Escape | cancel, and undo what the edit had copied |
| Editing | Up / Down | commit, then edit the row above or below |
| Editing | Ctrl/Cmd + Z | undo one keystroke, editor stays open |

## How it behaves

- A load is one level deep: subfolders are listed, never entered.
- Renaming is in place. Nothing moves between folders, and a name may not contain a
  path separator.
- Save works on the whole grid, not on the filtered view, and skips rows whose name
  has not changed — so a file that keeps its odd spacing keeps it. An edited name is
  trimmed before it is applied.
- The extension is not editable and always goes back on. Directories have none.
- Editing inserts by default; the Insert key switches the field to overtyping, where a
  typed character replaces the one under the caret, and the caret is drawn as a
  rectangle over that character instead of a vertical bar. The mode is not per edit:
  once overtyping is on it stays on, from row to row and edit to edit, until Insert
  switches it back.
- A name that has been edited is shown **in bold**, so the rows a save would rename
  stand out from the ones it would leave alone. The bold appears when the edit is
  finished — never while the cell is being typed into, nor on the rows a highlighted
  edit is still copying itself into — and goes away again when the name matches the
  one on disk: put back by hand, undone, or renamed on disk by a save.
- Save checks every name before it moves anything: an empty name, `.`, `..`, a name
  used twice in the grid, or a name already taken on disk is refused, and if a rename
  fails the ones already made are put back.
- Every row that was refused goes back to the name it has on disk and is shown **in
  red**, with the reason on hover, until its name is edited again — not just the
  ones currently visible in the grid. The other rows keep what was typed, so once
  the offending name is fixed the save can be made again.
- The Setup window (top right) is a dialog rather than a window of its own: no title
  bar to minimise, maximise or close it with, a fixed size, and it comes up in the
  middle of the grid and stays in front of it. What title bar it has is the strip it
  is dragged by. **Save** writes the options out and puts them into effect straight
  away, **Cancel** leaves them as they were, and those two buttons are the only ways
  out — a window manager's close is refused. It shows which build is running; the
  same stamp is printed in the log at startup. Closing the main window closes it for
  real, along with the rest of the app.

## Configuration

The Setup window saves to two files in the application's own directory:

| Platform | Directory |
| --- | --- |
| Linux | `~/.config/MultiRenamer/` |
| macOS | `~/Library/Preferences/MultiRenamer/` |
| Windows | `C:\ProgramData\MultiRenamer\` |

`config.json` holds the options, and is written with the defaults on the first run
if it is not there:

```json
{ "theme": "light", "toolbar_text": true, "bold_changed": true,
  "auto_sort": true, "remember_window": false }
```

| Option | Default | What it does |
| --- | --- | --- |
| Theme | Light | Light or dark window and grid |
| Toolbar: Show Text | on | The word beside each toolbar icon; off leaves the icons alone |
| Bold changed file names | on | A name that differs from the one on disk is drawn bold |
| Auto Sort Column | on | Every load is sorted by name; off keeps the folder's own order |
| Save current window size/location on exit | off | Restores the window where it was left |

`window.json` sits beside it and is written when the program exits, but only while
that last option is on; it holds the main window's width, height and position.

Whatever is in the files is read when the program starts, so a hand-edited
`config.json` is honoured. A missing or unreadable file falls back to the defaults.

## Project layout

| Path | What is in it |
| --- | --- |
| `main.go` | the window, file drop, and the embedded frontend |
| `app.go` | loading, renaming, the dialogs, the build stamp |
| `config.go` | the saved options and window geometry, and where they live |
| `frontend/index.html` | toolbar and grid markup |
| `frontend/src/main.js` | grid setup, toolbar wiring, load and save |
| `frontend/src/mirror.js` | multi-row editing: one edit, every highlighted row |
| `frontend/src/history.js` | the undo stack behind the button and Ctrl/Cmd+Z |
| `frontend/src/macro.js` | recording and replaying keystrokes |
| `frontend/src/steps.js` | the editing vocabulary shared by the recorder and the multi-row edit |
| `frontend/src/rowselection.js` | clicks and arrow keys: select, edit, move the highlight |
| `frontend/src/caret.js` | keeps the caret offset when the edit moves between cells |
| `frontend/src/overtype.js` | insert vs overtype, and the caret that shows which is on |
| `frontend/src/edited.js` | the bold mark on a name that has been edited |
| `frontend/src/preferences.js` | applies the saved options: theme, toolbar text, bold, sort |
| `frontend/src/hidden.js` | the dotfile filter |
| `frontend/src/toolbar.js` | what each toolbar button can do |
| `frontend/setup.html`, `frontend/src/setup.js` | the Setup window and its Cancel/Save |
| `frontend/src/style.css` | theme and grid overrides |

## Checks

```sh
go vet ./...
cd frontend && npm run typecheck
```

### Browser suite

`test/` runs the frontend's own modules — the multi-row edit, the undo stack, the
macro recorder, the toolbar and the filters — against the real Tabulator in a
headless Chromium, driving keys and clicks the way a person would:

```sh
node test/run.mjs       # prints "RESULT <n> passed / <m> failed"; exits 1 on a failure
```

It needs `frontend/node_modules` (`cd frontend && npm ci`) and a Chromium binary —
set `CHROME=/path/to/chromium` if it is not on your `PATH`. `PORT`, `DEBUG_PORT` and
`TIMEOUT` are there if the defaults clash with something else. The page, the static
server and the checks all live in `test/`.

## Licence

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026 Kenneth W. Boyd —
[github.com/GrayNerd/MultiRenamer](https://github.com/GrayNerd/MultiRenamer)

The copyright notice and the permission notice are part of the software: anyone who
redistributes it, or a substantial portion of it, keeps both with it.
