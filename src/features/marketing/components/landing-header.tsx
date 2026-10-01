"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";

import { NestoryLogo } from "@/components/brand/nestory-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const navItems = [
  { href: "/#workspace", label: "Workspace" },
  { href: "/#operations", label: "Operations" },
  { href: "/request?intent=demo", label: "Request a demo" },
] as const;

type SectionNavigation = {
  hash: string;
  fromUrl: string;
  href?: string;
  behavior: ScrollBehavior;
};

export function LandingHeader({
  tone = "page",
}: {
  tone?: "hero" | "page" | "semantic";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuOpen = useRef(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const dialogPresent = useRef(false);
  const pendingSection = useRef<SectionNavigation | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const cancelScroll = useCallback(() => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
  }, []);
  const scrollToSection = useCallback((navigation: SectionNavigation) => {
    cancelScroll();
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      if (menuOpen.current || window.location.href !== navigation.fromUrl) return;
      const target = navigation.hash
        ? document.getElementById(navigation.hash.slice(1))
        : menuTrigger.current;
      if (!target) return;
      if (navigation.href && window.location.hash !== navigation.hash) {
        window.history.pushState(null, "", navigation.href);
      }
      target.focus({ preventScroll: true });
      if (navigation.hash) {
        target.scrollIntoView({ block: "start", behavior: navigation.behavior });
      }
    });
  }, [cancelScroll]);

  useEffect(() => {
    function handleHistory() {
      cancelScroll();
      window.scrollTo({ left: window.scrollX, top: window.scrollY, behavior: "instant" });
      const hash = window.location.hash;
      const hasTarget = ["#workspace", "#operations"].includes(hash)
        && document.getElementById(hash.slice(1));
      pendingSection.current = null;
      if (hasTarget) {
        const navigation: SectionNavigation = {
          hash,
          fromUrl: window.location.href,
          behavior: "instant",
        };
        if (dialogPresent.current) pendingSection.current = navigation;
        else scrollToSection(navigation);
      } else if (!hash && window.location.pathname === "/" && !dialogPresent.current) {
        scrollToSection({ hash, fromUrl: window.location.href, behavior: "instant" });
      }
      menuOpen.current = false;
      setIsOpen(false);
    }
    window.addEventListener("popstate", handleHistory);
    window.addEventListener("hashchange", handleHistory);
    if (["#workspace", "#operations"].includes(window.location.hash)) {
      scrollToSection({
        hash: window.location.hash,
        fromUrl: window.location.href,
        behavior: "instant",
      });
    }
    return () => {
      window.removeEventListener("popstate", handleHistory);
      window.removeEventListener("hashchange", handleHistory);
      cancelScroll();
    };
  }, [cancelScroll, scrollToSection]);

  function handleOpenChange(open: boolean) {
    menuOpen.current = open;
    if (open) {
      pendingSection.current = null;
      cancelScroll();
    }
    setIsOpen(open);
  }

  function handleSectionClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey
      || event.ctrlKey || event.shiftKey || event.altKey) return;
    const hash = href.startsWith("/#") ? href.slice(1) : "";
    if (window.location.pathname === "/" && hash
      && document.getElementById(hash.slice(1))) {
      event.preventDefault();
      pendingSection.current = {
        hash,
        href,
        fromUrl: window.location.href,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant" : "smooth",
      };
    }
    handleOpenChange(false);
  }

  const isHeroTone = tone === "hero";
  const isSemanticTone = tone === "semantic";
  const logoClass = isHeroTone
    ? "leading-none text-white"
    : "leading-none text-[var(--landing-heading)]";
  const quietControlClass = isHeroTone
    ? "text-white hover:bg-white/10 hover:text-white focus-visible:ring-white"
    : isSemanticTone
      ? "text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50"
      : "text-[var(--landing-heading)] hover:bg-black/5 hover:text-[var(--landing-heading)] focus-visible:ring-[var(--landing-accent)]";

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex h-24 max-w-[1360px] items-start justify-between px-6 pt-7 sm:px-10 lg:px-14">
          <Link aria-label="Nestory home" className={logoClass} href="/">
            <LandingLogo hero={isHeroTone} />
          </Link>

          <div
            className={
              isHeroTone
                ? "flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-white/90 sm:gap-4"
                : isSemanticTone
                  ? "flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-muted-foreground sm:gap-4"
                  : "flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-[var(--landing-muted)] sm:gap-4"
            }
          >
            <Link
              className="hidden min-h-9 items-center whitespace-nowrap rounded-sm px-1 outline-none transition-colors hover:text-current focus-visible:ring-2 sm:inline-flex"
              href="/request?intent=demo"
            >
              Request a demo
            </Link>
            <Link
              className="inline-flex min-h-9 items-center whitespace-nowrap rounded-sm px-1 outline-none transition-colors hover:text-current focus-visible:ring-2"
              href="/login"
            >
              Sign in
            </Link>
            <ThemeToggle className={quietControlClass} />
            <DialogTrigger asChild>
              <Button
                aria-label="Open menu"
                className={quietControlClass}
                ref={menuTrigger}
                size="icon"
                variant="ghost"
              >
                <Menu aria-hidden="true" size={24} strokeWidth={1.45} />
              </Button>
            </DialogTrigger>
          </div>
        </div>
      </header>

      <DialogContent
        className="inset-0 left-0 top-0 flex h-svh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none bg-[#090a0c] p-0 text-white ring-0 sm:max-w-none"
        aria-describedby={undefined}
        onOpenAutoFocus={() => { dialogPresent.current = true; }}
        onCloseAutoFocus={(event) => {
          dialogPresent.current = false;
          const navigation = pendingSection.current;
          pendingSection.current = null;
          if (!navigation) return;
          event.preventDefault();
          scrollToSection(navigation);
        }}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Nestory navigation</DialogTitle>
        <div className="mx-auto flex h-24 w-full max-w-[1360px] shrink-0 items-start justify-between px-6 pt-7 sm:px-10 lg:px-14">
          <Link
            aria-label="Nestory home"
            className="leading-none text-white"
            href="/"
            onNavigate={() => handleOpenChange(false)}
          >
            <LandingLogo hero />
          </Link>
          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-white/85 sm:gap-4">
            <Link
              className="inline-flex min-h-9 items-center rounded-sm px-1 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white"
              href="/login"
              onNavigate={() => handleOpenChange(false)}
            >
              Sign in
            </Link>
            <ThemeToggle className="text-white hover:bg-white/10 hover:text-white focus-visible:ring-white" />
            <DialogClose asChild>
              <Button
                aria-label="Close menu"
                className="text-white hover:bg-white/10 hover:text-white focus-visible:ring-white"
                size="icon"
                variant="ghost"
              >
                <X aria-hidden="true" size={26} strokeWidth={1.35} />
              </Button>
            </DialogClose>
          </div>
        </div>

        <nav
          aria-label="Landing page sections"
          className="flex flex-1 items-center justify-center px-6 py-8"
        >
          <div className="space-y-4 text-center">
            {navItems.map((item) => (
              <Link
                className="font-display block rounded-sm text-4xl font-semibold leading-none text-white/70 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white sm:text-5xl lg:text-6xl"
                href={item.href}
                key={item.href}
                onClick={(event) => handleSectionClick(event, item.href)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              className="font-display block rounded-sm pt-6 text-3xl font-semibold leading-none text-white/70 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white sm:text-4xl lg:text-5xl"
              href="/login"
              onNavigate={() => handleOpenChange(false)}
            >
              Sign in
            </Link>
          </div>
        </nav>
      </DialogContent>
    </Dialog>
  );
}

function LandingLogo({ hero }: { hero: boolean }) {
  return (
    <NestoryLogo
      markClassName="h-9 w-9"
      markTone={hero ? "light" : "auto"}
      priority
      subtitleClassName={hero ? "hidden text-white/75 sm:block" : "hidden text-[var(--landing-subtle)] sm:block"}
      textClassName={hero ? "hidden text-2xl text-white sm:block" : "hidden text-2xl text-[var(--landing-heading)] sm:block"}
    />
  );
}
