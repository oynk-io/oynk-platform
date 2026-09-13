import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronRight,
  Eye,
  Github,
  Globe2,
  Landmark,
  Layers3,
  Menu,
  Mail,
  Network,
  Route,
  Smartphone,
  Twitter,
  Workflow,
  X,
} from "lucide-react";
import { NewsletterForm } from "../components/NewsletterForm";
import { BrandMark } from "../components/BrandMark";

const navigation = [
  { label: "Settlement network", href: "#network" },
  { label: "Consumer app", href: "#consumer-app" },
  { label: "Our experience", href: "#experience" },
] as const;

const consoleUrl = import.meta.env.VITE_CONSOLE_SITE_URL ?? "https://console.oynk.io";

function Wordmark() {
  return (
    <span className="wordmark">
      <BrandMark className="wordmark-mark" />
      <span>Oynk</span>
    </span>
  );
}

function LandingHeader() {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeNavigation({ restoreFocus: true });
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(mobileNavigationRef.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') ?? []);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    function closeAtDesktop(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    document.body.style.overflow = "hidden";
    firstMobileLinkRef.current?.focus();
    window.addEventListener("keydown", handleKeyDown);
    desktopQuery.addEventListener("change", closeAtDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      desktopQuery.removeEventListener("change", closeAtDesktop);
    };
  }, [open]);

  function closeNavigation({ restoreFocus = false } = {}) {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  return (
    <header className="landing-header">
      <div className="landing-container flex h-[72px] items-center justify-between gap-6">
        <a href="/" aria-label="Oynk home"><Wordmark /></a>
        <nav className="landing-desktop-navigation items-center gap-7" aria-label="Primary navigation">
          {navigation.map((item) => <a key={item.label} href={item.href} className="landing-nav-link">{item.label}</a>)}
        </nav>
        <div className="landing-desktop-actions items-center gap-3">
          <a href={`${consoleUrl}/login`} className="landing-nav-link">Console sign in</a>
          <a href={`${consoleUrl}/signup`} className="landing-button landing-button-primary">Join the network <ArrowRight size={16} aria-hidden="true" /></a>
        </div>
        <button ref={menuButtonRef} type="button" className="landing-icon-button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-navigation" aria-label="Open navigation">
          <Menu size={22} />
        </button>
      </div>
      {open && createPortal(
        <div className="landing-mobile-layer">
          <button type="button" className="landing-mobile-overlay" onClick={() => closeNavigation({ restoreFocus: true })} aria-label="Close navigation" tabIndex={-1} />
          <nav ref={mobileNavigationRef} id="mobile-navigation" className="landing-mobile-nav" aria-label="Mobile navigation">
            <div className="landing-mobile-nav-header"><a href="/" aria-label="Oynk home" onClick={() => closeNavigation()}><Wordmark /></a><button type="button" className="landing-icon-button landing-mobile-close" onClick={() => closeNavigation({ restoreFocus: true })} aria-label="Close navigation" aria-expanded={open} aria-controls="mobile-navigation"><X size={22} /></button></div>
            <div className="flex flex-col py-3">
            {navigation.map((item, index) => <a ref={index === 0 ? firstMobileLinkRef : undefined} key={item.label} href={item.href} className="landing-mobile-link" onClick={() => closeNavigation()}>{item.label}<ChevronRight size={17} aria-hidden="true" /></a>)}
            <a href={`${consoleUrl}/login`} className="landing-mobile-link" onClick={() => closeNavigation()}>Console sign in<ChevronRight size={17} /></a>
            <a href={`${consoleUrl}/signup`} className="landing-button landing-button-primary mt-3 justify-center" onClick={() => closeNavigation()}>Join the network <ArrowRight size={16} aria-hidden="true" /></a>
            </div>
          </nav>
        </div>,
        document.body,
      )}
    </header>
  );
}

function NetworkVisual() {
  return (
    <div className="network-visual" role="img" aria-label="Oynk connecting a payment platform, liquidity provider, and local settlement provider through one visible settlement journey">
      <div className="network-orbit network-orbit-one" aria-hidden="true" />
      <div className="network-orbit network-orbit-two" aria-hidden="true" />
      <div className="network-route-line network-route-one" aria-hidden="true" />
      <div className="network-route-line network-route-two" aria-hidden="true" />
      <div className="network-node network-node-origin">
        <span className="network-node-icon"><Building2 size={19} aria-hidden="true" /></span>
        <span><strong>Payment platform</strong><small>Payment request</small></span>
      </div>
      <div className="network-core">
        <BrandMark className="wordmark-mark" />
        <strong>Oynk</strong>
        <small>Settlement network</small>
      </div>
      <div className="network-node network-node-liquidity">
        <span className="network-node-icon"><Banknote size={19} aria-hidden="true" /></span>
        <span><strong>Liquidity provider</strong><small>Qualified participant</small></span>
      </div>
      <div className="network-node network-node-destination">
        <span className="network-node-icon"><Landmark size={19} aria-hidden="true" /></span>
        <span><strong>Settlement provider</strong><small>Destination market</small></span>
      </div>
      <div className="network-status-card">
        <span className="network-status-icon"><CheckCircle2 size={16} aria-hidden="true" /></span>
        <span><small>Programmable coordination</small><strong>One visible settlement journey</strong></span>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, copy, align = "left" }: { eyebrow: string; title: string; copy: string; align?: "left" | "center" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="landing-eyebrow">{eyebrow}</p>
      <h2 className="landing-section-title">{title}</h2>
      <p className="landing-section-copy">{copy}</p>
    </div>
  );
}

