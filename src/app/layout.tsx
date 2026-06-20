import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ParadigmBanner } from "@/components/paradigm-banner";
import { PortalHandoffClaim } from "@/components/portal-handoff-claim";

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

const SITE_URL = "https://slatewell.projectnexuscode.org";
const SITE_DESCRIPTION =
  "Multi-staff scheduling for service businesses. Real availability, real deposits, and real cancellation policy without enterprise overhead.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Slatewell",
    template: "%s | Slatewell",
  },
  description: SITE_DESCRIPTION,
  robots: { index: false, follow: false },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Slatewell",
    title: "Slatewell",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "Slatewell, a Paradigm Coding Solutions portfolio demo.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Slatewell",
    description: SITE_DESCRIPTION,
    images: ["/og-default.png"],
  },
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
        <PortalHandoffClaim />
        <ParadigmBanner />
      </body>
    </html>
  );
}
