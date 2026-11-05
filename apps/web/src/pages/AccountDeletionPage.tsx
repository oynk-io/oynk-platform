import { ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';

export function AccountDeletionPage() {
  return <main className="account-deletion-page">
    <section className="account-deletion-card">
      <a href="/" className="wordmark"><BrandMark className="wordmark-mark"/><span>Oynk</span></a>
      <div className="account-deletion-icon"><Trash2 size={25}/></div>
      <p className="landing-eyebrow">Account and data</p>
      <h1>Delete your Oynk account</h1>
      <p>Request permanent deletion in the Oynk app from <strong>Account → Settings → Security → Delete account</strong>. Your passkey or protected phone signer confirms that the request came from you.</p>
      <div className="account-deletion-steps">
        <div><Smartphone size={20}/><span><strong>Use the app when possible</strong><small>This is the fastest and safest way to verify ownership.</small></span></div>
        <div><ShieldCheck size={20}/><span><strong>Lost access?</strong><small>Email the privacy team to begin a verified recovery and deletion request.</small></span></div>
      </div>
      <a className="landing-button landing-button-primary account-deletion-action" href="mailto:privacy@oynk.io?subject=Oynk%20account%20deletion%20request">Request help by email</a>
      <p className="account-deletion-note">Oynk deletes account and personal data it is not legally required to retain. Payment, anti-fraud and KYC records may be retained for the period required by applicable law. Assets held on-chain cannot be deleted; withdraw available balances before requesting deletion.</p>
    </section>
  </main>;
}
