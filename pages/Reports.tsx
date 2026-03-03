
import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FileText, 
  Download, 
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Printer
} from 'lucide-react';

export const Reports: React.FC = () => {
  const { transactions, members, accounts } = useStore();
  
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  // Filter transactions for the selected month/year
  const monthlyTransactions = useMemo(() => {
    return transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [transactions, selectedMonth, selectedYear]);

  // Calculate Aggregates
  const stats = useMemo(() => {
    const s = {
      contributions: 0,
      repayments: 0,
      loansGiven: 0,
      expenses: 0,
      transfers: 0,
      openingBalance: 0,
      totalIncome: 0,
      totalOutgoing: 0
    };

    monthlyTransactions.forEach(t => {
      if (t.transaction_type === 'CONTRIBUTION') s.contributions += t.amount;
      if (t.transaction_type === 'LOAN_REPAYMENT') s.repayments += t.amount;
      if (t.transaction_type === 'LOAN_GIVEN') s.loansGiven += Math.abs(t.amount);
      if (t.transaction_type === 'EXPENSE') s.expenses += Math.abs(t.amount);
      if (t.transaction_type === 'TRANSFER' && t.amount > 0) s.transfers += t.amount; // Count one side of transfer
      if (t.transaction_type === 'OPENING_BALANCE') s.openingBalance += t.amount;
    });

    s.totalIncome = s.contributions + s.repayments + s.openingBalance;
    s.totalOutgoing = s.loansGiven + s.expenses;

    return s;
  }, [monthlyTransactions]);

  const generatePDF = () => {
    const doc = new jsPDF();
    const monthName = months[selectedMonth];
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(37, 99, 235); // Blue-600
    doc.text("WealthShare Manager", 14, 20);
    
    doc.setFontSize(14);
    doc.setTextColor(100);
    doc.text(`Monthly Report: ${monthName} ${selectedYear}`, 14, 30);
    
    doc.setLineWidth(0.5);
    doc.line(14, 35, 196, 35);

    // Summary Section
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Financial Summary", 14, 45);

    const summaryData = [
      ['Total Income', `${stats.totalIncome.toLocaleString()} MK`],
      ['Total Expenses & Loans', `${stats.totalOutgoing.toLocaleString()} MK`],
      ['Net Cash Flow', `${(stats.totalIncome - stats.totalOutgoing).toLocaleString()} MK`],
    ];

    autoTable(doc, {
      startY: 50,
      head: [['Metric', 'Amount']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 'auto', halign: 'right' } },
      margin: { left: 14 }
    });

    let finalY = (doc as any).lastAutoTable.finalY || 80;

    // Breakdown Section
    doc.text("Detailed Breakdown", 14, finalY + 15);
    
    const breakdownData = [
      ['Contributions', stats.contributions.toLocaleString()],
      ['Loan Repayments', stats.repayments.toLocaleString()],
      ['Loans Given', `(${stats.loansGiven.toLocaleString()})`],
      ['Expenses', `(${stats.expenses.toLocaleString()})`],
      ['Opening Balances', stats.openingBalance.toLocaleString()]
    ];

    autoTable(doc, {
      startY: finalY + 20,
      body: breakdownData,
      theme: 'plain',
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: 14, right: 100 } // Keep it compact
    });

    finalY = (doc as any).lastAutoTable.finalY || 120;

    // Transactions Table
    doc.text("Transaction History", 14, finalY + 15);

    const tableRows = monthlyTransactions.map(t => {
      const member = members.find(m => m.id === t.memberId)?.name || '-';
      const account = accounts.find(a => a.id === t.accountId)?.account_name || '-';
      const note = t.notes || '-';
      const truncatedNote = note.length > 30 ? note.substring(0, 30) + '...' : note;

      return [
        new Date(t.date).toLocaleDateString(),
        (t.transaction_type || '').replace('_', ' '),
        member,
        account,
        t.fund_type,
        truncatedNote,
        t.amount.toLocaleString(),
      ];
    });

    autoTable(doc, {
      startY: finalY + 20,
      head: [['Date', 'Type', 'Member', 'Account', 'Fund', 'Notes', 'Amount']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 7 },
      columnStyles: { 
        0: { cellWidth: 22 },
        1: { cellWidth: 25 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
        4: { cellWidth: 20 },
        5: { cellWidth: 'auto' },
        6: { halign: 'right', fontStyle: 'bold', cellWidth: 25 } 
      }
    });

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    doc.setFontSize(8);
    doc.setTextColor(150);
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(`Page ${i} of ${pageCount} - Generated on ${new Date().toLocaleDateString()}`, 14, 285);
    }

    doc.save(`WealthShare_Report_${monthName}_${selectedYear}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monthly Reports</h1>
          <p className="text-slate-500">Generate and download financial summaries</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-slate-200">
            <Calendar size={16} className="text-slate-400" />
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="bg-transparent font-medium text-slate-700 outline-none cursor-pointer"
            >
              {months.map((m, idx) => (
                <option key={idx} value={idx}>{m}</option>
              ))}
            </select>
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-transparent font-medium text-slate-700 outline-none cursor-pointer border-l pl-2"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          
          <button 
            onClick={generatePDF}
            disabled={monthlyTransactions.length === 0}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={18} />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
              <TrendingUp size={20} />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase">Income</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalIncome.toLocaleString()}</div>
          <div className="text-xs text-slate-500 mt-1">Contributions & Repayments</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
              <TrendingDown size={20} />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase">Outgoing</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalOutgoing.toLocaleString()}</div>
          <div className="text-xs text-slate-500 mt-1">Loans Given & Expenses</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <ArrowRight size={20} />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase">Net Flow</span>
          </div>
          <div className={`text-2xl font-bold ${(stats.totalIncome - stats.totalOutgoing) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {(stats.totalIncome - stats.totalOutgoing).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">Income - Outgoing</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
              <FileText size={20} />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase">Transactions</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{monthlyTransactions.length}</div>
          <div className="text-xs text-slate-500 mt-1">Records this month</div>
        </div>
      </div>

      {/* Transaction List Preview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="font-semibold text-slate-800">Report Preview</h3>
          <span className="text-xs text-slate-500 italic">
            Showing all {monthlyTransactions.length} records for {months[selectedMonth]} {selectedYear}
          </span>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Date</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Type</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Member</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Account</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {monthlyTransactions.map(t => {
                 const member = members.find(m => m.id === t.memberId);
                 const account = accounts.find(a => a.id === t.accountId);
                 return (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(t.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        t.transaction_type === 'CONTRIBUTION' ? 'bg-emerald-100 text-emerald-700' :
                        t.transaction_type === 'LOAN_GIVEN' ? 'bg-rose-100 text-rose-700' :
                        t.transaction_type === 'LOAN_REPAYMENT' ? 'bg-blue-100 text-blue-700' :
                        t.transaction_type === 'EXPENSE' ? 'bg-rose-100 text-rose-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {(t.transaction_type || '').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600">
                      {member?.name || '-'}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600">
                      {account?.account_name}
                    </td>
                    <td className={`px-6 py-3 text-sm font-bold text-right ${t.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.amount.toLocaleString()}
                    </td>
                  </tr>
                 );
              })}
              {monthlyTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                    No transactions found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
