/* TypeScript versions of the API's payment DTOs:
 the shapes of the JSON the frontend receives from the /api/payments endpoints, so HTTP calls and templates are type-checked. */
export interface Payment {
  paymentID: number;
  policyID: number;
  typeName: string;
  dueDate: string;            // "yyyy-mm-dd"
  amount: number;
  lateFee: number;
  totalAmount: number;        // amount + late fee
  paidDate: string | null;
  paymentStatus: string;      // stored: Pending / Paid / Cancelled
  displayStatus: string;      // shown: adds Overdue
  daysOverdue: number;
}

// returned after a successful payment, used for the confirmation message
export interface PaymentReceipt {
  paymentID: number;
  dueDate: string;
  amount: number;
  lateFee: number;
  totalCharged: number;
  paidDate: string;
}
