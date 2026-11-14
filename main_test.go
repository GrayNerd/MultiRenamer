package main

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestMainWindowIsMadeHidden(t *testing.T) {
	options := mainWindowOptions(defaultConfig(), WindowState{}, false)

	// A window shown at creation is seen in the wrong place and theme before it is
	// put right; it is shown by ShowMain instead.
	if !options.Hidden {
		t.Error("the main window should be made hidden")
	}

	if options.Width != 800 || options.Height != 800 {
		t.Errorf("default size: got %dx%d, want 800x800", options.Width, options.Height)
	}
}

func TestMainWindowTakesTheStoredSize(t *testing.T) {
	state := WindowState{Width: 900, Height: 700, X: 40, Y: 50}
	options := mainWindowOptions(defaultConfig(), state, true)

	if !options.Hidden {
		t.Error("a window whose size is restored should still be made hidden")
	}
	if options.Width != 900 || options.Height != 700 {
		t.Errorf("restored size: got %dx%d, want 900x700", options.Width, options.Height)
	}
}

func TestMainWindowIgnoresAStoredSizeWhenThereIsNoneToRestore(t *testing.T) {
	state := WindowState{Width: 900, Height: 700, X: 40, Y: 50}
	options := mainWindowOptions(defaultConfig(), state, false)

	if options.Width != 800 || options.Height != 800 {
		t.Errorf("size without remembering: got %dx%d, want 800x800", options.Width, options.Height)
	}
}

func TestMainWindowAsksForTheStoredPlaceAsItIsMade(t *testing.T) {
	state := WindowState{Width: 900, Height: 700, X: 40, Y: 50}
	options := mainWindowOptions(defaultConfig(), state, true)

	// A platform that puts a window up where it is created opens it in the right
	// spot, with no move afterwards: the place has to be asked for both ways, as
	// X,Y are ignored unless the place is named.
	if options.InitialPosition != application.WindowXY {
		t.Errorf("initial position: got %v, want WindowXY", options.InitialPosition)
	}
	if options.X != 40 || options.Y != 50 {
		t.Errorf("restored place: got %d,%d, want 40,50", options.X, options.Y)
	}
}

func TestMainWindowAsksForNoPlaceWhenThereIsNoneToRestore(t *testing.T) {
	state := WindowState{Width: 900, Height: 700, X: 40, Y: 50}
	options := mainWindowOptions(defaultConfig(), state, false)

	// Without a stored place the window is left where the platform puts a new
	// one, rather than at the top left corner that an unchecked 0,0 would mean.
	if options.InitialPosition == application.WindowXY {
		t.Error("a window with no place to restore should not ask for X,Y")
	}
	if options.X != 0 || options.Y != 0 {
		t.Errorf("place without remembering: got %d,%d, want 0,0", options.X, options.Y)
	}
}

func TestMainWindowBackgroundFollowsTheTheme(t *testing.T) {
	dark := mainWindowOptions(Config{Theme: themeDark}, WindowState{}, false)
	light := mainWindowOptions(defaultConfig(), WindowState{}, false)

	if dark.BackgroundColour == light.BackgroundColour {
		t.Errorf("the window colour should differ with the theme, both are %+v", light.BackgroundColour)
	}
}
