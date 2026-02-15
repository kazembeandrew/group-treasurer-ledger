
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Member, Account, Transaction, Loan, Notification, LoanStatus, AccountType, ChatMessage, ActionDraft } from './types';
import { supabase, isCloudMode } from './supabaseClient';

interface StoreContextType {
  members: Member[];
  accounts: Account[];
  transactions: Transaction[];
  loans: Loan[];
  notifications: Notification[];
  chatMessages: ChatMessage[];
  isLoading: boolean;
  workingDate: string;
  isCloudMode: boolean; // Added property
  setWorkingDate: (date: string) => void;
  addMember: (name: string, startingCredit?: number) => Promise<string>;
  updateMember: (id: string, updates: Partial<Member>) => Promise<void>;
  addAccount: (name: string, type: AccountType, memberId?: string) => Promise<string>;
  deleteAccount: (id: string) => Promise<string | null>;
  addContribution: (memberId: string, amount: number, accountId: string, date: string, notes: string) => Promise<string | null>;
  addLoan: (memberId: string, amount: number, accountId: string, date: string, interestRate: number) => Promise<string | null>;
  addRepayment: (loanId: string, amount: number, accountId: string, date: string, notes: string) => Promise<void>;
  addExpense: (amount: number, accountId: string, date: string, notes: string) => Promise<string | null>;
  addTransfer: (fromAccountId: string, toAccountId: string, amount: number, fundType: 'PRINCIPAL' | 'INTEREST', date: string, notes: string) => Promise<void>;
  addOpeningBalance: (accountId: string, amount: number, fundType: 'PRINCIPAL' | 'INTEREST', date: string, notes: string) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addChatMessage: (sender: 'user' | 'ai', text?: string, actions?: ActionDraft[]) => Promise<void>;
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
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [workingDate, setWorkingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(true);

  const addNotification = useCallback((message: string, type: Notification['type'] = 'info') => {
    setNotifications(prev => [{
      id: uuidv4(),
      message,
      type,
      date: new Date().toISOString()
    }, ...prev]);
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch Members
      const { data: membersData, error: mError } = await supabase.from('members').select('*');
      if (mError) addNotification('Error fetching members: ' + mError.message, 'error');
      else if (membersData) setMembers(membersData);

      // Fetch Accounts
      const { data: accountsData, error: aError } = await supabase.from('accounts').select('*');
      if (aError) {
        addNotification('Error fetching accounts: ' + aError.message, 'error');
      } else if (accountsData) {
        if (accountsData.length === 0) {
          console.log("No accounts found. Seeding defaults if using mock or empty DB...");
          const defaultAccounts = [
            { id: uuidv4(), account_name: 'Cash', type: 'CASH', active: true },
            { id: uuidv4(), account_name: 'Airtel Money', type: 'MOBILE', active: true },
            { id: uuidv4(), account_name: 'Mpamba', type: 'MOBILE', active: true },
            { id: uuidv4(), account_name: 'Bank', type: 'BANK', active: true }
          ];
          
          // Optimistic update
          setAccounts(defaultAccounts.map(a => ({ ...a, type: a.type as AccountType, memberId: undefined })));
          
          // Persist
          await supabase.from('accounts').insert(defaultAccounts);
          addNotification('Created default accounts.', 'info');
        } else {
          // Map snake_case to camelCase
          setAccounts(accountsData.map((a: any) => ({
            ...a,
            memberId: a.member_id
          })));
        }
      }

      // Fetch Loans
      const { data: loansData, error: lError } = await supabase.from('loans').select('*');
      if (lError) addNotification('Error fetching loans: ' + lError.message, 'error');
      else if (loansData) {
        setLoans(loansData.map((l: any) => ({
          ...l,
          memberId: l.member_id
        })));
      }

      // Fetch Transactions
      const { data: transData, error: tError } = await supabase.from('transactions').select('*');
      if (tError) addNotification('Error fetching transactions: ' + tError.message, 'error');
      else if (transData) {
        setTransactions(transData.map((t: any) => ({
          ...t,
          memberId: t.member_id,
          accountId: t.account_id,
          related_loan_id: t.related_loan_id 
        })));
      }

      // Fetch Chat History
      // We try to fetch chat history, but if the table doesn't exist (migrations not run), we ignore it gracefully
      const { data: chatData, error: cError } = await supabase
        .from('ai_chat_history')
        .select('*')
        .order('timestamp', { ascending: true });
      
      if (cError) {
         console.warn('Error fetching chat history (Table might be missing):', cError.message);
      } else if (chatData) {
        setChatMessages(chatData.map((c: any) => ({
          id: c.id,
          sender: c.sender,
          text: c.text,
          actions: c.actions,
          timestamp: c.timestamp
        })));
      }
    } catch (e: any) {
      console.error("Critical error during data fetch:", e);
      addNotification("Critical error loading data. Please check connection.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const deleteTransaction = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) {
      addNotification('Failed to delete transaction: ' + error.message, 'error');
      return;
    }
    setTransactions(prev => prev.filter(t => t.id !== id));
    addNotification('Transaction deleted.', 'info');
  };

  const addChatMessage = async (sender: 'user' | 'ai', text?: string, actions?: ActionDraft[]) => {
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    const newMessage: ChatMessage = { id, sender, text, actions, timestamp };
    
    setChatMessages(prev => [...prev, newMessage]);

    const { error } = await supabase.from('ai_chat_history').insert({
      id,
      sender,
      text,
      actions, // JSONB
      timestamp
    });

    if (error) {
      console.error('Failed to save chat message:', error);
    }
  };

  const clearChatHistory = async () => {
    setChatMessages([]);
    const { error } = await supabase.from('ai_chat_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) addNotification('Failed to clear chat history: ' + error.message, 'error');
    else addNotification('Chat history cleared.', 'info');
  };

  // Helper to check if a date is on or before working date
  const isBeforeOrOnWorkingDate = useCallback((dateStr: string) => {
    return dateStr <= workingDate;
  }, [workingDate]);

  const getAccountBalance = useCallback((accountId: string) => {
    // Filter transactions by working date
    const accTrans = transactions.filter(t => 
      t.accountId === accountId && isBeforeOrOnWorkingDate(t.date)
    );
    const principal = accTrans.filter(t => t.fund_type === 'PRINCIPAL').reduce((sum, t) => sum + t.amount, 0);
    const interest = accTrans.filter(t => t.fund_type === 'INTEREST').reduce((sum, t) => sum + t.amount, 0);
    return { principal, interest, total: principal + interest };
  }, [transactions, isBeforeOrOnWorkingDate]);

  const getLoanDetails = useCallback((loan: Loan) => {
    const interestAmount = (loan.amount_given * (loan.interest_rate / 100));
    const totalDue = loan.amount_given + interestAmount;
    
    // Only count repayments made on or before the working date
    const amountPaid = transactions
      .filter(t => 
        t.related_loan_id === loan.id && 
        t.transaction_type === 'LOAN_REPAYMENT' &&
        isBeforeOrOnWorkingDate(t.date)
      )
      .reduce((sum, t) => sum + t.amount, 0);
      
    const balance = totalDue - amountPaid;
    
    let status: LoanStatus = 'UNPAID';
    if (balance <= 0) status = 'PAID';
    // Logic for overdue depends on if the due date has passed RELATIVE TO WORKING DATE
    else if (workingDate > loan.due_date) status = 'OVERDUE';

    return { interestAmount, totalDue, amountPaid, balance, status };
  }, [transactions, workingDate, isBeforeOrOnWorkingDate]);

  const getMemberStats = useCallback((memberId: string) => {
    // Filter transactions by working date
    const memberTransactions = transactions.filter(t => 
      t.memberId === memberId && isBeforeOrOnWorkingDate(t.date)
    );
    
    const totalContributed = memberTransactions
      .filter(t => t.transaction_type === 'CONTRIBUTION')
      .reduce((sum, t) => sum + t.amount, 0);

    const contributions = memberTransactions
      .filter(t => t.transaction_type === 'CONTRIBUTION')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const lastContributionDate = contributions.length > 0 ? contributions[0].date : null;
    
    // Filter loans by working date (only show loans given on or before working date)
    const memberLoans = loans.filter(l => 
      l.memberId === memberId && isBeforeOrOnWorkingDate(l.date_given)
    );
    
    let activeLoans = 0;
    let totalLoanBalance = 0;

    memberLoans.forEach(l => {
      const details = getLoanDetails(l);
      if (details.status !== 'PAID') {
        activeLoans++;
        totalLoanBalance += details.balance;
      }
    });

    // Calculate funds held by this member (accounts linked to memberId)
    const memberAccounts = accounts.filter(a => a.memberId === memberId && a.type === 'MEMBER');
    let fundsHeld = 0;
    memberAccounts.forEach(acc => {
      const bal = getAccountBalance(acc.id);
      fundsHeld += bal.total;
    });

    return { totalContributed, activeLoans, totalLoanBalance, lastContributionDate, fundsHeld };
  }, [transactions, loans, accounts, getLoanDetails, getAccountBalance, isBeforeOrOnWorkingDate]);

  const addMember = async (name: string, startingCredit: number = 0) => {
    const id = uuidv4();
    const newMember = { id, name, active: true, advance_credit: startingCredit };
    
    // Optimistic Update
    setMembers(prev => [...prev, newMember]);
    
    const { error } = await supabase.from('members').insert(newMember);
    if (error) {
      addNotification('Failed to add member to DB: ' + error.message, 'error');
    }
    return id;
  };

  const updateMember = async (id: string, updates: Partial<Member>) => {
    // Optimistic
    setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    
    const { error } = await supabase.from('members').update(updates).eq('id', id);
    if (error) addNotification('Failed to update member in DB: ' + error.message, 'error');
  };

  const addAccount = async (name: string, type: AccountType, memberId?: string) => {
    const id = uuidv4();
    const newAccount = {
      id,
      account_name: name,
      type,
      active: true,
      member_id: memberId || null
    };

    setAccounts(prev => [...prev, {
      id, 
      account_name: name,
      type,
      active: true,
      memberId
    }]);

    const { error } = await supabase.from('accounts').insert(newAccount);
    if (error) addNotification('Failed to create account in DB: ' + error.message, 'error');
    else addNotification(`Account "${name}" created successfully.`, 'success');
    
    return id;
  };

  const deleteAccount = async (id: string) => {
    const accTrans = transactions.filter(t => t.accountId === id);
    const totalBalance = accTrans.reduce((sum, t) => sum + t.amount, 0);

    if (Math.abs(totalBalance) > 0.01) {
      return `Cannot delete account. It has a remaining balance of ${totalBalance.toLocaleString()} MK.`;
    }

    setAccounts(prev => prev.filter(a => a.id !== id));
    
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) {
      addNotification('Failed to delete account from DB: ' + error.message, 'error');
      fetchData(); // Sync back
    } else {
      addNotification('Account deleted.', 'info');
    }
    return null;
  };

  const addContribution = async (memberId: string, amount: number, accountId: string, date: string, notes: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return 'Member not found';

    const existingContributionAmountOnDate = transactions
      .filter(t => t.memberId === memberId && t.date === date && t.transaction_type === 'CONTRIBUTION')
      .reduce((sum, t) => sum + t.amount, 0);

    const remainingShareCapacity = Math.max(0, 1000 - existingContributionAmountOnDate);
    
    let totalPool = amount + member.advance_credit;
    const share = Math.min(remainingShareCapacity, totalPool);
    let extra = totalPool - share;

    const newTransactions: any[] = [];
    const localNewTransactions: Transaction[] = [];
    
    if (share > 0) {
      const tId = uuidv4();
      const tData = {
        id: tId,
        date,
        member_id: memberId,
        account_id: accountId,
        fund_type: 'PRINCIPAL',
        transaction_type: 'CONTRIBUTION',
        amount: share,
        notes: notes || 'Daily Share'
      };
      newTransactions.push(tData);
      localNewTransactions.push({
        ...tData, memberId, accountId, fund_type: 'PRINCIPAL', transaction_type: 'CONTRIBUTION'
      });
    }

    let remainingExtra = extra;
    let updatedAdvanceCredit = 0;

    if (remainingExtra > 0) {
      const unpaidLoans = loans
        .filter(l => l.memberId === memberId)
        .map(l => ({ ...l, ...getLoanDetails(l) }))
        .filter(l => l.status !== 'PAID')
        .sort((a, b) => new Date(a.date_given).getTime() - new Date(b.date_given).getTime());

      for (const loan of unpaidLoans) {
        if (remainingExtra <= 0) break;
        const repaymentAmount = Math.min(remainingExtra, loan.balance);
        if (repaymentAmount > 0) {
          const tId = uuidv4();
          const tData = {
            id: tId,
            date,
            member_id: memberId,
            account_id: accountId,
            fund_type: 'PRINCIPAL',
            transaction_type: 'LOAN_REPAYMENT',
            amount: repaymentAmount,
            related_loan_id: loan.id,
            notes: 'Auto-repayment from extra contribution'
          };
          newTransactions.push(tData);
          localNewTransactions.push({
             ...tData, memberId, accountId, fund_type: 'PRINCIPAL', transaction_type: 'LOAN_REPAYMENT'
          });
          remainingExtra -= repaymentAmount;
        }
      }

      updatedAdvanceCredit = remainingExtra;
    }

    // Optimistic updates
    setTransactions(prev => [...prev, ...localNewTransactions]);
    updateMember(memberId, { advance_credit: updatedAdvanceCredit });

    // Bulk insert transactions
    if (newTransactions.length > 0) {
      const { error } = await supabase.from('transactions').insert(newTransactions);
      if (error) {
        console.error(error);
        addNotification('Failed to save contributions: ' + error.message, 'error');
        fetchData(); // Resync on error
      }
    }

    return null;
  };

  const addLoan = async (memberId: string, amount: number, accountId: string, date: string, interestRate: number) => {
    const balance = getAccountBalance(accountId);
    if (balance.total < amount) return 'Insufficient funds in account';

    const memberLoans = loans.filter(l => l.memberId === memberId);
    const hasActiveLoan = memberLoans.some(l => getLoanDetails(l).status !== 'PAID');
    if (hasActiveLoan) {
      return 'Member already has an outstanding loan. Please repay it first.';
    }

    const loanId = uuidv4();
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 30); // Default 30 days due

    const loanDB = {
      id: loanId,
      member_id: memberId,
      amount_given: amount,
      interest_rate: interestRate,
      date_given: date,
      due_date: dueDate.toISOString()
    };

    const transId = uuidv4();
    const transDB = {
      id: transId,
      date,
      member_id: memberId,
      account_id: accountId,
      fund_type: 'PRINCIPAL',
      transaction_type: 'LOAN_GIVEN',
      amount: -amount,
      notes: `Loan given to member`
    };

    // Optimistic
    setLoans(prev => [...prev, {
      id: loanId,
      memberId,
      amount_given: amount,
      interest_rate: interestRate,
      date_given: date,
      due_date: dueDate.toISOString()
    }]);

    setTransactions(prev => [...prev, {
      id: transId,
      date,
      memberId,
      accountId,
      fund_type: 'PRINCIPAL',
      transaction_type: 'LOAN_GIVEN',
      amount: -amount,
      notes: `Loan given to member`
    }]);

    // DB calls
    const { error: lError } = await supabase.from('loans').insert(loanDB);
    if (lError) {
      addNotification('Failed to create loan: ' + lError.message, 'error');
      fetchData(); return 'Database error';
    }

    const { error: tError } = await supabase.from('transactions').insert(transDB);
    if (tError) {
      addNotification('Failed to record loan transaction: ' + tError.message, 'error');
    }

    return null;
  };

  const addRepayment = async (loanId: string, amount: number, accountId: string, date: string, notes: string) => {
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;

    const tId = uuidv4();
    const transDB = {
      id: tId,
      date,
      member_id: loan.memberId,
      account_id: accountId,
      fund_type: 'PRINCIPAL',
      transaction_type: 'LOAN_REPAYMENT',
      amount,
      related_loan_id: loanId,
      notes: notes || 'Direct repayment'
    };

    setTransactions(prev => [...prev, {
      ...transDB, memberId: loan.memberId, accountId, fund_type: 'PRINCIPAL', transaction_type: 'LOAN_REPAYMENT'
    }]);

    const { error } = await supabase.from('transactions').insert(transDB);
    if (error) addNotification('Failed to record repayment: ' + error.message, 'error');
  };

  const addExpense = async (amount: number, accountId: string, date: string, notes: string) => {
    const allInterestIncoming = transactions
      .filter(t => t.fund_type === 'INTEREST' && t.amount > 0 && isBeforeOrOnWorkingDate(t.date))
      .reduce((sum, t) => sum + t.amount, 0);
    const allInterestOutgoing = transactions
      .filter(t => t.transaction_type === 'EXPENSE' && t.fund_type === 'INTEREST' && isBeforeOrOnWorkingDate(t.date))
      .reduce((sum, t) => sum + t.amount, 0);
    
    const availableInterest = allInterestIncoming - allInterestOutgoing;

    if (availableInterest < amount) {
      return `Insufficient interest funds. Available: ${availableInterest} MK`;
    }

    const tId = uuidv4();
    const transDB = {
      id: tId,
      date,
      account_id: accountId,
      fund_type: 'INTEREST',
      transaction_type: 'EXPENSE',
      amount: -amount,
      notes
    };

    setTransactions(prev => [...prev, {
      ...transDB, memberId: undefined, accountId, fund_type: 'INTEREST', transaction_type: 'EXPENSE'
    }]);

    const { error } = await supabase.from('transactions').insert(transDB);
    if (error) addNotification('Failed to record expense: ' + error.message, 'error');
    return null;
  };

  const addTransfer = async (fromAccountId: string, toAccountId: string, amount: number, fundType: 'PRINCIPAL' | 'INTEREST', date: string, notes: string) => {
    const t1Id = uuidv4();
    const t2Id = uuidv4();
    
    const trans1 = {
      id: t1Id,
      date,
      account_id: fromAccountId,
      fund_type: fundType,
      transaction_type: 'TRANSFER',
      amount: -amount,
      notes: `Transfer to ${accounts.find(a => a.id === toAccountId)?.account_name}: ${notes}`
    };

    const trans2 = {
      id: t2Id,
      date,
      account_id: toAccountId,
      fund_type: fundType,
      transaction_type: 'TRANSFER',
      amount: amount,
      notes: `Transfer from ${accounts.find(a => a.id === fromAccountId)?.account_name}: ${notes}`
    };

    setTransactions(prev => [
      ...prev,
      { ...trans1, accountId: fromAccountId, fund_type: fundType as any, transaction_type: 'TRANSFER' },
      { ...trans2, accountId: toAccountId, fund_type: fundType as any, transaction_type: 'TRANSFER' }
    ]);

    const { error } = await supabase.from('transactions').insert([trans1, trans2]);
    if (error) addNotification('Failed to record transfer: ' + error.message, 'error');
  };

  const addOpeningBalance = async (accountId: string, amount: number, fundType: 'PRINCIPAL' | 'INTEREST', date: string, notes: string) => {
    const tId = uuidv4();
    const transDB = {
      id: tId,
      date,
      account_id: accountId,
      fund_type: fundType,
      transaction_type: 'OPENING_BALANCE',
      amount,
      notes: notes || 'Opening Balance'
    };

    setTransactions(prev => [...prev, {
      ...transDB, accountId, fund_type: fundType as any, transaction_type: 'OPENING_BALANCE'
    }]);

    const { error } = await supabase.from('transactions').insert(transDB);
    if (error) addNotification('Failed to record opening balance: ' + error.message, 'error');
  };

  // Data Management
  const exportData = () => {
    const data = {
      members,
      accounts,
      transactions,
      loans,
      chatMessages,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    return JSON.stringify(data, null, 2);
  };

  const importData = async (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.members && data.accounts && data.transactions && data.loans) {
        setIsLoading(true);
        // We'll wipe and replace. Danger zone!
        await resetData();

        // Need to map back to DB format (camelCase -> snake_case)
        const dbMembers = data.members.map((m: any) => ({
          id: m.id, name: m.name, active: m.active, advance_credit: m.advance_credit
        }));
        await supabase.from('members').insert(dbMembers);

        const dbAccounts = data.accounts.map((a: any) => ({
          id: a.id, account_name: a.account_name, type: a.type, active: a.active, member_id: a.memberId
        }));
        await supabase.from('accounts').insert(dbAccounts);

        const dbLoans = data.loans.map((l: any) => ({
          id: l.id, member_id: l.memberId, amount_given: l.amount_given, interest_rate: l.interest_rate, date_given: l.date_given, due_date: l.due_date
        }));
        await supabase.from('loans').insert(dbLoans);

        const dbTrans = data.transactions.map((t: any) => ({
          id: t.id, date: t.date, member_id: t.memberId, account_id: t.accountId, fund_type: t.fund_type, transaction_type: t.transaction_type, amount: t.amount, related_loan_id: t.related_loan_id, notes: t.notes
        }));
        
        // Chunk inserts for transactions to avoid payload limits
        const chunkSize = 100;
        for (let i = 0; i < dbTrans.length; i += chunkSize) {
          const { error } = await supabase.from('transactions').insert(dbTrans.slice(i, i + chunkSize));
          if (error) throw error;
        }

        if (data.chatMessages) {
          const dbChat = data.chatMessages.map((c: any) => ({
             id: c.id, sender: c.sender, text: c.text, actions: c.actions, timestamp: c.timestamp
          }));
          for (let i = 0; i < dbChat.length; i += chunkSize) {
            await supabase.from('ai_chat_history').insert(dbChat.slice(i, i + chunkSize));
          }
        }
        
        await fetchData();
        addNotification('Data imported successfully!', 'success');
        return true;
      }
      return false;
    } catch (e: any) {
      console.error(e);
      addNotification('Failed to import data: ' + e.message, 'error');
      setIsLoading(false);
      return false;
    }
  };

  const resetData = async () => {
    // Delete in order of constraints
    await supabase.from('ai_chat_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('loans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    setMembers([]);
    setTransactions([]);
    setLoans([]);
    setAccounts([]);
    setChatMessages([]);
    addNotification('All data has been wiped from database.', 'warning');
  };

  return (
    <StoreContext.Provider value={{
      members, accounts, transactions, loans, notifications, chatMessages, isLoading, workingDate, isCloudMode, setWorkingDate,
      addMember, updateMember, addAccount, deleteAccount, addContribution, addLoan, addRepayment, addExpense, addTransfer, addOpeningBalance, deleteTransaction,
      addChatMessage, clearChatHistory,
      getLoanDetails, getMemberStats, getAccountBalance, dismissNotification,
      exportData, importData, resetData
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
