// Fitting the grid to the window it ends up in.
//
// The window is made hidden until the saved options are on (see App.ShowMain), so
// the grid is built while there is no window to fill: Tabulator measures the width
// it finds then and keeps the columns it works out from it, because it only fits
// them again when the table itself is resized. The header would stop short of the
// window's edge until something resized the table — a load, or dragging the
// window — so the fit is asked for again once the window is really there.

// A redraw with force re-runs the layout against the width the table has now. It
// waits for the next frame, by which time the window has been laid out at the size
// it will keep.
export function fitColumns(table) {
    requestAnimationFrame(() => table.redraw(true));
}
