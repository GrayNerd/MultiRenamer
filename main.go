package main

import (
	"embed"
	"log"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

// mainWindowOptions is the window the program opens with: 1200×800, unless the
// window's size and place were asked to be remembered and there is one stored to
// restore. It is made hidden, because a window shown at creation is seen in the
// wrong place and the wrong theme before it is put right: App.ShowMain shows it
// once the page has applied the saved options.
func mainWindowOptions(cfg Config, state WindowState, restore bool) application.WebviewWindowOptions {
	options := application.WebviewWindowOptions{
		Name:           "main",
		Title:          "MultiRenamer",
		Width:          1200,
		Height:         800,
		EnableFileDrop: true,
		URL:            "/",
		Hidden:         true,
		// The colour behind the page, so the first frame is not a white flash on a
		// dark theme.
		BackgroundColour: themeBackground(cfg.Theme),
	}

	if !restore {
		return options
	}

	// Only the size is asked for here: the place is set once the window is up,
	// which is the first moment a move is honoured — see App.ShowMain.
	options.Width = state.Width
	options.Height = state.Height

	return options
}

// themeBackground is the window colour that goes with a theme, matching the page's
// own background.
func themeBackground(theme string) application.RGBA {
	if theme == themeDark {
		return application.NewRGB(0x2b, 0x2b, 0x2b)
	}
	return application.NewRGB(0xff, 0xff, 0xff)
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

	app.mainWindow = a.Window.NewWithOptions(mainWindowOptions(cfg, state, restore))
	app.windowState, app.hasWindowState = state, restore

	// The page asks for the window once it has applied the saved options. This is
	// the backstop: a page that never gets that far cannot leave the app with no
	// window on screen.
	time.AfterFunc(3*time.Second, app.ShowMain)

	// Hidden until the Setup button asks for it, and its own close button only
	// hides it — see newSetupWindow. It closes for real only when the app goes
	// with the main window.
	app.setupWindow = app.newSetupWindow()

	// Closing the main window closes the app, setup window included: the app
	// only quits once its last window is gone, and the setup window only hides
	// when it is closed on its own. Settings changed in the setup window and never
	// saved are asked about first — they would go with the app — and the size and
	// place the window is being closed at are written while it still knows them.
	app.mainWindow.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if !app.quitting.Load() && app.setupIsDirty() {
			event.Cancel()
			app.askAboutUnsavedSetup()
			return
		}

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
