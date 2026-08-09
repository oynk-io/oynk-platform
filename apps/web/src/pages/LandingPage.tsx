import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronRight,
  Eye,
  Globe2,
  Handshake,
  Landmark,
  Layers3,
  KeyRound,
  Menu,
  Network,
  RadioTower,
  Route,
  ShieldCheck,
  Smartphone,
  Store,
  Workflow,
  X,
} from "lucide-react";

const navigation = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Architecture", href: "#architecture" },
  { label: "Network", href: "#network" },
  { label: "Solutions", href: "#solutions" },
  { label: "Experience", href: "#experience" },
  { label: "Activity", href: "/dashboard" },
] as const;

const consoleUrl = import.meta.env.VITE_CONSOLE_SITE_URL ?? "https://console.oynk.io";

function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wordmark-mark" aria-hidden="true">O</span>
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
          <a href={`${consoleUrl}/login`} className="landing-nav-link">Sign in</a>
          <a href={`${consoleUrl}/signup`} className="landing-button landing-button-primary">Get started <ArrowRight size={16} aria-hidden="true" /></a>
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
            <a href={`${consoleUrl}/login`} className="landing-mobile-link" onClick={() => closeNavigation()}>Sign in<ChevronRight size={17} /></a>
            <a href={`${consoleUrl}/signup`} className="landing-button landing-button-primary mt-3 justify-center" onClick={() => closeNavigation()}>Get started <ArrowRight size={16} aria-hidden="true" /></a>
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
        <span className="wordmark-mark" aria-hidden="true">O</span>
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

const solutions = [
  { icon: Building2, title: "Payment platforms", copy: "Expand cross-border capabilities through a common settlement layer rather than a separate system for every route." },
  { icon: Smartphone, title: "Consumer applications", copy: "Add international payment experiences without building every market connection independently." },
  { icon: Store, title: "Businesses and commerce platforms", copy: "Coordinate international value movement with clearer settlement visibility." },
  { icon: Handshake, title: "Settlement and liquidity partners", copy: "Support payment demand through a structured network and programmable coordination workflow." },
] as const;

const benefits = [
  { title: "Provider independence", copy: "The network is designed to support multiple qualified liquidity and settlement providers rather than depend on one source." },
  { title: "Modular expansion", copy: "The model is designed to reduce repeated integration work as eligible providers support additional payment routes." },
  { title: "Programmable coordination", copy: "A common workflow brings payment instructions, provider participation, and completion status together." },
  { title: "Transaction visibility", copy: "Platforms can maintain a clearer view of value movement across participating payment paths." },
] as const;

const architecturePrinciples = [
  {
    icon: KeyRound,
    label: "Authorization",
    title: "Bounded, user-controlled access",
    copy: "Oynk is exploring smart-account authorization with passkeys and limited sessions that can restrict spend, permitted actions, duration, and delegate access.",
  },
  {
    icon: ShieldCheck,
    label: "Settlement controls",
    title: "Explicit rules for value movement",
    copy: "The proposed Stellar and Soroban settlement layer is intended to coordinate requests, provider commitments, deadlines, evidence, claims, refunds, and disputes.",
  },
  {
    icon: RadioTower,
    label: "Low-connectivity access",
    title: "Designed for constrained environments",
    copy: "A proposed one-sided offline model lets a user prepare a tightly limited authorization while an online merchant submits it for network verification.",
  },
] as const;

