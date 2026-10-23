/* TypeScript versions of the API's policy DTOs:
the shapes of the JSON the frontend sends to and receives from
 the /api/policies endpoints, so HTTP calls and templates are type-checked. */
// one tier of a product (e.g. Liability Only), with a plain-English description for the radio buttons
// each level has its own coverage range
export interface CoverageLevel { coverageLevelID: number; levelName: string; description: string; minCoverage: number; maxCoverage: number; }
// a product (Auto, Home, ...) with its coverage levels nested inside
export interface PolicyType { policyTypeID: number; typeName: string; levels: CoverageLevel[]; }
// how the customer pays: 12 monthly payments, or one yearly payment that costs less
export type PaymentPlan = 'Monthly' | 'Yearly';
// used for the unsaved price preview in the change-coverage dialog
export interface PolicyRequest { policyTypeID: number; coverageLevelID: number; coverageAmount: number; }
// what the customer sends to get (and save) a quote
export interface CreateQuoteRequest { policyTypeID: number; coverageLevelID: number; coverageAmount: number; }
// a quote saved in the database: valid for 30 days, and a policy can be bought from it at this price
export interface SavedQuote {
  quoteID: number;
  policyTypeID: number;
  typeName: string;
  coverageLevelID: number;
  levelName: string;
  coverageAmount: number;
  monthlyPremium: number;
  yearlyTotal: number;
  yearlyDiscountedTotal: number;
  createdDate: string;
  expiryDate: string;
  quoteStatus: string;     // stored: Open, Accepted, Dismissed
  displayStatus: string;   // shown: Active, Expired or Accepted
}
// a quote carries both prices, so the customer can compare the plans before buying
export interface Quote { typeName: string; levelName: string; coverageAmount: number; monthlyPremium: number; yearlyTotal: number; yearlyDiscountedTotal: number; }
export interface PolicyCreated { policyID: number; }
// returned after a coverage change, with the new level, amount and monthly price
export interface CoverageChanged { policyID: number; coverageLevelID: number; levelName: string; coverageAmount: number; monthlyPremium: number; }
export interface Policy {
  policyID: number;
  policyTypeID: number;
  typeName: string;
  coverageLevelID: number;
  levelName: string;
  coverageAmount: number;
  monthlyPremium: number;
  startDate: string;        // "yyyy-mm-dd"
  endDate: string;
  policyStatus: string;     // what is stored
  displayStatus: string;    // what to show (an Active policy past its end date shows as Expired)
  paymentPlan: PaymentPlan;
  paidSoFar: number;
  remainingBalance: number; // still left to pay (not counting late fees)
  policyTotal: number;      // paid so far + remaining
  nextDueDate: string | null;   // "yyyy-mm-dd", or null when nothing is left to pay
}
