import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import DayCycle from "./day-cycle";
import LiquidGlass from "./liquid-glass";
import styles from "./day-cycle.module.css";
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
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080d1b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <DayCycle />
        <div className={styles.content}>{children}</div>
        <LiquidGlass />
      </body>
    </html>
  );
}
