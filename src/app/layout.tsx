import type { Metadata, Viewport } from "next";
import { Parisienne } from "next/font/google";
import "./globals.css";

const parisienne = Parisienne({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-wordmark",
});

export const metadata: Metadata = {
  title: "Atrium — self-evolving classroom",
  description:
    "A multi-agent classroom intelligence system shown as a living isometric school.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#151517",
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
