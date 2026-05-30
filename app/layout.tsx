import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Caveat, Fraunces, JetBrains_Mono, Quicksand } from "next/font/google";
import "./globals.css";

// Display — bold soft-serif manifesto headers (elaichi-warm)
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

// Body — rounded chunky sans
const quicksand = Quicksand({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Handwritten — signatures, agent notes
const caveat = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Onbehalf — AI that applies for you",
  description:
    "An autonomous agent that finds, tailors, and submits job applications on your behalf. You stay in the loop on every decision.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#0D9488",
          colorBackground: "#EFEAD8",
          colorText: "#1C1B17",
          colorTextSecondary: "#6B6859",
          fontFamily: "Quicksand, system-ui, sans-serif",
          borderRadius: "16px",
        },
      }}
    >
      <html
        lang="en"
        className={`${fraunces.variable} ${quicksand.variable} ${caveat.variable} ${jetbrainsMono.variable}`}
      >
        <body className="ob-noise bg-cream text-ink antialiased min-h-screen">{children}</body>
      </html>
    </ClerkProvider>
  );
}
