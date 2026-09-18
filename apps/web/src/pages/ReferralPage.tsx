import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, ShieldCheck, UsersRound } from "lucide-react";
import { BrandMark } from "../components/BrandMark";

type State = "loading" | "valid" | "invalid" | "unavailable";

export function ReferralPage({ code }: { code: string }) {
  const [state, setState] = useState<State>("loading");
  const [copied, setCopied] = useState(false);
  const api = import.meta.env.VITE_API_URL ?? "https://api.oynk.io";

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${api.replace(/\/$/, "")}/api/consumer/referrals/resolve/${code}`, {
      headers: { Accept: "application/json" }, signal: controller.signal, credentials: "omit",
    }).then(response => {
      if (response.ok) setState("valid");
      else if (response.status === 404) setState("invalid");
      else setState("unavailable");
    }).catch(error => { if (error?.name !== "AbortError") setState("unavailable"); });
    return () => controller.abort();
  }, [api, code]);

  async function copyCode() {
    try { await navigator.clipboard.writeText(`https://oynk.io/${code}`); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  }

  if (state === "invalid") return <ReferralUnavailable title="This invite has expired." copy="Ask the person who invited you for a new Oynk link." />;
  if (state === "unavailable") return <ReferralUnavailable title="We couldn’t check this invite." copy="Please refresh the page or try the link again shortly." retry />;

  return <main className="referral-page">
    <div className="referral-shell">
      <a href="/" className="wordmark justify-center" aria-label="Oynk home"><BrandMark className="wordmark-mark" /><span>Oynk</span></a>
      <section className="referral-card" aria-busy={state === "loading"}>
        <div className="referral-icon"><UsersRound size={27} aria-hidden="true" /></div>
        <p className="landing-eyebrow">A PERSONAL INVITE</p>
        <h1>{state === "loading" ? "Checking your invite…" : "You’ve been invited to Oynk."}</h1>
        <p>{state === "loading" ? "This will only take a moment." : "Build your USDC balance, contribute to the Oynk Pool and access benefits as the network grows."}</p>
        {state === "valid" && <>
          <div className="referral-code"><span><small>Invite code</small><strong>{code}</strong></span><button type="button" onClick={() => void copyCode()} aria-label="Copy invite link">{copied ? <Check size={19} /> : <Copy size={19} />}</button></div>
          <a className="landing-button landing-button-primary referral-primary" href={`oynk://referral?code=${code}`}>Open Oynk <ExternalLink size={17} aria-hidden="true" /></a>
          <p className="referral-note"><ShieldCheck size={15} aria-hidden="true" />Your invitation is connected after you verify your phone and secure your smart account.</p>
        </>}
      </section>
      <p className="referral-footer">Only use Oynk links from oynk.io.</p>
    </div>
  </main>;
}

function ReferralUnavailable({ title, copy, retry = false }: { title: string; copy: string; retry?: boolean }) {
  return <main className="referral-page"><div className="referral-shell"><a href="/" className="wordmark justify-center"><BrandMark className="wordmark-mark" /><span>Oynk</span></a><section className="referral-card"><div className="referral-icon"><ShieldCheck size={27} /></div><h1>{title}</h1><p>{copy}</p><div className="referral-actions">{retry && <button type="button" className="landing-button landing-button-primary" onClick={() => window.location.reload()}>Try again</button>}<a className="landing-button landing-button-secondary" href="/">Visit Oynk</a></div></section></div></main>;
}

