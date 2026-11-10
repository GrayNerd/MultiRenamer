package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// App holds the Wails application instance and its windows.
type App struct {
	app         *application.App
	mainWindow  *application.WebviewWindow
	setupWindow *application.WebviewWindow

	// windowState is the size and place the main window was left at, when it was
	// asked to be kept; hasWindowState says whether there is one to restore.
	windowState    WindowState
	hasWindowState bool

	// mainShown is set once the main window has been shown, so the page asking for
	// it and the fallback timer cannot both do it.
	mainShown atomic.Bool

	// config is what the Setup window saved and the grid is using. The mutex
	// keeps the reads (a window drawing itself, the geometry being saved on the
	// way out) away from a save that is writing it.
	configMu sync.RWMutex
	config   Config

	// mainClosing is set as the main window closes. From then on the setup window
	// may close for real: hiding it would leave it as the last window standing,
	// and the application only quits once its last window is gone.
	mainClosing atomic.Bool
}

// currentConfig is the options in force right now.
func (a *App) currentConfig() Config {
	a.configMu.RLock()
	defer a.configMu.RUnlock()
	return a.config
}

type FileInfo struct {
	// Name is what the grid shows and edits: the file name without its
	// extension ("archive.tar.gz" -> "archive.tar"), or the whole directory
	// name. OriginalName is the same name as it was loaded.
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Extension    string `json:"extension"` // "gz"; empty when a file has none
	IsDir        bool   `json:"is_dir"`
	Hidden       bool   `json:"hidden"` // a dotfile; the grid hides these by default
	DateCreated  string `json:"date_created"`
	DateModified string `json:"date_modified"`
	Size         string `json:"size"`
	FullPath     string `json:"full_path"`
	// Failed is set by a save that could not rename the row: Name is put back to
	// what is on disk and the grid shows it in red. FailedReason says why.
	Failed       bool   `json:"failed"`
	FailedReason string `json:"failed_reason"`
}

// Build is when this binary was made, so one build can be told from another: a
// window left open from an earlier build otherwise looks exactly like this one.
// The timestamp comes from the file itself, so it needs nothing special at build
// time and cannot go stale against the code.
func (a *App) Build() string {
	executable, err := os.Executable()
	if err != nil {
		return ""
	}

	info, err := os.Stat(executable)
	if err != nil {
		return ""
	}

	return info.ModTime().Format("2006-01-02 15:04")
}

// LoadDirectory opens a native directory picker and returns what is in the
// chosen directory: its files and its subdirectories, one level only.
func (a *App) LoadDirectory() ([]FileInfo, error) {
	// ✅ v3 directory picker: OpenFile() with CanChooseDirectories(true) and CanChooseFiles(false)
	path, err := a.app.Dialog.OpenFile().
		SetTitle("Select a directory").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		PromptForSingleSelection()

	if err != nil || path == "" {
		return nil, err // user cancelled or error
	}
	return a.readDir(path)
}

// LoadPaths loads an explicit list of paths (used for drag‑and‑drop).
//
// Files are always added as themselves. Folders go by how many were dropped: a
// single one stands for what is inside it — its files and its subfolders, one
// level only, never entered — while several are taken as the things to rename,
// so the folders are listed themselves and their contents left alone.
func (a *App) LoadPaths(paths []string) ([]FileInfo, error) {
	type dropped struct {
		path string
		info os.FileInfo
	}

	entries := make([]dropped, 0, len(paths))
	dirs := 0

	for _, p := range paths {
		info, err := os.Stat(p)
		if err != nil {
			continue
		}
		if info.IsDir() {
			dirs++
		}
		entries = append(entries, dropped{p, info})
	}

	var result []FileInfo
	for _, e := range entries {
		if e.info.IsDir() && dirs == 1 {
			if contents, err := a.readDir(e.path); err == nil {
				result = append(result, contents...)
			}
			continue
		}
		result = append(result, a.fileInfo(e.path, e.info))
	}

	return result, nil
}

func (a *App) readDir(dir string) ([]FileInfo, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var result []FileInfo
	for _, e := range entries {
		// Everything directly inside dir is listed, files and subdirectories
		// alike. Nothing is looked up inside those subdirectories: this is one
		// level, never a walk of the tree.
		full := filepath.Join(dir, e.Name())
		info, err := e.Info()
		if err != nil {
			continue
		}
		result = append(result, a.fileInfo(full, info))
	}
	return result, nil
}

