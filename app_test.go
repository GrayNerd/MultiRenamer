package main

import (
	"os"
	"path/filepath"
	"testing"
)

// row puts a file on disk and hands back the grid's view of it. The name and
// original_name are the stem — the extension is carried beside them and put back on
// when a name is applied — so "a.txt" arrives as {Name: "a", Extension: "txt"}.
func row(t *testing.T, dir, was, now string) FileInfo {
	t.Helper()

	full := filepath.Join(dir, was)
	if err := os.WriteFile(full, []byte("x"), 0o644); err != nil {
		t.Fatalf("writing %s: %v", full, err)
	}

	stem, extension := splitExtension(was, false)

	return FileInfo{Name: now, OriginalName: stem, Extension: extension, FullPath: full}
}

func exists(t *testing.T, dir, name string) bool {
	t.Helper()

	_, err := os.Lstat(filepath.Join(dir, name))
	return err == nil
}

// The Setup window's form is what closing the app offers to save, so Go has to
// know when it differs from the options in force.
func TestSetupFormKnowsWhenThereAreUnsavedChanges(t *testing.T) {
	app := &App{config: defaultConfig()}

	// As the window opens: filled in from what is saved, so nothing to offer.
	app.SetSetupForm(defaultConfig())
	if app.setupIsDirty() {
		t.Fatal("an untouched form was counted as unsaved changes")
	}

	// One option changed, and the form that would be saved is the one reported.
	changed := defaultConfig()
	changed.Theme = themeDark
	app.SetSetupForm(changed)

	if !app.setupIsDirty() {
		t.Fatal("a changed form was not noticed")
	}
	if got := app.pendingSetupForm(); got != changed {
		t.Fatalf("pending form: got %+v, want %+v", got, changed)
	}

	// Cancel, Save and the window's own close all drop it.
	app.forgetSetupForm()
	if app.setupIsDirty() {
		t.Fatal("a forgotten form was still offered")
	}

	// Put back by hand: no unsaved changes either.
	app.SetSetupForm(changed)
	app.SetSetupForm(defaultConfig())
	if app.setupIsDirty() {
		t.Fatal("a form put back to the saved options was taken for a change")
	}

	// A theme the file cannot carry is the theme in force, so it is no change.
	odd := defaultConfig()
	odd.Theme = "Dark"
	app.SetSetupForm(odd)
	if app.setupIsDirty() {
		t.Fatalf("an unreadable theme was counted as a change: %+v", app.pendingSetupForm())
	}
}

func TestRenameRowsMovesEveryChangedName(t *testing.T) {
	dir := t.TempDir()
	rows := []FileInfo{row(t, dir, "a.txt", "one"), row(t, dir, "b.txt", "b")}

	if problems := renameRows(rows); problems != nil {
		t.Fatalf("unexpected refusals: %v", problems)
	}

	if !exists(t, dir, "one.txt") || exists(t, dir, "a.txt") {
		t.Fatal("the changed row was not renamed, extension and all")
	}
	if !exists(t, dir, "b.txt") {
		t.Fatal("the unchanged row was moved")
	}
}

func TestRenameRowsRefusesEmptyNameAndLeavesEverythingAlone(t *testing.T) {
	dir := t.TempDir()
	rows := []FileInfo{row(t, dir, "a.txt", "one"), row(t, dir, "b.txt", "  ")}

	problems := renameRows(rows)
	if problems == nil {
		t.Fatal("an empty name was accepted")
	}
	if problems[1] == "" {
		t.Fatalf("the empty name was not reported: %v", problems)
	}
	if problems[0] != "" {
		t.Fatalf("the good row was blamed too: %v", problems)
	}

	// All or nothing: the good row must not have moved either.
	if !exists(t, dir, "a.txt") || exists(t, dir, "one.txt") {
		t.Fatal("a refused save renamed something")
	}
}

func TestRenameRowsBlamesBothRowsWhenANameIsUsedTwice(t *testing.T) {
	dir := t.TempDir()
	rows := []FileInfo{row(t, dir, "a.txt", "same"), row(t, dir, "b.txt", "same")}

	problems := renameRows(rows)
	if problems == nil {
		t.Fatal("two rows wanting one name was accepted")
	}
	if problems[0] == "" || problems[1] == "" {
		t.Fatalf("both rows should be blamed: %v", problems)
	}
}

