import { useEffect, useRef, useState } from 'react';
import type { OrganizationSummary } from '@oynk/shared';
import { ArrowRight, Banknote, Building2, CheckCircle2, ClipboardList, LoaderCircle, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { api, ApiError, type BusinessRegistry, type RegisteredBusiness } from '../api';
import { businessStates } from './businessLabels';

function BusinessRow({ business, onNavigate }: { business: RegisteredBusiness; onNavigate: (path: string) => void }) {
  const href = `/internal/businesses/${business.slug || business.id}`;
  return <>
    <tr>
      <td><div className="business-directory-name"><span><Building2 size={18}/></span><div><strong>{business.legalName}</strong><small>{business.industry || 'Business'}{business.registrationCountry ? ` · ${business.registrationCountry}` : ''}</small></div></div></td>
      <td><span className={`control-state state-${business.status.toLowerCase().replaceAll('_', '-')}`}>{businessStates[business.status] ?? business.status}</span></td>
      <td><div className="business-directory-readiness"><span className={business.vfdAccountNumber ? 'ready' : ''}><Banknote size={14}/>{business.vfdAccountNumber ? 'Naira ready' : 'Naira not set'}</span><span className={business.smartAccountAddress && business.cryptoUsdcReady ? 'ready' : ''}><ShieldCheck size={14}/>{business.smartAccountAddress && business.cryptoUsdcReady ? 'USDC ready' : business.smartAccountAddress ? 'USDC setup' : 'USDC not set'}</span></div></td>
      <td><span className="business-directory-mode">{business.platformMode}</span></td>
      <td><time dateTime={business.createdAt}>{new Date(business.createdAt).toLocaleDateString()}</time></td>
      <td><a className="business-directory-view" href={href} aria-label={`View ${business.legalName}`} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onNavigate(href); } }}>View business<ArrowRight size={15}/></a></td>
    </tr>
  </>;
}

export function BusinessRegistryPage({ organization, onNavigate }: { organization: OrganizationSummary; onNavigate: (path: string) => void }) {
  const [data, setData] = useState<BusinessRegistry | null>(null);
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  const [status, setStatus] = useState(''), [mode, setMode] = useState('');
  const [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true); setLoadingMore(false); setError(''); setData(null);
    void api.registeredBusinesses({ q: query, status, mode }).then(result => {
      if (requestId.current === id) setData(result);
    }).catch(cause => {
      if (requestId.current === id) setError(cause instanceof ApiError ? cause.message : 'We couldn’t load businesses. Try again.');
    }).finally(() => { if (requestId.current === id) setLoading(false); });
    return () => { requestId.current++; };
  }, [query, status, mode, refresh]);

  async function loadMore() {
    if (data?.nextOffset == null || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true); setError('');
    try {
      const next = await api.registeredBusinesses({ q: query, status, mode, offset: data.nextOffset });
      if (requestId.current === id) setData(current => {
        if (!current) return next;
        const seen = new Set(current.businesses.map(business => business.id));
        return { ...next, businesses: [...current.businesses, ...next.businesses.filter(business => !seen.has(business.id))] };
      });
    } catch (cause) {
      if (requestId.current === id) setError(cause instanceof ApiError ? cause.message : 'We couldn’t load more businesses. Try again.');
    } finally { if (requestId.current === id) setLoadingMore(false); }
  }

  const summary = data?.summary;
  return <div className="control-page business-directory-page">
    <div className="control-hero"><div><p className="eyebrow">Business registry</p><h1>Businesses</h1><p>Every registered business, from first sign-up to active operations.</p></div><div className="business-directory-actions">{organization.permissions.includes('applications:approve') ? <a className="secondary" href="/internal/applications"><ClipboardList size={16}/>Review applications</a> : null}<button className="control-refresh" aria-label="Refresh businesses" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw/></button></div></div>
    <section className="control-metrics" aria-label="All registered businesses">
      <article><span><Building2/>Registered businesses</span><strong>{summary?.total ?? '—'}</strong><small>Across all environments</small></article>
      <article><span><CheckCircle2/>Active</span><strong>{summary?.active ?? '—'}</strong><small>Approved and activated</small></article>
      <article><span><ClipboardList/>In review</span><strong>{summary?.awaitingReview ?? '—'}</strong><small>Submitted or awaiting information</small></article>
      <article><span><Banknote/>Needs account setup</span><strong>{summary?.needsAccountSetup ?? '—'}</strong><small>Approved, with accounts still pending</small></article>
    </section>
    <form className="control-filters" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); }}>
      <label><Search/><input aria-label="Search businesses" placeholder="Business name, registration or account number" value={search} maxLength={120} onChange={event => setSearch(event.target.value)}/></label>
      <label><select aria-label="Business status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{Object.entries(businessStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><select aria-label="Business environment" value={mode} onChange={event => setMode(event.target.value)}><option value="">All environments</option><option value="SANDBOX">Sandbox</option><option value="TEST">Test</option><option value="LIVE">Live</option></select></label>
    </form>
    {error ? <div className="control-failure" role="alert"><div><strong>Businesses unavailable</strong><p>{error}</p></div><button onClick={() => setRefresh(value => value + 1)}>Try again</button></div> : null}
    <section className="control-panel">
      <header><div><h2>Business directory</h2><p>{data ? `${data.total} ${data.total === 1 ? 'business' : 'businesses'}${query || status || mode ? ' matching your filters' : ' registered'}` : 'Registration, review and account readiness'}</p></div></header>
      {loading ? <div className="control-loading" role="status"><LoaderCircle/>Loading businesses…</div> : data?.businesses.length ? <div className="business-directory-table-wrap"><table className="business-directory-table"><thead><tr><th scope="col">Business</th><th scope="col">Status</th><th scope="col">Accounts</th><th scope="col">Environment</th><th scope="col">Registered</th><th scope="col"><span className="business-directory-sr-only">Details</span></th></tr></thead><tbody>{data.businesses.map(business => <BusinessRow key={business.id} business={business} onNavigate={onNavigate}/>)}</tbody></table></div> : !error ? <div className="control-empty"><Building2/><h3>{query || status || mode ? 'No businesses match these filters' : 'No businesses registered yet'}</h3><p>{query || status || mode ? 'Try another name, status or environment.' : 'New business registrations will appear here automatically.'}</p></div> : null}
      {data?.businesses.length ? <footer className="business-directory-pagination"><span>Showing {data.businesses.length} of {data.total}</span>{data.nextOffset !== null ? <button className="secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : 'Show more businesses'}</button> : null}</footer> : null}
    </section>
  </div>;
}
