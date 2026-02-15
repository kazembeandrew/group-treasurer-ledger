
export type AccountType = 'CASH' | 'MOBILE' | 'BANK' | 'MEMBER';
export type FundType = 'PRINCIPAL' | 'INTEREST';
export type TransactionType = 'CONTRIBUTION' | 'LOAN_GIVEN' | 'LOAN_REPAYMENT' | 'EXPENSE' | 'TRANSFER' | 'OPENING_BALANCE';
export type LoanStatus = 'PAID' | 'OVERDUE' | 'UNPAID';

export interface Member {
  id: string;
  name: string;
  active: boolean;
  advance_credit: number;
}

export interface Account {
  id: string;
  account_name: string;
  type: AccountType;
  active: boolean;
  memberId?: string; // Optional: Link account to a specific member
}

export interface Transaction {
  id: string;
  date: string;
  memberId?: string;
  accountId: string;
  fund_type: FundType;
  transaction_type: TransactionType;
  amount: number;
  related_loan_id?: string;
  notes: string;
}

export interface Loan {
  id: string;
  memberId: string;
  amount_given: number;
  interest_rate: number;
  date_given: string;
  due_date: string;
}

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  date: string;
}

export type ActionType = 
  | 'ADD_MEMBER' 
  | 'ADD_ACCOUNT' 
  | 'CREATE_LOAN' 
  | 'CONTRIBUTION' 
  | 'LOAN_REPAYMENT' 
  | 'EXPENSE' 
  | 'TRANSFER'
  | 'OPENING_BALANCE';

export interface ActionDraft {
  type: ActionType;
  
  // Common Data
  date?: string;
  notes?: string;
  amount?: number;
  
  // References (IDs)
  memberId?: string;
  accountId?: string;
  toAccountId?: string;
  
  // Entity Creation Data
  memberName?: string; // Used for ADD_MEMBER or UI display
  accountName?: string; // Used for ADD_ACCOUNT or UI display
  
  // Specific Fields
  startingCredit?: number; // For ADD_MEMBER
  accountType?: AccountType; // For ADD_ACCOUNT
  interestRate?: number; // For CREATE_LOAN
  fundType?: 'PRINCIPAL' | 'INTEREST'; // For TRANSFER
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text?: string;
  actions?: ActionDraft[];
  timestamp: string;
}
