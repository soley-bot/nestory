import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

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

const themeScript = `
(() => {
  try {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const stored = window.localStorage.getItem("nestory-display-mode:public");
    const requested = ["light", "dark", "system"].includes(stored) ? stored : "system";
    const theme = requested === "system" ? (prefersDark ? "dark" : "light") : requested;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = requested;
    document.documentElement.classList.toggle("dark", theme === "dark");
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.themePreference = "system";
    document.documentElement.classList.remove("dark");
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
      className={`${geist.variable} ${geistMono.variable} h-full font-sans antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
