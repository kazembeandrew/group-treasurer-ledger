
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Wallet, 
  ArrowLeftRight, 
  Banknote, 
  Bell, 
  X,
  Menu,
  Calendar,
  FileText,
  Settings,
  Sparkles,
  Cloud,
  CloudOff,
  AlertTriangle,
  Clock,
  LogOut
} from 'lucide-react';
import { useStore } from '../store';

const NavItem: React.FC<{ to: string, icon: React.ReactNode, label: string, onClick?: () => void }> = ({ to, icon, label, onClick }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link 
      to={to} 
      onClick={onClick}
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
        isActive ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </Link>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { 
    notifications, dismissNotification, workingDate, setWorkingDate, isCloudMode, offlineReason, connectionError,
    transactions, loans, members, checkLastBackup, getLoanDetails, signOut
  } = useStore();

  const isToday = workingDate === new Date().toISOString().split('T')[0];

  // --- AUTOMATED NOTIFICATION LOGIC ---
  const [localAlerts, setLocalAlerts] = useState<{id: string, msg: string, type: 'info'|'warning'}[]>([]);

  useEffect(() => {
    const alerts: {id: string, msg: string, type: 'info'|'warning'}[] = [];

    // 1. Daily Activity Reminder (7 PM - 10 PM)
    const now = new Date();
    const currentHour = now.getHours();
    
    // Only check if it's "Today"
    if (isToday) {
        const hasTransactionsToday = transactions.some(t => t.date === workingDate);
        if (!hasTransactionsToday && currentHour >= 19 && currentHour < 22) {
            alerts.push({
                id: 'daily-reminder',
                msg: "Reminder: You have not recorded today's contributions yet.",
                type: 'warning'
            });
        }
    }

    // 2. Previous Day Contribution Check
    // Calculate "Yesterday" based on workingDate
    if (workingDate) {
      const prevDate = new Date(workingDate);
      if (!isNaN(prevDate.getTime())) {
        prevDate.setDate(prevDate.getDate() - 1);
        const yesterdayStr = prevDate.toISOString().split('T')[0];

        // Find active members who did NOT contribute yesterday
        const missedYesterday = members.filter(m => {
          if (!m.active) return false;
          return !transactions.some(t => 
            t.memberId === m.id && 
            t.transaction_type === 'CONTRIBUTION' && 
            t.date === yesterdayStr
          );
        });

        if (missedYesterday.length > 0) {
          const count = missedYesterday.length;
          // List up to 2 names, then say "+ X others"
          const names = missedYesterday.slice(0, 2).map(m => m.name).join(', ');
          const suffix = count > 2 ? ` and ${count - 2} others` : '';
          
          alerts.push({
            id: 'missed-yesterday',
            msg: `${count} member${count > 1 ? 's' : ''} missed contribution yesterday (${yesterdayStr}): ${names}${suffix}`,
            type: 'warning'
          });
        }
      }
    }

    // 3. Loan Due Date Notifications
    loans.forEach(loan => {
        const details = getLoanDetails(loan);
        if (details.status === 'PAID') return;

        const dueDate = new Date(loan.due_date);
        const todayDate = new Date();
        // Reset times for date comparison
        dueDate.setHours(0,0,0,0);
        todayDate.setHours(0,0,0,0);

        const diffTime = dueDate.getTime() - todayDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            alerts.push({ id: `due-${loan.id}`, msg: `Loan Due Today: Member ${loan.memberId}`, type: 'warning' });
        } else if (diffDays > 0 && diffDays <= 2) {
            alerts.push({ id: `soon-${loan.id}`, msg: `Loan Due in ${diffDays} days: Member ${loan.memberId}`, type: 'info' });
        }
    });

    // 4. Weekly Backup Reminder
    const lastBackupStr = checkLastBackup();
    if (lastBackupStr) {
        const lastBackup = new Date(lastBackupStr);
        const diffTime = now.getTime() - lastBackup.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays >= 7) {
            alerts.push({ id: 'backup', msg: 'Weekly Backup Reminder: Please export your data.', type: 'info' });
        }
    } else {
         // No backup ever
         alerts.push({ id: 'backup-init', msg: 'System Alert: Please perform an initial backup in Settings.', type: 'info' });
    }

    setLocalAlerts(alerts);
  }, [transactions, loans, members, workingDate, checkLastBackup, getLoanDetails]);


  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 w-64 bg-white border-r transform transition-transform duration-200 ease-in-out z-50
        md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        flex flex-col
      `}>
        <div className="p-6 flex-1">
          <h1 className="text-2xl font-bold text-blue-600 mb-2 hidden md:block">WealthShare</h1>
          
          <div className={`text-xs font-semibold px-2 py-1 rounded inline-flex items-center mb-6 gap-1 ${
            connectionError 
              ? 'bg-red-100 text-red-700'
              : isCloudMode 
                ? 'bg-emerald-100 text-emerald-700' 
                : 'bg-slate-100 text-slate-500'
          }`}>
             {connectionError ? <AlertTriangle size={12} /> : isCloudMode ? <Cloud size={12} /> : <CloudOff size={12} />}
             {connectionError ? 'AUTH ERROR' : isCloudMode ? 'SYNC ACTIVE' : offlineReason.toUpperCase()}
          </div>

          <nav className="space-y-1">
            <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" onClick={() => setIsSidebarOpen(false)} />
            
            {/* AI Assistant Highlighted */}
            <NavItem 
              to="/ai" 
              icon={<Sparkles size={20} className="text-purple-500" />} 
              label="AI Assistant" 
              onClick={() => setIsSidebarOpen(false)} 
            />

            <NavItem to="/members" icon={<Users size={20} />} label="Members" onClick={() => setIsSidebarOpen(false)} />
            <NavItem to="/accounts" icon={<Wallet size={20} />} label="Accounts" onClick={() => setIsSidebarOpen(false)} />
            <NavItem to="/transactions" icon={<ArrowLeftRight size={20} />} label="Transactions" onClick={() => setIsSidebarOpen(false)} />
            <NavItem to="/loans" icon={<Banknote size={20} />} label="Loans" onClick={() => setIsSidebarOpen(false)} />
            <NavItem to="/reports" icon={<FileText size={20} />} label="Reports" onClick={() => setIsSidebarOpen(false)} />
            
            <div className="pt-4 mt-4 border-t border-slate-100">
              <NavItem to="/settings" icon={<Settings size={20} />} label="Settings" onClick={() => setIsSidebarOpen(false)} />
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={() => {
              setIsSidebarOpen(false);
              signOut();
            }} 
            className="flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 w-full transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Header / Working Date Selector */}
        <header className="bg-white border-b px-4 md:px-8 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
          <div className="flex items-center space-x-4">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-600">
              <Menu size={24} />
            </button>
            <h1 className="text-xl font-bold text-blue-600 md:hidden">WealthShare</h1>
            
            {/* Working Date Selector */}
            <div className={`hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-lg border transition-colors ${!isToday ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              <Calendar size={16} />
              <label htmlFor="workingDate" className="text-xs font-bold uppercase tracking-wider">Entry Date:</label>
              <input 
                type="date" 
                id="workingDate"
                className="bg-transparent border-none focus:ring-0 text-sm font-semibold outline-none cursor-pointer"
                value={workingDate}
                onChange={(e) => setWorkingDate(e.target.value)}
              />
              {!isToday && (
                <button 
                  onClick={() => setWorkingDate(new Date().toISOString().split('T')[0])}
                  className="text-[10px] font-bold bg-amber-200 px-1.5 py-0.5 rounded hover:bg-amber-300"
                >
                  RESET TO TODAY
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
             {/* Mobile Entry Date Button (Compact) */}
             <div className={`sm:hidden flex items-center px-2 py-1 rounded border ${!isToday ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
               <input 
                type="date" 
                className="bg-transparent border-none focus:ring-0 text-xs font-semibold outline-none"
                value={workingDate}
                onChange={(e) => setWorkingDate(e.target.value)}
              />
             </div>
          </div>
        </header>

        {/* Notifications Bar (System + Local Alerts) */}
        {(notifications.length > 0 || localAlerts.length > 0) && (
          <div className="max-h-48 overflow-y-auto p-4 space-y-2 bg-slate-100/50 backdrop-blur-sm border-b z-30">
            {localAlerts.map(alert => (
              <div key={alert.id} className={`
                p-3 rounded-lg border flex items-start justify-between animate-in fade-in slide-in-from-top-2
                ${alert.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}
              `}>
                <div className="flex space-x-3">
                   {alert.id === 'daily-reminder' ? <Clock size={18} className="mt-0.5 shrink-0" /> : <Bell size={18} className="mt-0.5 shrink-0" />}
                  <p className="text-sm font-medium">{alert.msg}</p>
                </div>
              </div>
            ))}
            {notifications.map(notif => (
              <div key={notif.id} className={`
                p-3 rounded-lg border flex items-start justify-between animate-in fade-in slide-in-from-top-2
                ${notif.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 
                  notif.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 
                  'bg-blue-50 border-blue-200 text-blue-800'}
              `}>
                <div className="flex space-x-3">
                  <Bell size={18} className="mt-0.5 shrink-0" />
                  <p className="text-sm">{notif.message}</p>
                </div>
                <button onClick={() => dismissNotification(notif.id)} className="p-1 hover:bg-black/5 rounded">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Page Content */}
        <main className="p-4 md:p-8 overflow-y-auto flex-1">
          {children}
        </main>
      </div>
    </div>
  );
};
