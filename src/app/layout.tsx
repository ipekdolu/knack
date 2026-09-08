import type { Metadata } from "next";
import { Nunito, Inter, Bagel_Fat_One } from "next/font/google";
import "./globals.css";

// Rounded, playful display font for headings — the "Duolingo-ish" energy
// the design calls for. Body text stays on a clean, readable sans.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// A single-weight, ultra-bold bubble display face reserved for the "Knack"
// wordmark itself -- distinct from the Nunito headings used everywhere
// else, so the logo reads as a logo rather than just bold body text.
const bagelFatOne = Bagel_Fat_One({
  variable: "--font-logo",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Knack",
  description: "Learn German by using it -- reading, writing, and speaking real sentences, with feedback on each one.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${inter.variable} ${bagelFatOne.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-text font-sans">
        {children}
      </body>
    </html>
  );
}
