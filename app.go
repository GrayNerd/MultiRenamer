package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// App holds the Wails application instance and its windows.
type App struct {
	app         *application.App
	mainWindow  *application.WebviewWindow
	setupWindow *application.WebviewWindow
}

type FileInfo struct {
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	DateCreated  string `json:"date_created"`
	DateModified string `json:"date_modified"`
	Size         string `json:"size"`
	FullPath     string `json:"full_path"`
}

// LoadDirectory opens a native directory picker and returns the contents.
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
func (a *App) LoadPaths(paths []string) ([]FileInfo, error) {
	var result []FileInfo
	for _, p := range paths {
		info, err := os.Stat(p)
		if err != nil {
			continue
		}
		if info.IsDir() {
			sub, err := a.readDir(p)
			if err != nil {
				continue
			}
			result = append(result, sub...)
		} else {
			result = append(result, a.fileInfo(p, info))
		}
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
	// time.DateTime ("2006-01-02 15:04:05") instead of RFC3339: the "T" separator
	// and timezone offset just eat space in the grid columns.
	return FileInfo{
		Name:         info.Name(),
		OriginalName: info.Name(),
		DateCreated:  created.Format(time.DateTime),
		DateModified: info.ModTime().Format(time.DateTime),
		Size:         formatSize(info.Size()),
		FullPath:     fullPath,
	}
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
// matches its OriginalName is renamed on disk, files and directories alike.
//
// Every row is checked before anything is touched, and if a rename fails part way
// through the ones already done are rolled back, so the files on disk never end
// up out of step with the rows in the grid.
func (a *App) SaveRenames(rows []FileInfo) error {
	if err := renameRows(rows); err != nil {
		a.showError("Save failed", err.Error())
		return err
	}
	return nil
}

// renamePlan is one rename worked out from a grid row.
type renamePlan struct {
	from string
	to   string
}

// renameRows validates every changed row and then applies the renames.
func renameRows(rows []FileInfo) error {
	plans := make([]renamePlan, 0, len(rows))
	targets := make(map[string]bool, len(rows))

	for _, row := range rows {
		if row.Name == row.OriginalName {
			continue // unchanged: the name still matches original_name
		}
		if err := checkNewName(row.Name); err != nil {
			return fmt.Errorf("cannot rename %q: %w", row.OriginalName, err)
		}

		dir := filepath.Dir(row.FullPath)
		plan := renamePlan{
			from: filepath.Join(dir, row.OriginalName),
			to:   filepath.Join(dir, row.Name),
		}
		if plan.from == plan.to {
			continue
		}
		if _, err := os.Lstat(plan.from); err != nil {
			return fmt.Errorf("cannot rename %q: %w", row.OriginalName, err)
		}
		if targets[plan.to] {
			return fmt.Errorf("cannot rename to %q: that name is used twice", row.Name)
		}
		if err := checkTargetFree(plan.from, plan.to); err != nil {
			return err
		}

		targets[plan.to] = true
		plans = append(plans, plan)
	}

	done := make([]renamePlan, 0, len(plans))
	for _, plan := range plans {
		if err := os.Rename(plan.from, plan.to); err != nil {
			// Undo the renames already made, so a failed save changes nothing.
			for i := len(done) - 1; i >= 0; i-- {
				_ = os.Rename(done[i].to, done[i].from)
			}
			return fmt.Errorf("cannot rename %q: %w", filepath.Base(plan.from), err)
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

// ShowSetup shows the setup window.
func (a *App) ShowSetup() {
	if a.setupWindow != nil {
		a.setupWindow.Show()
		a.setupWindow.Focus()
	}
}

// SetTheme switches the frontend CSS between light and dark mode.
// Native title‑bar theming is platform‑specific in v3; CSS is the reliable cross‑platform approach.
func (a *App) SetTheme(dark bool) {
	// ✅ App.SetTheme does not exist in v3.  Emit the event so the frontend can toggle CSS.
	a.app.Event.Emit("theme-changed", dark)

	// OPTIONAL: On Windows you can also set the native title‑bar theme:
	// if dark {
	//     runtime.WindowSetDarkTheme(a.ctx)
	// } else {
	//     runtime.WindowSetLightTheme(a.ctx)
	// }
}