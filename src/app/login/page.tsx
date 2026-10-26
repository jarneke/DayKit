import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Access from "../access";
import styles from "../access.module.css";

async function LoginContent() {
  const session = await getSession();

  if (session) {
    redirect("/");
  }

  return <Access mode="login" hasPasskeys={false} />;
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.loading} role="status">
          Daykit openen…
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