func (a *App) fileInfo(fullPath string, info os.FileInfo) FileInfo {
	created := info.ModTime() // fallback; use platform‑specific syscall for true creation time

	// The grid edits the name without its extension and shows the extension in
	// its own column; a directory has no extension to show.
	name, extension := splitExtension(info.Name(), info.IsDir())

	// A name starting with a dot is how Unix hides a file, and it is the one flag
	// that means the same on every platform this runs on. The grid leaves these
	// rows out until they are asked for (Ctrl+H).
	hidden := strings.HasPrefix(info.Name(), ".")

	// time.DateTime ("2006-01-02 15:04:05") instead of RFC3339: the "T" separator
	// and timezone offset just eat space in the grid columns.
	return FileInfo{
		Name:         name,
		OriginalName: name,
		Extension:    extension,
		IsDir:        info.IsDir(),
		Hidden:       hidden,
		DateCreated:  created.Format(time.DateTime),
		DateModified: info.ModTime().Format(time.DateTime),
		Size:         formatSize(info.Size()),
		FullPath:     fullPath,
	}
}

// splitExtension separates the name the grid shows from the extension kept on
// disk: everything after the last "." is the extension, so "archive.tar.gz"
// becomes "archive.tar" and "gz", while "README" has no extension at all. A
// leading dot marks a hidden file, not an extension (".bashrc" has no
// extension), and directories are never split.
func splitExtension(name string, isDir bool) (stem, extension string) {
	if isDir {
		return name, ""
	}

	dot := strings.LastIndex(name, ".")
	if dot <= 0 || dot == len(name)-1 {
		return name, ""
	}

	return name[:dot], name[dot+1:]
}

// diskName is how a row's entry is called on disk: the grid's (edited) name plus
// the extension it was loaded with.
func (row FileInfo) diskName(name string) string {
	if row.IsDir || row.Extension == "" {
		return name
	}
	return name + "." + row.Extension
}

// formatSize converts a byte count into a human‑readable string (B, KB, MB, GB, TB).
func formatSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.2f %cB", float64(bytes)/float64(div), "KMGT"[exp])
}

// SaveRenames applies the edits made in the grid: every row whose Name no longer
// matches its OriginalName is renamed on disk, files and directories alike. Only
// the name is edited; the extension stays as it was, so "report.txt" renamed to
// "summary" becomes "summary.txt". Spaces either side of the edited name are
// dropped, since they would otherwise become part of the name on disk.
//
// Every row is checked before anything is touched, and if a rename fails part way
// through the ones already done are rolled back, so the files on disk never end
// up out of step with the rows in the grid. The rows come back with the new name
// as their baseline and their paths brought up to date.
func (a *App) SaveRenames(rows []FileInfo) ([]FileInfo, error) {
	// Rows the user did not edit keep whatever name they have on disk, odd spaces
	// and all; an edited name is trimmed before it is compared and applied.
	for i := range rows {
		if rows[i].Name != rows[i].OriginalName {
			rows[i].Name = strings.TrimSpace(rows[i].Name)
		}
		rows[i].Failed = false
		rows[i].FailedReason = ""
	}

	if problems := renameRows(rows); problems != nil {
		// Nothing moved. A row that could not be renamed goes back to the name it
		// has on disk and is marked, so the grid can show it in red and the user can
		// see which one to fix; the other rows keep what was typed, ready for
		// another go.
		refusals := make([]string, 0, len(problems))
		for i := range rows {
			if problems[i] == "" {
				continue
			}
			rows[i].Name = rows[i].OriginalName
			rows[i].Failed = true
			rows[i].FailedReason = problems[i]
			refusals = append(refusals, fmt.Sprintf("%s: %s", rows[i].OriginalName, problems[i]))
		}

		shown := refusals
		if len(shown) > 5 {
			shown = shown[:5]
		}
		message := strings.Join(shown, "\n")
		if extra := len(refusals) - len(shown); extra > 0 {
			message += fmt.Sprintf("\nand %d more", extra)
		}
		a.showError("Save failed", "Nothing was renamed.\n\n"+message)

		return rows, nil
	}

	for i := range rows {
		rows[i].OriginalName = rows[i].Name
		rows[i].FullPath = filepath.Join(filepath.Dir(rows[i].FullPath), rows[i].diskName(rows[i].Name))
	}

	return rows, nil
}

// renamePlan is one rename worked out from a grid row.
type renamePlan struct {
	row  int // which row of the save it belongs to
	from string
	to   string
}

