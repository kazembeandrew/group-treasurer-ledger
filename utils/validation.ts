import { AccountType, FundType, TransactionType } from '../types';

// Sanitize string input to prevent XSS
export const sanitizeString = (input: string): string => {
  return input.trim().replace(/[<>]/g, '');
};

// Validate positive number
export const validatePositiveNumber = (value: any): boolean => {
  const num = Number(value);
  return !isNaN(num) && num > 0;
};

// Validate date in YYYY-MM-DD format
export const validateDate = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  return !isNaN(date.getTime()) && dateStr.match(/^\d{4}-\d{2}-\d{2}$/) !== null;
};

// Validate member name
export const validateMemberName = (name: string): { valid: boolean; error?: string } => {
  const sanitized = sanitizeString(name);
  if (!sanitized || sanitized.length < 1 || sanitized.length > 50) {
    return { valid: false, error: 'Name must be 1-50 characters long.' };
  }
  return { valid: true };
};

// Validate account name
export const validateAccountName = (name: string): { valid: boolean; error?: string } => {
  const sanitized = sanitizeString(name);
  if (!sanitized || sanitized.length < 1 || sanitized.length > 100) {
    return { valid: false, error: 'Account name must be 1-100 characters long.' };
  }
  return { valid: true };
};

// Validate amount
export const validateAmount = (amount: any): { valid: boolean; error?: string } => {
  if (!validatePositiveNumber(amount)) {
    return { valid: false, error: 'Amount must be a positive number.' };
  }
  return { valid: true };
};

// Validate interest rate (0-100)
export const validateInterestRate = (rate: any): { valid: boolean; error?: string } => {
  const num = Number(rate);
  if (isNaN(num) || num < 0 || num > 100) {
    return { valid: false, error: 'Interest rate must be between 0 and 100.' };
  }
  return { valid: true };
};

// Validate account type
export const validateAccountType = (type: any): { valid: boolean; error?: string } => {
  const validTypes: AccountType[] = ['CASH', 'MOBILE', 'BANK', 'MEMBER'];
  if (!validTypes.includes(type)) {
    return { valid: false, error: 'Invalid account type.' };
  }
  return { valid: true };
};

// Validate fund type
export const validateFundType = (type: any): { valid: boolean; error?: string } => {
  const validTypes: FundType[] = ['PRINCIPAL', 'INTEREST'];
  if (!validTypes.includes(type)) {
    return { valid: false, error: 'Invalid fund type.' };
  }
  return { valid: true };
};

// Validate notes (optional, max 500 chars)
export const validateNotes = (notes: string): { valid: boolean; error?: string } => {
  const sanitized = sanitizeString(notes);
  if (sanitized.length > 500) {
    return { valid: false, error: 'Notes must be less than 500 characters.' };
  }
  return { valid: true };
};
