import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CashSense — See what’s ahead",
  description: "Know where your cash is going, what could change, and what to do next.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
