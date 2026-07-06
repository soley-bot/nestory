"use client";

import { Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { NestoryLogo } from "@/components/brand/nestory-logo";

const navItems = [
  { href: "#workspace", label: "Workspace" },
  { href: "#control", label: "Control" },
  { href: "#operations", label: "Operations" },
  { href: "#start", label: "Start" },
];

export function LandingHeader() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  function toggleTheme() {
    const currentTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("nestory-theme", nextTheme);
  }

  return (
    <>
      {!isOpen ? (
        <header className="absolute inset-x-0 top-0 z-40">
          <div className="mx-auto flex h-24 max-w-[1360px] items-start justify-between px-6 pt-7 sm:px-10 lg:px-14">
            <Link
              aria-label="Nestory home"
              className="leading-none text-[var(--landing-heading)]"
              href="/"
            >
              <NestoryLogo
                markClassName="h-9 w-9"
                priority
                subtitleClassName="text-[var(--landing-subtle)]"
                textClassName="text-2xl text-[var(--landing-heading)]"
              />
            </Link>

            <div className="flex items-center gap-5 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--landing-muted)]">
              <Link
                className="transition-colors hover:text-[var(--landing-heading)]"
                href="/login"
              >
                Sign in
              </Link>
              <LandingThemeToggle onToggle={toggleTheme} />
              <button
                aria-label="Open menu"
                className="inline-flex h-8 w-8 items-center justify-center text-[var(--landing-heading)] transition-opacity hover:opacity-65"
                onClick={() => setIsOpen(true)}
                type="button"
              >
                <Menu size={26} strokeWidth={1.45} />
              </button>
            </div>
          </div>
        </header>
      ) : null}

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#090a0c] text-white"
          role="dialog"
        >
          <div className="mx-auto flex h-24 max-w-[1360px] items-start justify-between px-6 pt-7 sm:px-10 lg:px-14">
            <Link
              aria-label="Nestory home"
              className="leading-none text-white"
              href="/"
              onClick={() => setIsOpen(false)}
            >
              <NestoryLogo
                markClassName="h-9 w-9"
                markTone="light"
                priority
                subtitleClassName="text-white/40"
                textClassName="text-2xl text-white"
              />
            </Link>

            <div className="flex items-center gap-5 text-[11px] font-medium uppercase tracking-[0.16em] text-white/55">
              <Link
                className="transition-colors hover:text-white"
                href="/login"
                onClick={() => setIsOpen(false)}
              >
                Sign in
              </Link>
              <LandingThemeToggle onToggle={toggleTheme} variant="overlay" />
              <button
                aria-label="Close menu"
                className="inline-flex h-8 w-8 items-center justify-center text-white transition-opacity hover:opacity-65"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X size={28} strokeWidth={1.35} />
              </button>
            </div>
          </div>

          <nav
            aria-label="Landing page sections"
            className="flex min-h-[calc(100svh-6rem)] items-center justify-center px-6 pb-16"
          >
            <div className="space-y-4 text-center">
              {navItems.map((item) => (
                <a
                  className="font-display block text-4xl font-semibold leading-none text-white/35 transition-colors hover:text-white sm:text-5xl lg:text-6xl"
                  href={item.href}
                  key={item.href}
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <Link
                className="font-display block pt-6 text-3xl font-semibold leading-none text-white/35 transition-colors hover:text-white sm:text-4xl lg:text-5xl"
                href="/signup"
                onClick={() => setIsOpen(false)}
              >
                Create workspace
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}

function LandingThemeToggle({
  onToggle,
  variant = "page",
}: {
  onToggle: () => void;
  variant?: "overlay" | "page";
}) {
  return (
    <button
      aria-label="Toggle color theme"
      className={
        variant === "overlay"
          ? "inline-flex h-8 w-8 items-center justify-center text-white transition-opacity hover:opacity-65"
          : "inline-flex h-8 w-8 items-center justify-center text-[var(--landing-heading)] transition-opacity hover:opacity-65"
      }
      onClick={onToggle}
      title="Toggle color theme"
      type="button"
    >
      <Moon className="theme-toggle-moon" size={20} strokeWidth={1.45} />
      <Sun className="theme-toggle-sun" size={20} strokeWidth={1.45} />
    </button>
  );
}
