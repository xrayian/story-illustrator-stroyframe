import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { themeInitScript } from "@/components/theme-init";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "Storyframe — paste a story, get a narrated bundle";
const DESCRIPTION =
  "Drop in a story, approve the cast, and download an illustrated, narrated .svmp media bundle. Built for redistribution.";

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: "%s · Storyframe",
  },
  description: DESCRIPTION,
  applicationName: "Storyframe",
  keywords: [
    "story to audio",
    "illustrated narration",
    "AI voice",
    "AI illustration",
    ".svmp bundle",
    "storyframe",
  ],
  authors: [{ name: "Storyframe" }],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#181c27" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
     </head>
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
    </body>
  </html>
  );
}
