package main

import (
	"reflect"
	"testing"
)

// Nemo and the other Linux file managers launch the program with a file:// URI
// for each file or folder that was picked.
func TestPathsFromArgsTurnsFileURIsIntoPaths(t *testing.T) {
	args := []string{
		"file:///home/ken/notes.txt",
		"file:///home/ken/My%20File.txt",
		"file:///home/ken/read%23me.md",
		"file://localhost/home/ken/readme.txt",
		"file:///home/ken/%C3%A9t%C3%A9.txt",
	}
	want := []string{
		"/home/ken/notes.txt",
		"/home/ken/My File.txt",
		"/home/ken/read#me.md",
		"/home/ken/readme.txt",
		"/home/ken/été.txt",
	}

	if got := pathsFromArgs(args); !reflect.DeepEqual(got, want) {
		t.Errorf("pathsFromArgs(%q) = %q, want %q", args, got, want)
	}
}

func TestPathsFromArgsKeepsPlainPaths(t *testing.T) {
	args := []string{"/home/ken/notes.txt", "relative/notes.txt", "./notes.txt"}

	if got := pathsFromArgs(args); !reflect.DeepEqual(got, args) {
		t.Errorf("pathsFromArgs(%q) = %q, want them unchanged", args, got)
	}
}

func TestPathsFromArgsDropsWhatIsNotOnThisMachine(t *testing.T) {
	args := []string{
		"https://example.com/notes.txt",
		"file://othermachine/share/notes.txt",
		"file://",
		"",
	}

	if got := pathsFromArgs(args); len(got) != 0 {
		t.Errorf("pathsFromArgs(%q) = %q, want nothing", args, got)
	}
}

func TestPathsFromArgsKeepsTheOnesItCanUse(t *testing.T) {
	args := []string{
		"file:///home/ken/a.txt",
		"https://example.com/b.txt",
		"file:///home/ken/c.txt",
	}
	want := []string{"/home/ken/a.txt", "/home/ken/c.txt"}

	if got := pathsFromArgs(args); !reflect.DeepEqual(got, want) {
		t.Errorf("pathsFromArgs(%q) = %q, want %q", args, got, want)
	}
}

// Opening the program from the menu passes nothing, and the grid starts empty.
func TestPathsFromArgsWithNoArguments(t *testing.T) {
	if got := pathsFromArgs(nil); len(got) != 0 {
		t.Errorf("pathsFromArgs(nil) = %q, want nothing", got)
	}
}

// A Windows path is a path, not a URI whose scheme is the drive letter.
func TestIsDrivePath(t *testing.T) {
	for _, arg := range []string{`C:\Users\ken\notes.txt`, "C:/Users/ken/notes.txt"} {
		if !isDrivePath(arg) {
			t.Errorf("isDrivePath(%q) = false, want true", arg)
		}
	}
	for _, arg := range []string{"notes.txt", "/home/ken/notes.txt", "C:", "1:\\notes.txt", "C:notes.txt"} {
		if isDrivePath(arg) {
			t.Errorf("isDrivePath(%q) = true, want false", arg)
		}
	}
}

func TestWindowsPath(t *testing.T) {
	got := windowsPath("/C:/Users/ken/notes.txt")
	want := `C:\Users\ken\notes.txt`

	if got != want {
		t.Errorf("windowsPath: got %q, want %q", got, want)
	}
}
