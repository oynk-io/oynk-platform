import { useEffect, useState, type FormEvent } from 'react';
import { ChevronRight, Clipboard, CreditCard, LoaderCircle, Printer, RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { api, ApiError, type TerminalPayment, type TerminalPaymentDetail } from '../api';

function formatNaira(kobo:string){
  return new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:2}).format(Number(kobo)/100);
}
function message(error:unknown){return error instanceof ApiError?error.message:'We couldn’t load terminal payments.';}
function State({value}:{value:string}){return <span className={'control-state state-'+value.toLowerCase().replaceAll('_','-')}>{value.replaceAll('_',' ')}</span>;}

export function TerminalPaymentsPage({internal=false}:{internal?:boolean}){
  const[payments,setPayments]=useState<TerminalPayment[]>([]);
  const[selected,setSelected]=useState<TerminalPaymentDetail|null>(null);
  const[state,setState]=useState('');
  const[search,setSearch]=useState('');
  const[loading,setLoading]=useState(true);
  const[detailLoading,setDetailLoading]=useState(false);
  const[refundBusy,setRefundBusy]=useState(false);
  const[reconcileBusy,setReconcileBusy]=useState(false);
  const[error,setError]=useState('');

  async function load(){
    setLoading(true);setError('');
    try{
      const result=internal
        ? await api.controlTerminalPayments({state:state||undefined,search:search||undefined})
        : await api.businessTerminalPayments({state:state||undefined,search:search||undefined});
      setPayments(result.payments);
    }catch(cause){setError(message(cause));}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[state]);
  async function open(id:string){
    setDetailLoading(true);setSelected(null);setError('');
    try{setSelected(internal?await api.controlTerminalPayment(id):await api.businessTerminalPayment(id));}
    catch(cause){setError(message(cause));}
    finally{setDetailLoading(false);}
  }
  async function refund(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selected)return;const data=new FormData(event.currentTarget),amount=Number(data.get('amount'));if(!Number.isFinite(amount)||amount<=0)return;setRefundBusy(true);setError('');try{await api.refundTerminalPayment(selected.payment.id,{amountKobo:String(Math.round(amount*100)),idempotencyKey:`console-${crypto.randomUUID()}`,reason:String(data.get('reason')??'')||undefined});setSelected(await api.businessTerminalPayment(selected.payment.id));await load();}catch(cause){setError(message(cause));}finally{setRefundBusy(false);}}
  async function reconcile(){if(!selected||!internal)return;setReconcileBusy(true);setError('');try{await api.reconcileTerminalPayment(selected.payment.id);setSelected(await api.controlTerminalPayment(selected.payment.id));await load();}catch(cause){setError(message(cause));}finally{setReconcileBusy(false);}}
  const completed=payments.filter(item=>item.state==='COMPLETED').reduce((sum,item)=>sum+BigInt(item.amountKobo),0n);
  const attention=payments.filter(item=>['PROCESSING','RECONCILIATION_REQUIRED','FAILED'].includes(item.state)).length;
  return <div className="control-page">
    <div className="control-hero"><div><p className="eyebrow">{internal?'Payment operations':'Customer payments'}</p><h1>Terminal payments</h1><p>{internal?'Follow every Offline Pay authorization, provider transfer and operational exception.':'See payments accepted through your Oynk hardware and software terminals.'}</p></div></div>
    <section className="control-metrics">
      <article><span><CreditCard/>Payments shown</span><strong>{payments.length}</strong><small>Latest matching records</small></article>
      <article><span><CreditCard/>Completed value</span><strong>{formatNaira(completed.toString())}</strong><small>Across the records shown</small></article>
      <article><span><CreditCard/>Processing</span><strong>{payments.filter(item=>item.state==='PROCESSING').length}</strong><small>Provider confirmation pending</small></article>
      <article><span><CreditCard/>Needs attention</span><strong>{attention}</strong><small>Processing or unsuccessful</small></article>
    </section>
    <form className="control-filters" onSubmit={event=>{event.preventDefault();void load();}}>
      <label><Search/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Payment ID, provider reference, business or handle"/></label>
      <label><select value={state} onChange={event=>setState(event.target.value)}><option value="">All states</option>{['AWAITING_PIN','AUTHORIZING','PROCESSING','RECONCILIATION_REQUIRED','COMPLETED','DECLINED','FAILED','REVERSED','CANCELLED'].map(value=><option key={value}>{value}</option>)}</select></label>
      <button type="submit">Search</button>
    </form>
    {error?<div className="control-failure"><div><strong>Payments unavailable</strong><p>{error}</p></div><button onClick={()=>void load()}>Try again</button></div>:null}
    <section className="control-panel transaction-panel">
      {loading?<div className="control-loading"><LoaderCircle/>Loading payments…</div>:payments.length?<div className="transaction-table terminal-payment-table">
        <div className="transaction-head"><span>Payment</span><span>Customer</span><span>Business</span><span>Amount</span><span>Status</span><span/></div>
        {payments.map(item=><button key={item.id} onClick={()=>void open(item.id)}>
          <span><strong>{item.receiptNumber}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span>
          <span><strong>{item.customerHandle??'Private customer'}</strong><small>{item.terminalType.toLowerCase()} terminal</small></span>
          <span><strong>{item.businessName}</strong><small>{item.terminalLabel}</small></span>
          <span><strong>{formatNaira(item.amountKobo)}</strong><small>{item.providerReference??'No provider reference'}</small></span>
          <State value={item.state}/><span><ChevronRight/></span>
        </button>)}
      </div>:<div className="control-empty"><CreditCard/><h3>No terminal payments</h3><p>Payments accepted by activated terminals will appear here.</p></div>}
    </section>
    {detailLoading?<div className="control-drawer-backdrop" role="presentation"><aside className="control-drawer"><div className="drawer-loading"><LoaderCircle/>Loading payment…</div></aside></div>:null}
    {selected?<div className="control-drawer-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setSelected(null);}}><aside className="control-drawer terminal-payment-drawer" role="dialog" aria-modal="true" aria-label="Terminal payment details"><button className="drawer-close" onClick={()=>setSelected(null)} aria-label="Close"><X/></button><div className="receipt-heading"><p className="eyebrow">Terminal receipt</p><h2>{formatNaira(selected.payment.amountKobo)}</h2><div><State value={selected.payment.state}/><code>{selected.payment.receiptNumber}</code></div></div><div className="receipt-actions"><button onClick={()=>void navigator.clipboard.writeText(selected.payment.receiptNumber)}><Clipboard/>Copy receipt</button><button onClick={()=>window.print()}><Printer/>Print</button>{internal&&['PROCESSING','RECONCILIATION_REQUIRED'].includes(selected.payment.state)?<button disabled={reconcileBusy} onClick={()=>void reconcile()}><RefreshCw/>{reconcileBusy?'Checking…':'Check provider'}</button>:null}</div><dl><dt>Business</dt><dd>{selected.payment.businessName}</dd><dt>Customer</dt><dd>{selected.payment.customerHandle??'Private customer'}</dd><dt>Terminal</dt><dd>{selected.payment.terminalLabel} · {selected.payment.terminalType.toLowerCase()}</dd><dt>Provider</dt><dd>{selected.payment.provider??'Not submitted'}</dd><dt>Provider reference</dt><dd>{selected.payment.providerReference??'Not available'}</dd><dt>Created</dt><dd>{new Date(selected.payment.createdAt).toLocaleString()}</dd>{selected.payment.failureReason||selected.payment.declineCode?<><dt>Attention</dt><dd>{selected.payment.failureReason??selected.payment.declineCode}</dd></>:null}</dl>{selected.refunds.length?<section className="refund-history"><h3>Refunds</h3>{selected.refunds.map(item=><article key={item.id}><div><strong>{formatNaira(item.amountKobo)}</strong><small>{new Date(item.createdAt).toLocaleString()}{item.reason?` · ${item.reason}`:''}</small></div><State value={item.state}/></article>)}</section>:null}{!internal&&['COMPLETED','REVERSED'].includes(selected.payment.state)&&selected.refunds.filter(item=>['CREATED','PROCESSING','RECONCILIATION_REQUIRED','COMPLETED'].includes(item.state)).reduce((sum,item)=>sum+BigInt(item.amountKobo),0n)<BigInt(selected.payment.amountKobo)?<form className="refund-form" onSubmit={event=>void refund(event)}><header><RotateCcw/><div><h3>Refund customer</h3><p>Return all or part of this payment to the customer’s Oynk Pay account.</p></div></header><label><span>Amount</span><input name="amount" type="number" min="0.01" step="0.01" max={Number(BigInt(selected.payment.amountKobo)-selected.refunds.filter(item=>['CREATED','PROCESSING','RECONCILIATION_REQUIRED','COMPLETED'].includes(item.state)).reduce((sum,item)=>sum+BigInt(item.amountKobo),0n))/100} required/></label><label><span>Reason <small>optional</small></span><input name="reason" maxLength={500}/></label><button className="primary" disabled={refundBusy}>{refundBusy?'Submitting refund…':'Refund payment'}</button></form>:null}<section className="activity-timeline"><h3>Payment history</h3>{selected.events.map(item=><article key={item.sequence}><span/><div><strong>{item.eventType.replaceAll('_',' ')}</strong><small>{item.fromState?item.fromState.replaceAll('_',' ')+' → ':''}{(item.toState??'recorded').replaceAll('_',' ')} · {new Date(item.createdAt).toLocaleString()}</small></div></article>)}</section></aside></div>:null}
  </div>;
}
