import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--rw-font-sans-loaded",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--rw-font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "RubyWhisper — Mac dictation that feels instant",
  description:
    "RubyWhisper is a native-feeling Mac dictation utility. Hold a hotkey, speak, and keep writing — clean text lands where your cursor was already waiting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
