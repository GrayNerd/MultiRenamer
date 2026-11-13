package main

import (
	"net/url"
	"runtime"
	"strings"
)

// The command line is how a file manager hands a selection over. Nemo, like the
// other Linux file managers, launches the program with one file:// URI for each
// file or folder that was picked, and the grid opens on those. Only a selection
// ever arrives this way — opening a single folder browses it instead — so nothing
// here has to stand for a folder's contents the way a lone folder does when it is
// dropped on the window.

// pathsFromArgs turns the arguments the program was started with into local
// paths. A URI naming something that is not on this machine — another host
// (file://host/...) or another scheme (https://...) — is left out, since there is
// nothing here to rename. A plain path is taken as it stands, so the program can
// also be started by hand.
func pathsFromArgs(args []string) []string {
	paths := make([]string, 0, len(args))
	for _, arg := range args {
		if path, ok := pathFromArg(arg); ok {
			paths = append(paths, path)
		}
	}
	return paths
}

// pathFromArg is one argument as a local path. The second answer is false when
// the argument does not name anything on this machine.
func pathFromArg(arg string) (string, bool) {
	if arg == "" {
		return "", false
	}

	// A Windows path (C:\...) looks like a URI whose scheme is the drive letter.
	// It is a path already.
	if isDrivePath(arg) {
		return arg, true
	}

	u, err := url.Parse(arg)
	if err != nil {
		return "", false
	}

	// No scheme at all: a plain path, absolute or relative to where the program
	// was started.
	if u.Scheme == "" {
		return arg, true
	}
	if !strings.EqualFold(u.Scheme, "file") {
		return "", false // a web address, a share on another protocol, ...
	}
	if u.Host != "" && !strings.EqualFold(u.Host, "localhost") {
		return "", false // file://host/... is a file on another machine
	}
	if u.Path == "" {
		return "", false // file:// names nothing
	}

	// url.Parse has undone the escaping by now, so a space arrives as a space.
	path := u.Path
	if runtime.GOOS == "windows" {
		path = windowsPath(path)
	}
	return path, true
}

// isDrivePath reports whether arg starts the way Windows writes a path: a drive
// letter, a colon, and a separator (C:\Users or C:/Users).
func isDrivePath(arg string) bool {
	if len(arg) < 3 || arg[1] != ':' {
		return false
	}
	letter := arg[0]
	if !('a' <= letter && letter <= 'z' || 'A' <= letter && letter <= 'Z') {
		return false
	}
	return arg[2] == '\\' || arg[2] == '/'
}

// windowsPath turns the path of a file URI into a Windows path: the leading slash
// goes and the slashes are turned round, so file:///C:/Users/me/notes.txt becomes
// C:\Users\me\notes.txt.
func windowsPath(path string) string {
	if len(path) > 2 && path[0] == '/' && isDrivePath(path[1:]) {
		path = path[1:]
	}
	return strings.ReplaceAll(path, "/", `\`)
}
