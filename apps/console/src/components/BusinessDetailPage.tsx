import { useEffect, useState, type ReactNode } from 'react';
import type { OrganizationSummary } from '@oynk/shared';
import { ArrowLeft, Banknote, Building2, CheckCircle2, ClipboardList, Clock3, History, LoaderCircle, Mail, MapPin, MessageSquare, Phone, Play, Power, RefreshCw, ShieldCheck, UserRound, WalletCards } from 'lucide-react';
import { api, ApiError, type BusinessDetail } from '../api';
import { businessDate, businessSetupStates, businessStates } from './businessLabels';
import { BusinessActionDialog, type BusinessAction } from './BusinessActionDialog';
import { useToast } from './Toast';

function Info({ label, children, wide }: { label: string; children?: ReactNode; wide?: boolean }) {
  return <div className={wide ? 'wide' : undefined}><dt>{label}</dt><dd>{children || 'Not provided'}</dd></div>;
}

export function BusinessDetailPage({ id, organization, onNavigate }: { id: string; organization: OrganizationSummary; onNavigate: (path: string) => void }) {
  const [data, setData] = useState<BusinessDetail | null>(null);
  const [section, setSection] = useState<'overview' | 'accounts' | 'history' | 'information'>('overview');
  const [action, setAction] = useState<{ type: BusinessAction; requestId?: string } | null>(null);
  const toast = useToast();
  const [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(''); setNotFound(false); setData(null);
    void api.registeredBusiness(id).then(result => {
      if (!current) return;
      setData(result);
      if (result.business.slug) {
        const canonical = `/internal/businesses/${result.business.slug}`;
        if (location.pathname !== canonical) history.replaceState(history.state, '', canonical);
      }
    }).catch(cause => {
      if (!current) return;
      setNotFound(cause instanceof ApiError && cause.status === 404);
      setError(cause instanceof ApiError ? cause.message : 'We couldn’t load this business. Try again.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [id, refresh]);

  const business = data?.business;
  const informationRequests = data?.informationRequests ?? [];
  const canManage = organization.permissions.includes('accounts:activate');
  const canReview = organization.permissions.includes('compliance:review');
  const canSuspend = organization.permissions.includes('accounts:suspend');
  const reviewPending = business && ['COMPLIANCE_SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(business.status);
  const tabs = [{ id: 'overview', label: 'Overview', icon: Building2 }, { id: 'accounts', label: 'Accounts', icon: WalletCards }, { id: 'information', label: 'Requests', icon: MessageSquare }, { id: 'history', label: 'History', icon: History }] as const;
  const address = business ? [business.addressLine1, business.addressLine2, business.city, business.region, business.postalCode, business.addressCountry].filter(Boolean).join(', ') : '';
  async function completeAction(note: string, requestId: string) {
    if (!action || !business) return;
    if (action.type === 'deactivate' || action.type === 'reactivate') await api.changeBusinessActivation(business.id, action.type, note);
    else if (action.type === 'activate') await api.activateBusiness(business.id, note);
    else if (action.type === 'approve' || action.type === 'reject') await api.decideBusinessApplication(business.id, action.type, note);
    else if (action.type === 'request-information') { await api.requestBusinessInformation(business.id, requestId, note); setSection('information'); }
    else if (action.requestId) await api.resolveBusinessInformation(business.id, action.requestId, note);
    else throw new Error('Choose an information request.');
    const messages: Record<BusinessAction, string> = { activate: 'Business activated.', deactivate: 'Business deactivated.', reactivate: 'Business reactivated.', approve: 'Application approved.', reject: 'Application rejected.', 'request-information': 'Information request sent.', 'resolve-information': 'Information request closed.' };
    toast.success(messages[action.type]); setAction(null); setRefresh(value => value + 1);
  }
  return <div className="control-page business-detail-page">
    <a className="business-detail-back" href="/internal/businesses" onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onNavigate('/internal/businesses'); } }}><ArrowLeft size={16}/>All businesses</a>
    <div className="control-hero business-detail-hero"><div className="business-detail-heading"><span className="business-detail-mark"><Building2 size={25}/></span><div><p className="eyebrow">Business profile</p><h1>{business?.legalName ?? 'Business details'}</h1><div className="business-detail-subtitle">{business ? <><span>{business.industry || 'Business'}{business.registrationCountry ? ` · ${business.registrationCountry}` : ''}</span><span className={`control-state state-${business.status.toLowerCase().replaceAll('_', '-')}`}>{businessStates[business.status] ?? business.status}</span><span className="business-directory-mode">{business.platformMode}</span></> : <span>Registration and account information</span>}</div></div></div><div className="business-directory-actions">{business && canReview && business.status !== 'CLOSED' ? <button className="business-detail-action" onClick={() => setAction({ type: 'request-information' })}><MessageSquare size={15}/>Request information</button> : null}{business && canSuspend && business.status === 'ACTIVE' ? <button className="business-detail-action danger" onClick={() => setAction({ type: 'deactivate' })}><Power size={15}/>Deactivate</button> : business && canManage && business.status === 'SUSPENDED' && business.activatedAt ? <button className="business-detail-action" onClick={() => setAction({ type: 'reactivate' })}><Play size={15}/>Reactivate</button> : business && canManage && business.status === 'APPROVED' && business.provisioningState === 'READY' ? <button className="business-detail-action" onClick={() => setAction({ type: 'activate' })}><Play size={15}/>Activate business</button> : null}<button className="control-refresh" aria-label="Refresh business" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={18}/></button></div></div>
    {loading ? <section className="control-panel"><div className="control-loading" role="status"><LoaderCircle/>Loading business…</div></section> : error ? <section className="control-failure" role="alert"><div><strong>{notFound ? 'Business not found' : 'Business unavailable'}</strong><p>{error}</p></div>{!notFound ? <button onClick={() => setRefresh(value => value + 1)}>Try again</button> : null}</section> : business && data ? <>
      <nav className="business-detail-tabs" aria-label="Business sections">{tabs.map(tab => <button key={tab.id} aria-current={section === tab.id ? 'page' : undefined} onClick={() => setSection(tab.id)}><tab.icon size={16}/>{tab.label}{tab.id === 'information' && informationRequests.some(request => request.state !== 'RESOLVED') ? <span className="business-detail-tab-count">{informationRequests.filter(request => request.state !== 'RESOLVED').length}</span> : null}</button>)}</nav>
      {section === 'overview' ? <div className="business-detail-grid">
        {reviewPending ? <section className="control-panel business-detail-review"><div><h2>Application ready for review</h2><p>Check the business information and accounts before deciding.</p></div><div>{organization.permissions.includes('applications:approve') ? <button className="business-detail-action" onClick={() => setAction({ type: 'approve' })}><CheckCircle2 size={15}/>Approve application</button> : null}{organization.permissions.includes('applications:reject') ? <button className="business-detail-action danger" onClick={() => setAction({ type: 'reject' })}>Reject application</button> : null}</div></section> : null}
        <section className="control-panel"><header><div><h2>Business information</h2><p>Registered details and current review status</p></div></header><div className="business-detail-body"><dl className="business-detail-fields">
          <Info label="Legal name">{business.legalName}</Info><Info label="Trading name">{business.tradingName || business.legalName}</Info>
          <Info label="Business type">{business.businessType}</Info><Info label="Registration number">{business.registrationNumber}</Info>
          <Info label="Incorporation date">{business.incorporationDate ? businessDate(business.incorporationDate) : null}</Info><Info label="Industry">{business.industry}</Info>
          <Info label="Registration country">{business.registrationCountry}</Info><Info label="Operating country">{business.operatingCountry}</Info>
          <Info label="Website">{business.website}</Info><Info label="Registered on">{businessDate(business.createdAt)}</Info>
        </dl>{business.description ? <div className="business-detail-text"><h3>About this business</h3><p>{business.description}</p></div> : null}<div className="business-detail-text"><h3><MapPin size={15}/>Business address</h3><p>{address || 'The business has not provided an address yet.'}</p></div></div></section>
        <div className="business-detail-side"><section className="control-panel"><header><div><h2>Account readiness</h2><p>Banking and USDC settlement</p></div></header><div className="business-detail-readiness"><div><Banknote size={19}/><span><strong>Naira account</strong><small>{business.vfdAccountNumber ? 'Account created' : 'Not configured'}</small></span>{business.vfdAccountNumber ? <CheckCircle2 size={17}/> : <Clock3 size={17}/>}</div><div><ShieldCheck size={19}/><span><strong>USDC account</strong><small>{business.smartAccountAddress && business.cryptoUsdcReady ? 'Verified and ready' : business.smartAccountAddress ? 'USDC setup pending' : 'Not linked'}</small></span>{business.smartAccountAddress && business.cryptoUsdcReady ? <CheckCircle2 size={17}/> : <Clock3 size={17}/>}</div><p>{businessSetupStates[business.provisioningState ?? ''] || 'Account setup not started'}</p><button onClick={() => setSection('accounts')}>View accounts</button></div></section>
          <section className="control-panel"><header><div><h2>Business owners</h2><p>Current owner contacts</p></div></header><div className="business-detail-owners">{data.owners.length ? data.owners.map(owner => <article key={owner.id}><div><UserRound size={17}/><strong>{owner.name}</strong></div><a href={`mailto:${owner.email}`}><Mail size={14}/>{owner.email}</a>{owner.phone ? <a href={`tel:${owner.phone}`}><Phone size={14}/>{owner.phone}</a> : null}</article>) : <p>No active owner contact is recorded.</p>}</div></section>
        </div>
      </div> : section === 'accounts' ? <div className="business-detail-account-grid">
        <section className="control-panel"><header><div className="business-detail-section-title"><Banknote size={20}/><div><h2>Naira account</h2><p>{business.vfdAccountNumber ? 'Dedicated VFD business account' : 'Account setup pending'}</p></div></div></header><div className="business-detail-body"><dl className="business-detail-fields"><Info label="Account number">{business.vfdAccountNumber}</Info><Info label="Account name">{business.vfdAccountName}</Info><Info label="Setup status">{businessSetupStates[business.provisioningState ?? ''] || 'Not started'}</Info></dl></div></section>
        <section className="control-panel"><header><div className="business-detail-section-title"><ShieldCheck size={20}/><div><h2>USDC settlement account</h2><p>{business.cryptoUsdcReady ? 'USDC enabled' : 'USDC not enabled yet'}</p></div></div></header><div className="business-detail-body"><dl className="business-detail-fields"><Info label="Account address" wide><span className="business-detail-address">{business.smartAccountAddress || 'Not linked'}</span></Info><Info label="Network">{business.smartAccountNetwork}</Info><Info label="Account type">{business.cryptoAccountKind === 'SOCKETFI_SMART_ACCOUNT' ? 'SocketFi smart account' : business.cryptoAccountKind === 'STELLAR_ACCOUNT' ? 'Stellar account' : null}</Info><Info label="Ownership verified">{business.cryptoVerifiedAt ? businessDate(business.cryptoVerifiedAt) : null}</Info></dl></div></section>
        <section className="control-panel"><header><div className="business-detail-section-title"><WalletCards size={20}/><div><h2>External settlement destination</h2><p>Optional bank destination</p></div></div></header><div className="business-detail-body">{business.externalAccountNumber ? <dl className="business-detail-fields"><Info label="Account number">{business.externalAccountNumber}</Info><Info label="Account name">{business.externalAccountName}</Info><Info label="Bank code">{business.externalBankCode}</Info></dl> : <p className="business-detail-muted">No external bank destination has been configured.</p>}</div></section>
      </div> : section === 'information' ? <section className="control-panel"><header><div><h2>Information requests</h2><p>Questions, business responses and review outcomes</p></div></header>{informationRequests.length ? informationRequests.map(request => <article key={request.id} className="business-information-card"><div className="business-information-heading"><span className={`control-state state-${request.state.toLowerCase()}`}>{request.state === 'OPEN' ? 'Awaiting response' : request.state === 'RESPONDED' ? 'Ready to review' : 'Closed'}</span><time dateTime={request.createdAt}>{businessDate(request.createdAt)}</time></div><p className="business-information-note">{request.note}</p>{request.response ? <div className="business-information-response"><h3>Business response</h3><p>{request.response}</p></div> : null}{request.resolutionNote ? <div className="business-information-response"><h3>Review note</h3><p>{request.resolutionNote}</p></div> : null}{canReview && request.state !== 'RESOLVED' ? <button className="business-detail-action" onClick={() => setAction({ type: 'resolve-information', requestId: request.id })}><CheckCircle2 size={15}/>Close request</button> : null}</article>) : <div className="control-empty"><MessageSquare/><h3>No information requested yet</h3><p>Questions and responses for this business will appear here.</p>{canReview && business.status !== 'CLOSED' ? <button className="business-detail-action" onClick={() => setAction({ type: 'request-information' })}>Request information</button> : null}</div>}</section> : <section className="control-panel"><header><div><h2>Recent business history</h2><p>Latest 50 review and account setup events</p></div></header>{data.events.length ? <ol className="business-detail-history">{data.events.map(event => <li key={`${event.source}:${event.sequence}`}><span className="business-detail-history-icon">{event.source === 'REVIEW' ? <ClipboardList size={17}/> : <WalletCards size={17}/>}</span><div><strong>{event.eventType.toLowerCase().replaceAll('_', ' ')}</strong><p>{event.state ? businessStates[event.state] ?? businessSetupStates[event.state] ?? event.state : 'Recorded'}{event.actorName ? ` · ${event.actorName}` : ''}</p>{event.note ? <p className="business-detail-history-note">{event.note}</p> : null}</div><time dateTime={event.createdAt}>{businessDate(event.createdAt)}<small>{new Date(event.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</small></time></li>)}</ol> : <div className="control-empty"><History/><h3>No setup events recorded yet</h3><p>Review and account setup activity will appear here.</p></div>}</section>}
      <footer className="business-detail-reference"><span>Business ID: {business.id}</span><span>Activated {business.activatedAt ? businessDate(business.activatedAt) : '—'}</span></footer>
    </> : null}
    {action && business ? <BusinessActionDialog action={action.type} name={business.legalName} onDismiss={() => setAction(null)} onSubmit={completeAction}/> : null}
  </div>;
}
