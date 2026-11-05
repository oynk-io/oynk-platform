import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { ApiError } from '../api';

export type BusinessAction = 'activate' | 'deactivate' | 'reactivate' | 'approve' | 'reject' | 'request-information' | 'resolve-information';
const copy: Record<BusinessAction, { title: string; description: string; submit: string }> = {
  activate: { title: 'Activate business', description: 'Enable payments and terminal access after the financial accounts are ready.', submit: 'Activate business' },
  deactivate: { title: 'Deactivate business', description: 'Pause new payments and terminal access. The business’s bank and USDC accounts stay linked.', submit: 'Deactivate business' },
  reactivate: { title: 'Reactivate business', description: 'Restore payments and terminal access for this business.', submit: 'Reactivate business' },
  approve: { title: 'Approve application', description: 'Approve the business information you have reviewed. Account setup and activation follow separately.', submit: 'Approve application' },
  reject: { title: 'Reject application', description: 'Explain why the application cannot be approved.', submit: 'Reject application' },
  'request-information': { title: 'Request information', description: 'Tell the business what to provide. Its activation status will stay the same.', submit: 'Send request' },
  'resolve-information': { title: 'Close information request', description: 'Close a request after reviewing the response, or when the information is no longer needed.', submit: 'Close request' },
};

export function BusinessActionDialog({ action, name, onDismiss, onSubmit }: { action: BusinessAction; name: string; onDismiss: () => void; onSubmit: (note: string, requestId: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const text = copy[action], optional = action === 'resolve-information';
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => { node?.close(); }; }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (!optional && note.trim().length < 3) { setError('Add a short explanation before continuing.'); return; }
    setBusy(true); setError('');
    try { await onSubmit(note.trim(), requestId); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'We couldn’t complete this action. Try again.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="business-action-dialog" aria-labelledby="business-action-title" aria-describedby="business-action-description" onCancel={event => { event.preventDefault(); if (!busy) onDismiss(); }}>
    <form onSubmit={event => void submit(event)}><header><div><p className="eyebrow">{name}</p><h2 id="business-action-title">{text.title}</h2></div><button type="button" className="business-action-close" aria-label="Close action" disabled={busy} onClick={onDismiss}><X size={19}/></button></header>
      <p id="business-action-description">{text.description}</p><label><span>{action === 'request-information' ? 'Information needed' : optional ? 'Review note (optional)' : 'Reason'}</span><textarea autoFocus value={note} rows={4} required={!optional} minLength={optional ? undefined : 3} maxLength={action === 'request-information' ? 2000 : 1000} disabled={busy} onChange={event => { setNote(event.target.value); setError(''); }}/></label>
      {error ? <div className="error" role="alert">{error}</div> : null}<footer><button type="button" className="secondary" disabled={busy} onClick={onDismiss}>Cancel</button><button className={`primary${action === 'deactivate' || action === 'reject' ? ' business-action-danger' : ''}`} disabled={busy}>{busy ? <><LoaderCircle size={16}/>Saving…</> : text.submit}</button></footer>
    </form>
  </dialog>;
}
