import type { Metadata, Viewport } from "next";
import { Parisienne } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const parisienne = Parisienne({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-wordmark",
});

const title = "Atrium | A classroom with memory, in motion";
const description =
  "Atrium remembers how students learn, forms explainable learning rooms, and turns each assignment into the next teaching plan.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https");
  let metadataBase = new URL("http://localhost:3001");

  if (host) {
    try {
      metadataBase = new URL(`${protocol}://${host}`);
    } catch {
      // Keep local metadata valid when a development proxy sends a malformed host.
    }
  }

  return {
    metadataBase,
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Atrium living school" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#071119",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={parisienne.variable}>{children}</body>
    </html>
  );
}
