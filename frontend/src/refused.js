// What a refused save leaves behind.
//
// A name the save could not change comes back from Go as it is on disk, with the
// row marked and the reason beside it: the row is shown with its name in red, and
// the reason on hover, so it is obvious which one needs fixing. The mark belongs to
// that refused name, not to the row, so editing the name takes it away.

export function markRefused(row) {
    const data = row.getData();
    const element = row.getElement();

    element.classList.toggle("rename-failed", !!data.failed);

    if (data.failed) element.title = data.failed_reason || "this name could not be changed";
    else element.removeAttribute("title");
}

// The name has been edited again. By the time this runs the editor is closed — it
// is driven from cellEdited — so the row can be written to safely.
export function forgetRefused(cell) {
    const row = cell.getRow();

    if (!row.getData().failed) return;

    row.update({failed: false, failed_reason: ""});
}
