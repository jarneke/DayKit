"use server";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import webpush from "web-push";

type SubscriptionInput = {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
};

type TestResult =
    | { ok: true; delayed: boolean }
    | { ok: false; error: string };

function validAccessCode(input: string, expected: string) {
    const inputHash = createHash("sha256").update(input).digest();
    const expectedHash = createHash("sha256").update(expected).digest();

    return timingSafeEqual(inputHash, expectedHash);
}

function isSubscription(input: unknown): input is SubscriptionInput {
    if (!input || typeof input !== "object") {
        return false;
    }

    const value = input as Record<string, unknown>;

    if (
        typeof value.endpoint !== "string" ||
        value.endpoint.length > 4096 ||
        !value.keys ||
        typeof value.keys !== "object"
    ) {
        return false;
    }

    const keys = value.keys as Record<string, unknown>;

    if (
        typeof keys.p256dh !== "string" ||
        typeof keys.auth !== "string" ||
        !/^[A-Za-z0-9_-]{87}={0,2}$/.test(keys.p256dh) ||
        !/^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth)
    ) {
        return false;
    }

    try {
        const endpoint = new URL(value.endpoint);
        const hostname = endpoint.hostname.toLowerCase();

        const allowedHost =
            hostname === "web.push.apple.com" ||
            hostname.endsWith(".push.apple.com") ||
            hostname === "fcm.googleapis.com" ||
            hostname === "updates.push.services.mozilla.com" ||
            hostname.endsWith(".push.services.mozilla.com");

        return (
            endpoint.protocol === "https:" &&
            endpoint.port === "" &&
            endpoint.username === "" &&
            endpoint.password === "" &&
            allowedHost
        );
    } catch {
        return false;
    }
}

export async function sendTestNotification(
    subscription: unknown,
    accessCode: string,
    delaySeconds: number,
): Promise<TestResult> {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    const expectedCode = process.env.TEST_ACCESS_CODE;

    if (!publicKey || !privateKey || !subject || !expectedCode) {
        return {
            ok: false,
            error: "De pushconfiguratie op de server is nog niet volledig.",
        };
    }

    if (
        typeof accessCode !== "string" ||
        accessCode.length > 256 ||
        !validAccessCode(accessCode, expectedCode)
    ) {
        return {
            ok: false,
            error: "De testcode klopt niet.",
        };
    }

    if (delaySeconds !== 0 && delaySeconds !== 60) {
        return {
            ok: false,
            error: "Deze vertraging wordt niet ondersteund.",
        };
    }

    if (!isSubscription(subscription)) {
        return {
            ok: false,
            error: "Ongeldige pushregistratie. Schakel meldingen opnieuw in.",
        };
    }

    const pushSubscription: webpush.PushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
        },
    };

    const payload = JSON.stringify({
        id: randomUUID(),
        title: "Hey, dit is Daykit 👋",
        body:
            delaySeconds === 60
                ? "Je melding na 60 seconden is aangekomen. Ook met de app gesloten!"
                : "Het werkt! Je eerste pushmelding is aangekomen.",
    });

    async function deliver() {
        await webpush.sendNotification(pushSubscription, payload, {
            TTL: 300,
            urgency: "high",
            timeout: 15000,
            vapidDetails: {
                subject: subject!,
                publicKey: publicKey!,
                privateKey: privateKey!,
            },
        });
    }

    if (delaySeconds === 60) {
        after(async () => {
            await new Promise((resolve) => setTimeout(resolve, 60000));

            try {
                await deliver();
            } catch (error) {
                const statusCode =
                    error && typeof error === "object" && "statusCode" in error
                        ? error.statusCode
                        : "unknown";

                console.error("Daykit delayed push failed:", statusCode);
            }
        });

        return { ok: true, delayed: true };
    }

    try {
        await deliver();
        return { ok: true, delayed: false };
    } catch (error) {
        const statusCode =
            error && typeof error === "object" && "statusCode" in error
                ? error.statusCode
                : undefined;

        if (statusCode === 404 || statusCode === 410) {
            return {
                ok: false,
                error:
                    "Deze pushregistratie is verlopen. Zet meldingen hieronder uit en opnieuw aan.",
            };
        }

        console.error("Daykit immediate push failed:", statusCode ?? "unknown");

        return {
            ok: false,
            error: "Versturen mislukt. Controleer de pushconfiguratie en serverlogs.",
        };
    }
}
