import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
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
          fontFamily: "Inter, system-ui, sans-serif",
          borderRadius: "6px",
        },
      }}
    >
      <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <body className="bg-sand text-ink antialiased min-h-screen">{children}</body>
      </html>
    </ClerkProvider>
  );
}
