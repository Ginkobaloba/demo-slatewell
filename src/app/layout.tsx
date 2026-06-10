import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ParadigmBanner } from "@/components/paradigm-banner";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "Slatewell",
    template: "%s | Slatewell",
  },
  description:
    "Booking that respects your customers and your staff calendar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <div className="flex flex-1 flex-col">{children}</div>
        <ParadigmBanner />
      </body>
    </html>
  );
}
