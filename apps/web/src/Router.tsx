import { lazy, Suspense } from "react";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";

const DashboardPage = lazy(() =>
  import("./App").then((module) => ({ default: module.DashboardPage }))
);
const TransactionsPage = lazy(() =>
  import("./pages/TransactionsPage").then((module) => ({ default: module.TransactionsPage }))
);

function DashboardFallback() {
  return (
    <main className="dashboard-page grid min-h-screen place-items-center bg-[#07110e] px-6 text-center" role="status">
      <div>
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-emerald-300 font-black text-[#07110e]">O</span>
        <p className="mt-4 text-sm text-slate-400">Loading network activity…</p>
      </div>
    </main>
  );
}

function updateMetadata(title: string, description: string, themeColor: string) {
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
}

export default function Router() {
  switch (window.location.pathname) {
    case "/":
      updateMetadata(
        "Oynk — Payment Infrastructure for Connected Economies",
        "Oynk is a programmable payment and settlement platform designed for fast-growing economies, connecting payment platforms, qualified liquidity providers, and local partners.",
        "#fafbf8"
      );
      return <LandingPage />;
    case "/dashboard":
    case "/dashboard/":
      updateMetadata(
        "Indexed On-Chain Activity — Oynk",
        "Explore BSC and Solana transactions currently indexed by Oynk, including inflows, outflows, tracked wallets, and explorer records.",
        "#07110e"
      );
      return <Suspense fallback={<DashboardFallback />}><DashboardPage /></Suspense>;
    case "/dashboard/transactions":
    case "/dashboard/transactions/":
      updateMetadata(
        "Transactions — Oynk",
        "Search and verify BSC and Solana transactions indexed across Oynk settlement wallets.",
        "#0b0f0e"
      );
      return <Suspense fallback={<DashboardFallback />}><TransactionsPage /></Suspense>;
    default:
      updateMetadata(
        "Page Not Found — Oynk",
        "The requested Oynk page could not be found.",
        "#fafbf8"
      );
      return <NotFoundPage />;
  }
}
