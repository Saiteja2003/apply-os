import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "Honing — Institutional Career Intelligence & Automation",
    template: "%s | Honing",
  },
  description:
    "One immutable master record, tailored reviewable precision for every role. Institutional career intelligence & automation.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16.svg", sizes: "16x16", type: "image/svg+xml" },
    ],
    apple: [
      {
        url: "/brand/honing-app-icon-1024.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  openGraph: {
    title: "Honing — Institutional Career Intelligence & Automation",
    description:
      "One immutable master record, tailored reviewable precision for every role.",
    images: [
      {
        url: "/brand/honing-og-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Honing — Your record, honed.",
      },
    ],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
