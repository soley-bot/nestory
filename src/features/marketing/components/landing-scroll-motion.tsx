"use client";

import { useEffect } from "react";

export function LandingScrollMotion() {
  useEffect(() => {
    const landingPage = document.querySelector<HTMLElement>(".landing-page");
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-landing-reveal]"),
    );

    if (!elements.length) {
      return;
    }

    landingPage?.setAttribute("data-motion-ready", "true");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      elements.forEach((element) => {
        element.dataset.revealed = "true";
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const target = entry.target as HTMLElement;
          target.dataset.revealed = "true";
          observer.unobserve(target);
        });
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.16,
      },
    );

    elements.forEach((element, index) => {
      element.style.setProperty("--landing-reveal-index", String(index % 6));
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
      landingPage?.removeAttribute("data-motion-ready");
    };
  }, []);

  return null;
}
