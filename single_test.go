package main

import (
	"path/filepath"
	"reflect"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// A selection is loaded once: the page takes what is waiting and it is gone.
func TestTakeOpenPathsHandsThemOverOnce(t *testing.T) {
	app := &App{}
	app.addOpenPaths([]string{"/home/ken/a.txt", "/home/ken/b.txt"})

	want := []string{"/home/ken/a.txt", "/home/ken/b.txt"}
	if got := app.TakeOpenPaths(); !reflect.DeepEqual(got, want) {
		t.Errorf("first take: got %q, want %q", got, want)
	}
	if got := app.TakeOpenPaths(); len(got) != 0 {
		t.Errorf("second take: got %q, want nothing", got)
	}
}

// Nemo launching the program again hands its URIs to the copy that is running,
// which is what loads them.
func TestSecondInstanceHandsItsURIsOver(t *testing.T) {
	app := &App{}
	app.secondInstance(application.SecondInstanceData{
		Args: []string{"/usr/local/bin/MultiRenamer", "file:///home/ken/My%20File.txt"},
	})

	want := []string{"/home/ken/My File.txt"}
	if got := app.TakeOpenPaths(); !reflect.DeepEqual(got, want) {
		t.Errorf("got %q, want %q", got, want)
	}
}

// A plain relative path means where the second copy was started, which need not
// be where the running copy was.
func TestSecondInstanceResolvesRelativePathsFromItsOwnDirectory(t *testing.T) {
	app := &App{}
	app.secondInstance(application.SecondInstanceData{
		Args:       []string{"/usr/local/bin/MultiRenamer", "notes.txt"},
		WorkingDir: "/home/ken/Documents",
	})

	want := []string{filepath.Join("/home/ken/Documents", "notes.txt")}
	if got := app.TakeOpenPaths(); !reflect.DeepEqual(got, want) {
		t.Errorf("got %q, want %q", got, want)
	}
}

// Opening the program with no selection — the menu, say — has nothing to load.
func TestSecondInstanceWithNoSelectionOpensNothing(t *testing.T) {
	app := &App{}
	app.secondInstance(application.SecondInstanceData{Args: []string{"/usr/local/bin/MultiRenamer"}})
	app.secondInstance(application.SecondInstanceData{})

	if got := app.TakeOpenPaths(); len(got) != 0 {
		t.Errorf("got %q, want nothing", got)
	}
}
