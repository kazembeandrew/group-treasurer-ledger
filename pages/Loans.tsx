
import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { jsPDF } from 'jspdf';
import { 
  Plus, 
  Calendar, 
  AlertCircle,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Printer,
  Languages,
  X,
  Archive,
  Eye,
  Trash2,
  AlertTriangle
} from 'lucide-react';

export const Loans: React.FC = () => {
  const { 
    loans, 
    members, 
    accounts, 
    transactions,
    addLoan, 
    addRepayment, 
    getLoanDetails,
    deleteLoan,
    workingDate,
    isLoading
  } = useStore();
  
  const [modalType, setModalType] = useState<'NEW_LOAN' | 'REPAY' | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false); // Toggle for Paid loans
  const [formData, setFormData] = useState({
    memberId: '',
    accountId: '',
    amount: '',
    interestRate: '10',
    date: workingDate,
    notes: ''
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Receipt Language State
  const [receiptLangModalOpen, setReceiptLangModalOpen] = useState(false);
  const [currentReceiptData, setCurrentReceiptData] = useState<{
    transaction: any;
    memberName: string;
    accountName: string;
    loanId: string;
    remainingBalance: number;
  } | null>(null);

  // Sync date with global working date when modal opens
  useEffect(() => {
    setFormData(prev => ({ ...prev, date: workingDate }));
  }, [workingDate, modalType]);

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const amt = parseFloat(formData.amount);
    
    setIsSubmitting(true);
    
    if (modalType === 'NEW_LOAN') {
      const result = await addLoan(
        formData.memberId, 
        amt, 
        formData.accountId, 
        formData.date, 
        parseFloat(formData.interestRate)
      );
      if (result) setError(result);
      else closeModal();
    } else if (modalType === 'REPAY') {
      await addRepayment(selectedLoanId, amt, formData.accountId, formData.date, formData.notes);
      closeModal();
    }
    
    setIsSubmitting(false);
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedLoanId('');
    setDeleteConfirmId(null);
    setFormData({
      memberId: '',
      accountId: '',
      amount: '',
      interestRate: '10',
      date: workingDate,
      notes: ''
    });
  };

  const handleDeleteLoan = async () => {
    if (deleteConfirmId) {
      await deleteLoan(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const initiateReceipt = (transaction: any, memberName: string, accountName: string, loanId: string, remainingBalance: number) => {
    setCurrentReceiptData({ transaction, memberName, accountName, loanId, remainingBalance });
    setReceiptLangModalOpen(true);
  };

  const generateReceipt = (lang: 'EN' | 'NY') => {
    if (!currentReceiptData) return;
    const { transaction, memberName, accountName, loanId, remainingBalance } = currentReceiptData;

    const translations = {
      EN: {
        title: "OFFICIAL RECEIPT",
        receiptLabel: "Receipt #",
        dateLabel: "Date",
        receivedFromLabel: "Received From",
        loanRefLabel: "Loan Ref",
        amountPaidLabel: "AMOUNT PAID",
        paymentMethodLabel: "Method",
        allocatedToLabel: "Allocation",
        balanceLabel: "Remaining Bal",
        transTypeLabel: "Type",
        loanRepayment: "Loan Repayment",
        notesLabel: "Notes",
        loanPrincipal: "Principal",
        loanInterest: "Interest",
        footerText: "Thank you for your payment.",
        generatedOn: "Generated"
      },
      NY: {
        title: "KALISITI LA KULIPILA",
        receiptLabel: "Nambala",
        dateLabel: "Tsiku",
        receivedFromLabel: "Wolipila",
        loanRefLabel: "Ngongole",
        amountPaidLabel: "NDALAMA",
        paymentMethodLabel: "Njira Yolipirira",
        allocatedToLabel: "Zapita Ku",
        balanceLabel: "Ngongole Yotsala",
        transTypeLabel: "Mtundu",
        loanRepayment: "Kubweza Ngongole",
        notesLabel: "Zolemba",
        loanPrincipal: "Principal",
        loanInterest: "Interest",
        footerText: "Zikomo pobweza ngongole yanu.",
        generatedOn: "Yapangidwa"
      }
    };

    const t = translations[lang];
    
    // Use Mobile Dimensions: 90mm width x 160mm height
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [90, 160] 
    });

    const pageWidth = 90;
    const centerX = pageWidth / 2;
    const receiptColor = [37, 99, 235]; // Blue-600

    // --- HEADER ---
    doc.setFillColor(receiptColor[0], receiptColor[1], receiptColor[2]);
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("WealthShare Manager", centerX, 10, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(t.title, centerX, 18, { align: "center" });

    // --- MAIN INFO ---
    doc.setTextColor(0, 0, 0);
    
    let currentY = 35;
    
    // Receipt # and Date (Small, Centered)
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`${t.receiptLabel}: ${transaction.id.substring(0, 8).toUpperCase()}`, centerX, currentY, { align: 'center' });
    currentY += 4;
    doc.text(`${t.dateLabel}: ${new Date(transaction.date).toLocaleDateString()}`, centerX, currentY, { align: 'center' });
    currentY += 10;

    // Amount Box (Hero Section)
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.roundedRect(10, currentY, pageWidth - 20, 22, 3, 3, 'FD');
    
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(t.amountPaidLabel, centerX, currentY + 6, { align: "center" });
    
    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235); // Blue
    doc.setFont("helvetica", "bold");
    doc.text(`${transaction.amount.toLocaleString()} MK`, centerX, currentY + 16, { align: "center" });
    
    currentY += 32;

    // Received From
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100); // Label color
    doc.setFont("helvetica", "bold");
    doc.text(t.receivedFromLabel, 10, currentY);
    
    doc.setTextColor(0, 0, 0); // Value color
    doc.setFont("helvetica", "normal");
    doc.text(memberName, pageWidth - 10, currentY, { align: "right" });
    currentY += 8;
    
    // Separator line
    doc.setDrawColor(230, 230, 230);
    doc.line(10, currentY - 4, pageWidth - 10, currentY - 4);

    // Loan Ref
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "bold");
    doc.text(t.loanRefLabel, 10, currentY);
    
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.text(loanId.substring(0, 8), pageWidth - 10, currentY, { align: "right" });
    currentY += 8;

    doc.line(10, currentY - 4, pageWidth - 10, currentY - 4);

    // Payment Method
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "bold");
    doc.text(t.paymentMethodLabel, 10, currentY);
    
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.text(accountName, pageWidth - 10, currentY, { align: "right" });
    currentY += 8;

    doc.line(10, currentY - 4, pageWidth - 10, currentY - 4);

    // Allocation
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "bold");
    doc.text(t.allocatedToLabel, 10, currentY);
    
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    
    let allocationText = "";
    if (transaction.principalAmount > 0 && transaction.interestAmount > 0) {
      allocationText = `Prin: ${transaction.principalAmount.toLocaleString()} | Int: ${transaction.interestAmount.toLocaleString()}`;
    } else if (transaction.principalAmount > 0) {
      allocationText = `${t.loanPrincipal}: ${transaction.principalAmount.toLocaleString()}`;
    } else {
      allocationText = `${t.loanInterest}: ${transaction.interestAmount.toLocaleString()}`;
    }
    
    doc.setFontSize(9); // Slightly smaller for long text
    doc.text(allocationText, pageWidth - 10, currentY, { align: "right" });
    currentY += 8;

    doc.line(10, currentY - 4, pageWidth - 10, currentY - 4);

    // Remaining Balance (New Field)
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "bold");
    doc.text(t.balanceLabel, 10, currentY);
    
    doc.setTextColor(220, 38, 38); // Red-600 for outstanding balance
    doc.setFont("helvetica", "bold");
    doc.text(`${remainingBalance.toLocaleString()} MK`, pageWidth - 10, currentY, { align: "right" });
    currentY += 8;

    doc.line(10, currentY - 4, pageWidth - 10, currentY - 4);
    
    // Notes (if any)
    if (transaction.notes) {
        doc.setTextColor(100, 100, 100);
        doc.setFont("helvetica", "bold");
        doc.text(t.notesLabel, 10, currentY);
        
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        // Handle long notes with splitTextToSize
        const splitNotes = doc.splitTextToSize(transaction.notes, 40);
        doc.text(splitNotes, pageWidth - 10, currentY, { align: "right" });
        currentY += (splitNotes.length * 4) + 4;
    } else {
        currentY += 4;
    }

    // --- FOOTER ---
    const footerY = 145;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.text(t.footerText, centerX, footerY, { align: "center" });
    doc.text(`${t.generatedOn} ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, centerX, footerY + 4, { align: "center" });
    
    // Save
    doc.save(`Receipt_${memberName.replace(/\s+/g, '_')}_${transaction.date}.pdf`);
    
    // Close modal
    setReceiptLangModalOpen(false);
    setCurrentReceiptData(null);
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading loans...</div>;

  // Helper to group split repayments (Interest + Principal) into single entries
  const groupRepayments = (transactions: any[]) => {
    const groups: { [key: string]: any } = {};
    
    transactions.forEach(t => {
      // Key by date + account + minute to group batch entries safely
      const timeKey = t.created_at ? t.created_at.substring(0, 16) : 'unknown'; 
      const key = `${t.date}-${t.accountId}-${timeKey}`;
      
      if (!groups[key]) {
        groups[key] = {
          id: t.id,
          date: t.date,
          accountId: t.accountId,
          amount: 0,
          principalAmount: 0,
          interestAmount: 0,
          fund_type: 'MIXED', // For display logic
          notes: t.notes?.replace(/\s*\(Int\)|\s*\(Prin\)/g, '').replace('Repayment', '').trim() || 'Repayment',
          rawTransactions: []
        };
      }
      
      groups[key].amount += t.amount;
      if (t.fund_type === 'PRINCIPAL') groups[key].principalAmount += t.amount;
      if (t.fund_type === 'INTEREST') groups[key].interestAmount += t.amount;
      groups[key].rawTransactions.push(t);
    });
    
    return Object.values(groups).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // Process all loans first
  const allProcessedLoans = loans
    .filter(l => l.date_given <= workingDate)
    .map(l => ({
      ...l,
      member: members.find(m => m.id === l.memberId),
      details: getLoanDetails(l),
      repayments: groupRepayments(transactions
        .filter(t => 
          t.related_loan_id === l.id && 
          t.transaction_type === 'LOAN_REPAYMENT' &&
          t.date <= workingDate 
        ))
    })).sort((a, b) => new Date(b.date_given).getTime() - new Date(a.date_given).getTime());

  // Filter based on "Archived" toggle
  const displayedLoans = allProcessedLoans.filter(l => {
    const isPaid = l.details.status === 'PAID';
    return showArchived ? isPaid : !isPaid;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Loans 
            {showArchived && <span className="text-sm font-normal bg-slate-200 px-2 py-0.5 rounded-full text-slate-600">Archived</span>}
          </h1>
          <p className="text-slate-500">Manage member loans and repayment cycles</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg transition-colors border ${
              showArchived 
                ? 'bg-slate-700 text-white border-slate-700 hover:bg-slate-800' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {showArchived ? <Eye size={20} /> : <Archive size={20} />}
            <span>{showArchived ? 'View Active' : 'View Archived'}</span>
          </button>
          
          {!showArchived && (
            <button 
              onClick={() => setModalType('NEW_LOAN')}
              className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              <span>New Loan</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {displayedLoans.map(loan => (
          <div key={loan.id} className={`bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden ${loan.details.status === 'PAID' ? 'opacity-80' : ''}`}>
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1 space-y-2">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${loan.details.status === 'PAID' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                    {loan.member?.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{loan.member?.name}</h3>
                    <div className="flex items-center text-xs text-slate-500 space-x-3">
                      <span className="flex items-center"><Calendar size={12} className="mr-1" /> {new Date(loan.date_given).toLocaleDateString()})</span>
                      <span className="flex items-center"><Clock size={12} className="mr-1" /> Due: {new Date(loan.due_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-[2]">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Total Due</p>
                  <p className="font-bold text-slate-900">{loan.details.totalDue.toLocaleString()} MK</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Paid</p>
                  <p className="font-bold text-emerald-600">{loan.details.amountPaid.toLocaleString()} MK</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Balance</p>
                  <p className={`font-bold ${loan.details.balance > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    {loan.details.balance.toLocaleString()} MK
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold flex items-center ${
                    loan.details.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                    loan.details.status === 'OVERDUE' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {loan.details.status === 'PAID' ? <CheckCircle2 size={12} className="mr-1" /> :
                     loan.details.status === 'OVERDUE' ? <AlertCircle size={12} className="mr-1" /> :
                     <Clock size={12} className="mr-1" />}
                    {loan.details.status}
                  </span>
                </div>
              </div>

              {loan.details.status !== 'PAID' && (
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => {
                      setSelectedLoanId(loan.id);
                      setModalType('REPAY');
                    }}
                    className="bg-slate-50 text-slate-700 hover:bg-slate-100 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border"
                  >
                    Repay
                  </button>
                  <button 
                    onClick={() => setDeleteConfirmId(loan.id)}
                    className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                    title="Delete Loan"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
              {loan.details.status === 'PAID' && (
                <button 
                  onClick={() => setDeleteConfirmId(loan.id)}
                  className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                  title="Delete Loan"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>

            {/* Repayment History Section */}
            {loan.repayments.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <h4 className="text-xs font-bold uppercase text-slate-400 mb-3 tracking-wider flex items-center">
                  <History size={14} className="mr-1.5" /> Repayment History
                </h4>
                <div className="space-y-2">
                  {loan.repayments.map((rp: any) => {
                    const acc = accounts.find(a => a.id === rp.accountId);
                    return (
                      <div key={rp.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0 hover:bg-slate-50 px-2 rounded -mx-2 transition-colors group">
                        <div className="flex items-center space-x-6">
                          <span className="text-slate-500 font-medium w-24">
                            {new Date(rp.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span className="text-slate-600 truncate max-w-[120px] md:max-w-none">
                            {acc?.account_name}
                          </span>
                          <span className="text-slate-400 italic text-xs hidden sm:inline-block">
                            {rp.notes}
                          </span>
                          <div className="flex flex-col text-[10px] leading-tight text-slate-400">
                            {rp.interestAmount > 0 && <span>Int: {rp.interestAmount.toLocaleString()}</span>}
                            {rp.principalAmount > 0 && <span>Prin: {rp.principalAmount.toLocaleString()}</span>}
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="text-emerald-600 font-bold">
                            +{rp.amount.toLocaleString()} MK
                          </span>
                          <button 
                            onClick={() => initiateReceipt(rp, loan.member?.name || 'Member', acc?.account_name || 'Cash', loan.id, loan.details.balance)}
                            className="text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                            title="Generate Receipt"
                          >
                             <Printer size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
        {displayedLoans.length === 0 && (
          <div className="p-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
            {showArchived 
              ? 'No archived (paid) loans found.' 
              : `No active loans found on ${new Date(workingDate).toLocaleDateString()}.`}
          </div>
        )}
      </div>

      {/* Main Loan Modal */}
      {modalType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-slate-900">{modalType === 'NEW_LOAN' ? 'Grant New Loan' : 'Record Repayment'}</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center">
                <AlertCircle size={16} className="mr-2" />
                {error}
              </div>
            )}

            <form onSubmit={handleAction} className="space-y-4">
              {modalType === 'NEW_LOAN' ? (
                <>
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
                      {members.filter(m => m.active).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Amount (MK)</label>
                      <input 
                        type="number" required 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                        value={formData.amount}
                        onChange={(e) => setFormData({...formData, amount: e.target.value})}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Interest (%)</label>
                      <input 
                        type="number" required 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                        value={formData.interestRate}
                        onChange={(e) => setFormData({...formData, interestRate: e.target.value})}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 bg-blue-50 text-blue-800 text-sm rounded-lg mb-4">
                    Repayment for <strong>{allProcessedLoans.find(l => l.id === selectedLoanId)?.member?.name}</strong>'s loan.
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Repayment Amount (MK)</label>
                    <input 
                      type="number" required 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      disabled={isSubmitting}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Account</label>
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input 
                  type="date" required 
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
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 border rounded-lg" disabled={isSubmitting}>Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex justify-center items-center" disabled={isSubmitting}>
                   {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Language Modal */}
      {receiptLangModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-xl animate-in fade-in zoom-in-95">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Languages size={20} className="text-blue-600" />
                  Select Receipt Language
                </h3>
                <button onClick={() => setReceiptLangModalOpen(false)} className="text-slate-400 hover:text-red-500">
                  <X size={20} />
                </button>
             </div>
             
             <p className="text-sm text-slate-500 mb-6">
               Please choose the language for the downloaded PDF receipt.
             </p>

             <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => generateReceipt('EN')}
                  className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                >
                  <span className="text-2xl mb-2">🇬🇧</span>
                  <span className="font-bold text-slate-700 group-hover:text-blue-700">English</span>
                </button>
                <button 
                  onClick={() => generateReceipt('NY')}
                  className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                >
                  <span className="text-2xl mb-2">🇲🇼</span>
                  <span className="font-bold text-slate-700 group-hover:text-blue-700">Chichewa</span>
                </button>
             </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">Delete Loan?</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              This will permanently delete this loan record and <strong>all associated transactions</strong> (disbursement and repayments). This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteLoan}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-bold"
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
