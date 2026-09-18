export const rampDirections = ['ON_RAMP', 'OFF_RAMP'] as const;
export type RampDirection = typeof rampDirections[number];

export type RampPolicy = {
 id: string;
 direction: RampDirection;
 enabled: boolean;
 manualThresholdUsdcAtomic: bigint;
 cumulativeEnabled: boolean;
 cumulativeThresholdUsdcAtomic: bigint | null;
 cumulativeWindowSeconds: number | null;
 additionalRules: Record<string,unknown>;
 version: number;
};

export type PolicyDecision = {
 outcome: 'AUTO_APPROVED' | 'MANUAL_APPROVAL' | 'BLOCKED';
 reasonCodes: string[];
 approvalState: 'NOT_REQUIRED' | 'PENDING';
 riskState: 'CLEAR' | 'REVIEW_REQUIRED' | 'BLOCKED';
 state: 'CREATED' | 'PENDING_APPROVAL';
 cumulativeAmountUsdcAtomic: bigint;
};

export type RampActor = {
 type: 'CONSUMER' | 'OPERATOR' | 'PROVIDER' | 'SYSTEM';
 reference?: string | null;
 requestId?: string | null;
};
