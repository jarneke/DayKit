"use client";

import { useSyncExternalStore } from "react";
import styles from "./day-cycle.module.css";

type DayPeriod = "morning" | "afternoon" | "evening";

function getCurrentPeriod(): DayPeriod {
  const hour = new Date().getHours();

  if (hour >= 6 && hour < 12) {
    return "morning";
  }

  if (hour >= 12 && hour < 18) {
    return "afternoon";
  }

  return "evening";
}

function getServerPeriod(): DayPeriod | null {
  return null;
}

function subscribe(onChange: () => void) {
  let timer: number | undefined;

  function refresh() {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }

    onChange();

    const now = new Date();
    const nextMinute = new Date(now);

    nextMinute.setMinutes(now.getMinutes() + 1, 0, 0);

    timer = window.setTimeout(
      refresh,
      Math.max(100, nextMinute.getTime() - now.getTime() + 20),
    );
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      refresh();
    }
  }

  refresh();

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("focus", refresh);

  return () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }

    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pageshow", refresh);
    window.removeEventListener("focus", refresh);
  };
}

export default function DayCycle() {
  const period = useSyncExternalStore<DayPeriod | null>(
    subscribe,
    getCurrentPeriod,
    getServerPeriod,
  );

  return (
    <div
      className={styles.background}
      data-period={period ?? "loading"}
      aria-hidden="true"
    >
      <div className={`${styles.layer} ${styles.morning}`} />
      <div className={`${styles.layer} ${styles.afternoon}`} />
      <div className={`${styles.layer} ${styles.evening}`} />
    </div>
  );
}
