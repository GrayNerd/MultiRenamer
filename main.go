package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := &App{}

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

	app.mainWindow = a.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:           "main",
		Title:          "MultiRenamer",
		Width:          1200,
		Height:         800,
		EnableFileDrop: true,
		URL:            "/",
	})

	// Hidden until the Setup button asks for it, and its own close button only
	// hides it — see newSetupWindow. It closes for real only when the app goes
	// with the main window.
	app.setupWindow = app.newSetupWindow()

	// Closing the main window closes the app, setup window included: the app
	// only quits once its last window is gone, and the setup window only hides
	// when it is closed on its own.
	app.mainWindow.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
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
