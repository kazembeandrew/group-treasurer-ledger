
import React, { useState } from 'react';
import { useStore } from '../store';
import { Plus, Search, User, CreditCard, Banknote, TrendingUp, AlertCircle, Clock, Wallet, Loader2 } from 'lucide-react';

export const Members: React.FC = () => {
  const { members, addMember, getMemberStats, isLoading } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [startingCredit, setStartingCredit] = useState('0');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      setIsSubmitting(true);
      await addMember(newName.trim(), parseFloat(startingCredit) || 0);
      setNewName('');
      setStartingCredit('0');
      setIsModalOpen(false);
      setIsSubmitting(false);
    }
  };

  const filteredMembers = members.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDaysSince = (dateStr: string | null) => {
    if (!dateStr) return null;
    const last = new Date(dateStr);
    const now = new Date();
    // Reset time components to compare dates only
    last.setHours(0,0,0,0);
    now.setHours(0,0,0,0);
    
    const diffTime = Math.abs(now.getTime() - last.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading members...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Members</h1>
          <p className="text-slate-500">Manage group membership and credits</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          <span>Add Member</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="Search members..." 
          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMembers.map(member => {
          const stats = getMemberStats(member.id);
          const daysSinceLastContribution = getDaysSince(stats.lastContributionDate);
          const isInactive = daysSinceLastContribution !== null && daysSinceLastContribution > 7;

          return (
            <div key={member.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg relative">
                      {member.name.charAt(0)}
                      {isInactive && (
                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5" title="No contribution in 7+ days">
                           <AlertCircle size={16} className="text-amber-500 fill-white" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{member.name}</h3>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        member.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {member.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 flex items-center">
                      <CreditCard size={14} className="mr-1.5" /> Advance Credit
                    </span>
                    <span className="font-semibold text-blue-600">{member.advance_credit.toLocaleString()} MK</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 flex items-center">
                      <TrendingUp size={14} className="mr-1.5" /> Total Contributions
                    </span>
                    <span className="font-semibold">{stats.totalContributed.toLocaleString()} MK</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 flex items-center">
                      <Banknote size={14} className="mr-1.5" /> Loan Balance
                    </span>
                    <span className={`font-semibold ${stats.totalLoanBalance > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                      {stats.totalLoanBalance.toLocaleString()} MK
                    </span>
                  </div>

                  {stats.fundsHeld > 0 && (
                    <div className="flex items-center justify-between text-sm bg-amber-50 p-2 rounded-lg border border-amber-100">
                      <span className="text-amber-700 flex items-center font-medium">
                        <Wallet size={14} className="mr-1.5" /> Funds Held
                      </span>
                      <span className="font-bold text-amber-700">
                        {stats.fundsHeld.toLocaleString()} MK
                      </span>
                    </div>
                  )}
                  
                  <div className="pt-3 border-t border-slate-50 flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center">
                      <Clock size={12} className="mr-1.5" /> Last Contribution
                    </span>
                    <span className={`font-medium ${isInactive ? 'text-amber-600 flex items-center' : 'text-slate-600'}`}>
                       {stats.lastContributionDate 
                         ? `${new Date(stats.lastContributionDate).toLocaleDateString()} (${daysSinceLastContribution} days ago)` 
                         : 'Never'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-4 text-slate-900">Add New Member</h2>
            <form onSubmit={handleAddMember}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                  <input 
                    type="text" 
                    autoFocus
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Starting Advance Credit (MK)</label>
                  <input 
                    type="number" 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                    value={startingCredit}
                    onChange={(e) => setStartingCredit(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Use this to enter previous savings for the member.</p>
                </div>
              </div>
              <div className="flex space-x-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
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
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Save Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
