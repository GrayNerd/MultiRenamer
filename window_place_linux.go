//go:build linux && cgo && !gtk3 && !android && !server

package main

/*
#cgo linux pkg-config: gtk4
#cgo linux LDFLAGS: -lX11

#include <string.h>
#include <unistd.h>
#include <gtk/gtk.h>
#include <gdk/x11/gdkx.h>
#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <X11/Xutil.h>

// frameExtents reads _NET_FRAME_EXTENTS, the border the window manager puts
// around a window: left, right, top and bottom. 0 is returned until the window
// manager has managed the window and set it.
static int frameExtents(Display *xdisplay, Window xwindow, int *left, int *top) {
	Atom atom = XInternAtom(xdisplay, "_NET_FRAME_EXTENTS", True);
	if (atom == None) {
		return 0;
	}

	Atom type;
	int format;
	unsigned long count, after;
	unsigned char *data = NULL;
	if (XGetWindowProperty(xdisplay, xwindow, atom, 0, 4, False, XA_CARDINAL,
			&type, &format, &count, &after, &data) != Success) {
		return 0;
	}
	if (data == NULL) {
		return 0;
	}
	if (count < 4 || format != 32) {
		XFree(data);
		return 0;
	}

	long *values = (long *)data;
	*left = (int)values[0];
	*top = (int)values[2];
	XFree(data);
	return 1;
}

// setPositionHints puts x,y into WM_NORMAL_HINTS as the program's own choice,
// keeping whatever else (the size limits, for one) is there.
static void setPositionHints(Display *xdisplay, Window xwindow, int x, int y) {
	XSizeHints *hints = XAllocSizeHints();
	if (hints == NULL) {
		return;
	}
	long supplied = 0;
	if (!XGetWMNormalHints(xdisplay, xwindow, hints, &supplied)) {
		hints->flags = 0;
	}
	hints->flags |= USPosition | PPosition;
	hints->x = x;
	hints->y = y;
	XSetWMNormalHints(xdisplay, xwindow, hints);
	XFree(hints);
}

// setWindowOpacity makes the whole window — frame included — this opaque, from
// 0 (invisible) to 0xffffffff (fully opaque), through the standard property the
// compositor reads.
static void setWindowOpacity(Display *xdisplay, Window xwindow, unsigned long opacity) {
	Atom atom = XInternAtom(xdisplay, "_NET_WM_WINDOW_OPACITY", False);
	XChangeProperty(xdisplay, xwindow, atom, XA_CARDINAL, 32, PropModeReplace,
		(unsigned char *)&opacity, 1);
}

// showWindowAt maps the window at x,y with the position hints already on it.
//
// GDK writes WM_NORMAL_HINTS itself when it presents a window, and drops the
// position, so the map request is sent here — with the hints set — and GTK is
// asked to present the window afterwards, when it is already mapped.
//
// A reparenting window manager places the window's frame at the hint's x,y,
// leaving the content a title bar lower. It reports that border in
// _NET_FRAME_EXTENTS as it manages the window, so the frame is moved up by it
// before the window is revealed. The window is transparent in the meantime, so it
// is never seen anywhere but where it belongs.
static int showWindowAt(void *window, int x, int y) {
	GtkWidget *widget = GTK_WIDGET(window);
	gtk_widget_realize(widget);

	GtkNative *native = gtk_widget_get_native(widget);
	if (native == NULL) {
		return 0;
	}

	GdkSurface *surface = gtk_native_get_surface(native);
	if (surface == NULL || !GDK_IS_X11_SURFACE(surface)) {
		return 0;
	}

	GdkDisplay *display = gdk_surface_get_display(surface);
	Display *xdisplay = gdk_x11_display_get_xdisplay(display);
	Window xwindow = gdk_x11_surface_get_xid(GDK_X11_SURFACE(surface));

	setPositionHints(xdisplay, xwindow, x, y);

	XSetWindowAttributes attributes;
	memset(&attributes, 0, sizeof(attributes));
	attributes.win_gravity = StaticGravity;
	XChangeWindowAttributes(xdisplay, xwindow, CWWinGravity, &attributes);

	XMoveWindow(xdisplay, xwindow, x, y);
	setWindowOpacity(xdisplay, xwindow, 0); // not seen until it is in place
	XMapWindow(xdisplay, xwindow);
	XFlush(xdisplay);

	int left = 0, top = 0;
	for (int attempt = 0; attempt < 40; attempt++) {
		if (frameExtents(xdisplay, xwindow, &left, &top)) {
			break;
		}
		usleep(500);
	}

	attributes.win_gravity = StaticGravity;
	XChangeWindowAttributes(xdisplay, xwindow, CWWinGravity, &attributes);
	XMoveWindow(xdisplay, xwindow, x - left, y - top);
	setPositionHints(xdisplay, xwindow, x - left, y - top);
	XFlush(xdisplay);

	// GTK presents the window (it is already mapped) and starts rendering, writing
	// its own hints and gravity: ours go back, and only then is the window shown.
	gtk_window_present(GTK_WINDOW(widget));
	setPositionHints(xdisplay, xwindow, x - left, y - top);
	attributes.win_gravity = StaticGravity;
	XChangeWindowAttributes(xdisplay, xwindow, CWWinGravity, &attributes);
	setWindowOpacity(xdisplay, xwindow, 0xffffffff);
	XFlush(xdisplay);

	return 1;
}
*/
import "C"

import "github.com/wailsapp/wails/v3/pkg/application"

// showWindowAt puts the window at x,y before it is first seen, so the window
// manager maps it there rather than at a place of its own choosing, and its frame
// is accounted for so the content lands where it was left. The answer is false
// when this display cannot be positioned this way (a Wayland session, or a
// platform without X11), and the window is put up and moved instead (see
// App.ShowMain).
func showWindowAt(window *application.WebviewWindow, x, y int) bool {
	shown := false

	// GTK and Xlib are only safe on the thread that owns them.
	application.InvokeSync(func() {
		native := window.NativeWindow()
		if native == nil {
			return
		}
		shown = C.showWindowAt(native, C.int(x), C.int(y)) != 0
	})

	return shown
}
