import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Caveat, JetBrains_Mono, Quicksand } from "next/font/google";
import "./globals.css";

// Primary UI font — rounded chunky display sans, similar to elaichi co.
const quicksand = Quicksand({
  variable: "--font-inter", // keep the CSS var name; Tailwind's --font-sans already references it
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Marker / handwritten accent — for signatures, "from us" notes, etc.
const caveat = Caveat({
  variable: "--font-accent",
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
          colorBackground: "#FAFAF7",
          colorText: "#1A1A1A",
          colorTextSecondary: "#6B6B6B",
          fontFamily: "Quicksand, system-ui, sans-serif",
          borderRadius: "8px",
        },
      }}
    >
      <html lang="en" className={`${quicksand.variable} ${caveat.variable} ${jetbrainsMono.variable}`}>
        <body className="bg-sand text-ink antialiased min-h-screen">{children}</body>
      </html>
    </ClerkProvider>
  );
}
