"use client";

import { useEffect, useRef, useState } from "react";
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
    throw new Error("Passkeys zijn hier niet beschikbaar. Gebruik je pincode.");
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError" || error.name === "AbortError") {
      return "De aanvraag is geannuleerd of verlopen. Je kunt opnieuw proberen.";
    }

    if (error.name === "InvalidStateError") {
      return "Deze wachtwoordbeheerder heeft al een passkey voor Daykit.";
    }

    if (error.name === "SecurityError") {
      return "Deze passkey kan hier niet gebruikt worden. Gebruik je pincode.";
    }

    return error.message;
  }

  return "Er ging iets mis. Controleer je verbinding en probeer opnieuw.";
}

export default function Access({ mode, hasPasskeys, expiresAt }: AccessProps) {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [passkeyAvailable, setPasskeyAvailable] = useState(hasPasskeys);

  const inFlight = useRef(false);
  const settings = mode === "settings";

  useEffect(() => {
    if (!settings || !expiresAt) {
      return;
    }

    function checkExpiry() {
      if (expiresAt && Date.now() >= expiresAt) {
        window.location.replace("/login");
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

  function beginRequest() {
    if (inFlight.current) {
      return false;
    }

    inFlight.current = true;
    setBusy(true);
    setMessage("");

    return true;
  }

  function finishRequest() {
    inFlight.current = false;
    setBusy(false);
  }

  async function unlockWithPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^\d{6}$/.test(pin) || !beginRequest()) {
      return;
    }

    try {
      await requestAuth("code", { code: pin });
      setPin("");
      window.location.replace("/");
    } catch (error) {
      setPin("");
      setMessage(errorMessage(error));
      finishRequest();
    }
  }

  async function unlockWithPasskey() {
    if (!beginRequest()) {
      return;
    }

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
      finishRequest();
    }
  }

  async function registerPasskey() {
    if (!beginRequest()) {
      return;
    }

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
        "Je passkey is opgeslagen. Log uit om het inloggen met je passkey te proberen.",
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      finishRequest();
    }
  }

  async function logout() {
    if (!beginRequest()) {
      return;
    }

    try {
      await requestAuth("logout");
      window.location.replace("/login");
    } catch (error) {
      setMessage(errorMessage(error));
      finishRequest();
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
                ? "Er is een passkey ingesteld."
                : "Voeg je eerste passkey toe."}
            </p>
          </div>
        </div>

        <p className={styles.explanation}>
          Met een passkey bevestig je de toegang op je toestel. Op je iPhone kan
          dat met Face ID, Touch ID of je toestelcode.
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
                ? "Nog een passkey toevoegen"
                : "Passkey instellen"}
          </button>

          <button
            type="button"
            className={styles.secondary}
            onClick={logout}
            disabled={busy}
          >
            Uitloggen
          </button>
        </div>

        <p className={styles.hint}>
          Je blijft maximaal zeven dagen ingelogd. Uitloggen beëindigt de sessie
          op dit toestel.
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
          <p>Log in met je passkey of je pincode.</p>
        </div>

        <section className={styles.loginCard} aria-label="Inloggen bij Daykit">
          <button
            type="button"
            className={styles.primary}
            onClick={unlockWithPasskey}
            disabled={busy}
          >
            {busy ? "Even wachten…" : "Inloggen met passkey"}
          </button>

          <p className={styles.passkeyHint}>
            Bevestig op je toestel, bijvoorbeeld met Face ID.
          </p>

          <div className={styles.divider}>
            <span>of met je pincode</span>
          </div>

          <form className={styles.form} onSubmit={unlockWithPin}>
            <label className={styles.field} htmlFor="daykit-pin">
              Pincode
            </label>

            <input
              id="daykit-pin"
              name="pin"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="off"
              className={styles.input}
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, "").slice(0, 6));
                setMessage("");
              }}
              placeholder="Je 6-cijferige pincode"
              minLength={6}
              maxLength={6}
              disabled={busy}
              aria-describedby={message ? "daykit-login-message" : undefined}
              required
            />

            <button
              type="button"
              className={styles.secondary}
              onClick={() => setShowPin((value) => !value)}
              aria-pressed={showPin}
              disabled={busy}
            >
              {showPin ? "Pincode verbergen" : "Pincode tonen"}
            </button>

            <button
              type="submit"
              className={styles.primary}
              disabled={busy || pin.length !== 6}
            >
              {busy ? "Even wachten…" : "Inloggen met pincode"}
            </button>
          </form>

          {message && (
            <p
              id="daykit-login-message"
              className={styles.message}
              role="alert"
            >
              {message}
            </p>
          )}
        </section>

        <p className={styles.loginNote}>
          Nog geen passkey? Log eerst in met je pincode. Daarna kun je een
          passkey instellen.
        </p>
      </div>
    </main>
  );
}
