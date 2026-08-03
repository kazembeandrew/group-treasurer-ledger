
import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowLeftRight,
  TrendingUp,
  AlertCircle,
  Database,
  Trash2,
  AlertTriangle,
  Banknote,
  Loader2,
  Info
} from 'lucide-react';
import { TransactionType, FundType } from '../types';

export const Transactions: React.FC = () => {
  const { 
    transactions, 
    members, 
    accounts, 
    loans,
    addContribution, 
    addExpense, 
    addTransfer,
    addOpeningBalance,
    addRepayment,
    getLoanDetails,
    workingDate,
    deleteTransaction,
    isLoading
  } = useStore();
  
  const [modalType, setModalType] = useState<TransactionType | 'TRANSFER' | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    memberId: '',
    accountId: '',
    toAccountId: '',
    amount: '',
    date: workingDate,
    notes: '',
    fundType: 'PRINCIPAL' as FundType
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync form date with working date when modal opens or working date changes
  useEffect(() => {
    setFormData(prev => ({ ...prev, date: workingDate }));
  }, [workingDate, modalType]);

  // Check for missed payment on previous day
  const missedYesterday = useMemo(() => {
    if (!formData.memberId || modalType !== 'CONTRIBUTION') return false;
    const currentDate = new Date(formData.date);
    if (isNaN(currentDate.getTime())) return false;
    const prevDateObj = new Date(currentDate);
    prevDateObj.setDate(currentDate.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    const hasPrev = transactions.some(t => 
      t.memberId === formData.memberId && 
      t.date === prevDate && 
      t.transaction_type === 'CONTRIBUTION'
    );
    return !hasPrev;
  }, [formData.memberId, formData.date, modalType, transactions]);

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const amt = parseFloat(formData.amount);
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }

    setIsSubmitting(true);
    let result: string | null = null;

    try {
      if (modalType === 'CONTRIBUTION') {
        result = await addContribution(formData.memberId, amt, formData.accountId, formData.date, formData.notes);
      } else if (modalType === 'EXPENSE') {
        result = await addExpense(amt, formData.accountId, formData.date, formData.notes);
      } else if (modalType === 'TRANSFER') {
        await addTransfer(formData.accountId, formData.toAccountId, amt, formData.fundType, formData.date, formData.notes);
      } else if (modalType === 'OPENING_BALANCE') {
        await addOpeningBalance(formData.accountId, amt, formData.fundType, formData.date, formData.notes);
      } else if (modalType === 'LOAN_REPAYMENT') {
        // Find the active loan for this member
        const activeLoan = loans.find(l => {
          if (l.memberId !== formData.memberId) return false;
          const details = getLoanDetails(l);
          return details.status !== 'PAID';
        });

        if (activeLoan) {
          await addRepayment(activeLoan.id, amt, formData.accountId, formData.date, formData.notes);
        } else {
          result = 'No active unpaid loan found for this member.';
        }
      }
    } catch (e: any) {
      result = e.message || 'Error occurred';
    }

    setIsSubmitting(false);

    if (result) {
      setError(result);
    } else {
      setModalType(null);
      setFormData({
        memberId: '',
        accountId: '',
        toAccountId: '',
        amount: '',
        date: workingDate,
        notes: '',
        fundType: 'PRINCIPAL'
      });
    }
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await deleteTransaction(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading transactions...</div>;

  // Filter transactions for the exact working date and sort by created_at (newest first)
  const sortedTransactions = [...transactions]
    .filter(t => t.date === workingDate)
    .sort((a, b) => {
       // Secondary sort: Creation timestamp desc
       const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
       const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
       return timeB - timeA;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
          <p className="text-slate-500">Records for {new Date(workingDate).toLocaleDateString()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setModalType('CONTRIBUTION')}
            className="flex items-center space-x-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <TrendingUp size={16} />
            <span>Contribution</span>
          </button>
          <button 
            onClick={() => setModalType('LOAN_REPAYMENT')}
            className="flex items-center space-x-2 bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            <Banknote size={16} />
            <span>Repayment</span>
          </button>
          <button 
            onClick={() => setModalType('EXPENSE')}
            className="flex items-center space-x-2 bg-rose-600 text-white px-3 py-2 rounded-lg hover:bg-rose-700 text-sm font-medium"
          >
            <ArrowDownLeft size={16} />
            <span>Expense</span>
          </button>
          <button 
            onClick={() => setModalType('TRANSFER')}
            className="flex items-center space-x-2 bg-slate-700 text-white px-3 py-2 rounded-lg hover:bg-slate-800 text-sm font-medium"
          >
            <ArrowLeftRight size={16} />
            <span>Transfer</span>
          </button>
          <button 
            onClick={() => setModalType('OPENING_BALANCE')}
            className="flex items-center space-x-2 bg-slate-400 text-white px-3 py-2 rounded-lg hover:bg-slate-500 text-sm font-medium"
          >
            <Database size={16} />
            <span>Opening Bal</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Time</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Details</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Account</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Type</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Fund</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right">Amount</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedTransactions.map(t => {
                const member = members.find(m => m.id === t.memberId);
                const account = accounts.find(a => a.id === t.accountId);
                return (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                      {t.created_at ? new Date(t.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">
                        {member?.name || 'System/Group'}
                      </div>
                      <div className="text-xs text-slate-400 truncate max-w-[200px]">
                        {t.notes || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {account?.account_name}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        t.transaction_type === 'CONTRIBUTION' ? 'bg-emerald-100 text-emerald-700' :
                        t.transaction_type === 'LOAN_GIVEN' ? 'bg-rose-100 text-rose-700' :
                        t.transaction_type === 'LOAN_REPAYMENT' ? 'bg-blue-100 text-blue-700' :
                        t.transaction_type === 'EXPENSE' ? 'bg-rose-100 text-rose-700' :
                        t.transaction_type === 'OPENING_BALANCE' ? 'bg-slate-200 text-slate-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {t.transaction_type?.replace('_', ' ') || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-500">
                      {t.fund_type}
                    </td>
                    <td className={`px-6 py-4 text-sm font-bold text-right ${t.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.amount.toLocaleString()} MK
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setDeleteId(t.id)}
                        className="text-slate-400 hover:text-red-600 transition-colors p-1"
                        title="Delete transaction"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sortedTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                    No transactions recorded on {new Date(workingDate).toLocaleDateString()}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Forms Modal */}
      {modalType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-xl font-bold mb-4 text-slate-900">Record {modalType?.replace('_', ' ') || 'Transaction'}</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center text-red-700 text-sm">
                <AlertCircle size={16} className="mr-2" />
                {error}
              </div>
            )}

            <form onSubmit={handleAction} className="space-y-4">
              {(modalType === 'CONTRIBUTION' || modalType === 'LOAN_REPAYMENT') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Member</label>
                  <select 
                    required 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    value={formData.memberId}
                    onChange={(e) => setFormData({...formData, memberId: e.target.value})}
                    disabled={isSubmitting}
                  >
                    <option value="">Select Member</option>
                    {members.filter(m => {
                      if (!m.active) return false;
                      if (modalType === 'LOAN_REPAYMENT') {
                        // Only show members with active loans for repayment
                        const memberLoans = loans.filter(l => l.memberId === m.id);
                        return memberLoans.some(l => getLoanDetails(l).status !== 'PAID');
                      }
                      return true;
                    }).map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  
                  {missedYesterday && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start text-amber-800 text-xs">
                      <Info size={14} className="mr-1.5 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-bold">Missed Payment Alert:</span> This member did not contribute yesterday. 
                        If they pay 2,000 MK today, the system will automatically allocate 1,000 MK to yesterday's date.
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {modalType === 'TRANSFER' ? 'From Account' : 'Account'}
                  </label>
                  <select 
                    required 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    value={formData.accountId}
                    onChange={(e) => setFormData({...formData, accountId: e.target.value})}
                    disabled={isSubmitting}
                  >
                    <option value="">Select Account</option>
                    {accounts.filter(a => a.active).map(a => (
                      <option key={a.id} value={a.id}>{a.account_name}</option>
                    ))}
                  </select>
                </div>

                {modalType === 'TRANSFER' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">To Account</label>
                    <select 
                      required 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                      value={formData.toAccountId}
                      onChange={(e) => setFormData({...formData, toAccountId: e.target.value})}
                      disabled={isSubmitting}
                    >
                      <option value="">Select Account</option>
                      {accounts.filter(a => a.active && a.id !== formData.accountId).map(a => (
                        <option key={a.id} value={a.id}>{a.account_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={modalType === 'TRANSFER' ? 'col-span-2' : ''}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (MK)</label>
                  <input 
                    type="number" 
                    required 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {(modalType === 'TRANSFER' || modalType === 'OPENING_BALANCE') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fund Type</label>
                  <select 
                    required 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    value={formData.fundType}
                    onChange={(e) => setFormData({...formData, fundType: e.target.value as FundType})}
                    disabled={isSubmitting}
                  >
                    <option value="PRINCIPAL">PRINCIPAL</option>
                    <option value="INTEREST">INTEREST</option>
                  </select>
                  {modalType === 'OPENING_BALANCE' && (
                    <p className="text-[10px] text-slate-400 mt-1">Specify if this opening amount belongs to the Principal pot or Interest pot.</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input 
                  type="date" 
                  required 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                <textarea 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder={modalType === 'OPENING_BALANCE' ? "e.g., Initial group funds from Jan 2026" : ""}
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setModalType(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 font-medium"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex justify-center items-center"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Save Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center space-x-3 text-red-600 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle size={24} />
              </div>
              <h2 className="text-xl font-bold">Delete Transaction?</h2>
            </div>
            
            <p className="text-slate-600 mb-6">
              Are you sure you want to delete this transaction? 
              <br/><br/>
              <span className="text-sm font-medium text-red-600 bg-red-50 p-2 rounded block">
                Warning: This action cannot be undone and may affect account balances and member credits.
              </span>
            </p>

            <div className="flex space-x-3">
              <button 
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
