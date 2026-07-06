import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Nestory",
  title: {
    default: "Nestory",
    template: "%s | Nestory",
  },
  description:
    "Property operations software for portfolios, leases, rent, maintenance, documents, and reporting.",
  icons: {
    apple: "/apple-icon.png",
    icon: "/icon.png",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    description:
      "Property operations software for portfolios, leases, rent, maintenance, documents, and reporting.",
    siteName: "Nestory",
    title: "Nestory",
    type: "website",
  },
  twitter: {
    card: "summary",
    description:
      "Property operations software for portfolios, leases, rent, maintenance, documents, and reporting.",
    title: "Nestory",
  },
};

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});

const themeScript = `
(() => {
  try {
    const stored = window.localStorage.getItem("nestory-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
