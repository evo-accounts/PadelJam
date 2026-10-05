import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Providers } from "@/components/Providers";

// Body sans per the design system (variables.json). Mono stays Geist.
//
// The serif slot falls back to a system stack in globals.css, and nothing uses
// `font-serif` today. Atelia (Branding/Font - Atelia/, four formats) is the
// design's display face, and mobile embeds it for the welcome slides' titles.
// Web has no such title yet; when one arrives, load the woff2 here with
// next/font/local and point `--font-serif` at it. It ships a single Regular
// weight, so it can only ever be a display face.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Padel Jam",
  description: "Padel Jam — communities, groups, and events for the padel world.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes sets the class on <html> from a
    // blocking script before React hydrates, so the server and client markup
    // deliberately differ on this one element. Scoped here, not app-wide.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
