import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession, hasPasskeys } from "@/lib/auth";
import Dashboard from "./dashboard";
import styles from "./dashboard.module.css";

async function HomeContent() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const passkeysAvailable = await hasPasskeys();

  return (
    <Dashboard
      name={session.name}
      hasPasskeys={passkeysAvailable}
      expiresAt={session.expiresAt}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className={styles.loading} role="status">
          Je dag klaarzetten…
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
