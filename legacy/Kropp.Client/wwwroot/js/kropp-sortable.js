// Drag-and-drop reordering with SortableJS, as in GospelPresenter: drag by the handle, a short
// delay on touch so a swipe still scrolls, and the DOM put back after the drop so Blazor alone
// decides the order when it re-renders.

export function init(list, dotnet) {
    if (!list || typeof Sortable === 'undefined') return;
    if (list._sortable) list._sortable.destroy();
    list._sortable = new Sortable(list, {
        animation: 150,
        handle: '.drag-handle',
        delay: 150,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        ghostClass: 'opacity-0',
        onEnd(evt) {
            if (evt.oldIndex === evt.newIndex) return;
            const parent = evt.from;
            parent.insertBefore(evt.item, parent.children[evt.oldIndex < evt.newIndex ? evt.oldIndex : evt.oldIndex + 1]);
            dotnet.invokeMethodAsync('OnEntryReordered', evt.oldIndex, evt.newIndex);
        },
    });
}

export function destroy(list) {
    if (list && list._sortable) {
        list._sortable.destroy();
        list._sortable = null;
    }
}
