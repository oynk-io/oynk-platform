import type { OrganizationSummary } from "@oynk/shared";
import { ArrowUpRight, CheckCircle2, Inbox, ShieldCheck } from "lucide-react";
import type { ConsoleRoute } from "../consoleRoutes";

export function ConsoleSection({ organization, route }: { organization: OrganizationSummary; route: ConsoleRoute }) {
  const isHome = route.path.endsWith("/home");
  const isIndexing = route.path === "/internal/indexing";

  return <>
    <div className="page-heading console-section-heading"><div><p className="eyebrow">{organization.type === "INTERNAL" ? "Platform operations" : "Organization workspace"}</p><h1>{route.title}</h1><p>{route.description}</p></div>{isIndexing ? <a className="section-primary-action" href="/dashboard">Open indexing dashboard <ArrowUpRight /></a> : null}</div>
    {isHome ? <section className="account-summary" aria-label="Account summary"><div><span>Environment</span><strong>{organization.platformMode}</strong><small>Controlled by your account activation state</small></div><div><span>Account status</span><strong>{organization.status.replaceAll("_", " ")}</strong><small>Current organization review state</small></div><div><span>Access</span><strong>{organization.role.replaceAll("_", " ")}</strong><small>Permissions are enforced by the API</small></div></section> : null}
    <section className="records-panel" aria-labelledby="records-title">
      <header className="records-toolbar"><div><h2 id="records-title">{isHome ? "Recent activity" : route.title}</h2><p>{isHome ? "Latest verified records for this organization." : "Records are scoped to the active organization and environment."}</p></div></header>
      <div className="production-empty-state"><span className="empty-state-icon"><Inbox /></span><div><h3>{route.emptyTitle}</h3><p>{route.emptyDescription}</p></div>{organization.status !== "ACTIVE" && organization.type !== "INTERNAL" ? <span className="empty-state-note"><ShieldCheck /> Live operations require account approval and activation.</span> : <span className="empty-state-note"><CheckCircle2 /> This view is ready for verified records.</span>}</div>
    </section>
  </>;
}
