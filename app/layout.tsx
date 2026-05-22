import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import LayoutShell from "@/components/LayoutShell";

export const metadata: Metadata = {
  title: "Diktat Deutsch - Hörverstehen üben",
  description: "Lerne Deutsch durch Diktate mit YouTube-Videos und lokalen Aufnahmen",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <LayoutShell>{children}</LayoutShell>
        </Providers>
      </body>
    </html>
  );
}

