/* TypeScript versions of the API's admin DTOs:
 the shapes of the JSON the admin pages send to and receive from /api/admin/..., so HTTP calls and templates are type-checked. */
// one row of the admin's customer list
export interface AdminCustomer {
  customerID: number;
  firstName: string;
  lastName: string;
  customerDOB: string;       // "yyyy-mm-dd"
  customerEmail: string;
  customerPhone: string;
  isActive: boolean;
  activePolicies: number;
  openClaims: number;
  overduePayments: number;   // unpaid payments past their due date
}

// one payment in the admin's payments list, with the customer's contact details for following up
export interface AdminPayment {
  paymentID: number;
  policyID: number;
  customerID: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  typeName: string;
  levelName: string;
  dueDate: string;
  amount: number;
  lateFee: number;
  totalAmount: number;       // amount + late fee
  paidDate: string | null;
  paymentStatus: string;     // stored: Pending / Paid / Cancelled
  displayStatus: string;     // an unpaid payment past its due date shows as Overdue
  daysOverdue: number;
}

export interface UpdateCustomerRequest {
  password: string;          // the admin's own password
  firstName: string;
  lastName: string;
  dateOfBirth: string;       // "yyyy-mm-dd"
}

// one claim in the admin's review list, with the customer's name and policy details
export interface AdminClaim {
  claimID: number;
  policyID: number;
  customerID: number;
  customerName: string;
  typeName: string;
  levelName: string;
  incidentDate: string;
  submittedDate: string;
  claimDescription: string;
  claimAmount: number;
  claimStatus: string;
  approvedAmount: number | null;
  resolvedDate: string | null;
  decisionNote: string | null;
}

// matches the columns admin_GetQuotes returns
export interface AdminQuote {
  quoteID: number;
  customerID: number;
  customerName: string;
  customerEmail: string;
  typeName: string;
  levelName: string;
  coverageAmount: number;
  monthlyPremium: number;
  createdDate: string;
  expiryDate: string;
  quoteStatus: string;
  displayStatus: string;     // Active, Expired, Accepted or Removed
  policyID: number | null;   // the policy bought from this quote, if any
}

// one row of the admin's product list (matches the columns admin_GetProductSummary returns)
export interface AdminProductSummary {
  policyTypeID: number;
  typeName: string;
  levels: string | null;      // level names in order, e.g. "Liability Only, Full Coverage"
  customers: number;          // customers with a current policy of this product
}

// one customer's current policy under a product (matches the columns admin_GetProductCustomers returns)
export interface AdminProductCustomer {
  customerID: number;
  firstName: string;
  lastName: string;
  customerDOB: string;        // "yyyy-mm-dd"
  customerEmail: string;
  customerPhone: string;
  isActive: boolean;
  policyID: number;
  levelName: string;
  coverageAmount: number;
  monthlyPremium: number;
  paymentPlan: string;        // Monthly or Yearly
  startDate: string;
  endDate: string;
  overduePayments: number;    // unpaid payments past their due date
}

export type ClaimDecision = 'Approved' | 'Denied';
export interface DecideClaimRequest {
  decision: ClaimDecision;
  approvedAmount: number | null;   // only used when the decision is Approved
  decisionNote: string | null;
}

// one coverage level of a new product, as typed into the admin form
export interface NewCoverageLevel {
  levelName: string;
  description: string;
  rateFactor: number;
  minCoverage: number;
  maxCoverage: number;
}

export interface CreateProductRequest {
  password: string;
  typeName: string;
  baseRate: number;          // yearly rate on the coverage: 0.01 = 1% a year
  factorUnder25: number;
  factor25to64: number;
  factor65plus: number;
  levels: NewCoverageLevel[];
}
