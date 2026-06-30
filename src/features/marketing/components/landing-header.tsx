"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const navItems = [
  { href: "#platform", label: "Platform" },
  { href: "#operations", label: "Operations" },
  { href: "#method", label: "Method" },
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

  return (
    <>
      {!isOpen ? (
        <header className="absolute inset-x-0 top-0 z-40">
          <div className="mx-auto flex h-24 max-w-7xl items-start justify-between px-6 pt-7 sm:px-10 lg:px-14">
            <Link
              aria-label="Nestory home"
              className="font-display leading-none text-[#060910]"
              href="/"
            >
              <span className="block text-2xl font-semibold">NESTORY</span>
              <span className="mt-0.5 block text-center text-[10px] font-medium uppercase tracking-[0.24em] text-[#9aa0aa]">
                Property Management
              </span>
            </Link>

            <div className="flex items-center gap-6 text-[11px] font-medium uppercase text-[#838995]">
              <Link className="transition-colors hover:text-[#060910]" href="/login">
                Sign in
              </Link>
              <button
                aria-label="Open menu"
                className="inline-flex h-8 w-8 items-center justify-center text-[#060910] transition-opacity hover:opacity-65"
                onClick={() => setIsOpen(true)}
                type="button"
              >
                <Menu size={24} strokeWidth={1.5} />
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
          <div className="mx-auto flex h-24 max-w-7xl items-start justify-between px-6 pt-7 sm:px-10 lg:px-14">
            <Link
              aria-label="Nestory home"
              className="font-display leading-none text-white"
              href="/"
              onClick={() => setIsOpen(false)}
            >
              <span className="block text-2xl font-semibold">NESTORY</span>
              <span className="mt-0.5 block text-center text-[10px] font-medium uppercase tracking-[0.24em] text-white/40">
                Property Management
              </span>
            </Link>

            <div className="flex items-center gap-6 text-[11px] font-medium uppercase text-white/55">
              <Link
                className="transition-colors hover:text-white"
                href="/login"
                onClick={() => setIsOpen(false)}
              >
                Sign in
              </Link>
              <button
                aria-label="Close menu"
                className="inline-flex h-8 w-8 items-center justify-center text-white transition-opacity hover:opacity-65"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X size={26} strokeWidth={1.4} />
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
                  className="block text-5xl font-semibold leading-none text-white/32 transition-colors hover:text-white sm:text-6xl lg:text-7xl"
                  href={item.href}
                  key={item.href}
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <Link
                className="block pt-6 text-4xl font-semibold leading-none text-white/32 transition-colors hover:text-white sm:text-5xl lg:text-6xl"
                href="/signup"
                onClick={() => setIsOpen(false)}
              >
                Create account
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
