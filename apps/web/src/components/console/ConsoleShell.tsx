import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  Braces,
  ChevronLeft,
  LayoutDashboard,
  Menu,
  X,
} from "lucide-react";
import { BrandMark } from "../BrandMark";

type NavItem = { label: string; href: string; icon: LucideIcon };

const navItems: readonly NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Transactions", href: "/dashboard/transactions", icon: Activity },
];

function Navigation({ pathname, collapsed, onNavigate }: { pathname: string; collapsed: boolean; onNavigate?: () => void }) {
  return <nav className="console-nav" aria-label="Console navigation"><section className="console-nav-group"><h2 className={collapsed ? "sr-only" : undefined}>Workspace</h2><div>{navItems.map((item) => {
    const active = item.href === pathname || (item.href !== "/dashboard" && item.href && pathname.startsWith(item.href));
    const Icon = item.icon;
    return <a key={item.label} href={item.href} onClick={onNavigate} className={`console-nav-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined}><Icon size={17} aria-hidden="true" /><span>{item.label}</span></a>;
  })}</div></section></nav>;
}

export function ConsoleShell({ title, description, children, actions }: { title: string; description: string; children: ReactNode; actions?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem("oynk-console-collapsed") === "true");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";
  const environment = import.meta.env.VITE_NETWORK_ENV?.trim() || "Mainnet";

  useEffect(() => { window.localStorage.setItem("oynk-console-collapsed", String(collapsed)); }, [collapsed]);
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("a,button:not(:disabled)")?.focus();
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        window.requestAnimationFrame(() => menuButtonRef.current?.focus());
      }
    }
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", close); };
  }, [drawerOpen]);

  return <div className={`console-shell ${collapsed ? "is-collapsed" : ""}`}>
    <a href="#console-content" className="console-skip-link">Skip to workspace</a>
    <aside className="console-sidebar" aria-label="Oynk workspace">
      <div className="console-brand"><a href="/" aria-label="Oynk home"><BrandMark /><strong>Oynk</strong></a><button type="button" onClick={() => setCollapsed((current) => !current)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}><ChevronLeft size={16} className={collapsed ? "rotate-180" : ""} /></button></div>
      <div className="console-org"><span>ON</span><div><strong>Oynk Network</strong><small>Operations workspace</small></div></div>
      <Navigation pathname={pathname} collapsed={collapsed} />
      <a className="console-docs-link" href="https://docs.oynk.io/docs"><BookOpen size={17} aria-hidden="true" /><span>Documentation</span></a>
    </aside>

    {drawerOpen && <div className="console-drawer-backdrop" onMouseDown={() => setDrawerOpen(false)}><aside ref={drawerRef} className="console-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Mobile console navigation"><div className="console-brand"><a href="/"><BrandMark /><strong>Oynk</strong></a><button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close navigation"><X size={19} /></button></div><div className="console-org"><span>ON</span><div><strong>Oynk Network</strong><small>Operations workspace</small></div></div><Navigation pathname={pathname} collapsed={false} onNavigate={() => setDrawerOpen(false)} /><a className="console-docs-link" href="https://docs.oynk.io/docs"><BookOpen size={17} /><span>Documentation</span></a></aside></div>}

    <div className="console-workspace">
      <header className="console-topbar"><div className="flex items-center gap-3"><button ref={menuButtonRef} type="button" className="console-mobile-menu" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" aria-expanded={drawerOpen}><Menu size={20} /></button><div className="console-breadcrumb"><a href="/dashboard">Oynk</a><span>/</span><strong>{title}</strong></div></div><div className="console-topbar-actions"><span className="console-environment"><i />{environment}</span><a href="https://docs.oynk.io/docs" aria-label="Open Oynk documentation"><Braces size={18} /></a></div></header>
      <main id="console-content" className="console-content"><header className="console-page-header"><div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="console-page-actions">{actions}</div>}</header>{children}</main>
    </div>
  </div>;
}
