/* TypeScript versions of the API's customer DTOs:
 the shapes of the JSON the frontend sends to and receives from the /api/customers/me endpoints, so HTTP calls and templates are type-checked. */
export interface Customer {
  customerID: number;
  firstName: string;
  lastName: string;
  customerDOB: string;       // "yyyy-mm-dd"
  customerEmail: string;
  customerPhone: string;
  isActive: boolean;
}

// the body sent to PUT /api/customers/me/contact
export interface UpdateContactRequest {
  email: string;
  phone: string;
  currentPassword: string;   // required for any change to personal info
}
