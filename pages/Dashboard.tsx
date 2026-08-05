
import React, { useEffect, useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';
import { 
  Banknote, 
  TrendingUp, 
  AlertCircle,
  ArrowRight,
  PlusCircle,
  Briefcase,
  PieChart as PieIcon,
  Activity,
  Sparkles,
  RefreshCw,
  X,
  Check,
  CheckCircle,
  DollarSign,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useStore } from '../store';
import { Link } from 'react-router-dom';
import { askFinancialAssistant } from '../utils/aiHelper';
import { getUTCOffsetDate } from '../utils/dateUtils';
import { Member } from '../types';

const KPICard: React.FC<{ title: string, value: string, icon: React.ReactNode, color: string }> = ({ title, value, icon, color }) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 rounded-lg ${color} bg-opacity-10 text-${color.split('-')[1]}-600`}>
        {icon}
      </div>
    </div>
    <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
    <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
  </div>
);

export const Dashboard: React.FC = () => {
  const { transactions, loans, accounts, members, getLoanDetails, getAccountBalance, workingDate, addContribution, connectionError } = useStore();
  
  // AI Insights State
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Daily Contribution Modal State
  const [showDailyModal, setShowDailyModal] = useState(false);
  const [customAmountId, setCustomAmountId] = useState<string | null>(null); // ID of member being edited
  const [customAmountValue, setCustomAmountValue] = useState('');

  // View Missed Dates & Calendar Modal State
  const [selectedMemberForCalendar, setSelectedMemberForCalendar] = useState<{
    member: Member;
    due: number;
    daysMissed: number;
    missedDates: string[];
  } | null>(null);
  const [calendarDate, setCalendarDate] = useState<Date>(new Date(workingDate));

  // Helper to get date string X days ago (timezone safe)
  const getPreviousDate = (dateStr: string, daysBack: number) => {
    return getUTCOffsetDate(dateStr, daysBack);
  };

  // 1. Calculate Unpaid Members (Checking Consecutive & Total Missed Days)
  const unpaidMembersData = useMemo(() => {
    const DAILY_RATE = 1000;
    const MAX_LOOKBACK = 365; // Look back up to 365 days

    // System earliest date fallback
    const earliestSystemDate = transactions.length > 0 
      ? transactions.reduce((min, t) => (t.date && t.date < min ? t.date : min), workingDate)
      : getPreviousDate(workingDate, 30);
    
    const results: { member: Member, due: number, daysMissed: number, missedDates: string[] }[] = [];

    members.forEach(m => {
      if (!m.active) return;

      let due = 0;
      let daysMissed = 0;
      let creditDays = Math.floor((m.advance_credit || 0) / DAILY_RATE);
      const missedDates: string[] = [];

      const memberStartDate = m.created_at 
        ? m.created_at.split('T')[0] 
        : earliestSystemDate;

      // Iterate backwards from Today (0) up to MAX_LOOKBACK days or member start date
      for (let i = 0; i < MAX_LOOKBACK; i++) {
        const checkDate = getPreviousDate(workingDate, i);
        if (!checkDate || checkDate < memberStartDate) break;

        // Sum contributions for this member on checkDate
        const dateContributions = transactions.filter(t => 
          t.memberId === m.id && 
          t.transaction_type === 'CONTRIBUTION' && 
          t.date === checkDate
        );
        const dayPaid = dateContributions.reduce((sum, t) => sum + t.amount, 0);

        if (dayPaid > 0) {
          creditDays += Math.floor(dayPaid / DAILY_RATE);
        }

        if (creditDays > 0) {
          // Covered by payment or advance credit
          creditDays -= 1;
        } else {
          // Unpaid missed day
          due += DAILY_RATE;
          daysMissed++;
          missedDates.push(checkDate);
        }
      }

      if (due > 0) {
        results.push({ member: m, due, daysMissed, missedDates: missedDates.reverse() });
      }
    });

    return results.sort((a, b) => b.due - a.due); // Show highest arrears first
  }, [members, transactions, workingDate]);

  // Sync selectedMemberForCalendar modal state with latest unpaidMembersData
  useEffect(() => {
    if (selectedMemberForCalendar) {
      const updated = unpaidMembersData.find(u => u.member.id === selectedMemberForCalendar.member.id);
      if (updated) {
        setSelectedMemberForCalendar(updated);
      } else {
        setSelectedMemberForCalendar(prev => prev ? {
          ...prev,
          due: 0,
          daysMissed: 0,
          missedDates: []
        } : null);
      }
    }
  }, [unpaidMembersData]);

  // 2. Trigger Modal on Mount (Every visit to Dashboard)
  useEffect(() => {
    // Show modal whenever visiting dashboard if there are unpaid members and active accounts
    if (unpaidMembersData.length > 0 && accounts.length > 0) {
      setShowDailyModal(true);
    }
  }, [workingDate, accounts.length, unpaidMembersData.length]);

  // Generate Insight Function
  const generateInsight = async () => {
    setIsAiLoading(true);
    try {
      const response = await askFinancialAssistant(
        "Analyze the current financial health. Focus on 1) Cash Utilization Risk and 2) Loan Delinquency Risk. Keep it under 50 words.",
        { members, accounts, loans, transactions, workingDate, chatHistory: [] }
      );
      setAiInsight(response.text || "No insights available.");
    } catch (e) {
      setAiInsight("AI Assistant is currently offline or unconfigured.");
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (!aiInsight && transactions.length > 0) {
      generateInsight();
    }
  }, [transactions.length]);

  const handleQuickPay = async (memberId: string, amount: number, daysMissed: number) => {
    // Find default account (Cash preferred, else first active)
    const defaultAccount = accounts.find(a => a.type === 'CASH' && a.active) || accounts.find(a => a.active);
    
    if (defaultAccount) {
      const note = daysMissed > 1 
        ? `Daily Contribution (${daysMissed} days)` 
        : "Daily Contribution";
        
      await addContribution(memberId, amount, defaultAccount.id, workingDate, note);
    } else {
      alert("No active accounts found to receive payment.");
    }
  };

  const handlePaySingleDate = async (memberId: string, targetDateStr: string) => {
    const defaultAccount = accounts.find(a => a.type === 'CASH' && a.active) || accounts.find(a => a.active);
    if (!defaultAccount) {
      alert("No active accounts found to receive payment.");
      return;
    }

    const note = `Daily Contribution for ${targetDateStr}`;
    const err = await addContribution(memberId, 1000, defaultAccount.id, targetDateStr, note, true);
    if (err) {
      alert(err);
    } else {
      setSelectedMemberForCalendar(prev => {
        if (!prev) return null;
        const newMissed = prev.missedDates.filter(d => d !== targetDateStr);
        const newDays = newMissed.length;
        const newDue = newDays * 1000;
        if (newDays === 0) return null;
        return {
          ...prev,
          missedDates: newMissed,
          daysMissed: newDays,
          due: newDue
        };
      });
    }
  };

  const handleCustomSubmit = (memberId: string) => {
    const amt = parseFloat(customAmountValue);
    if (!isNaN(amt) && amt > 0) {
      const calcDays = Math.max(1, Math.round(amt / 1000));
      handleQuickPay(memberId, amt, calcDays);
      setCustomAmountId(null);
      setCustomAmountValue('');
    }
  };

  const filteredTransactions = transactions.filter(t => t.date <= workingDate);

  const totalPrincipal = filteredTransactions.filter(t => t.fund_type === 'PRINCIPAL').reduce((sum, t) => sum + t.amount, 0);
  const totalInterest = filteredTransactions.filter(t => t.fund_type === 'INTEREST').reduce((sum, t) => sum + t.amount, 0);
  const totalFunds = totalPrincipal + totalInterest;

  const activeLoans = loans
    .filter(l => l.date_given <= workingDate)
    .map(l => ({ ...l, ...getLoanDetails(l) }))
    .filter(l => l.status !== 'PAID');
    
  const outstandingLoansTotal = activeLoans.reduce((sum, l) => sum + l.balance, 0);
  const totalPortfolio = totalFunds + outstandingLoansTotal;
  
  // Accountant Metrics
  const utilizationRate = totalPortfolio > 0 ? (outstandingLoansTotal / totalPortfolio) * 100 : 0;
  const overdueValue = activeLoans.filter(l => l.status === 'OVERDUE').reduce((sum, l) => sum + l.balance, 0);
  
  const today = new Date(workingDate);
  const threeDaysFromNow = new Date(workingDate);
  threeDaysFromNow.setDate(today.getDate() + 3);

  const dueSoonCount = activeLoans.filter(l => {
    const dueDate = new Date(l.due_date);
    return dueDate > today && dueDate <= threeDaysFromNow;
  }).length;

  const overdueCount = activeLoans.filter(l => l.status === 'OVERDUE').length;

  const accountBalances = accounts.map(acc => ({
    name: acc.account_name,
    ...getAccountBalance(acc.id)
  }));
  
  // Account Type Breakdown
  const accountTypeStats = accounts.reduce((acc, account) => {
    const bal = getAccountBalance(account.id);
    acc[account.type] = (acc[account.type] || 0) + bal.total;
    return acc;
  }, {} as Record<string, number>);

  // Pie Chart Data
  const allocationData = [
    { name: 'Cash Reserves', value: totalFunds },
    { name: 'Active Loans', value: outstandingLoansTotal }
  ];

  const PIE_COLORS = ['#10b981', '#3b82f6'];

  return (
    <div className="space-y-8">
      {connectionError && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3 text-red-700 animate-in fade-in slide-in-from-top-4">
          <AlertCircle size={20} className="shrink-0" />
          <div className="text-sm">
            <p className="font-bold">Database Connection Error</p>
            <p>{connectionError}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financial Dashboard</h1>
          <p className="text-slate-500">Overview of group savings and loans (As of {new Date(workingDate).toLocaleDateString()})</p>
        </div>
        <div className="flex items-center gap-3">
          {unpaidMembersData.length > 0 && (
            <button
              onClick={() => setShowDailyModal(true)}
              className="flex items-center justify-center space-x-2 bg-amber-500 text-white px-4 py-3 rounded-lg hover:bg-amber-600 transition-colors shadow-sm font-bold relative animate-pulse"
            >
              <Clock size={20} />
              <span>Outstanding ({unpaidMembersData.length})</span>
            </button>
          )}
          <Link 
            to="/transactions" 
            className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-bold animate-in fade-in slide-in-from-right-4"
          >
            <PlusCircle size={20} />
            <span>Record Entry</span>
          </Link>
        </div>
      </div>

      {/* AI Analyst Card */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-xl p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <Sparkles size={100} />
        </div>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-purple-800 flex items-center gap-2">
              <Sparkles size={18} className="text-purple-600" />
              AI Financial Analyst
            </h3>
            <button 
              onClick={generateInsight} 
              className="text-purple-400 hover:text-purple-700 transition-colors"
              title="Refresh Analysis"
            >
              <RefreshCw size={16} className={isAiLoading ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="text-sm text-slate-700 leading-relaxed min-h-[40px]">
             {isAiLoading ? (
               <span className="flex items-center gap-2 text-slate-500 italic">
                 <RefreshCw size={12} className="animate-spin" /> Analyzing portfolio risks...
               </span>
             ) : (
               aiInsight || "Click refresh to analyze your portfolio."
             )}
          </div>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Total Portfolio" 
          value={`${totalPortfolio.toLocaleString()} MK`}
          icon={<Briefcase size={24} />} 
          color="bg-purple-500" 
        />
        <KPICard 
          title="Cash Available" 
          value={`${totalFunds.toLocaleString()} MK`}
          icon={<Wallet size={24} className="text-emerald-500" />} 
          color="bg-emerald-500" 
        />
        <KPICard 
          title="Principal Pool" 
          value={`${totalPrincipal.toLocaleString()} MK`}
          icon={<TrendingUp size={24} />} 
          color="bg-blue-500" 
        />
        <KPICard 
          title="Interest Earnings" 
          value={`${totalInterest.toLocaleString()} MK`}
          icon={<Banknote size={24} />} 
          color="bg-amber-500" 
        />
      </div>

      {/* Account Type Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(accountTypeStats).map(([type, amount]) => (
          <div key={type} className="bg-white p-4 rounded-lg border border-slate-200 text-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">{type}</span>
            <span className="font-bold text-slate-800 block">{amount.toLocaleString()} MK</span>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Account Balances Bar Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-semibold mb-6 flex items-center">
             Balances by Account
          </h3>
          <div className="w-full" style={{ height: 300 }}>
             {accountBalances.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={accountBalances} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} />
                   <XAxis dataKey="name" />
                   <YAxis />
                   <Tooltip 
                     formatter={(value: number) => `${value.toLocaleString()} MK`}
                     cursor={{ fill: 'transparent' }}
                   />
                   <Legend />
                   <Bar dataKey="principal" name="Principal" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                   <Bar dataKey="interest" name="Interest" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                 </BarChart>
               </ResponsiveContainer>
             ) : (
               <div className="flex h-full items-center justify-center text-slate-400 italic">
                 No active accounts found.
               </div>
             )}
          </div>
        </div>

        {/* Asset Allocation Pie Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
           <h3 className="text-lg font-semibold mb-4 flex items-center">
             <PieIcon size={18} className="mr-2 text-slate-500" /> Asset Allocation
           </h3>
           <div className="flex-1 min-h-[250px] relative">
              {totalPortfolio > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocationData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {allocationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `${value.toLocaleString()} MK`} />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-slate-400 italic">No assets</div>
              )}
           </div>
        </div>
      </div>

      {/* Bottom Row: Health Check & Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Financial Health Check */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
           <h3 className="text-lg font-semibold mb-4 flex items-center text-slate-800">
             <Activity size={20} className="mr-2 text-blue-600" /> Financial Health
           </h3>
           <div className="space-y-6">
              <div>
                 <div className="flex justify-between text-sm mb-1">
                   <span className="text-slate-500">Cash Utilization Rate</span>
                   <span className="font-bold text-slate-800">{utilizationRate.toFixed(1)}%</span>
                 </div>
                 <div className="w-full bg-slate-100 rounded-full h-2.5">
                   <div 
                      className={`h-2.5 rounded-full ${utilizationRate > 90 ? 'bg-red-500' : utilizationRate > 70 ? 'bg-emerald-500' : 'bg-blue-400'}`} 
                      style={{ width: `${Math.min(utilizationRate, 100)}%` }}
                   ></div>
                 </div>
                 <p className="text-[10px] text-slate-400 mt-1">
                   {utilizationRate > 90 ? 'Warning: Low Liquidity' : utilizationRate < 50 ? 'Inefficient: Excess Cash' : 'Healthy Efficiency'}
                 </p>
              </div>

              <div>
                 <div className="flex justify-between text-sm mb-1">
                   <span className="text-slate-500">Portfolio at Risk</span>
                   <span className={`font-bold ${overdueValue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                     {overdueValue.toLocaleString()} MK
                   </span>
                 </div>
                 <p className="text-[10px] text-slate-400">Total value of overdue loans</p>
              </div>
           </div>
        </div>

        {/* Loan Alerts */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold flex items-center">
                <AlertCircle size={20} className="mr-2 text-slate-500" />
                Loan Watchlist
              </h3>
              <Link to="/loans" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center">
                View All <ArrowRight size={16} className="ml-1" />
              </Link>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-xs font-bold text-blue-600 uppercase mb-1">Total Outstanding</p>
                <p className="text-xl font-bold text-slate-800">{outstandingLoansTotal.toLocaleString()} MK</p>
              </div>
              <div className={`p-4 rounded-lg border ${dueSoonCount > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                <p className={`text-xs font-bold uppercase mb-1 ${dueSoonCount > 0 ? 'text-amber-600' : 'text-slate-500'}`}>Due in 3 Days</p>
                <div className="flex items-end gap-2">
                  <p className="text-xl font-bold text-slate-800">{dueSoonCount}</p>
                  <span className="text-xs text-slate-500 mb-1">loans</span>
                </div>
              </div>
              <div className={`p-4 rounded-lg border ${overdueCount > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                <p className={`text-xs font-bold uppercase mb-1 ${overdueCount > 0 ? 'text-red-600' : 'text-slate-500'}`}>Overdue</p>
                <div className="flex items-end gap-2">
                  <p className={`text-xl font-bold ${overdueCount > 0 ? 'text-red-700' : 'text-slate-800'}`}>{overdueCount}</p>
                  <span className="text-xs text-slate-500 mb-1">loans</span>
                </div>
              </div>
            </div>
        </div>
      </div>

      {/* Daily Contribution Quick Modal */}
      {showDailyModal && unpaidMembersData.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[85vh]">
             <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 flex justify-between items-center text-white shrink-0">
               <div className="flex items-center gap-2">
                 <Check className="text-emerald-300" />
                 <h2 className="text-lg font-bold">Outstanding Contributions</h2>
               </div>
               <button onClick={() => setShowDailyModal(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                 <X size={20} />
               </button>
             </div>
             
             <div className="p-4 bg-blue-50 text-blue-800 text-sm shrink-0 border-b border-blue-100">
               <p>The following members have outstanding contributions for <strong>today</strong> or recent days.</p>
             </div>

             <div className="overflow-y-auto p-4 space-y-3">
               {unpaidMembersData.map(({ member, due, daysMissed, missedDates }) => (
                 <div key={member.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                   <div className="flex-1 pr-2">
                     <div className="font-medium text-slate-800 truncate">{member.name}</div>
                     {daysMissed > 1 && (
                       <div className="flex items-center text-[10px] text-amber-600 font-medium">
                         <Clock size={10} className="mr-1" />
                         Missed {daysMissed} days
                       </div>
                     )}
                   </div>
                   
                   {customAmountId === member.id ? (
                     <div className="flex items-center gap-2">
                       <input 
                         type="number" 
                         autoFocus
                         className="w-24 px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                         placeholder="MK"
                         value={customAmountValue}
                         onChange={(e) => setCustomAmountValue(e.target.value)}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter') handleCustomSubmit(member.id);
                           if (e.key === 'Escape') {
                             setCustomAmountId(null);
                             setCustomAmountValue('');
                           }
                         }}
                       />
                       <button 
                         onClick={() => handleCustomSubmit(member.id)}
                         className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700"
                       >
                         <Check size={16} />
                       </button>
                       <button 
                         onClick={() => {
                           setCustomAmountId(null);
                           setCustomAmountValue('');
                         }}
                         className="bg-slate-200 text-slate-600 p-1 rounded hover:bg-slate-300"
                       >
                         <X size={16} />
                       </button>
                     </div>
                   ) : (
                     <div className="flex items-center gap-2 shrink-0">
                       <button 
                         onClick={() => {
                            setSelectedMemberForCalendar({ member, due, daysMissed, missedDates });
                            setCalendarDate(new Date(workingDate));
                          }}
                          className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-indigo-200"
                          title="View Missed Contribution Dates Calendar"
                        >
                          <Calendar size={13} />
                          <span>View</span>
                        </button>
                        <button 
                          onClick={() => handleQuickPay(member.id, due, daysMissed)}
                         className={`bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center ${daysMissed > 1 ? 'border border-emerald-300' : ''}`}
                       >
                         Pay {due.toLocaleString()}
                       </button>
                       <button 
                         onClick={() => {
                           setCustomAmountId(member.id);
                           setCustomAmountValue('');
                         }}
                         className="bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-slate-200"
                       >
                         Amount
                       </button>
                     </div>
                   )}
                 </div>
               ))}
               
               {unpaidMembersData.length === 0 && (
                 <div className="text-center py-8 text-emerald-600 font-medium">
                   <CheckCircle size={48} className="mx-auto mb-2 text-emerald-400" />
                   All active members are up to date!
                 </div>
               )}
             </div>

             <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 text-center">
               <button 
                 onClick={() => setShowDailyModal(false)}
                 className="text-slate-500 hover:text-slate-700 text-sm font-medium"
               >
                 Dismiss
               </button>
             </div>
          </div>
        </div>
      )}
      {/* Member Calendar & Missed Dates View Modal */}
      {selectedMemberForCalendar && (() => {
        const calYear = calendarDate.getFullYear();
        const calMonthIndex = calendarDate.getMonth();
        const calMonthName = calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        const firstDayOfWeek = new Date(calYear, calMonthIndex, 1).getDay();
        const daysInMonth = new Date(calYear, calMonthIndex + 1, 0).getDate();

        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center font-bold text-indigo-300">
                    {selectedMemberForCalendar.member.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      {selectedMemberForCalendar.member.name}
                      <span className="text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30 px-2.5 py-0.5 rounded-full">
                        {selectedMemberForCalendar.daysMissed} Days Unpaid
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Total Arrears: <strong className="text-amber-300">MK {selectedMemberForCalendar.due.toLocaleString()}</strong>
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedMemberForCalendar(null)} 
                  className="hover:bg-white/10 p-1.5 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Main Content Grid */}
              <div className="overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Left Column: Interactive Month Calendar (7 cols) */}
                <div className="md:col-span-7 bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <Calendar size={16} className="text-indigo-600" />
                      Contribution Calendar
                    </h3>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setCalendarDate(new Date(calYear, calMonthIndex - 1, 1))}
                        className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                        title="Previous Month"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className="text-xs font-bold text-slate-700 min-w-[110px] text-center">
                        {calMonthName}
                      </span>
                      <button 
                        onClick={() => setCalendarDate(new Date(calYear, calMonthIndex + 1, 1))}
                        className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                        title="Next Month"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Day Names Header */}
                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 mb-2">
                    <div>Sun</div>
                    <div>Mon</div>
                    <div>Tue</div>
                    <div>Wed</div>
                    <div>Thu</div>
                    <div>Fri</div>
                    <div>Sat</div>
                  </div>

                  {/* Days Grid */}
                  <div className="grid grid-cols-7 gap-1 text-center text-xs">
                    {/* Blank leading slots */}
                    {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                      <div key={`blank-${i}`} className="h-9 rounded-lg bg-transparent" />
                    ))}

                    {/* Month Days */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const dayNum = i + 1;
                      const dateStr = `${calYear}-${String(calMonthIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                      
                      const isMissed = selectedMemberForCalendar.missedDates.includes(dateStr);
                      const isToday = dateStr === workingDate;
                      
                      const contribSum = transactions
                        .filter(t => t.memberId === selectedMemberForCalendar.member.id && t.date === dateStr && t.transaction_type === 'CONTRIBUTION')
                        .reduce((sum, t) => sum + t.amount, 0);

                      const isPaid = contribSum >= 1000;
                      const isPartial = contribSum > 0 && contribSum < 1000;

                      let bgClass = "bg-white text-slate-600 border border-slate-200";
                      let indicator = null;

                      if (isMissed) {
                        bgClass = "bg-red-50 text-red-700 border-2 border-red-400 font-bold shadow-xs hover:bg-red-100 hover:border-red-500 hover:scale-105 cursor-pointer active:scale-95";
                        indicator = <span className="w-1.5 h-1.5 rounded-full bg-red-500 absolute top-1 right-1" />;
                      } else if (isPaid) {
                        bgClass = "bg-emerald-50 text-emerald-700 border border-emerald-300 font-medium";
                        indicator = <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute top-1 right-1" />;
                      } else if (isPartial) {
                        bgClass = "bg-amber-50 text-amber-700 border border-amber-300 font-medium";
                        indicator = <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute top-1 right-1" />;
                      }

                      return (
                        <button
                          key={dayNum}
                          onClick={() => {
                            if (isMissed) {
                              handlePaySingleDate(selectedMemberForCalendar.member.id, dateStr);
                            }
                          }}
                          disabled={!isMissed}
                          className={`h-9 rounded-lg flex flex-col items-center justify-center relative transition-all ${bgClass} ${isToday ? 'ring-2 ring-blue-500 ring-offset-1 font-bold' : ''}`}
                          title={`${dateStr}: ${isMissed ? 'UNPAID / MISSED (Click to Pay MK 1,000)' : isPaid ? `PAID (${contribSum.toLocaleString()} MK)` : 'No Contribution'}`}
                        >
                          <span>{dayNum}</span>
                          {indicator}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-around text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-red-100 border border-red-400 inline-block" />
                      <span>Unpaid (Click to Pay)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" />
                      <span>Contributed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-white border border-slate-300 inline-block" />
                      <span>Regular</span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Detailed List of Missed Dates (5 cols) */}
                <div className="md:col-span-5 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <AlertCircle size={16} className="text-red-500" />
                        Unpaid Dates ({selectedMemberForCalendar.missedDates.length})
                      </span>
                      <span className="text-xs text-slate-500 font-normal">MK 1,000 / day</span>
                    </h3>

                    <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1">
                      {selectedMemberForCalendar.missedDates.map((dateStr) => {
                        const dateParts = dateStr.split('-');
                        const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
                        const formattedDate = dateObj.toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        });

                        return (
                          <div key={dateStr} className="p-2.5 bg-red-50/80 border border-red-200 rounded-lg flex items-center justify-between text-xs">
                            <div>
                              <div className="font-bold text-red-900">{formattedDate}</div>
                              <div className="text-[10px] text-red-600 font-mono">{dateStr}</div>
                            </div>
                            <button
                              onClick={() => handlePaySingleDate(selectedMemberForCalendar.member.id, dateStr)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1 shadow-xs shrink-0"
                              title={`Pay MK 1,000 for ${dateStr}`}
                            >
                              <Check size={13} />
                              <span>Pay MK 1,000</span>
                            </button>
                          </div>
                        );
                      })}

                      {selectedMemberForCalendar.missedDates.length === 0 && (
                        <div className="p-4 text-center text-slate-400 text-xs">
                          No missed contribution dates recorded.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions inside View Modal */}
                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <button
                      onClick={() => {
                        handleQuickPay(
                          selectedMemberForCalendar.member.id, 
                          selectedMemberForCalendar.due, 
                          selectedMemberForCalendar.daysMissed
                        );
                        setSelectedMemberForCalendar(null);
                      }}
                      className="w-full bg-emerald-600 text-white hover:bg-emerald-700 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Check size={16} />
                      <span>Pay All Arrears (MK {selectedMemberForCalendar.due.toLocaleString()})</span>
                    </button>

                    <button
                      onClick={() => setSelectedMemberForCalendar(null)}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium py-2 px-4 rounded-xl text-xs transition-colors"
                    >
                      Close View
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// Utility Icons needed for Dashboard
const Wallet: React.FC<any> = ({ ...props }) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
  </svg>
);
