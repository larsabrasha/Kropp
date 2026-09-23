// Browser events that should start a sync. The decisions are made in SyncCoordinator.

export function register(dotnet) {
    const online = () => dotnet.invokeMethodAsync('OnOnline');
    const offline = () => dotnet.invokeMethodAsync('OnOffline');
    const visible = () => {
        if (document.visibilityState === 'visible') dotnet.invokeMethodAsync('OnVisible');
    };

    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);

    return {
        dispose() {
            window.removeEventListener('online', online);
            window.removeEventListener('offline', offline);
            document.removeEventListener('visibilitychange', visible);
        },
    };
}

export function isOnline() {
    return navigator.onLine;
}

// Asks the browser not to evict our IndexedDB under storage pressure. Safari may still decline;
// the server copy is the backup either way.
export async function requestPersistentStorage() {
    try {
        return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
    } catch {
        return false;
    }
}
