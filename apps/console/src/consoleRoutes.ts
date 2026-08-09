import type { OrganizationType } from "@oynk/shared";

export type ConsoleRoute = {
  path: string;
  label: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
};

const businessRoutes = [
  ["home", "Home", "Business overview", "Monitor account readiness and payment operations.", "No payment activity yet", "Transactions and settlement activity will appear here after your account is activated and begins processing payments."],
  ["payments", "Payments", "Payments", "Review collections and customer payment activity.", "No payments yet", "Payments created through checkout, payment links, terminals, or the API will appear here."],
  ["payouts", "Payouts", "Payouts", "Track beneficiary and supplier disbursements.", "No payouts yet", "Payout requests and their delivery status will appear here once payout access is enabled."],
  ["cross-border", "Cross-border", "Cross-border transfers", "Review quotes, recipients, and transfer settlement.", "No cross-border transfers yet", "Cross-border transfer activity will appear here when your organization initiates its first supported transfer."],
  ["point-of-sale", "Point of sale", "Point of sale", "Manage terminal applications, locations, and device activity.", "No terminals assigned", "Approved terminal applications and assigned devices will appear here."],
  ["settlements", "Settlements", "Settlements", "Track expected settlements and reconciliation status.", "No settlements yet", "Completed payment batches and their settlement status will appear here."],
  ["team", "Team", "Team and roles", "Manage organization access and responsibilities.", "No additional team members", "Invite colleagues when organization membership management is enabled for your account."],
  ["settings", "Settings", "Organization settings", "Review account, security, and notification preferences.", "No configurable preferences yet", "Organization settings will appear here as capabilities are enabled for your account."],
] as const;

const partnerRoutes = [
  ["home", "Home", "Partner overview", "Monitor approval, capacity, and settlement execution.", "No settlement activity yet", "Qualified settlement activity will appear after your organization is reviewed and activated."],
  ["opportunities", "Opportunities", "Settlement opportunities", "Review eligible liquidity and settlement requests.", "No eligible opportunities", "Requests matching your approved corridors, capabilities, and limits will appear here."],
  ["execution", "Execution", "Settlement execution", "Manage assigned collection, payout, and evidence tasks.", "No active assignments", "Accepted settlement requests and their required execution steps will appear here."],
  ["liquidity", "Liquidity", "Liquidity", "Monitor committed capacity and utilization.", "No liquidity profile available", "Submit and verify your liquidity profile before capacity and utilization can be displayed."],
  ["corridors", "Corridors", "Corridors", "Review requested and approved market coverage.", "No approved corridors", "Corridor applications and approved operating limits will appear here."],
  ["performance", "Performance", "Performance", "Review verified settlement outcomes and service levels.", "No performance history", "Performance indicators require completed settlement assignments."],
  ["organization", "Organization", "Partner organization", "Manage team access and operational account details.", "No organization changes", "Your verified organization profile and membership controls will appear here."],
] as const;

const internalRoutes = [
  ["home", "Home", "Internal operations", "Review protected platform operations and queues.", "No items require attention", "Review queues and operational activity will appear here as records are created."],
  ["applications", "Applications", "Applications", "Review submitted business and partner applications.", "No applications in this queue", "New applications will appear here when they are submitted for review."],
  ["businesses", "Businesses", "Businesses", "Review registered business organizations and account state.", "No businesses found", "Business organizations will appear here after registration."],
  ["partners", "Partners", "Settlement partners", "Review partner organizations, capabilities, and activation.", "No partners found", "Settlement partner applications will appear here after registration."],
  ["payments", "Payments", "Payment operations", "Review payment activity and operational exceptions.", "No payment activity", "Platform payment records will appear here when payment processing is connected."],
  ["settlements", "Settlements", "Settlement operations", "Review settlement lifecycle and exceptions.", "No settlement activity", "Verified settlement requests will appear here when settlement APIs are connected."],
  ["terminals", "Terminals", "Terminal operations", "Review applications, inventory, and device incidents.", "No terminal records", "Terminal applications and managed devices will appear here as they are registered."],
  ["risk-alerts", "Risk alerts", "Risk alerts", "Review operational and compliance signals.", "No open risk alerts", "Risk signals requiring operator review will appear here."],
  ["audit-logs", "Audit logs", "Audit logs", "Review protected account and operator actions.", "No audit events available", "Authorized audit events will appear here as platform actions are recorded."],
  ["indexing", "Indexing", "Blockchain indexing", "Open the existing settlement-indexing operations surface.", "Indexing console is separate", "Use the internal indexing dashboard to review blockchain synchronization and transfer records."],
] as const;

const routeDefinitions: Record<OrganizationType, readonly (readonly [string, string, string, string, string, string])[]> = {
  BUSINESS: businessRoutes,
  SETTLEMENT_PARTNER: partnerRoutes,
  INTERNAL: internalRoutes,
};

const routePrefixes: Record<OrganizationType, string> = {
  BUSINESS: "/business",
  SETTLEMENT_PARTNER: "/partner",
  INTERNAL: "/internal",
};

const verificationRoutes: Partial<Record<OrganizationType, ConsoleRoute>> = {
  BUSINESS: { path: "/business/compliance", label: "Verification", title: "Business verification", description: "Provide the business information required for account review.", emptyTitle: "", emptyDescription: "" },
  SETTLEMENT_PARTNER: { path: "/partner/compliance", label: "Verification", title: "Partner verification", description: "Provide the organization information required for partner review.", emptyTitle: "", emptyDescription: "" },
};

export function getConsoleRoutes(type: OrganizationType): ConsoleRoute[] {
  return routeDefinitions[type].map(([segment, label, title, description, emptyTitle, emptyDescription]) => ({
    path: `${routePrefixes[type]}/${segment}`,
    label,
    title,
    description,
    emptyTitle,
    emptyDescription,
  }));
}

export function getConsoleRoute(type: OrganizationType, path: string): ConsoleRoute | null {
  return getConsoleRoutes(type).find((route) => route.path === path) ?? (verificationRoutes[type]?.path === path ? verificationRoutes[type] ?? null : null);
}
