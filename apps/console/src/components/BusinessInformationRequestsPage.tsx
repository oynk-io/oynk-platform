import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, LoaderCircle, MessageSquare, RefreshCw } from 'lucide-react';
import { api, ApiError, type BusinessInformationRequest } from '../api';
import { businessDate } from './businessLabels';
import { useToast } from './Toast';

export function BusinessInformationNotice({ organizationId, onNavigate }: { organizationId: string; onNavigate: (path: string) => void }) {
  const [count, setCount] = useState(0), [failed, setFailed] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    let mounted = true;
    function load() {
      const request = ++generation.current;
      void api.businessInformationRequests().then(result => { if (mounted && request === generation.current) { setCount(result.requests.filter(item => item.state === 'OPEN').length); setFailed(false); } }).catch(() => { if (mounted && request === generation.current) setFailed(true); });
    }
    load(); window.addEventListener('focus', load); window.addEventListener('oynk-business-information-changed', load);
    return () => { mounted = false; window.removeEventListener('focus', load); window.removeEventListener('oynk-business-information-changed', load); };
  }, [organizationId]);
  if (!count && !failed) return null;
  return <div className="banner attention"><MessageSquare/><div><strong>{failed ? 'Business updates could not be loaded' : `${count === 1 ? 'Oynk needs some information' : `${count} information requests need a response`}`}</strong><p>{failed ? 'Open your information requests to check for updates.' : 'Review the request and send a response in Console.'}</p></div><a href="/business/information-requests" onClick={event => { event.preventDefault(); onNavigate('/business/information-requests'); }}>View requests</a></div>;
}

function ResponseCard({ request, onChanged }: { request: BusinessInformationRequest; onChanged: () => void }) {
  const [response, setResponse] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const toast = useToast();
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || response.trim().length < 3) return;
    setBusy(true); setError('');
    try { await api.respondBusinessInformation(request.id, response.trim()); toast.success('Your response has been sent.'); onChanged(); window.dispatchEvent(new Event('oynk-business-information-changed')); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'We couldn’t send your response. Try again.'); }
    finally { setBusy(false); }
  }
  return <article className="business-information-card"><div className="business-information-heading"><span className={`control-state state-${request.state.toLowerCase()}`}>{request.state === 'OPEN' ? 'Response needed' : request.state === 'RESPONDED' ? 'Response sent' : 'Closed'}</span><time dateTime={request.createdAt}>{businessDate(request.createdAt)}</time></div><p className="business-information-note">{request.note}</p>
    {request.response ? <div className="business-information-response"><h3>Your response</h3><p>{request.response}</p></div> : null}
    {request.resolutionNote ? <div className="business-information-response"><h3>Review note</h3><p>{request.resolutionNote}</p></div> : null}
    {request.state === 'OPEN' ? <form onSubmit={event => void submit(event)}><label><span>Your response</span><textarea required minLength={3} maxLength={4000} rows={4} disabled={busy} value={response} onChange={event => { setResponse(event.target.value); setError(''); }} placeholder="Provide the information requested above"/></label>{error ? <div className="error" role="alert">{error}</div> : null}<button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send response'}</button></form> : null}
  </article>;
}

export function BusinessInformationRequestsPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [requests, setRequests] = useState<BusinessInformationRequest[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true; setLoading(true); setError('');
    void api.businessInformationRequests().then(result => { if (current) setRequests(result.requests); }).catch(cause => { if (current) setError(cause instanceof ApiError ? cause.message : 'We couldn’t load your requests. Try again.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [refresh]);
  return <div className="control-page business-information-page"><a className="business-detail-back" href="/business/home" onClick={event => { event.preventDefault(); onNavigate('/business/home'); }}><ArrowLeft size={16}/>Business home</a><div className="control-hero"><div><p className="eyebrow">Business updates</p><h1>Information requests</h1><p>Review what Oynk needs and send your response.</p></div><button className="control-refresh" aria-label="Refresh requests" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={18}/></button></div>
    {error ? <div className="control-failure" role="alert"><div><strong>Requests unavailable</strong><p>{error}</p></div><button onClick={() => setRefresh(value => value + 1)}>Try again</button></div> : null}
    <section className="control-panel">{loading ? <div className="control-loading" role="status"><LoaderCircle/>Loading requests…</div> : requests.length ? requests.map(request => <ResponseCard key={request.id} request={request} onChanged={() => setRefresh(value => value + 1)}/>) : !error ? <div className="control-empty"><CheckCircle2/><h3>Nothing needs a response</h3><p>Information requests from Oynk will appear here.</p></div> : null}</section>
  </div>;
}
