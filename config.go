package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

// The two themes the Setup window offers.
const (
	themeLight = "light"
	themeDark  = "dark"
)

// The files the application keeps in its own directory: the options, and the
// window geometry. They are separate because the geometry is written when the
// program exits, not when Save is pressed.
const (
	configFileName      = "config.json"
	windowStateFileName = "window.json"
)

// Config is everything the Setup window saves, and what the program reads back
// when it starts.
type Config struct {
	Theme          string `json:"theme"`           // "light" (the default) or "dark"
	ToolbarText    bool   `json:"toolbar_text"`    // the toolbar buttons show their text
	BoldChanged    bool   `json:"bold_changed"`    // a changed name is drawn italic
	AutoSort       bool   `json:"auto_sort"`       // a load is sorted by name
	RememberWindow bool   `json:"remember_window"` // save the window's size and place on exit
}

// WindowState is how big the main window was, and where.
type WindowState struct {
	Width  int `json:"width"`
	Height int `json:"height"`
	X      int `json:"x"`
	Y      int `json:"y"`
}

// defaultConfig is what a first run starts with, and what a missing or unreadable
// file falls back to. Light theme, text beside the toolbar icons, changed names
// in italic, and a load sorted by name — the window's size is not remembered until
// it is asked for.
func defaultConfig() Config {
	return Config{
		Theme:       themeLight,
		ToolbarText: true,
		BoldChanged: true,
		AutoSort:    true,
	}
}

// normaliseTheme answers with one of the two themes, whatever was in the file.
func normaliseTheme(theme string) string {
	if theme == themeDark {
		return themeDark
	}
	return themeLight
}

// configDir is the directory the files live in: a subdirectory of ~/.config on
// Linux, of ~/Library/Preferences on macOS, and of C:\ProgramData on Windows.
func configDir() (string, error) {
	switch runtime.GOOS {
	case "windows":
		base := os.Getenv("ProgramData")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, "MultiRenamer"), nil
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Library", "Preferences", "MultiRenamer"), nil
	default:
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, ".config", "MultiRenamer"), nil
	}
}

// LoadConfig reads the options from the application's own directory, writing the
// defaults there on the first run.
func LoadConfig() Config {
	dir, err := configDir()
	if err != nil {
		return defaultConfig()
	}
	return loadConfig(dir)
}

// loadConfig reads <dir>/config.json. A file that is not there is written with
// the defaults, so the first run leaves something to edit and the next one has a
// file to read. A file that cannot be understood falls back to the defaults, and
// a field the file does not carry keeps its default rather than becoming empty.
func loadConfig(dir string) Config {
	data, err := os.ReadFile(filepath.Join(dir, configFileName))
	if err != nil {
		cfg := defaultConfig()
		_ = saveConfig(dir, cfg)
		return cfg
	}

	cfg := defaultConfig()
	if err := json.Unmarshal(data, &cfg); err != nil {
		return defaultConfig()
	}

	cfg.Theme = normaliseTheme(cfg.Theme)
	return cfg
}

// saveConfig writes the configuration to <dir>/config.json, creating the
// directory on the first save.
func saveConfig(dir string, cfg Config) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "    ")
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(dir, configFileName), append(data, '\n'), 0o644)
}

// loadWindowState reads <dir>/window.json. The second answer is false when there
// is nothing worth restoring: no file, a file that cannot be read, or a size that
// could not be a window.
func loadWindowState(dir string) (WindowState, bool) {
	data, err := os.ReadFile(filepath.Join(dir, windowStateFileName))
	if err != nil {
		return WindowState{}, false
	}

	var state WindowState
	if err := json.Unmarshal(data, &state); err != nil {
		return WindowState{}, false
	}

	if state.Width <= 0 || state.Height <= 0 {
		return WindowState{}, false
	}

	return state, true
}

// saveWindowState writes <dir>/window.json, creating the directory if this is the
// first thing to be written there.
func saveWindowState(dir string, state WindowState) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(state, "", "    ")
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(dir, windowStateFileName), append(data, '\n'), 0o644)
}