// renameRows renames every row whose name changed, all of them or none: a name
// that cannot be used leaves the folder untouched rather than half renamed. Rows
// that were refused come back with the reason why, by index; nil means they all
// moved.
func renameRows(rows []FileInfo) []string {
	plans := make([]renamePlan, 0, len(rows))
	problems := make([]string, len(rows))
	claimed := make(map[string]int, len(rows)) // target -> the row that wants it
	refused := false

	for i, row := range rows {
		if row.Name == row.OriginalName {
			continue // unchanged: the name still matches original_name
		}
		if err := checkNewName(row.Name); err != nil {
			problems[i] = err.Error()
			refused = true
			continue
		}

		// The extension is not edited, so it has to go back on: the entry keeps
		// the one it was loaded with.
		dir := filepath.Dir(row.FullPath)
		plan := renamePlan{
			row:  i,
			from: filepath.Join(dir, row.diskName(row.OriginalName)),
			to:   filepath.Join(dir, row.diskName(row.Name)),
		}
		if plan.from == plan.to {
			continue
		}
		if _, err := os.Lstat(plan.from); err != nil {
			problems[i] = err.Error()
			refused = true
			continue
		}
		if other, taken := claimed[plan.to]; taken {
			// Both rows are as much at fault as each other.
			problems[i] = fmt.Sprintf("%q is used twice", filepath.Base(plan.to))
			problems[other] = problems[i]
			refused = true
			continue
		}
		if err := checkTargetFree(plan.from, plan.to); err != nil {
			problems[i] = err.Error()
			refused = true
			continue
		}

		claimed[plan.to] = i
		plans = append(plans, plan)
	}

	if refused {
		return problems
	}

	done := make([]renamePlan, 0, len(plans))
	for _, plan := range plans {
		if err := os.Rename(plan.from, plan.to); err != nil {
			// Undo the renames already made, so a failed save changes nothing.
			for i := len(done) - 1; i >= 0; i-- {
				_ = os.Rename(done[i].to, done[i].from)
			}
			problems = make([]string, len(rows))
			problems[plan.row] = err.Error()
			return problems
		}
		done = append(done, plan)
	}

	return nil
}

