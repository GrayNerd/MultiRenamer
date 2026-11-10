package main

import "testing"

func TestMainWindowIsMadeHidden(t *testing.T) {
	options := mainWindowOptions(defaultConfig(), WindowState{}, false)

	// A window shown at creation is seen in the wrong place and theme before it is
	// put right; it is shown by ShowMain instead.
	if !options.Hidden {
		t.Error("the main window should be made hidden")
	}

	if options.Width != 1200 || options.Height != 800 {
		t.Errorf("default size: got %dx%d, want 1200x800", options.Width, options.Height)
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

func TestMainWindowIgnoresAStoredSizeWhenNotAskedFor(t *testing.T) {
	state := WindowState{Width: 900, Height: 700, X: 40, Y: 50}
	options := mainWindowOptions(defaultConfig(), state, false)

	if options.Width != 1200 || options.Height != 800 {
		t.Errorf("size without remembering: got %dx%d, want 1200x800", options.Width, options.Height)
	}
}

func TestMainWindowBackgroundFollowsTheTheme(t *testing.T) {
	dark := mainWindowOptions(Config{Theme: themeDark}, WindowState{}, false)
	light := mainWindowOptions(defaultConfig(), WindowState{}, false)

	if dark.BackgroundColour == light.BackgroundColour {
		t.Errorf("the window colour should differ with the theme, both are %+v", light.BackgroundColour)
	}
}
