
import React, { useState } from 'react';
import { useStore } from '../store';
import { 
  CreditCard, 
  Smartphone, 
  Landmark, 
  CircleDollarSign,
  Plus,
  Trash2,
  AlertCircle,
  UserCircle,
  Loader2
} from 'lucide-react';
import { AccountType } from '../types';

export const Accounts: React.FC = () => {
  const { accounts, members, getAccountBalance, addAccount, deleteAccount, isLoading } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<AccountType>('CASH');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getIcon = (type: AccountType) => {
    switch (type) {
      case 'CASH': return <CircleDollarSign size={24} />;
      case 'MOBILE': return <Smartphone size={24} />;
      case 'BANK': return <Landmark size={24} />;
      case 'MEMBER': return <UserCircle size={24} />;
      default: return <CreditCard size={24} />;
    }
  };

  const getBgColor = (type: AccountType) => {
    switch (type) {
      case 'CASH': return 'bg-emerald-500';
      case 'MOBILE': return 'bg-blue-500';
      case 'BANK': return 'bg-slate-700';
      case 'MEMBER': return 'bg-amber-500';
      default: return 'bg-blue-500';
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAccountType === 'MEMBER' && !selectedMemberId) {
      setError('Please select a member.');
      return;
    }

    if (newAccountName.trim()) {
      setIsSubmitting(true);
      await addAccount(newAccountName.trim(), newAccountType, newAccountType === 'MEMBER' ? selectedMemberId : undefined);
      setNewAccountName('');
      setNewAccountType('CASH');
      setSelectedMemberId('');
      setError(null);
      setIsModalOpen(false);
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the account "${name}"?`)) {
      const result = await deleteAccount(id);
      if (result) {
        alert(result);
      }
    }
  };

  const handleTypeChange = (type: AccountType) => {
    setNewAccountType(type);
    if (type === 'MEMBER') {
       setNewAccountName(''); 
    }
  };
  
  const handleMemberSelect = (memberId: string) => {
    setSelectedMemberId(memberId);
    const member = members.find(m => m.id === memberId);
    if (member) {
      setNewAccountName(`${member.name}'s Cash`);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading accounts...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounts</h1>
          <p className="text-slate-500">Manage where group funds are held</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          <span>Add Account</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {accounts.map(acc => {
          const balance = getAccountBalance(acc.id);
          return (
            <div key={acc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group relative">
              <div className={`h-2 ${getBgColor(acc.type)}`} />
              
              <div className="p-6 flex-1">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2 rounded-lg bg-opacity-10 ${getBgColor(acc.type)} text-slate-800`}>
                    {getIcon(acc.type)}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {acc.type}
                    </span>
                    <button 
                      onClick={() => handleDelete(acc.id, acc.account_name)}
                      className="text-slate-300 hover:text-red-600 transition-colors p-1"
                      title="Delete Account"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                <h3 className="font-bold text-lg text-slate-900 mb-1">{acc.account_name}</h3>
                <div className="text-2xl font-bold text-blue-600 mb-6">
                  {balance.total.toLocaleString()} MK
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Principal</span>
                    <span className="font-semibold text-slate-700">{balance.principal.toLocaleString()} MK</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Interest</span>
                    <span className="font-semibold text-emerald-600">{balance.interest.toLocaleString()} MK</span>
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
            <h2 className="text-xl font-bold mb-4 text-slate-900">Add New Account</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center">
                <AlertCircle size={16} className="mr-2" />
                {error}
              </div>
            )}

            <form onSubmit={handleAddAccount}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Account Type</label>
                  <select 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                    value={newAccountType}
                    onChange={(e) => handleTypeChange(e.target.value as AccountType)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="MOBILE">Mobile Money</option>
                    <option value="BANK">Bank Account</option>
                    <option value="MEMBER">Member Holding (Personal)</option>
                  </select>
                </div>

                {newAccountType === 'MEMBER' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Select Member</label>
                    <select 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                      value={selectedMemberId}
                      onChange={(e) => handleMemberSelect(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Member --</option>
                      {members.filter(m => m.active).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Account Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder={newAccountType === 'MEMBER' ? "e.g., John's Cash Hand" : "e.g., Safe Box"}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                  />
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
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
