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

test('business detail deep links resolve within the internal registry', () => {
  const path = '/internal/businesses/47cc17da-4dd8-4f55-851d-0474fef8517f';
  assert.equal(getConsoleRoute('INTERNAL', path)?.title, 'Business details');
  assert.equal(getConsoleRoute('INTERNAL', `${path}/`)?.label, 'Businesses');
  assert.equal(getConsoleRoute('BUSINESS', path), null);
  assert.equal(getConsoleRoute('SETTLEMENT_PARTNER', path), null);
  assert.equal(getConsoleRoute('INTERNAL', '/internal/businesses/app-vest-ltd')?.title, 'Business details');
  assert.equal(getConsoleRoute('INTERNAL', '/internal/businesses/app-vest-ltd-47cc17da4d')?.title, 'Business details');
  assert.equal(getConsoleRoute('INTERNAL', '/internal/businesses/invalid!'), null);
  assert.equal(getConsoleRoute('INTERNAL', `${path}/unavailable`), null);
});

test('information requests belong to the business console', () => {
  assert.equal(getConsoleRoute('BUSINESS', '/business/information-requests')?.title, 'Information requests');
  assert.equal(getConsoleRoute('INTERNAL', '/business/information-requests'), null);
});
