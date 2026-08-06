import { lazy, Suspense } from "react";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";

const DashboardPage = lazy(() =>
  import("./App").then((module) => ({ default: module.DashboardPage }))
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

export default function Router() {
  switch (window.location.pathname) {
    case "/":
      document.title = "Oynk — Cross-Border Settlement Infrastructure";
      return <LandingPage />;
    case "/dashboard":
    case "/dashboard/":
      document.title = "Network Activity — Oynk";
      return <Suspense fallback={<DashboardFallback />}><DashboardPage /></Suspense>;
    default:
      document.title = "Page Not Found — Oynk";
      return <NotFoundPage />;
  }
}
