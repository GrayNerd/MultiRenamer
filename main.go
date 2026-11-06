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
		Name: "Rename App",
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
		Title:          "Rename Files & Directories",
		Width:          1200,
		Height:         800,
		EnableFileDrop: true,
		URL:            "/",
	})

	app.setupWindow = a.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:   "setup",
		Title:  "Setup",
		Width:  400,
		Height: 300,
		Hidden: true,
		URL:    "/setup.html",
	})

	app.mainWindow.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		files := event.Context().DroppedFiles()
		a.Event.Emit("files-dropped", files)
	})

	if err := a.Run(); err != nil {
		log.Fatal(err)
	}
}