func TestRenameRowsRefusesANameAlreadyOnDisk(t *testing.T) {
	dir := t.TempDir()
	rows := []FileInfo{row(t, dir, "a.txt", "taken")}
	if err := os.WriteFile(filepath.Join(dir, "taken.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	problems := renameRows(rows)
	if problems == nil || problems[0] == "" {
		t.Fatalf("an existing name was accepted: %q", problems)
	}
	if !exists(t, dir, "a.txt") {
		t.Fatal("the row was renamed over an existing file")
	}
}

func TestSaveRenamesMarksTheRefusedRowAndPutsItsNameBack(t *testing.T) {
	dir := t.TempDir()
	rows := []FileInfo{row(t, dir, "a.txt", "fine"), row(t, dir, "b.txt", "bad/name")}

	// showError returns early without an application, so no window is needed here.
	saved, err := (&App{}).SaveRenames(rows)
	if err != nil {
		t.Fatalf("a refused save reported an error instead of marking rows: %v", err)
	}
	if len(saved) != 2 {
		t.Fatalf("want both rows back, got %d", len(saved))
	}

	if saved[0].Failed {
		t.Error("the good row was marked as refused")
	}
	if !saved[1].Failed || saved[1].FailedReason == "" {
		t.Errorf("the refused row was not marked: %+v", saved[1])
	}
	if saved[1].Name != saved[1].OriginalName {
		t.Errorf("the refused name was not put back: %q, want %q", saved[1].Name, saved[1].OriginalName)
	}
	if saved[0].Name != "fine" {
		t.Errorf("the other row lost what was typed: %q", saved[0].Name)
	}

	// Nothing on disk moved.
	for _, name := range []string{"a.txt", "b.txt"} {
		if !exists(t, dir, name) {
			t.Errorf("%s is gone", name)
		}
	}
}

func TestSaveRenamesUpdatesOriginalNameAfterSuccessfulSave(t *testing.T) {
	dir := t.TempDir()

	// Two rows renamed, one row left unchanged.
	rows := []FileInfo{
		row(t, dir, "a.txt", "one"), // a.txt -> one.txt
		row(t, dir, "b.txt", "two"), // b.txt -> two.txt
		row(t, dir, "c.txt", "c"),   // unchanged: c.txt stays c.txt
	}

	saved, err := (&App{}).SaveRenames(rows)
	if err != nil {
		t.Fatalf("a successful save reported an error: %v", err)
	}
	if len(saved) != 3 {
		t.Fatalf("want all rows back, got %d", len(saved))
	}

	// Physical files moved on disk: new names present, old names gone.
	for _, name := range []string{"one.txt", "two.txt", "c.txt"} {
		if !exists(t, dir, name) {
			t.Errorf("%s is missing after the save", name)
		}
	}
	for _, name := range []string{"a.txt", "b.txt"} {
		if exists(t, dir, name) {
			t.Errorf("%s still exists after the save", name)
		}
	}

	// original_name is now the new name for the renamed rows, and untouched
	// for the unchanged row. FullPath points at the renamed file, extension
	// restored.
	want := func(name string) string { return filepath.Join(dir, name) }

	if got := saved[0]; got.OriginalName != "one" || got.Name != "one" {
		t.Errorf("row 0: original_name=%q name=%q, want both %q", got.OriginalName, got.Name, "one")
	}
	if got := saved[0].FullPath; got != want("one.txt") {
		t.Errorf("row 0 full_path=%q, want %q", got, want("one.txt"))
	}

	if got := saved[1]; got.OriginalName != "two" || got.Name != "two" {
		t.Errorf("row 1: original_name=%q name=%q, want both %q", got.OriginalName, got.Name, "two")
	}
	if got := saved[1].FullPath; got != want("two.txt") {
		t.Errorf("row 1 full_path=%q, want %q", got, want("two.txt"))
	}

	if got := saved[2]; got.OriginalName != "c" || got.Name != "c" {
		t.Errorf("row 2: original_name=%q name=%q, want both %q", got.OriginalName, got.Name, "c")
	}
	if got := saved[2].FullPath; got != want("c.txt") {
		t.Errorf("row 2 full_path=%q, want %q", got, want("c.txt"))
	}
}
