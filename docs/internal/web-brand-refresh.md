# Website and console brand refresh

The canonical artwork is `oynk-mobile-app/assets/branding/oynk-icon.png` in the sibling mobile repository. Both web apps copy that master to `public/oynk-icon.png`. The displayed wordmark uses its 192px derivative; no alternate SVG monogram is drawn.

Each app ships 32px favicons, 180px Apple touch icons, 192px and 512px manifest icons, and a matching SVG favicon wrapper. Generate resized PNGs from the master with `sips -z SIZE SIZE MASTER --out OUTPUT`. The website social card is a 1200×630 PNG with the same artwork, forest green, ivory and lime colors.

The website preserves the established cross-border settlement positioning, network diagram, architecture, provider coordination and founder experience. The consumer app is presented as a separate product alongside those services, with a dedicated product card and section. Business calls to action use the existing console signup routes. No public app-store download or completed fiat-to-USDC conversion is claimed.

Console changes preserve authentication, organization routing and compliance behavior. Overview shortcuts use the existing routes for each organization type. Browser verification used mock session responses only; no real users, applications or payments were created.

Validated production builds for `@oynk/web` and `@oynk/console`, 14 console tests, and Chrome layouts at 1440px, 768px and 390px (website additionally at 320px). Checked mobile navigation, login validation, signup form overflow and image loading. Actual production authentication/API operation was not exercised.

The consumer-app section uses the supplied `consumer-app.png` screenshot, copied unchanged to `apps/web/public/consumer-app.png`, inside a responsive CSS phone frame. iOS and Android badges communicate coming-soon availability without inactive download links. The screenshot is labeled as a Testnet preview. Verified image loading and overflow at 1440px, 768px, 390px and 320px; the web production build passes.

The landing page is consolidated around Settlement Network and Consumer App. Removed duplicate product, audience, modular-expansion and benefits sections; grouped the settlement workflow and provider responsibilities before the consumer preview. Shortened founder copy, linked detailed architecture to documentation, and labeled console entry points explicitly. Verified the production build, local anchors, image loading, mobile menu and horizontal overflow at 1440px, 1024px, 768px, 390px and 320px with no browser errors.


The newsletter now uses the Oynk database and existing backend email transport; see `newsletter.md`. The consumer-app preview appears before provider coordination, and the final Build with Oynk CTA has been removed.

Full local website review: verified 320/390/768/1024/1440px layouts, all loaded images and internal anchors, one page h1, menu Escape focus restoration, skip-link focus, and 404 return navigation. Fixed overlapping hero nodes at 320px and made the main landmark focusable by the skip link. Updated the 404 secondary action to the consumer app. Web build passes. This review does not verify external destination availability or real SMTP delivery.
