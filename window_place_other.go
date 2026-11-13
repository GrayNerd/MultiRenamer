//go:build !linux || !cgo || gtk3 || android || server

package main

import "github.com/wailsapp/wails/v3/pkg/application"

// showWindowAt is not possible here; the window is put up and moved instead (see
// App.ShowMain).
func showWindowAt(_ *application.WebviewWindow, _, _ int) bool {
	return false
}
