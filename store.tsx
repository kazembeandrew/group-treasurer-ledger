
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Member, Account, Transaction, Loan, Notification, LoanStatus, AccountType, ChatMessage, ActionDraft, FundType, TransactionType } from './types';
import { supabase, isCloudMode, offlineReason } from './supabaseClient';
import { sanitizeString, validateMemberName, validateAmount, validateAccountName, validateAccountType, validateDate, validateNotes, validateInterestRate, validateFundType } from './utils/validation';

interface StoreContextType {
  members: Member[];
  accounts: Account[];
  transactions: Transaction[];
  loans: Loan[];
  notifications: Notification[];
  chatMessages: ChatMessage[];
  isLoading: boolean;
  workingDate: string;
  isCloudMode: boolean;
  offlineReason: string;
  connectionError: string | null;
  setWorkingDate: (date: string) => void;
  addMember: (name: string, startingCredit?: number) => Promise<string>;
  updateMember: (id: string, updates: Partial<Member>) => Promise<void>;
  addAccount: (name: string, type: AccountType, memberId?: string) => Promise<string>;
  deleteAccount: (id: string) => Promise<string | null>;
  addContribution: (memberId: string, amount: number, accountId: string, date: string, notes: string, skipDuplicateCheck?: boolean) => Promise<string | null>;
  addLoan: (memberId: string, amount: number, accountId: string, date: string, interestRate: number) => Promise<string | null>;
  addRepayment: (loanId: string, amount: number, accountId: string, date: string, notes: string, skipDuplicateCheck?: boolean) => Promise<string | null>;
  addExpense: (amount: number, accountId: string, date: string, notes: string, skipDuplicateCheck?: boolean) => Promise<string | null>;
  addTransfer: (fromAccountId: string, toAccountId: string, amount: number, fundType: 'PRINCIPAL' | 'INTEREST', date: string, notes: string, skipDuplicateCheck?: boolean) => Promise<string | null>;
  addOpeningBalance: (accountId: string, amount: number, fundType: 'PRINCIPAL' | 'INTEREST', date: string, notes: string, skipDuplicateCheck?: boolean) => Promise<string | null>;
  deleteTransaction: (id: string) => Promise<void>;
  deleteLoan: (id: string) => Promise<void>;
  addChatMessage: (sender: 'user' | 'ai', text?: string, actions?: ActionDraft[]) => Promise<void>;
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => Promise<void>;
  clearChatHistory: () => Promise<void>;
  getLoanDetails: (loan: Loan) => {
    interestAmount: number;
    totalDue: number;
    amountPaid: number;
    balance: number;
    status: LoanStatus;
  };
  getMemberStats: (memberId: string) => {
    totalContributed: number;
    activeLoans: number;
    totalLoanBalance: number;
    lastContributionDate: string | null;
    fundsHeld: number;
  };
  getAccountBalance: (accountId: string) => {
    principal: number;
    interest: number;
    total: number;
  };
  dismissNotification: (id: string) => void;
  exportData: () => string;
  importData: (jsonString: string) => Promise<boolean>;
  resetData: () => Promise<void>;
  checkLastBackup: () => string | null;
  logBackup: () => void;
  signOut: () => Promise<void>; // Added signOut
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

// Generate a device ID for audit logging
const getDeviceId = () => {
  let id = localStorage.getItem('wealthshare_device_id');
  if (!id) {
    id = uuidv4();
    localStorage.setItem('wealthshare_device_id', id);
  }
  return id;
};

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [workingDate, setWorkingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Ref to track transactions immediately for batch operations and validation
  const transactionsRef = useRef<Transaction[]>([]);

  // Update ref whenever state changes
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  const addNotification = useCallback((message: string, type: Notification['type'] = 'info') => {
    setNotifications(prev => [{
      id: uuidv4(),
      message,
      type,
      date: new Date().toISOString()
    }, ...prev]);
  }, []);

  // --- INTERNAL HELPER: AUDIT LOG ---
  const logAudit = async (action: 'CREATED' | 'UPDATED' | 'DELETED', table: string, id: string, details: string) => {
    // Ensure id is a valid UUID for the record_id column
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidUuid = uuidRegex.test(id);
    
    const logEntry = {
      id: uuidv4(),
      action_type: action,
      table_name: table,
      record_id: isValidUuid ? id : '00000000-0000-0000-0000-000000000000',
      details: isValidUuid ? details : `[ID: ${id}] ${details}`,
      device_id: getDeviceId(),
      timestamp: new Date().toISOString()
    };
    
    // Fire and forget
    supabase.from('audit_logs').insert(logEntry).then(({ error }: any) => {
      if (error && error.code !== '42P01') console.error("Audit Log Failed", error);
    });
  };

  // --- INTERNAL HELPER: DUPLICATE CHECK ---
  const isDuplicateTransaction = (memberId: string | undefined, accountId: string, amount: number, type: TransactionType, date: string) => {
    const thresholdMs = 60000; // 60 seconds
    const now = new Date().getTime();
    
    const duplicate = transactionsRef.current.find(t => 
      t.memberId === memberId &&
      t.accountId === accountId &&
      Math.abs(t.amount) === Math.abs(amount) && 
      t.transaction_type === type &&
      t.date === date && 
      (t.created_at ? (now - new Date(t.created_at).getTime() < thresholdMs) : false)
    );

    return !!duplicate;
  };

  const fetchData = useCallback(async () => {
    if (transactions.length === 0) setIsLoading(true);
    setConnectionError(null);

    try {
      // 1. Fetch Members
      const { data: membersData, error: mError } = await supabase.from('members').select('*');
      if (mError) throw mError;
      if (membersData) setMembers(membersData);

      // 2. Fetch Accounts
      const { data: accountsData, error: aError } = await supabase.from('accounts').select('*');
      if (aError) throw aError;
      if (accountsData) {
         setAccounts(accountsData.map((a: any) => ({ ...a, memberId: a.member_id })));
      }

      // 3. Fetch Loans
      const { data: loansData, error: lError } = await supabase.from('loans').select('*');
      if (lError) throw lError;
      if (loansData) {
        setLoans(loansData.map((l: any) => ({ ...l, memberId: l.member_id })));
      }

      // 4. Fetch Transactions
      const { data: transData, error: tError } = await supabase.from('transactions').select('*');
      if (tError) throw tError;
      if (transData) {
        const mappedTrans = transData.map((t: any) => ({
          ...t,
          memberId: t.member_id,
          accountId: t.account_id,
          related_loan_id: t.related_loan_id 
        }));
        setTransactions(mappedTrans);
        transactionsRef.current = mappedTrans;
      }

      // 5. Fetch Chat
      const { data: chatData } = await supabase.from('ai_chat_history').select('*').order('timestamp', { ascending: true });
      if (chatData) {
        setChatMessages(chatData.map((c: any) => ({ ...c })));
      }

    } catch (e: any) {
      const errorMsg = e.message || String(e);
      console.error("Fetch Error:", e);
      
      if (errorMsg.toLowerCase().includes('invalid api key')) {
         setConnectionError('Auth Error');
      } else if (errorMsg.toLowerCase().includes('fetch')) {
         setConnectionError('Network Error: Failed to connect to database. Check your internet or Supabase configuration.');
      } else {
         setConnectionError(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- REALTIME SUBSCRIPTION ---
  useEffect(() => {
    if (!isCloudMode) return;
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // --- BACKGROUND REFRESH ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => { document.removeEventListener('visibilitychange', handleVisibilityChange); };
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getAccountBalance = useCallback((accountId: string) => {
    const accTrans = transactions.filter(t => t.accountId === accountId && t.date <= workingDate);
    const principal = accTrans.filter(t => t.fund_type === 'PRINCIPAL').reduce((sum, t) => sum + t.amount, 0);
    const interest = accTrans.filter(t => t.fund_type === 'INTEREST').reduce((sum, t) => sum + t.amount, 0);
    return { principal, interest, total: principal + interest };
  }, [transactions, workingDate]);

  const getLoanDetails = useCallback((loan: Loan) => {
    const interestAmount = loan.interest_amount !== undefined 
      ? loan.interest_amount 
      : (loan.amount_given * (loan.interest_rate / 100));
      
    const totalDue = loan.amount_given + interestAmount;
    
    const amountPaid = transactions
      .filter(t => t.related_loan_id === loan.id && t.transaction_type === 'LOAN_REPAYMENT' && t.date <= workingDate)
      .reduce((sum, t) => sum + t.amount, 0);
      
    const balance = totalDue - amountPaid;
    
    let status: LoanStatus = 'UNPAID';
    if (balance <= 0) status = 'PAID';
    else if (workingDate > loan.due_date) status = 'OVERDUE';

    return { interestAmount, totalDue, amountPaid, balance, status };
  }, [transactions, workingDate]);

  const getMemberStats = useCallback((memberId: string) => {
    const memberTransactions = transactions.filter(t => t.memberId === memberId && t.date <= workingDate);
    
    const totalContributed = memberTransactions
      .filter(t => t.transaction_type === 'CONTRIBUTION')
      .reduce((sum, t) => sum + t.amount, 0);

    const contributions = memberTransactions
      .filter(t => t.transaction_type === 'CONTRIBUTION')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const lastContributionDate = contributions.length > 0 ? contributions[0].date : null;
    
    const memberLoans = loans.filter(l => l.memberId === memberId && l.date_given <= workingDate);
    
    let activeLoans = 0;
    let totalLoanBalance = 0;

    memberLoans.forEach(l => {
      const details = getLoanDetails(l);
      if (details.status !== 'PAID') {
        activeLoans++;
        totalLoanBalance += details.balance;
      }
    });

    const memberAccounts = accounts.filter(a => a.memberId === memberId && a.type === 'MEMBER');
    let fundsHeld = 0;
    memberAccounts.forEach(acc => {
      const bal = getAccountBalance(acc.id);
      fundsHeld += bal.total;
    });

    return { totalContributed, activeLoans, totalLoanBalance, lastContributionDate, fundsHeld };
  }, [transactions, loans, accounts, getLoanDetails, getAccountBalance, workingDate]);

  // --- ACTIONS ---

  const addMember = async (name: string, startingCredit: number = 0) => {
    const sanitizedName = sanitizeString(name);
    const nameValidation = validateMemberName(sanitizedName);
    if (!nameValidation.valid) {
      throw new Error(nameValidation.error);
    }
    if (startingCredit > 0) {
      const creditValidation = validateAmount(startingCredit);
      if (!creditValidation.valid) {
        throw new Error(creditValidation.error);
      }
    }
    const id = uuidv4();
    const newMember = { id, name: sanitizedName, active: true, advance_credit: startingCredit };
    setMembers(prev => [...prev, newMember]);
    await supabase.from('members').insert(newMember);
    logAudit('CREATED', 'members', id, `Added member ${sanitizedName}`);
    return id;
  };

  const updateMember = async (id: string, updates: Partial<Member>) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    await supabase.from('members').update(updates).eq('id', id);
    logAudit('UPDATED', 'members', id, `Updated member fields: ${Object.keys(updates).join(', ')}`);
  };

  const addAccount = async (name: string, type: AccountType, memberId?: string) => {
    const sanitizedName = sanitizeString(name);
    const nameValidation = validateAccountName(sanitizedName);
    if (!nameValidation.valid) {
      throw new Error(nameValidation.error);
    }
    const typeValidation = validateAccountType(type);
    if (!typeValidation.valid) {
      throw new Error(typeValidation.error);
    }
    const id = uuidv4();
    const newAccount = { id, account_name: sanitizedName, type, active: true, member_id: memberId || null };
    setAccounts(prev => [...prev, { ...newAccount, memberId }]);
    await supabase.from('accounts').insert(newAccount);
    logAudit('CREATED', 'accounts', id, `Created account ${sanitizedName}`);
    return id;
  };

  const deleteAccount = async (id: string) => {
    const bal = getAccountBalance(id);
    if (Math.abs(bal.total) > 0.01) return `Cannot delete. Balance is ${bal.total}`;
    
    setAccounts(prev => prev.filter(a => a.id !== id));
    await supabase.from('accounts').delete().eq('id', id);
    logAudit('DELETED', 'accounts', id, 'Deleted account');
    return null;
  };

  const addContribution = async (memberId: string, amount: number, accountId: string, date: string, notes: string, skipDuplicateCheck = false): Promise<string | null> => {
    const amountValidation = validateAmount(amount);
    if (!amountValidation.valid) {
      return `Validation Failed: ${amountValidation.error}`;
    }
    const dateValidation = validateDate(date);
    if (!dateValidation.valid) {
      return "Validation Failed: Invalid date provided.";
    }
    const notesValidation = validateNotes(notes);
    if (!notesValidation.valid) {
      return `Validation Failed: ${notesValidation.error}`;
    }
    const sanitizedNotes = sanitizeString(notes);

    // Check for missed previous day payment
    const currentDate = new Date(date);
    const prevDateObj = new Date(currentDate);
    prevDateObj.setDate(currentDate.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    const hasPrevDayContribution = transactionsRef.current.some(t => 
      t.memberId === memberId && 
      t.date === prevDate && 
      t.transaction_type === 'CONTRIBUTION'
    );

    let amountForToday = amount;
    let amountForYesterday = 0;

    // If missed yesterday and paying enough to cover both (assuming 1000 daily standard)
    if (!hasPrevDayContribution && amount >= 2000) {
       amountForYesterday = 1000;
       amountForToday = amount - 1000;
    }

    // --- PROCESS YESTERDAY'S CATCH-UP ---
    if (amountForYesterday > 0) {
       if (!skipDuplicateCheck && isDuplicateTransaction(memberId, accountId, amountForYesterday, 'CONTRIBUTION', prevDate)) {
         console.warn("Duplicate catch-up transaction detected");
       } else {
         const tId = uuidv4();
         const transDB = {
            id: tId, date: prevDate, member_id: memberId, account_id: accountId,
            fund_type: 'PRINCIPAL', transaction_type: 'CONTRIBUTION', amount: amountForYesterday,
            notes: `${sanitizedNotes} (Catch-up for ${prevDate})`,
            created_at: new Date().toISOString(), last_modified: new Date().toISOString(),
            created_by: 'Treasurer'
         };
         // Insert immediately to state and DB
         setTransactions(prev => [...prev, { ...transDB, memberId, accountId } as Transaction]);
         await supabase.from('transactions').insert(transDB);
       }
    }

    // --- PROCESS TODAY'S CONTRIBUTION ---
    if (amountForToday <= 0) return null; // All went to yesterday?

    if (!skipDuplicateCheck && isDuplicateTransaction(memberId, accountId, amountForToday, 'CONTRIBUTION', date)) {
      return "Duplicate transaction detected! Please wait a moment or check records.";
    }

    const member = members.find(m => m.id === memberId);
    if (!member) return 'Member not found';

    const existingContributionAmountOnDate = transactionsRef.current
      .filter(t => t.memberId === memberId && t.date === date && t.transaction_type === 'CONTRIBUTION')
      .reduce((sum, t) => sum + t.amount, 0);

    const remainingShareCapacity = Math.max(0, 1000 - existingContributionAmountOnDate);
    let totalPool = amountForToday + member.advance_credit;
    const share = Math.min(remainingShareCapacity, totalPool);
    let extra = totalPool - share;

    const newTransactions: any[] = [];
    
    if (share > 0) {
      const tId = uuidv4();
      newTransactions.push({
        id: tId, date, member_id: memberId, account_id: accountId,
        fund_type: 'PRINCIPAL', transaction_type: 'CONTRIBUTION', amount: share,
        notes: sanitizedNotes || 'Daily Share',
        created_at: new Date().toISOString(), 
        last_modified: new Date().toISOString(),
        created_by: 'Treasurer'
      });
    }

    let remainingExtra = extra;
    let updatedAdvanceCredit = 0;

    if (remainingExtra > 0) {
       const getDetailsWithRef = (l: Loan) => {
        const interestAmount = l.interest_amount ?? (l.amount_given * (l.interest_rate / 100));
        const totalDue = l.amount_given + interestAmount;
        const amountPaid = transactionsRef.current
          .filter(t => t.related_loan_id === l.id && t.transaction_type === 'LOAN_REPAYMENT' && t.date <= workingDate)
          .reduce((sum, t) => sum + t.amount, 0);
        return { balance: totalDue - amountPaid, interestAmount };
      };

      const unpaidLoans = loans
        .filter(l => l.memberId === memberId)
        .map(l => ({ ...l, ...getDetailsWithRef(l) }))
        .filter(l => l.balance > 0)
        .sort((a, b) => new Date(a.date_given).getTime() - new Date(b.date_given).getTime());
      
      for (const loan of unpaidLoans) {
        if (remainingExtra <= 0) break;
        const repaymentAmount = Math.min(remainingExtra, loan.balance);
        if (repaymentAmount > 0) {
           const interestAlreadyPaid = transactionsRef.current
            .filter(t => t.related_loan_id === loan.id && t.transaction_type === 'LOAN_REPAYMENT' && t.fund_type === 'INTEREST')
            .reduce((sum, t) => sum + t.amount, 0);
           const interestRemaining = Math.max(0, loan.interestAmount - interestAlreadyPaid);
           
           let iComp = 0; let pComp = 0;
           if (repaymentAmount <= interestRemaining) { iComp = repaymentAmount; } 
           else { iComp = interestRemaining; pComp = repaymentAmount - interestRemaining; }

           if (iComp > 0) {
              newTransactions.push({
                id: uuidv4(), date, member_id: memberId, account_id: accountId,
                fund_type: 'INTEREST', transaction_type: 'LOAN_REPAYMENT', amount: iComp,
                related_loan_id: loan.id, notes: 'Auto-repayment (Interest)',
                created_at: new Date().toISOString(), last_modified: new Date().toISOString(),
                created_by: 'Treasurer'
              });
           }
           if (pComp > 0) {
              newTransactions.push({
                id: uuidv4(), date, member_id: memberId, account_id: accountId,
                fund_type: 'PRINCIPAL', transaction_type: 'LOAN_REPAYMENT', amount: pComp,
                related_loan_id: loan.id, notes: 'Auto-repayment (Principal)',
                created_at: new Date().toISOString(), last_modified: new Date().toISOString(),
                created_by: 'Treasurer'
              });
           }
           remainingExtra -= repaymentAmount;
        }
      }
      updatedAdvanceCredit = remainingExtra;
    }

    const mappedNewTransactions = newTransactions.map(t => ({
      ...t, memberId: t.member_id, accountId: t.account_id, related_loan_id: t.related_loan_id
    }));
    
    setTransactions(prev => [...prev, ...mappedNewTransactions]);
    updateMember(memberId, { advance_credit: updatedAdvanceCredit });

    if (newTransactions.length > 0) {
      await supabase.from('transactions').insert(newTransactions);
      logAudit('CREATED', 'transactions', 'batch', `Added contribution/repayments for ${member.name}`);
    }

    return null;
  };

  const addLoan = async (memberId: string, amount: number, accountId: string, date: string, interestRate: number) => {
    // Validate date
    if (!date || isNaN(new Date(date).getTime())) {
        return "Validation Failed: Invalid date provided.";
    }

    const accountBalance = getAccountBalance(accountId);
    // Modified: Check TOTAL balance instead of just Principal.
    // This allows borrowing from Interest funds if Principal is insufficient.
    if (accountBalance.total < amount) {
       return `Validation Failed: Insufficient Funds in Account. Available Total: ${accountBalance.total}, Needed: ${amount}.`;
    }

    if (isDuplicateTransaction(memberId, accountId, amount * -1, 'LOAN_GIVEN', date)) {
        return "Duplicate loan transaction detected.";
    }

    const memberLoans = loans.filter(l => l.memberId === memberId);
    const hasActiveLoan = memberLoans.some(l => getLoanDetails(l).status !== 'PAID');
    if (hasActiveLoan) return 'Member has outstanding loan.';

    const loanId = uuidv4();
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 30);
    const interestVal = amount * (interestRate / 100);

    const loanDB = {
      id: loanId, member_id: memberId, amount_given: amount,
      interest_rate: interestRate, interest_amount: interestVal,
      date_given: date, due_date: dueDate.toISOString(),
      created_at: new Date().toISOString()
    };

    const transId = uuidv4();
    const transDB = {
      id: transId, date, member_id: memberId, account_id: accountId,
      fund_type: 'PRINCIPAL', transaction_type: 'LOAN_GIVEN',
      amount: -amount, notes: `Loan given`,
      created_at: new Date().toISOString(), last_modified: new Date().toISOString(),
      created_by: 'Treasurer',
      related_loan_id: loanId
    };

    setLoans(prev => [...prev, { ...loanDB, memberId }]);
    setTransactions(prev => [...prev, { ...transDB, memberId, accountId, related_loan_id: loanId } as Transaction]);

    await supabase.from('loans').insert(loanDB);
    await supabase.from('transactions').insert(transDB);
    logAudit('CREATED', 'loans', loanId, `Loan given to member ${memberId}`);
    return null;
  };

  const addRepayment = async (loanId: string, amount: number, accountId: string, date: string, notes: string, skipDuplicateCheck = false): Promise<string | null> => {
     if (!date || isNaN(new Date(date).getTime())) {
        console.error("Invalid date for repayment");
        return "Invalid date";
     }
     if (!skipDuplicateCheck && isDuplicateTransaction(undefined, accountId, amount, 'LOAN_REPAYMENT', date)) {
        console.warn("Potential duplicate repayment");
     }

     const loan = loans.find(l => l.id === loanId);
     if (!loan) return "Loan not found";

     const totalInterest = loan.interest_amount ?? (loan.amount_given * (loan.interest_rate / 100));
     const interestPaid = transactionsRef.current
        .filter(t => t.related_loan_id === loanId && t.transaction_type === 'LOAN_REPAYMENT' && t.fund_type === 'INTEREST')
        .reduce((sum, t) => sum + t.amount, 0);
     const interestRemaining = Math.max(0, totalInterest - interestPaid);
     
     let iComp = 0; let pComp = 0;
     if (amount <= interestRemaining) { iComp = amount; }
     else { iComp = interestRemaining; pComp = amount - interestRemaining; }

     const newTransDB = [];
     if (iComp > 0) {
        newTransDB.push({
            id: uuidv4(), date, member_id: loan.memberId, account_id: accountId,
            fund_type: 'INTEREST', transaction_type: 'LOAN_REPAYMENT', amount: iComp,
            related_loan_id: loanId, notes: notes ? `${notes} (Int)` : 'Repayment (Int)',
            created_at: new Date().toISOString(), last_modified: new Date().toISOString(),
            created_by: 'Treasurer'
        });
     }
     if (pComp > 0) {
        newTransDB.push({
            id: uuidv4(), date, member_id: loan.memberId, account_id: accountId,
            fund_type: 'PRINCIPAL', transaction_type: 'LOAN_REPAYMENT', amount: pComp,
            related_loan_id: loanId, notes: notes ? `${notes} (Prin)` : 'Repayment (Prin)',
            created_at: new Date().toISOString(), last_modified: new Date().toISOString(),
            created_by: 'Treasurer'
        });
     }

     const localTrans = newTransDB.map(t => ({ ...t, memberId: loan.memberId, accountId: t.account_id, related_loan_id: t.related_loan_id } as Transaction));
     setTransactions(prev => [...prev, ...localTrans]);
     await supabase.from('transactions').insert(newTransDB);
     logAudit('CREATED', 'transactions', 'batch', `Repayment for loan ${loanId}`);
     return null;
  };

  const addExpense = async (amount: number, accountId: string, date: string, notes: string, skipDuplicateCheck = false) => {
    if (!date || isNaN(new Date(date).getTime())) {
        return "Validation Failed: Invalid date provided.";
    }
    const bal = getAccountBalance(accountId);
    if (bal.interest < amount) {
        return `Validation Failed: Insufficient Interest Funds. Available Interest: ${bal.interest}. Expenses must come from Interest.`;
    }

    if (!skipDuplicateCheck && isDuplicateTransaction(undefined, accountId, amount * -1, 'EXPENSE', date)) {
        return "Duplicate expense detected.";
    }

    const id = uuidv4();
    const transDB = {
        id, date, account_id: accountId, fund_type: 'INTEREST',
        transaction_type: 'EXPENSE', amount: -amount, notes,
        created_at: new Date().toISOString(), last_modified: new Date().toISOString(),
        created_by: 'Treasurer'
    };

    setTransactions(prev => [...prev, { ...transDB, accountId } as Transaction]);
    await supabase.from('transactions').insert(transDB);
    logAudit('CREATED', 'transactions', id, `Expense: ${notes}`);
    return null;
  };

  const addTransfer = async (fromAccountId: string, toAccountId: string, amount: number, fundType: 'PRINCIPAL' | 'INTEREST', date: string, notes: string, skipDuplicateCheck = false) => {
    if (!date || isNaN(new Date(date).getTime())) {
        return "Validation Failed: Invalid date provided.";
    }
    const fromBal = getAccountBalance(fromAccountId);
    const available = fundType === 'PRINCIPAL' ? fromBal.principal : fromBal.interest;
    
    if (available < amount) {
        return `Validation Failed: Insufficient ${fundType} funds in source account. Available: ${available}.`;
    }

    if (!skipDuplicateCheck && isDuplicateTransaction(undefined, fromAccountId, amount * -1, 'TRANSFER', date)) {
        return "Duplicate transfer detected.";
    }

    const t1Id = uuidv4(); const t2Id = uuidv4();
    const trans1 = {
        id: t1Id, date, account_id: fromAccountId, fund_type: fundType,
        transaction_type: 'TRANSFER', amount: -amount,
        notes: `Transfer to ${accounts.find(a=>a.id===toAccountId)?.account_name}: ${notes}`,
        created_at: new Date().toISOString(), last_modified: new Date().toISOString(),
        created_by: 'Treasurer'
    };
    const trans2 = {
        id: t2Id, date, account_id: toAccountId, fund_type: fundType,
        transaction_type: 'TRANSFER', amount: amount,
        notes: `Transfer from ${accounts.find(a=>a.id===fromAccountId)?.account_name}: ${notes}`,
        created_at: new Date().toISOString(), last_modified: new Date().toISOString(),
        created_by: 'Treasurer'
    };

    setTransactions(prev => [...prev, 
        {...trans1, accountId: fromAccountId } as Transaction, 
        {...trans2, accountId: toAccountId } as Transaction
    ]);
    await supabase.from('transactions').insert([trans1, trans2]);
    logAudit('CREATED', 'transactions', 'batch', `Transfer ${amount} ${fundType}`);
    return null;
  };

  const addOpeningBalance = async (accountId: string, amount: number, fundType: 'PRINCIPAL' | 'INTEREST', date: string, notes: string, skipDuplicateCheck = false): Promise<string | null> => {
      if (!date || isNaN(new Date(date).getTime())) {
          console.error("Invalid date for opening balance");
          return "Invalid date";
      }
      
      if (!skipDuplicateCheck && isDuplicateTransaction(undefined, accountId, amount, 'OPENING_BALANCE', date)) {
          console.warn("Duplicate opening balance detected");
      }
      
      const id = uuidv4();
      const transDB = {
          id, date, account_id: accountId, fund_type: fundType,
          transaction_type: 'OPENING_BALANCE', amount, notes,
          created_at: new Date().toISOString(), last_modified: new Date().toISOString(),
          created_by: 'Treasurer'
      };

      setTransactions(prev => [...prev, { ...transDB, accountId } as Transaction]);
      await supabase.from('transactions').insert(transDB);
      logAudit('CREATED', 'transactions', id, 'Opening Balance');
      return null;
  };

  const deleteTransaction = async (id: string) => {
      const transaction = transactions.find(t => t.id === id);
      
      // If it's a LOAN_GIVEN transaction, we should also delete the loan record
      if (transaction?.transaction_type === 'LOAN_GIVEN' && transaction.related_loan_id) {
          setLoans(prev => prev.filter(l => l.id !== transaction.related_loan_id));
          await supabase.from('loans').delete().eq('id', transaction.related_loan_id);
      }

      setTransactions(prev => prev.filter(t => t.id !== id));
      await supabase.from('transactions').delete().eq('id', id);
      logAudit('DELETED', 'transactions', id, 'Deleted Transaction');
  };

  const deleteLoan = async (id: string) => {
      // Delete associated transactions first
      setTransactions(prev => prev.filter(t => t.related_loan_id !== id));
      await supabase.from('transactions').delete().eq('related_loan_id', id);
      
      // Delete the loan
      setLoans(prev => prev.filter(l => l.id !== id));
      await supabase.from('loans').delete().eq('id', id);
      
      logAudit('DELETED', 'loans', id, 'Deleted Loan and associated transactions');
  };

  const exportData = () => {
    return JSON.stringify({
      members, accounts, transactions, loans, chatMessages,
      version: '2.0', exportedAt: new Date().toISOString()
    }, null, 2);
  };

  const importData = async (jsonString: string) => {
      try {
          const data = JSON.parse(jsonString);
          await resetData();
          if(data.members) await supabase.from('members').insert(data.members.map((m:any) => ({...m, id: m.id || uuidv4()})));
          if(data.accounts) await supabase.from('accounts').insert(data.accounts.map((a:any) => ({...a, member_id: a.memberId})));
          if(data.loans) await supabase.from('loans').insert(data.loans.map((l:any) => ({...l, member_id: l.memberId})));
          if(data.transactions) await supabase.from('transactions').insert(data.transactions.map((t:any) => ({...t, member_id: t.memberId, account_id: t.accountId})));
          
          await fetchData();
          return true;
      } catch (e) {
          console.error(e);
          return false;
      }
  };

  const resetData = async () => {
      await supabase.from('ai_chat_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('loans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setMembers([]); setAccounts([]); setTransactions([]); setLoans([]);
      logAudit('DELETED', 'ALL', 'RESET', 'System Reset');
  };
  
  const checkLastBackup = () => {
      return localStorage.getItem('wealthshare_last_backup');
  };
  
  const logBackup = () => {
      localStorage.setItem('wealthshare_last_backup', new Date().toISOString());
  };

  const addChatMessage = async (sender: 'user'|'ai', text?: string, actions?: ActionDraft[]) => {
      const id = uuidv4();
      const msg = { id, sender, text, actions, timestamp: new Date().toISOString() };
      setChatMessages(prev => [...prev, msg]);
      await supabase.from('ai_chat_history').insert(msg);
  };

  const updateChatMessage = async (id: string, updates: Partial<ChatMessage>) => {
    setChatMessages(prev => prev.map(msg => msg.id === id ? { ...msg, ...updates } : msg));
    await supabase.from('ai_chat_history').update(updates).eq('id', id);
  };

  const clearChatHistory = async () => {
      setChatMessages([]);
      await supabase.from('ai_chat_history').delete().neq('id', '0');
  };

  return (
    <StoreContext.Provider value={{
      members, accounts, transactions, loans, notifications, chatMessages, isLoading, workingDate, isCloudMode, offlineReason, connectionError,
      setWorkingDate, addMember, updateMember, addAccount, deleteAccount,
      addContribution, addLoan, addRepayment, addExpense, addTransfer, addOpeningBalance, deleteTransaction, deleteLoan,
      addChatMessage, updateChatMessage, clearChatHistory,
      getLoanDetails, getMemberStats, getAccountBalance, dismissNotification,
      exportData, importData, resetData, checkLastBackup, logBackup, signOut
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
};
