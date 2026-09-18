export type ApprovalState='NOT_REQUIRED'|'PENDING'|'APPROVED'|'REJECTED';
export type RampState='CREATED'|'POLICY_CHECK'|'PENDING_APPROVAL'|'APPROVED'|'PROCESSING'|'COMPLETED'|'FAILED'|'REJECTED'|'CANCELLED';

export function approvalTransition(current:{state:RampState;approvalState:ApprovalState;riskState?:'CLEAR'|'REVIEW_REQUIRED'|'FLAGGED'|'BLOCKED';existingAction?:'APPROVE'|'REJECT'|null},action:'APPROVE'|'REJECT'){
 if(current.existingAction){if(current.existingAction===action)return{idempotent:true,state:action==='APPROVE'?'APPROVED' as const:'REJECTED' as const,approvalState:action==='APPROVE'?'APPROVED' as const:'REJECTED' as const};throw new Error('APPROVAL_FINAL');}
 if(current.state!=='PENDING_APPROVAL'||current.approvalState!=='PENDING')throw new Error('APPROVAL_NOT_PENDING');
 if(action==='APPROVE'&&current.riskState==='BLOCKED')throw new Error('POLICY_BLOCKED');
 return{idempotent:false,state:action==='APPROVE'?'APPROVED' as const:'REJECTED' as const,approvalState:action==='APPROVE'?'APPROVED' as const:'REJECTED' as const};
}

export function retryAllowed(current:{state:RampState;approvalState:ApprovalState}):boolean{return current.state==='FAILED'&&current.approvalState!=='PENDING'&&current.approvalState!=='REJECTED';}

export function canUseRampControl(organizationType:string|undefined,permissions:string[],permission:string):boolean{return organizationType==='INTERNAL'&&permissions.includes(permission);}
