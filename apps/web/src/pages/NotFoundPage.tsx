import { ArrowLeft } from "lucide-react";
import { BrandMark } from "../components/BrandMark";

export function NotFoundPage() {
  return (
    <main className="landing-page grid min-h-screen place-items-center px-6 text-center">
      <div className="max-w-lg">
        <a href="/" className="wordmark justify-center" aria-label="Oynk home">
          <BrandMark className="wordmark-mark" />
          <span>Oynk</span>
        </a>
        <p className="mt-12 text-sm font-semibold uppercase tracking-[0.2em] text-[#17735b]">Page not found</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#10231d] sm:text-5xl">This path doesn’t lead anywhere.</h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-7 text-[#52635d]">Return to Oynk to learn about the network, or view recorded on-chain activity.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a href="/" className="landing-button landing-button-primary"><ArrowLeft size={17} aria-hidden="true" />Back to Oynk</a>
          <a href="/dashboard" className="landing-button landing-button-secondary">View activity</a>
        </div>
      </div>
    </main>
  );
}
