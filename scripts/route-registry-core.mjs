function indexUnique(entries, label, issues) {
  const index = new Map();

  for (const entry of entries ?? []) {
    if (!entry?.route) {
      issues.push(`${label} contains an entry without a route`);
      continue;
    }
    if (index.has(entry.route)) {
      issues.push(`${label} contains duplicate route ${entry.route}`);
      continue;
    }
    index.set(entry.route, entry);
  }

  return index;
}

export function buildRouteRegistry({ authenticated, contentReview, uiRoutes }) {
  const issues = [];
  const canonicalByRoute = indexUnique(uiRoutes, "canonical inventory", issues);
  const authenticatedByRoute = indexUnique(
    authenticated?.routes,
    "authenticated overlay",
    issues,
  );
  const contentReviewByRoute = indexUnique(
    contentReview?.routes,
    "content review",
    issues,
  );

  const authenticatedRoutes = [];
  for (const route of authenticated?.routes ?? []) {
    const canonical = canonicalByRoute.get(route.route);
    if (!canonical) {
      issues.push(
        `authenticated route ${route.route} is absent from config/ui-route-coverage.json`,
      );
      continue;
    }
    if (route.source && route.source !== canonical.source) {
      issues.push(
        `${route.route}: authenticated source metadata duplicates and conflicts with the canonical source`,
      );
    }
    authenticatedRoutes.push({
      ...route,
      roles: [...canonical.roles],
      source: canonical.source,
    });
  }

  for (const canonical of uiRoutes ?? []) {
    if (!contentReviewByRoute.has(canonical.route)) {
      issues.push(`content review is missing canonical route ${canonical.route}`);
    }
  }
  for (const review of contentReview?.routes ?? []) {
    if (!canonicalByRoute.has(review.route)) {
      issues.push(
        `content review route ${review.route} is absent from config/ui-route-coverage.json`,
      );
    }
  }

  return {
    authenticated: {
      ...authenticated,
      routes: authenticatedRoutes,
    },
    contentReview,
    counts: {
      all: canonicalByRoute.size,
      authenticated: authenticatedByRoute.size,
      reviewed: contentReviewByRoute.size,
    },
    issues,
    routes: [...(uiRoutes ?? [])],
  };
}

export async function loadRouteRegistry({ projectRoot = process.cwd() } = {}) {
  const [uiRoutes, authenticated, contentReview] = await Promise.all(
    [
      "config/ui-route-coverage.json",
      "config/authenticated-route-discoverability.json",
      "config/enterprise-frontend-content-review.json",
    ].map(async (path) =>
      JSON.parse(await readFile(resolve(projectRoot, path), "utf8")),
    ),
  );

  return buildRouteRegistry({ authenticated, contentReview, uiRoutes });
}
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
