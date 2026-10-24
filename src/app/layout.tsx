import { Suspense } from "react";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSession, hasPasskeys } from "@/lib/auth";
import Access from "./access";
import accessStyles from "./access.module.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Daykit",
  description: "Jouw dagelijkse tools op één plek.",
  appleWebApp: {
    capable: true,
    title: "Daykit",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f3ef",
};

async function AccessBoundary({ children }: { children: ReactNode }) {
  const session = await getSession();
  const passkeysAvailable = await hasPasskeys();

  if (!session) {
    return <Access mode="login" hasPasskeys={passkeysAvailable} />;
  }

  return (
    <>
      {children}
      <Access
        mode="settings"
        hasPasskeys={passkeysAvailable}
        expiresAt={session.expiresAt}
      />
    </>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <Suspense
          fallback={
            <div className={accessStyles.loading} role="status">
              Daykit openen…
            </div>
          }
        >
          <AccessBoundary>{children}</AccessBoundary>
        </Suspense>
      </body>
    </html>
  );
}
