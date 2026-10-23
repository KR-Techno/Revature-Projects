/* TypeScript versions of the API's claim DTOs:
 the shapes of the JSON the frontend sends to and receives from the /api/claims endpoints, so HTTP calls and templates are type-checked. */
export interface Claim {
  claimID: number;
  policyID: number;
  typeName: string;
  incidentDate: string;
  submittedDate: string;
  claimDescription: string;
  claimAmount: number;
  claimStatus: string;
  // these stay null until the claim has been decided
  approvedAmount: number | null;
  resolvedDate: string | null;
  decisionNote: string | null;
}

// the body sent to POST /api/claims when filing a new claim
export interface ClaimRequest {
  policyID: number;
  incidentDate: string;       // "yyyy-mm-dd"
  claimDescription: string;
  claimAmount: number;
}

export interface ClaimCreated { claimID: number; }
