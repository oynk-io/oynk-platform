import { DashboardPage } from "./App";
import { TransactionsPage } from "./pages/TransactionsPage";

function updateMetadata(title: string, description: string) {
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
}

export function Router() {
  switch (window.location.pathname) {
    case "/":
      updateMetadata("Network Activity — Oynk", "Explore settlement activity indexed by Oynk.");
      return <DashboardPage />;
    case "/transactions":
    case "/transactions/":
      updateMetadata("Transactions — Oynk", "Search and verify transactions indexed by Oynk.");
      return <TransactionsPage />;
    default:
      updateMetadata("Page Not Found — Oynk", "The requested activity page could not be found.");
      return <main className="grid min-h-screen place-items-center px-6 text-center"><div><h1 className="text-3xl font-semibold">Page not found</h1><a className="secondary-button mt-6 inline-block rounded-lg px-4 py-2" href="/">Return to activity</a></div></main>;
  }
}