// checkNewName rejects names that would not be a plain file name.
func checkNewName(name string) error {
	switch {
	case strings.TrimSpace(name) == "":
		return errors.New("the name cannot be empty")
	case name == "." || name == "..":
		return fmt.Errorf("%q is not a usable name", name)
	case strings.ContainsAny(name, `/\`):
		return errors.New("the name cannot contain a path separator")
	}
	return nil
}

// checkTargetFree refuses to rename over an existing entry, which os.Rename would
// silently replace. A case-only rename on a case-insensitive filesystem is the
// same file, so that stays allowed.
func checkTargetFree(from, to string) error {
	target, err := os.Lstat(to)
	if err != nil {
		return nil // nothing in the way
	}
	if source, err := os.Lstat(from); err == nil && os.SameFile(source, target) {
		return nil
	}
	return fmt.Errorf("cannot rename to %q: it already exists", filepath.Base(to))
}

// showError puts a failure in front of the user; the binding returns the error
// too, but the frontend would only log that to the console.
func (a *App) showError(title, message string) {
	if a.app == nil {
		return
	}
	a.app.Dialog.Error().
		SetTitle(title).
		SetMessage(message).
		Show()
}

// setupWindowName identifies the setup window in the window registry.
const setupWindowName = "setup"

// closeOtherWindows closes every window but the main one, the main window having
// started to close. The application only quits when its last window is gone, and
// the setup window hides rather than closes when it is closed on its own, so
// without this it would outlive the main window and leave the application running
// with nothing on screen.
func (a *App) closeOtherWindows() {
	a.mainClosing.Store(true)

	for _, w := range a.app.Window.GetAll() {
		if w.ID() != a.mainWindow.ID() {
			w.Close()
		}
	}
}

// The setup dialog's size. It has no frame to resize, so the size is fixed.
const (
	setupWindowWidth  = 460
	setupWindowHeight = 600
)

// newSetupWindow builds the hidden setup window.
//
// It is a dialog, not a window of its own: no title bar, so there is nothing to
// minimise, maximise or close it with; no resizing; and kept in front of the grid,
// which is as close to modal as Wails gets. Anything that asks it to close — the
// window manager's shortcut, Alt+F4 — is refused, so Cancel and Save are the only
// ways out. The one exception is the app going with the main window: then it has
// to close for real, or it would be the last window standing and the app would
// never quit.
func (a *App) newSetupWindow() *application.WebviewWindow {
	w := a.app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:          setupWindowName,
		Title:         "Setup",
		Width:         setupWindowWidth,
		Height:        setupWindowHeight,
		Hidden:        true,
		URL:           "/setup.html",
		Frameless:     true,
		DisableResize: true,
		AlwaysOnTop:   true,
	})
	w.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		if a.mainClosing.Load() {
			return
		}
		e.Cancel()
	})
	return w
}

// ShowMain shows the main window.
//
// The window is made hidden, and this is called once the page has applied the
// saved options, so it is never seen in the wrong place or the wrong theme. It
// acts once, whichever of the page and the fallback timer gets there first.
func (a *App) ShowMain() {
	if a.mainWindow == nil || a.mainShown.Swap(true) {
		return
	}

	// The window is put up first and moved once it is up: a window manager places a
	// new window where it likes, and a move asked for before it has done that is
	// thrown away. It is minimised for that moment, so the move is made while it is
	// out of sight and it is brought back where it belongs.
	a.mainWindow.Show()
	if a.hasWindowState {
		a.mainWindow.Minimise()

		go func() {
			time.Sleep(80 * time.Millisecond) // the window manager has placed it by now
			a.mainWindow.SetPosition(a.windowState.X, a.windowState.Y)

			time.Sleep(40 * time.Millisecond) // and has taken the move
			a.mainWindow.UnMinimise()

			// Coming back and being raised are two steps to the window manager, and
			// a raise asked for while the window is still coming back is lost, so
			// it is asked for until the window has the focus.
			for attempt := 0; attempt < 10 && !a.mainWindow.IsFocused(); attempt++ {
				a.mainWindow.Focus()
				time.Sleep(50 * time.Millisecond)
			}
		}()
		return
	}

	a.mainWindow.Focus()
}

// ShowSetup shows the setup window over the middle of the main window.
func (a *App) ShowSetup() {
	// Normally the window is only hidden, so showing it again is enough. Rebuild
	// it when it is gone: a destroyed window cannot be shown.
	if _, ok := a.app.Window.GetByName(setupWindowName); !ok {
		a.setupWindow = a.newSetupWindow()
	}
	a.setupWindow.Show()
	a.centreSetup()
	a.setupWindow.Focus()
}

// centreSetup puts the dialog in the middle of the main window. A window manager
// places a new window where it likes, so the move is made once the dialog is up,
// which is a move it does honour.
func (a *App) centreSetup() {
	if a.mainWindow == nil || a.setupWindow == nil {
		return
	}

	x, y := a.mainWindow.Position()
	width, height := a.mainWindow.Size()
	a.setupWindow.SetPosition(
		x+(width-setupWindowWidth)/2,
		y+(height-setupWindowHeight)/2,
	)
}

// GetConfig is the options in force: what the Setup window fills itself in from,
// and what the grid applies when it starts.
func (a *App) GetConfig() Config {
	return a.currentConfig()
}

// SaveConfig keeps the options the Setup window handed over: it writes them to
// the configuration file, holds them for the rest of the run, and tells the open
// windows so they change without a restart.
func (a *App) SaveConfig(cfg Config) error {
	cfg.Theme = normaliseTheme(cfg.Theme)

	dir, err := configDir()
	if err != nil {
		return err
	}
	if err := saveConfig(dir, cfg); err != nil {
		return err
	}

	a.configMu.Lock()
	a.config = cfg
	a.configMu.Unlock()

	if a.app != nil {
		a.app.Event.Emit("config-changed", cfg)
	}
	return nil
}

// HideSetup puts the setup window away, the way its own close button does. Save
// and Cancel both end there.
func (a *App) HideSetup() {
	if a.setupWindow != nil {
		a.setupWindow.Hide()
	}
}

// saveWindowState writes the size and place the main window was left at, when the
// user asked for them to be remembered. It runs as the window closes, while it
// still knows where it is.
func (a *App) saveWindowState() {
	if !a.currentConfig().RememberWindow || a.mainWindow == nil {
		return
	}

	dir, err := configDir()
	if err != nil {
		log.Printf("saving the window state: %v", err)
		return
	}

	width, height := a.mainWindow.Size()
	x, y := a.mainWindow.Position()
	if width <= 0 || height <= 0 {
		return
	}

	if err := saveWindowState(dir, WindowState{Width: width, Height: height, X: x, Y: y}); err != nil {
		log.Printf("saving the window state: %v", err)
	}
}
