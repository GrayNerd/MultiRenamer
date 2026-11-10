package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestLoadConfigWritesTheDefaultsWhenThereIsNoFile(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "MultiRenamer")

	cfg := loadConfig(dir)

	if cfg != defaultConfig() {
		t.Errorf("first run: got %+v, want the defaults %+v", cfg, defaultConfig())
	}
	if cfg.Theme != themeLight {
		t.Errorf("default theme: got %q, want %q", cfg.Theme, themeLight)
	}

	if _, err := os.Stat(filepath.Join(dir, configFileName)); err != nil {
		t.Fatalf("no configuration file was written: %v", err)
	}

	// And the file it wrote reads back as the same thing.
	if again := loadConfig(dir); again != cfg {
		t.Errorf("what was written does not read back: got %+v, want %+v", again, cfg)
	}
}

func TestSaveConfigRoundTrips(t *testing.T) {
	dir := t.TempDir()
	want := Config{
		Theme:          themeDark,
		ToolbarText:    false,
		BoldChanged:    false,
		AutoSort:       false,
		RememberWindow: true,
	}

	if err := saveConfig(dir, want); err != nil {
		t.Fatalf("saving: %v", err)
	}

	if got := loadConfig(dir); got != want {
		t.Errorf("read back %+v, want %+v", got, want)
	}
}

func TestLoadConfigFallsBackToTheDefaultsWhenTheFileIsGarbage(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, configFileName), []byte("not json at all"), 0o644); err != nil {
		t.Fatal(err)
	}

	if got := loadConfig(dir); got != defaultConfig() {
		t.Errorf("garbage file: got %+v, want the defaults", got)
	}
}

func TestLoadConfigKeepsTheDefaultForAFieldTheFileLeavesOut(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, configFileName), []byte(`{"theme":"dark"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	got := loadConfig(dir)

	if got.Theme != themeDark {
		t.Errorf("theme: got %q, want dark", got.Theme)
	}
	if !got.ToolbarText || !got.BoldChanged || !got.AutoSort {
		t.Errorf("the fields the file left out should keep their defaults: %+v", got)
	}
	if got.RememberWindow {
		t.Error("remember_window was not in the file and should be off")
	}
}

func TestLoadConfigRefusesAnUnknownTheme(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, configFileName), []byte(`{"theme":"neon"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	if got := loadConfig(dir); got.Theme != themeLight {
		t.Errorf("unknown theme: got %q, want light", got.Theme)
	}
}

func TestWindowStateRoundTrips(t *testing.T) {
	dir := t.TempDir()
	want := WindowState{Width: 1024, Height: 768, X: 40, Y: 60}

	if err := saveWindowState(dir, want); err != nil {
		t.Fatalf("saving the window state: %v", err)
	}

	got, ok := loadWindowState(dir)
	if !ok {
		t.Fatal("the window state was not read back")
	}
	if got != want {
		t.Errorf("read back %+v, want %+v", got, want)
	}
}

func TestLoadWindowStateRefusesAWindowWithNoSize(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, windowStateFileName), []byte(`{"width":0,"height":0}`), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, ok := loadWindowState(dir); ok {
		t.Error("a window with no size should not be restored")
	}
}

func TestConfigDirIsTheApplicationsOwnDirectory(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	got, err := configDir()
	if err != nil {
		t.Fatalf("configDir: %v", err)
	}

	var want string
	switch runtime.GOOS {
	case "windows":
		t.Skip("on Windows the directory comes from ProgramData, not the home directory")
	case "darwin":
		want = filepath.Join(home, "Library", "Preferences", "MultiRenamer")
	default:
		want = filepath.Join(home, ".config", "MultiRenamer")
	}

	if got != want {
		t.Errorf("configDir: got %q, want %q", got, want)
	}
}

func TestLoadWindowStateWithNoFile(t *testing.T) {
	if _, ok := loadWindowState(t.TempDir()); ok {
		t.Error("no file should not be restored")
	}
}
