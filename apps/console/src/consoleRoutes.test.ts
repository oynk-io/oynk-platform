import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationType } from "@oynk/shared";
import { getConsoleRoute, getConsoleRoutes } from "./consoleRoutes";

const organizationTypes: OrganizationType[] = ["BUSINESS", "SETTLEMENT_PARTNER", "INTERNAL"];

test("every organization console exposes unique working section routes", () => {
  for (const type of organizationTypes) {
    const routes = getConsoleRoutes(type);
    assert.ok(routes.length >= 7);
    assert.equal(new Set(routes.map((route) => route.path)).size, routes.length);
    assert.ok(routes.every((route) => getConsoleRoute(type, route.path) === route || getConsoleRoute(type, route.path)?.path === route.path));
  }
});

test("console navigation copy uses data-honest empty states", () => {
  const routes = organizationTypes.flatMap(getConsoleRoutes);

  assert.ok(routes.every((route) => route.emptyTitle.length > 0 && route.emptyDescription.length > 0));
  assert.ok(routes.every((route) => !/placeholder|planned/i.test(`${route.label} ${route.title} ${route.emptyTitle} ${route.emptyDescription}`)));
  assert.ok(routes.every((route) => !/developer|compliance/i.test(route.label)));
});
