package main

import (
	"embed"
	"log"
	"os"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

// mainWindowOptions is the window the program opens with: 800×800, unless there
// is a stored size and place to restore. It is made hidden, because a window
// shown at creation is seen in the wrong place and the wrong theme before it is
// put right: App.ShowMain shows it once the page has applied the saved options.
func mainWindowOptions(cfg Config, state WindowState, restore bool) application.WebviewWindowOptions {
	options := application.WebviewWindowOptions{
		Name:           "main",
		Title:          "MultiRenamer",
		Width:          800,
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

// singleInstanceID names the one copy of the program that may be running. Opening
// the program again — Nemo opening another selection — hands the arguments to the
// running copy rather than opening a second window on the same files. It is the
// product identifier from build/config.yml.
const singleInstanceID = "com.graynerd.multirenamer"

func main() {
	// The options are read before the window is made: they decide how it opens,
	// and the size and place it was left at may have to be restored.
	cfg := LoadConfig()

	// A file manager opens a selection by starting the program with a URI per
	// file or folder (Nemo does); the page loads them once it is up. A second
	// launch hands its own over the same way — see secondInstance.
	app := &App{config: cfg}
	app.addOpenPaths(pathsFromArgs(os.Args[1:]))

	// The size and place the window was left at, if one has ever been saved: that
	// is where it opens from now on. The Setup option decides whether this exit
	// writes a new one, not whether the last one is used.
	state, restore := WindowState{}, false
	if dir, err := configDir(); err == nil {
		state, restore = loadWindowState(dir)
	}

	a := application.New(application.Options{
		Name: "MultiRenamer",
		// One copy at a time: a second launch hands its arguments to this one and
		// exits (see secondInstance).
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID:               singleInstanceID,
			OnSecondInstanceLaunch: app.secondInstance,
		},
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

	// Everything a second launch needs is in place now: from here its paths can
	// be handed to the page and its window brought forward.
	app.ready.Store(true)

	if err := a.Run(); err != nil {
		log.Fatal(err)
	}
}
