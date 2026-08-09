import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceDirectory = new URL("./", import.meta.url);

test("console navigation is permanent from tablet widths upward", async () => {
  const styles = await readFile(new URL("styles.css", sourceDirectory), "utf8");

  assert.match(styles, /@media\(min-width:768px\) and \(max-width:800px\)/);
  assert.match(styles, /\.console>\.sidebar\{position:sticky/);
  assert.match(styles, /\.console \.mobile-navigation-control\{display:none\}/);
});

test("mobile navigation exposes an accessible controlled drawer", async () => {
  const [application, styles] = await Promise.all([
    readFile(new URL("App.tsx", sourceDirectory), "utf8"),
    readFile(new URL("styles.css", sourceDirectory), "utf8"),
  ]);

  assert.match(application, /aria-expanded=\{mobileNavigationOpen\}/);
  assert.match(application, /aria-controls="console-navigation"/);
  assert.match(application, /event\.key==="Escape"/);
  assert.match(application, /document\.body\.style\.overflow="hidden"/);
  assert.match(styles, /@media\(max-width:767px\)/);
  assert.match(styles, /\.console>\.navigation-overlay\.open\{opacity:1;visibility:visible/);
});
