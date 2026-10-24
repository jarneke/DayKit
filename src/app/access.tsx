"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import styles from "./access.module.css";

type AccessProps = {
  mode: "login" | "settings";
  hasPasskeys: boolean;
  expiresAt?: number;
};

async function requestAuth<T>(
  action: string,
  values: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("/api/auth", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...values }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Deze actie is niet gelukt. Probeer opnieuw.",
    );
  }

  return result as T;
}

function checkPasskeySupport() {
  if (!window.isSecureContext || !window.PublicKeyCredential) {
    throw new Error(
      "Passkeys zijn hier niet beschikbaar. Gebruik je toegangscode.",
    );
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError" || error.name === "AbortError") {
      return "Ontgrendelen is geannuleerd of verlopen. Je kunt opnieuw proberen.";
    }

    if (error.name === "InvalidStateError") {
      return "Er is al een passkey beschikbaar bij deze wachtwoordbeheerder.";
    }

    if (error.name === "SecurityError") {
      return "Deze passkey kan hier niet gebruikt worden. Probeer je toegangscode.";
    }

    return error.message;
  }

  return "Er ging iets mis. Controleer je verbinding en probeer opnieuw.";
}

export default function Access({ mode, hasPasskeys, expiresAt }: AccessProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [passkeyAvailable, setPasskeyAvailable] = useState(hasPasskeys);
  const settings = mode === "settings";

  useEffect(() => {
    if (!settings || !expiresAt) {
      return;
    }

    function checkExpiry() {
      if (expiresAt && Date.now() >= expiresAt) {
        window.location.replace("/");
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
        return;
      }

      checkExpiry();
    }

    const timer = window.setTimeout(
      checkExpiry,
      Math.max(0, expiresAt - Date.now()),
    );

    document.addEventListener("visibilitychange", checkExpiry);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", checkExpiry);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [settings, expiresAt]);

  async function unlockWithCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await requestAuth("code", { code });
      setCode("");
      window.location.replace("/");
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  async function unlockWithPasskey() {
    if (busy) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      checkPasskeySupport();

      const optionsJSON =
        await requestAuth<PublicKeyCredentialRequestOptionsJSON>(
          "authentication-options",
        );

      const response = await startAuthentication({ optionsJSON });

      await requestAuth("authentication-verify", { response });
      window.location.replace("/");
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  async function registerPasskey() {
    if (busy) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      checkPasskeySupport();

      const optionsJSON =
        await requestAuth<PublicKeyCredentialCreationOptionsJSON>(
          "registration-options",
        );

      const response = await startRegistration({ optionsJSON });

      await requestAuth("registration-verify", { response });

      setPasskeyAvailable(true);
      setMessage(
        "Je passkey is opgeslagen. Vergrendel Daykit om het ontgrendelen te proberen.",
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    if (busy) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await requestAuth("logout");
      window.location.replace("/");
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  if (settings) {
    return (
      <section className={styles.settings} aria-labelledby="access-title">
        <div className={styles.settingsHeader}>
          <span className={styles.symbol} aria-hidden="true">
            ✦
          </span>
          <div>
            <h2 id="access-title">Jouw toegang</h2>
            <p>
              {passkeyAvailable
                ? "Een passkey is ingesteld."
                : "Stel snel ontgrendelen in."}
            </p>
          </div>
        </div>

        <p className={styles.explanation}>
          Met een passkey bevestig je de toegang op je toestel. Op je iPhone kan
          dat met Face ID of je toestelcode.
        </p>

        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.primary}
            onClick={registerPasskey}
            disabled={busy}
          >
            {busy
              ? "Even wachten…"
              : passkeyAvailable
                ? "Nog een passkey instellen"
                : "Snel ontgrendelen instellen"}
          </button>

          <button
            type="button"
            className={styles.secondary}
            onClick={lock}
            disabled={busy}
          >
            Vergrendelen
          </button>
        </div>

        <p className={styles.hint}>
          Je sessie blijft maximaal 12 uur geldig. Vergrendelen meldt dit
          toestel meteen af.
        </p>

        {message && (
          <p className={styles.message} role="status" aria-live="polite">
            {message}
          </p>
        )}
      </section>
    );
  }

  return (
    <main className={styles.login}>
      <div className={styles.loginContent}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>daykit</span>
        </div>

        <div className={styles.intro}>
          <p className={styles.eyebrow}>Jouw dag, op één plek.</p>
          <h1>Welkom terug.</h1>
          <p>Ontgrendel je persoonlijke Daykit.</p>
        </div>

        <section className={styles.loginCard} aria-label="Daykit ontgrendelen">
          {passkeyAvailable && (
            <>
              <button
                type="button"
                className={styles.primary}
                onClick={unlockWithPasskey}
                disabled={busy}
              >
                {busy ? "Even wachten…" : "Ontgrendelen met passkey"}
              </button>

              <p className={styles.passkeyHint}>
                Gebruik Face ID, je vingerafdruk of je toestelcode.
              </p>

              <div className={styles.divider}>
                <span>of met je toegangscode</span>
              </div>
            </>
          )}

          <form className={styles.form} onSubmit={unlockWithCode}>
            <label className={styles.field} htmlFor="daykit-code">
              Toegangscode
            </label>

            <input
              id="daykit-code"
              name="password"
              type="password"
              className={styles.input}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Voer je code in"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              minLength={8}
              maxLength={128}
              disabled={busy}
              required
            />

            <button
              type="submit"
              className={passkeyAvailable ? styles.secondary : styles.primary}
              disabled={busy || code.length < 8}
            >
              {busy ? "Even wachten…" : "Ontgrendelen met code"}
            </button>
          </form>

          {message && (
            <p className={styles.message} role="status" aria-live="polite">
              {message}
            </p>
          )}
        </section>

        {!passkeyAvailable && (
          <p className={styles.loginNote}>
            Na het inloggen kun je snel ontgrendelen met een passkey instellen.
          </p>
        )}
      </div>
    </main>
  );
}
