"use client";

import { useEffect, useState } from "react";
import { sendTestNotification } from "./actions";
import styles from "./page.module.css";

export const maxDuration = 120;

function applicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes.buffer;
}

export default function Home() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [supported, setSupported] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Meldingen controleren…");

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let active = true;

    async function initialise() {
      const ios =
        /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;

      if (ios && !standalone) {
        if (active) {
          setNeedsInstall(true);
          setMessage("Voeg Daykit eerst toe aan je beginscherm.");
          setChecked(true);
        }

        return;
      }

      const canPush =
        window.isSecureContext &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!canPush) {
        if (active) {
          setMessage("Pushmeldingen zijn hier niet beschikbaar.");
          setChecked(true);
        }

        return;
      }

      try {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        const readyRegistration = await navigator.serviceWorker.ready;
        const existing = await readyRegistration.pushManager.getSubscription();

        if (!active) {
          return;
        }

        setSupported(true);
        setRegistration(readyRegistration);
        setSubscription(existing);
        setMessage(
          Notification.permission === "denied"
            ? "Meldingen zijn geblokkeerd. Sta ze toe via je toestelinstellingen."
            : existing
              ? "Dit toestel is klaar om meldingen te ontvangen."
              : "Schakel meldingen in om te beginnen.",
        );
      } catch {
        if (active) {
          setMessage("Meldingen voorbereiden is mislukt. Herlaad de app.");
        }
      } finally {
        if (active) {
          setChecked(true);
        }
      }
    }

    void initialise();

    return () => {
      active = false;
    };
  }, []);

  async function enableNotifications() {
    if (!registration || !publicKey || busy) {
      return;
    }

    setBusy(true);

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setMessage(
          permission === "denied"
            ? "Meldingen zijn geblokkeerd. Sta ze toe via je toestelinstellingen."
            : "Je hebt nog geen toestemming gegeven.",
        );
        return;
      }

      const current = await registration.pushManager.getSubscription();

      const next =
        current ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(publicKey),
        }));

      setSubscription(next);
      setMessage("Meldingen staan aan. Stuur je eerste test!");
    } catch {
      setMessage(
        "Inschakelen is mislukt. Controleer je verbinding en probeer opnieuw.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    if (!subscription || busy) {
      return;
    }

    setBusy(true);

    try {
      const removed = await subscription.unsubscribe();

      if (!removed) {
        setMessage("Uitschakelen is niet gelukt. Probeer opnieuw.");
        return;
      }

      setSubscription(null);
      setMessage("De pushregistratie op dit toestel is uitgeschakeld.");
    } catch {
      setMessage("Uitschakelen is niet gelukt. Probeer opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  async function send(delaySeconds: 0 | 60) {
    if (!subscription || busy) {
      return;
    }

    setBusy(true);
    setMessage(
      delaySeconds === 60
        ? "Je test voor over 60 seconden voorbereiden…"
        : "Je testmelding versturen…",
    );

    try {
      const result = await sendTestNotification(
        subscription.toJSON(),
        delaySeconds,
      );

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      setMessage(
        result.delayed
          ? "Test gestart! Vergrendel je iPhone. De server probeert over 60 seconden je melding te sturen."
          : "De pushdienst heeft je melding geaccepteerd. Controleer je meldingen.",
      );
    } catch {
      setMessage("De server kon niet bereikt worden. Probeer opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <span className={styles.logo} aria-hidden="true">
            ✦
          </span>
          <span>daykit</span>
          <span className={styles.label}>Eerste test</span>
        </header>

        <section className={styles.intro}>
          <p className={styles.eyebrow}>Een kleine ping. Een groot begin.</p>
          <h1>Even testen of we je kunnen bereiken.</h1>
          <p>
            Zet meldingen aan, stuur een test en probeer het daarna met je
            iPhone op slot.
          </p>
        </section>

        <section className={styles.card} aria-labelledby="notifications-title">
          <div className={styles.cardHeader}>
            <span className={styles.bell} aria-hidden="true">
              ↗
            </span>
            <div>
              <h2 id="notifications-title">Jouw meldingen</h2>
              <p>
                {subscription
                  ? "Ingeschakeld op dit toestel"
                  : "Nog niet actief"}
              </p>
            </div>
          </div>

          {needsInstall ? (
            <div className={styles.install}>
              <h3>Eerst op je beginscherm</h3>
              <ol>
                <li>Open deze website in Safari.</li>
                <li>Tik op de deelknop.</li>
                <li>Kies ‘Zet op beginscherm’.</li>
                <li>Open Daykit via het nieuwe icoon.</li>
              </ol>
            </div>
          ) : (
            <>
              {!subscription && (
                <button
                  className={styles.primary}
                  onClick={enableNotifications}
                  disabled={
                    !checked ||
                    !supported ||
                    !registration ||
                    !publicKey ||
                    busy
                  }
                >
                  {busy ? "Even wachten…" : "Meldingen inschakelen"}
                </button>
              )}

              {subscription && (
                <div className={styles.controls}>
                  <button
                    className={styles.primary}
                    onClick={() => send(0)}
                    disabled={busy}
                  >
                    {busy ? "Even wachten…" : "Stuur een testmelding"}
                  </button>

                  <button
                    className={styles.secondary}
                    onClick={() => send(60)}
                    disabled={busy}
                  >
                    Test over 60 seconden
                  </button>

                  <button
                    className={styles.textButton}
                    onClick={disableNotifications}
                    disabled={busy}
                  >
                    Meldingen uitschakelen
                  </button>
                </div>
              )}
            </>
          )}

          <p className={styles.status} role="status" aria-live="polite">
            {message}
          </p>

          {checked && supported && !publicKey && (
            <p className={styles.status}>
              De publieke pushsleutel ontbreekt nog in de appconfiguratie.
            </p>
          )}
        </section>

        <p className={styles.footnote}>
          Geen melding gezien? Controleer of Focus of het meldingenoverzicht de
          melding tegenhoudt.
        </p>
      </div>
    </main>
  );
}