const steps = [
  { icon: Layers3, number: "01", title: "A payment request is created", copy: "The payment platform defines the source, destination, amount, and preferred payment option." },
  { icon: Route, number: "02", title: "Qualified providers support the route", copy: "Oynk is designed to coordinate available liquidity and local settlement capabilities." },
  { icon: Network, number: "03", title: "Settlement is coordinated", copy: "Participating providers complete their assigned part of the cross-border payment flow." },
  { icon: Eye, number: "04", title: "Activity remains visible", copy: "The platform can follow transaction and settlement progress through completion." },
] as const;

export function LandingPage() {
  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <LandingHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-container grid items-center gap-14 py-20 lg:grid-cols-[1.02fr_.98fr] lg:py-28 xl:gap-20">
            <div>
              <div className="landing-kicker"><Globe2 size={15} aria-hidden="true" /> Payment infrastructure for connected economies</div>
              <h1 id="hero-title" className="landing-hero-title">One network for moving money across markets.</h1>
              <p className="landing-hero-copy">Oynk connects payment platforms, liquidity providers and local settlement partners to move money across borders. Oynk consumer app brings USDC savings, seamless payments and DeFi-powered financing for RWA into one personal financial experience.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#network" className="landing-button landing-button-primary">Explore the network <ArrowRight size={17} aria-hidden="true" /></a>
                <a href="#consumer-app" className="landing-button landing-button-secondary">Meet the consumer app</a>
              </div>
              <p className="mt-6 flex items-center gap-2 text-sm text-[#60716b]"><span className="h-1.5 w-1.5 rounded-full bg-[#e8765a]" aria-hidden="true" />Independent of any single exchange, bank, marketplace, or liquidity source.</p>
            </div>
            <NetworkVisual />
          </div>
        </section>

        <section id="network" className="landing-section scroll-mt-24">
          <div className="landing-container grid gap-12 lg:grid-cols-2 lg:gap-20">
            <SectionHeading eyebrow="Settlement network" title="Expand across markets through one settlement layer." copy="For payment platforms, businesses and teams building consumer apps. Oynk connects payment demand with qualified liquidity and local settlement providers, reducing the repeated integration and operational work of opening each new corridor." />
            <div className="corridor-comparison" aria-label="Comparison of bespoke corridor expansion and Oynk's modular network model">
              <div className="corridor-column corridor-column-fragmented">
                <span className="corridor-label">Corridor by corridor</span>
                <h3>Repeated bilateral work</h3>
                <div className="corridor-stack"><span>Source integration</span><span>Liquidity arrangement</span><span>Local payout setup</span><span>Settlement process</span></div>
              </div>
              <div className="corridor-divider" aria-hidden="true"><ArrowRight size={18} /></div>
              <div className="corridor-column corridor-column-network">
                <span className="corridor-label">Oynk’s model</span>
                <h3>One common settlement layer</h3>
                <div className="corridor-network-core"><span>Payment application</span><ArrowRight size={14} /><strong>Oynk</strong><ArrowRight size={14} /><span>Qualified provider</span></div>
                <p>Eligible providers can be added or replaced through a common workflow. Each route depends on partner coverage, liquidity and operational readiness.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="landing-section scroll-mt-20 bg-[#10231d] text-white">
          <div className="landing-container">
            <SectionHeading eyebrow="How it works" title="A coordinated path from payment request to completion." copy="Oynk is designed to give payment applications and qualified providers a consistent settlement workflow across participating routes." align="center" />
            <ol className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {steps.map((step) => <li key={step.number} className="step-card"><div className="flex items-center justify-between"><span className="step-icon"><step.icon size={21} aria-hidden="true" /></span><span className="step-number">{step.number}</span></div><h3>{step.title}</h3><p>{step.copy}</p></li>)}
            </ol>
          </div>
        </section>

        <section id="consumer-app" className="landing-section consumer-app-section scroll-mt-20">
          <div className="landing-container consumer-app-grid">
            <div>
              <SectionHeading eyebrow="A product for individuals" title="Meet the Oynk consumer app." copy="Alongside its cross-border settlement services, Oynk is building a personal financial experience around a SocketFi smart account. Access your account with a passkey, see your USDC balance and review transfers before approving them." />
              <p className="consumer-app-roadmap">Pool participation, purchasing power and provider-backed asset financing are planned extensions of the consumer product.</p>
            </div>
            <figure className="consumer-app-showcase">
              <div className="consumer-showcase-heading"><span className="consumer-preview-label"><span aria-hidden="true" />App preview</span><span>Built around you.</span></div>
              <div className="consumer-device-stage">
                <div className="consumer-device">
                  <img src="/consumer-app.png" width="1170" height="2532" loading="lazy" decoding="async" alt="Oynk consumer app home screen showing a test-USDC smart-account balance, money actions and Home, Pool, Explore and Profile navigation." />
                </div>
              </div>
              <figcaption>
                <div className="consumer-platforms" aria-label="Coming soon on iOS and Android">
                  <div className="consumer-platform"><Smartphone size={22} aria-hidden="true" /><span><small>Coming soon</small><strong>iOS</strong></span></div>
                  <div className="consumer-platform"><Smartphone size={22} aria-hidden="true" /><span><small>Coming soon</small><strong>Android</strong></span></div>
                </div>
                <p>Preview from the app on Testnet. Public downloads are not available yet.</p>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="landing-section coordination-section">
          <div className="landing-container">
            <SectionHeading eyebrow="Working together" title="Oynk coordinates. Providers deliver locally." copy="Payment platforms use a common workflow, while independent liquidity and settlement partners bring the capabilities needed in each market." align="center" />
            <div className="coordination-grid mt-12">
              <article className="coordination-card coordination-card-oynk">
                <span className="coordination-icon"><Workflow size={22} aria-hidden="true" /></span>
                <p className="landing-eyebrow">Oynk coordinates</p>
                <h3>A common settlement workflow</h3>
                <ul>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Payment instructions</li>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Provider participation</li>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Settlement progress</li>
                </ul>
              </article>
              <div className="coordination-connector" aria-hidden="true"><span>coordinates with</span><ArrowRight size={20} /></div>
              <article className="coordination-card coordination-card-partners">
                <span className="coordination-icon"><Banknote size={22} aria-hidden="true" /></span>
                <p className="landing-eyebrow">Network participants provide</p>
                <h3>Market and payment capabilities</h3>
                <ul>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Liquidity</li>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Local payment capability</li>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Banking connectivity</li>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Payout fulfillment</li>
                </ul>
              </article>
            </div>
            <p className="coordination-note">Merchant and everyday payments are future directions. Soroban settlement controls and low-connectivity authorization are under development. <a href="https://docs.oynk.io" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Explore the architecture <ArrowRight size={13} className="inline" aria-hidden="true" /></a></p>
          </div>
        </section>

        <section id="experience" className="landing-section experience-section scroll-mt-20">
          <div className="landing-container grid items-center gap-12 lg:grid-cols-[.78fr_1.22fr] lg:gap-20">
            <div className="experience-marker">
              <span className="experience-value">$2,000,000 USD</span>
              <span className="experience-label">Cross-border activity facilitated by Oynk’s founder</span>
              <small>Combined onchain settlement and offchain fiat-to-fiat payment activity.</small>
            </div>
            <div>
              <SectionHeading eyebrow="Built from operating experience" title="The network is grounded in real settlement challenges." copy="Oynk grew from its founder’s hands-on experience facilitating cross-border payments between the United States and Nigeria. Fragmented liquidity, manual coordination and payout delays shaped the network being built today." />

            </div>
          </div>
        </section>

        <section id="newsletter" className="landing-section scroll-mt-20" aria-labelledby="newsletter-title">
          <div className="landing-container">
            <div className="newsletter-feature">
              <div className="newsletter-copy">
                <p className="landing-eyebrow">The Oynk newsletter</p>
                <h2 id="newsletter-title" className="landing-section-title">Be part of what’s next.</h2>
                <p className="landing-section-copy">Get updates on the Oynk consumer app, new network partnerships and product launches.</p>
              </div>
              <div className="newsletter-action">
                <span className="newsletter-icon" aria-hidden="true"><Mail size={30} /></span>
                <NewsletterForm />
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="landing-footer">
        <div className="landing-container grid gap-10 py-12 md:grid-cols-[1fr_auto] md:items-start">
          <div><a href="/" aria-label="Oynk home"><Wordmark /></a><p className="mt-4 max-w-sm text-sm leading-6 text-[#66766f]">Programmable payment and settlement infrastructure for connected, fast-growing economies.</p></div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm sm:grid-cols-3" aria-label="Footer navigation">
            {navigation.map((item) => <a key={item.label} href={item.href} className="footer-link">{item.label}</a>)}
            <a href="https://docs.oynk.io" target="_blank" rel="noopener noreferrer" className="footer-link">Documentation</a>
            <a href="https://x.com/oynk_io" target="_blank" rel="noopener noreferrer" className="footer-link inline-flex items-center gap-2" aria-label="Oynk on X"><Twitter size={15} aria-hidden="true" />X / Twitter</a>
            <a href="https://github.com/oynk-io" target="_blank" rel="noopener noreferrer" className="footer-link inline-flex items-center gap-2" aria-label="Oynk on GitHub"><Github size={15} aria-hidden="true" />GitHub</a>
          </nav>
        </div>
        <div className="border-t border-[#dfe5e1]"><div className="landing-container flex flex-col gap-2 py-5 text-xs text-[#7a8883] sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Oynk. All rights reserved.</span><span>Payments and settlement, connected.</span></div></div>
      </footer>
    </div>
  );
}
