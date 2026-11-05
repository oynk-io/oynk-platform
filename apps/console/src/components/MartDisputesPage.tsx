import { useEffect, useState } from 'react';
import type { OrganizationSummary } from '@oynk/shared';
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, ApiError, type MartDispute } from '../api';

const money=(minor:string)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(minor)/100);
const label=(value:string)=>value.toLowerCase().replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase());

export function MartDisputesPage({organization}:{organization:OrganizationSummary}){
 const[rows,setRows]=useState<MartDispute[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const canResolve=organization.permissions.includes('payments:refund');
 async function load(){setLoading(true);setError('');try{setRows((await api.martDisputes()).disputes);}catch(cause){setError(cause instanceof ApiError?cause.message:'Order disputes could not be loaded.');}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 async function resolve(row:MartDispute,outcome:'BUYER'|'MERCHANT'){
  const note=window.prompt(outcome==='BUYER'?'Explain why the customer should receive a refund.':'Explain why the order should remain with the merchant.');if(!note?.trim())return;
  setBusy(row.id);setError('');try{await api.resolveMartDispute(row.id,outcome,note);await load();}catch(cause){setError(cause instanceof ApiError?cause.message:'The dispute could not be resolved.');}finally{setBusy('');}
 }
 return <div className="control-page"><div className="control-hero"><div><p className="eyebrow">Independent review</p><h1>Order disputes</h1><p>Merchants cannot close a disputed order. Review the report, then return the order to fulfilment or start a customer refund.</p></div><button className="control-refresh" aria-label="Refresh disputes" onClick={()=>void load()} disabled={loading}><RefreshCw size={18}/></button></div>
  {error?<div className="control-failure" role="alert"><AlertTriangle/><div><strong>Disputes unavailable</strong><p>{error}</p></div></div>:null}
  <section className="control-panel"><header><div><h2>Review queue</h2><p>{rows.filter(row=>['OPEN','UNDER_REVIEW'].includes(row.state)).length} need a decision</p></div></header>
   {loading?<div className="control-loading"><LoaderCircle/>Loading disputes…</div>:rows.length?<div className="business-directory-list">{rows.map(row=><article className="business-directory-row" key={row.id}><div className="business-directory-main"><div className="business-directory-mark"><ShieldCheck/></div><div><strong>{row.businessName}</strong><span>{row.customerName} · {money(row.orderTotalMinor)} · {row.fulfillmentMethod?label(row.fulfillmentMethod):'Fulfilment'}</span><p>{label(row.reason)} — {row.details}</p></div></div><div className="business-directory-meta"><span className={`control-state state-${row.state.toLowerCase().replaceAll('_','-')}`}>{label(row.state)}</span><time>{new Date(row.createdAt).toLocaleString()}</time></div>{canResolve&&['OPEN','UNDER_REVIEW'].includes(row.state)?<div className="business-directory-actions"><button disabled={busy===row.id} onClick={()=>void resolve(row,'MERCHANT')}>Keep order active</button><button className="danger" disabled={busy===row.id} onClick={()=>void resolve(row,'BUYER')}><CheckCircle2 size={15}/>Refund customer</button></div>:null}</article>)}</div>:<div className="control-empty"><ShieldCheck/><h3>No order disputes</h3><p>Customer fulfilment reports will appear here.</p></div>}
  </section>
 </div>;
}
