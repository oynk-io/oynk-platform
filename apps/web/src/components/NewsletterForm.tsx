import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export function NewsletterForm() {
  const [status,setStatus]=useState<'idle'|'sending'|'success'|'error'>('idle');
  const [message,setMessage]=useState('');
  const busy=useRef(false);
  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy.current)return;
    busy.current=true;
    const data=new FormData(event.currentTarget);
    setStatus('sending');setMessage('');
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const base=(import.meta.env.VITE_API_URL ?? '').replace(/\/$/,'');
      const response=await fetch(`${base}/api/newsletter/subscribe`,{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({email:data.get('email'),consent:data.get('consent')==='on',website:data.get('website')})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || 'Unable to subscribe right now. Please try again.');
      setStatus('success');setMessage('Thanks for joining. New subscribers will receive a confirmation email shortly.');
    } catch(error) {
      setStatus('error');setMessage(error instanceof Error && error.name!=='AbortError' && error.message!=='Failed to fetch' ? error.message : 'We couldn’t confirm your signup. Please try again; you won’t be added twice.');
    } finally {clearTimeout(timeout);busy.current=false;}
  }
  if(status==='success')return <div className="newsletter-success" role="status"><CheckCircle2 size={24} aria-hidden="true" /><p>{message}</p></div>;
  return <form className="newsletter-form" onSubmit={subscribe} aria-busy={status==='sending'}>
    <label htmlFor="newsletter-email">Email address</label>
    <div className="newsletter-input-row"><input id="newsletter-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required readOnly={status==='sending'} aria-describedby={status==='error'?'newsletter-error':undefined} /><button type="submit" disabled={status==='sending'} className="landing-button landing-button-light">{status==='sending'?'Joining…':'Join newsletter'}<ArrowRight size={16} aria-hidden="true" /></button></div>
    <div className="newsletter-honeypot" aria-hidden="true"><label htmlFor="newsletter-website">Website</label><input id="newsletter-website" name="website" tabIndex={-1} autoComplete="off" /></div>
    <label className="newsletter-consent"><input name="consent" type="checkbox" required disabled={status==='sending'} /><span>Email me Oynk product news and updates. I can unsubscribe at any time.</span></label>
    {status==='error'&&<p id="newsletter-error" className="newsletter-error" role="alert">{message}</p>}
  </form>;
}