export function LandingPage() {
  return (
    <div className="landing-page">
      <LandingHeader />
      <main>
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-container grid items-center gap-14 py-20 lg:grid-cols-[1.02fr_.98fr] lg:py-28 xl:gap-20">
            <div>
              <div className="landing-kicker"><Globe2 size={15} aria-hidden="true" /> Cross-border settlement infrastructure</div>
              <h1 id="hero-title" className="landing-hero-title">One network for cross-border settlement.</h1>
              <p className="landing-hero-copy">Oynk connects payment platforms, liquidity providers, and local settlement partners through a programmable, distributed settlement network designed for modular expansion and clearer transaction visibility.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#network" className="landing-button landing-button-primary">Explore the network <ArrowRight size={17} aria-hidden="true" /></a>
                <a href="/dashboard" className="landing-button landing-button-secondary">View on-chain activity</a>
              </div>
              <p className="mt-6 flex items-center gap-2 text-sm text-[#60716b]"><span className="h-1.5 w-1.5 rounded-full bg-[#e8765a]" aria-hidden="true" />Independent of any single exchange, bank, marketplace, or liquidity source.</p>
            </div>
            <NetworkVisual />
          </div>
        </section>

        <section className="border-y border-[#dfe5e1] bg-white" aria-label="Network participants">
          <div className="landing-container py-7">
            <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#74827d]">Designed to connect the participants already moving value across markets</p>
            <div className="grid grid-cols-2 gap-x-5 gap-y-5 text-center text-sm font-medium text-[#42534d] sm:grid-cols-3 lg:grid-cols-6">
              <span>Payment platforms</span><span>Liquidity providers</span><span>OTC desks</span><span>Settlement providers</span><span>Payment partners</span><span>Financial institutions</span>
            </div>
          </div>
        </section>

        <section id="about" className="landing-section scroll-mt-24">
          <div className="landing-container grid gap-12 lg:grid-cols-2 lg:gap-20">
            <SectionHeading eyebrow="The fragmentation problem" title="Every new corridor can become another system to build and operate." copy="Market expansion often brings new local integrations, banking relationships, liquidity arrangements, payout operations, and settlement processes. Existing capacity is spread across independent participants and frequently coordinated one route at a time." />
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
                <p>The model is designed so eligible providers can be added or replaced without rebuilding the full settlement experience.</p>
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

        <section id="architecture" className="landing-section architecture-section scroll-mt-20">
          <div className="landing-container">
            <div className="architecture-heading-grid">
              <SectionHeading eyebrow="Architecture direction" title="Built for controlled settlement—not a closed payment silo." copy="Oynk’s product direction combines user authorization, programmable settlement controls, and qualified provider execution while keeping each responsibility distinct." />
              <div className="architecture-status" role="note">
                <span>Development status</span>
                <p>Smart accounts, Soroban settlement controls, and low-connectivity authorization are proposed capabilities under active design. The public activity dashboard currently indexes supported BSC and Solana transactions.</p>
              </div>
            </div>
            <div className="architecture-principles">
              {architecturePrinciples.map((principle) => <article key={principle.title} className="architecture-card"><span className="architecture-card-icon"><principle.icon size={22} aria-hidden="true" /></span><p className="landing-eyebrow">{principle.label}</p><h3>{principle.title}</h3><p>{principle.copy}</p></article>)}
            </div>
            <p className="architecture-caveat">Phone numbers may support account discovery or recovery, but cryptographic keys—not phone-number possession—authorize payment actions. Low-connectivity operation still requires an online submitting participant and strict replay, expiry, and exposure controls.</p>
          </div>
        </section>

        <section id="solutions" className="landing-section scroll-mt-20">
          <div className="landing-container">
            <SectionHeading eyebrow="Solutions" title="Infrastructure for platforms and network participants." copy="Oynk is designed to support multiple payment experiences, settlement providers, liquidity sources, and destination markets through one coordination layer." />
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {solutions.map((solution) => <article key={solution.title} className="solution-card"><span className="solution-card-icon"><solution.icon size={22} aria-hidden="true" /></span><div><h3>{solution.title}</h3><p>{solution.copy}</p></div></article>)}
            </div>
          </div>
        </section>

        <section id="experience" className="landing-section experience-section scroll-mt-20">
          <div className="landing-container grid items-center gap-12 lg:grid-cols-[.78fr_1.22fr] lg:gap-20">
            <div className="experience-marker">
              <span className="experience-value">$200,000+</span>
              <span className="experience-label">Cross-border activity facilitated by Oynk’s founder since 2022</span>
              <small>Founder-led operating experience; this does not represent Oynk network activity.</small>
            </div>
            <div>
              <SectionHeading eyebrow="Built from operating experience" title="The network is grounded in real settlement challenges." copy="Since 2022, Oynk’s founder has facilitated more than $200,000 in cross-border settlements using digital assets as the settlement mechanism for demand between the United States and Nigeria." />
              <p className="mt-5 max-w-2xl text-[.95rem] leading-7 text-[#60716b]">That hands-on experience exposed recurring challenges around fragmented liquidity, foreign-exchange pricing, manual settlement coordination, payout fulfillment, delays, and transaction visibility. Oynk is being built to turn those operational lessons into repeatable, programmable infrastructure for payment platforms and qualified settlement providers.</p>
            </div>
          </div>
        </section>

        <section id="network" className="landing-section scroll-mt-20 bg-[#f1f4f0]">
          <div className="landing-container grid items-center gap-14 lg:grid-cols-[.9fr_1.1fr] lg:gap-20">
            <div className="network-story" aria-hidden="true">
              <div className="network-story-center"><Network size={27} /><span>Oynk settlement layer</span></div>
              <div className="network-story-item network-story-a"><Building2 size={18} /><span>Payment applications</span></div>
              <div className="network-story-item network-story-b"><Banknote size={18} /><span>Liquidity providers</span></div>
              <div className="network-story-item network-story-c"><Landmark size={18} /><span>Settlement providers</span></div>
              <div className="network-story-item network-story-d"><Route size={18} /><span>Local payment paths</span></div>
            </div>
            <div>
              <SectionHeading eyebrow="Modular corridor expansion" title="Add qualified providers—not another bespoke payment stack." copy="Oynk’s modular model is designed to support new routes by onboarding eligible settlement and liquidity providers through a common layer, rather than rebuilding the complete system for every country pair." />
              <div className="mt-8 space-y-5">
                <div className="network-point"><span>01</span><div><h3>Multiple independent providers</h3><p>The network can include qualified liquidity sources, OTC desks, payment partners, and local settlement providers.</p></div></div>
                <div className="network-point"><span>02</span><div><h3>Replaceable participation</h3><p>The model is designed so changing a liquidity or destination provider does not require redesigning the entire settlement layer.</p></div></div>
                <div className="network-point"><span>03</span><div><h3>Responsible market expansion</h3><p>Each route still depends on provider eligibility, liquidity, banking connectivity, compliance standards, and operational reliability.</p></div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section coordination-section">
          <div className="landing-container">
            <SectionHeading eyebrow="Designed for provider choice" title="Settlement coordination and liquidity sourcing stay separate." copy="Oynk coordinates the payment and settlement journey while independent network participants provide liquidity, local payment capabilities, banking connectivity, and market expertise." align="center" />
            <div className="coordination-grid mt-12">
              <article className="coordination-card coordination-card-oynk">
                <span className="coordination-icon"><Workflow size={22} aria-hidden="true" /></span>
                <p className="landing-eyebrow">Oynk coordinates</p>
                <h3>A common settlement workflow</h3>
                <ul>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Payment instructions</li>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Provider participation</li>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Settlement progress</li>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Transaction visibility</li>
                  <li><CheckCircle2 size={15} aria-hidden="true" />Completion workflow</li>
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
                  <li><CheckCircle2 size={15} aria-hidden="true" />Market expertise</li>
                </ul>
              </article>
            </div>
            <p className="coordination-note">This separation allows the network to support different qualified providers and local capabilities without rebuilding settlement coordination whenever a liquidity source changes.</p>
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-container">
            <div className="activity-feature">
              <div className="activity-copy">
                <p className="landing-eyebrow">Transaction visibility</p>
                <h2 className="landing-section-title">Explore indexed on-chain activity.</h2>
                <p className="landing-section-copy">View the blockchain transactions currently indexed by Oynk’s activity dashboard, including recorded transaction flows and supported chain activity.</p>
                <a href="/dashboard" className="landing-button landing-button-light mt-8">Explore network activity <ArrowRight size={17} aria-hidden="true" /></a>
              </div>
              <div className="activity-visual" aria-hidden="true">
                <div className="activity-visual-top"><span>Recorded activity</span><span className="activity-live-dot">On-chain</span></div>
                <div className="activity-flow"><span className="flow-node">Origin</span><span className="flow-line"><i /></span><span className="flow-node">Destination</span></div>
                <div className="activity-bars">{[32, 48, 41, 68, 53, 76, 61, 84, 70, 91].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
                <div className="activity-legend"><span><i className="bg-[#6ee7b7]" />Inflow</span><span><i className="bg-[#7ea6ff]" />Outflow</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section pt-4">
          <div className="landing-container">
            <SectionHeading eyebrow="Why Oynk" title="A durable layer between payment demand and local capability." copy="Oynk is designed to coordinate multiple providers through one programmable settlement experience—without tying the network to a single marketplace, bank, exchange, or liquidity source." align="center" />
            <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-[#dfe5e1] bg-[#dfe5e1] md:grid-cols-2 lg:grid-cols-4">
              {benefits.map((benefit, index) => <article key={benefit.title} className="benefit-card"><span>0{index + 1}</span><h3>{benefit.title}</h3><p>{benefit.copy}</p></article>)}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6 sm:py-28">
          <div className="final-cta">
            <div><p className="landing-eyebrow">Build the network</p><h2>Help shape the next generation of cross-border settlement.</h2><p>Oynk is designed for payment platforms, qualified liquidity providers, local settlement providers, and infrastructure partners.</p></div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row"><a href="https://docs.oynk.io/docs" className="landing-button landing-button-light">Review the architecture <ArrowRight size={17} aria-hidden="true" /></a><a href="/dashboard" className="landing-button landing-button-ghost-light">View activity</a></div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container grid gap-10 py-12 md:grid-cols-[1fr_auto] md:items-start">
          <div><a href="/" aria-label="Oynk home"><Wordmark /></a><p className="mt-4 max-w-sm text-sm leading-6 text-[#66766f]">Programmable cross-border settlement infrastructure for payment platforms and qualified network participants.</p></div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm sm:grid-cols-3" aria-label="Footer navigation">
            {navigation.map((item) => <a key={item.label} href={item.href} className="footer-link">{item.label}</a>)}
            <a href="https://docs.oynk.io/docs" className="footer-link">Documentation</a>
          </nav>
        </div>
        <div className="border-t border-[#dfe5e1]"><div className="landing-container flex flex-col gap-2 py-5 text-xs text-[#7a8883] sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Oynk. All rights reserved.</span><span>Cross-border settlement, connected.</span></div></div>
      </footer>
    </div>
  );
}
