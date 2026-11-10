package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

// mainWindowOptions is the window the program opens with: 1200×800, unless the
// window's size and place were asked to be remembered and there is one stored to
// restore.
func mainWindowOptions(state WindowState, restore bool) application.WebviewWindowOptions {
	options := application.WebviewWindowOptions{
		Name:           "main",
		Title:          "MultiRenamer",
		Width:          1200,
		Height:         800,
		EnableFileDrop: true,
		URL:            "/",
	}

	if !restore {
		return options
	}

	// Only the size is asked for here. The place is set once the window is up:
	// a position asked for while the window is being made is read relative to the
	// monitor by the platform, which is not what was stored.
	options.Width = state.Width
	options.Height = state.Height

	return options
}

func main() {
	// The options are read before the window is made: they decide how it opens,
	// and the size and place it was left at may have to be restored.
	cfg := LoadConfig()
	app := &App{config: cfg}

	// The size and place the window was left at, when they were asked to be kept.
	state, restore := WindowState{}, false
	if cfg.RememberWindow {
		if dir, err := configDir(); err == nil {
			state, restore = loadWindowState(dir)
		}
	}

	a := application.New(application.Options{
		Name: "MultiRenamer",
		// ✅ THIS is what makes bindings generate.
		Services: []application.Service{
			application.NewService(app),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})
	app.app = a

	app.mainWindow = a.Window.NewWithOptions(mainWindowOptions(state, restore))

	// A window manager may put a new window where it likes, whatever it was asked
	// for when it was made. The stored place is asked for again once the window is
	// up, which a window manager does honour — once, so a move the user makes
	// afterwards is not undone.
	if restore {
		moved := false
		app.mainWindow.OnWindowEvent(events.Common.WindowShow, func(*application.WindowEvent) {
			if moved {
				return // only the first show: a move the user makes later is left alone
			}
			moved = true
			app.mainWindow.SetPosition(state.X, state.Y)
		})
	}

	// Hidden until the Setup button asks for it, and its own close button only
	// hides it — see newSetupWindow. It closes for real only when the app goes
	// with the main window.
	app.setupWindow = app.newSetupWindow()

	// Closing the main window closes the app, setup window included: the app
	// only quits once its last window is gone, and the setup window only hides
	// when it is closed on its own. The size and place it is being closed at are
	// written first, while the window still knows them.
	app.mainWindow.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		app.saveWindowState()
		app.closeOtherWindows()
	})

	app.mainWindow.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		files := event.Context().DroppedFiles()
		a.Event.Emit("files-dropped", files)
	})

	if err := a.Run(); err != nil {
		log.Fatal(err)
	}
}
