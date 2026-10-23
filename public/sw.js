self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
    let message = {};

    try {
        message = event.data ? event.data.json() : {};
    } catch {
        message = {};
    }

    event.waitUntil(
        self.registration.showNotification(message.title || "Daykit", {
            body: message.body || "Je testmelding is aangekomen.",
            icon: "/apple-icon",
            tag: message.id || "daykit-test",
            data: {
                url: "/",
            },
        }),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    event.waitUntil(
        (async () => {
            const windows = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });

            const appWindow = windows.find(
                (client) => new URL(client.url).origin === self.location.origin,
            );

            if (appWindow) {
                await appWindow.focus();
                return;
            }

            await self.clients.openWindow("/");
        })(),
    );
});