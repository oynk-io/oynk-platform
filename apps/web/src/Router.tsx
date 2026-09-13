import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";

function updateMetadata(title: string, description: string, themeColor: string) {
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
}

export default function Router() {
  switch (window.location.pathname) {
    case "/":
      updateMetadata(
        "Oynk — Payment Infrastructure & Consumer Smart Accounts",
        "Oynk connects payment platforms, liquidity and settlement providers for cross-border payments, alongside a consumer smart-account app.",
        "#f7f8f2"
      );
      return <LandingPage />;
    case "/dashboard":
    case "/dashboard/":
      window.location.replace(`${import.meta.env.VITE_TRANSACTIONS_SITE_URL ?? "https://transactions.oynk.io"}/`);
      return null;
    case "/dashboard/transactions":
    case "/dashboard/transactions/":
      window.location.replace(`${import.meta.env.VITE_TRANSACTIONS_SITE_URL ?? "https://transactions.oynk.io"}/transactions`);
      return null;
    default:
      updateMetadata(
        "Page Not Found — Oynk",
        "The requested Oynk page could not be found.",
        "#f7f8f2"
      );
      return <NotFoundPage />;
  }
}
