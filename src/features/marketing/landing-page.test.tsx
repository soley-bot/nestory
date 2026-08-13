/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt, src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={String(src)} {...props} />
  ),
}));
vi.mock("@/features/marketing/components/landing-header", () => ({
  LandingHeader: () => <header>Public navigation</header>,
}));
vi.mock("@/features/marketing/components/landing-scroll-motion", () => ({
  LandingScrollMotion: () => null,
}));
vi.mock("@/features/marketing/components/control-preview", () => ({
  ControlPreview: () => <div>Workspace preview</div>,
}));

import { LandingPage } from "@/features/marketing/landing-page";

afterEach(cleanup);

describe("LandingPage enterprise composition", () => {
  it("preserves the hero and uses one purposeful property-operations editorial image", () => {
    render(<LandingPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", {
      name: "What if your whole portfolio stayed under control?",
    })).toBeTruthy();

    const editorial = screen.getByRole("img", {
      name: /property operations team reviewing a building plan/i,
    });
    expect(editorial.getAttribute("src")).toBe(
      "/property-operations-team-editorial.webp",
    );
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("keeps the image section useful when the image is unavailable", () => {
    render(<LandingPage />);

    const section = screen.getByRole("region", {
      name: "The same record, from request to close.",
    });
    expect(section.textContent).toContain("The same record, from request to close");
    expect(section.textContent).toContain("Maintenance");
    expect(section.textContent).toContain("Finance");
    expect(section.textContent).toContain("Reporting");
  });

  it("keeps the post-hero story concise", () => {
    const { container } = render(<LandingPage />);

    expect(container.querySelectorAll("main > section")).toHaveLength(4);
    expect(container.textContent).not.toContain("500+");
    expect(container.textContent).not.toContain("790");
  });
});
