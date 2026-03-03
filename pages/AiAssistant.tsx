
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { askFinancialAssistant } from '../utils/aiHelper';
import { ActionDraft } from '../types';
import { 
  Send, 
  Sparkles, 
  Bot, 
  User, 
  CheckCircle, 
  Loader2,
  List,
  Plus,
  ArrowRight,
  Trash2,
  Image as ImageIcon,
  X,
  AlertCircle
} from 'lucide-react';
import { AccountType } from '../types';

export const AiAssistant: React.FC = () => {
  const { 
    members, accounts, loans, transactions, workingDate, chatMessages,
    addContribution, addRepayment, addExpense, getLoanDetails,
    addMember, addAccount, addLoan, addTransfer, addOpeningBalance,
    addChatMessage, updateChatMessage, clearChatHistory
  } = useStore();
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isLoading, selectedImage]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !selectedImage) || isLoading) return;

    let userDisplayMessage = input;
    if (selectedImage) userDisplayMessage = input ? `${input} [Image Attached]` : '[Image Attached]';

    await addChatMessage('user', userDisplayMessage);
    
    const userInput = input; 
    const imageToSend = selectedImage;
    
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const response = await askFinancialAssistant(
        userInput, 
        { members, accounts, loans, transactions, workingDate, chatHistory: chatMessages },
        imageToSend || undefined
      );
      
      const responseText = response.text || (response.type === 'DRAFT_ACTIONS' ? `I've prepared ${response.actions?.length || 0} actions from your request.` : 'Done.');
      await addChatMessage('ai', responseText, response.type === 'DRAFT_ACTIONS' ? response.actions : undefined);

    } catch (err) {
      await addChatMessage('ai', "Sorry, I encountered an error processing that request.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmActions = async (messageId: string, actions: ActionDraft[]) => {
    setIsLoading(true);
    let successCount = 0;
    let failedCount = 0;
    
    // Create a deep copy of actions to update their status
    const updatedActions = actions.map(a => ({...a}));
    
    // We maintain a map of newly created names to IDs
    const newMemberMap = new Map<string, string>();
    const newAccountMap = new Map<string, string>();

    for (let i = 0; i < updatedActions.length; i++) {
      const act = updatedActions[i];
      
      // Skip if already successfully executed
      if (act.status === 'DONE') {
          successCount++;
          continue;
      }

      let result: string | null = null;
      const notes = act.notes || 'AI Action';
      const dateToUse = act.date || workingDate;

      let resolvedMemberId = act.memberId;
      if (!resolvedMemberId && act.memberName) {
        // Check new members first
        if (newMemberMap.has(act.memberName)) {
          resolvedMemberId = newMemberMap.get(act.memberName);
        } else {
          // Check existing members
          const existing = members.find(m => m.name.toLowerCase() === act.memberName?.toLowerCase());
          if (existing) {
            resolvedMemberId = existing.id;
          } else {
            console.warn(`Could not resolve member by name: ${act.memberName}`);
          }
        }
      }

      let resolvedAccountId = act.accountId;
      if (!resolvedAccountId) {
        if (act.accountName) {
          if (newAccountMap.has(act.accountName)) {
            resolvedAccountId = newAccountMap.get(act.accountName);
          } else {
            const existing = accounts.find(a => a.account_name.toLowerCase() === act.accountName?.toLowerCase());
            if (existing) {
              resolvedAccountId = existing.id;
            } else {
              console.warn(`Could not resolve account by name: ${act.accountName}`);
            }
          }
        }
        
        // Final fallback: Use first CASH account if still missing for financial actions
        if (!resolvedAccountId && ['CONTRIBUTION', 'LOAN_REPAYMENT', 'CREATE_LOAN', 'EXPENSE', 'TRANSFER', 'OPENING_BALANCE'].includes(act.type)) {
          const defaultCash = accounts.find(a => a.type === 'CASH');
          if (defaultCash) {
            resolvedAccountId = defaultCash.id;
            console.info(`Using default CASH account for ${act.type}`);
          }
        }
      }

      console.log(`Processing action ${i}: type=${act.type}, member=${resolvedMemberId}, account=${resolvedAccountId}, amount=${act.amount}`);

      try {
        switch (act.type) {
          case 'ADD_MEMBER':
            if (act.memberName) {
              const newId = await addMember(act.memberName, act.startingCredit || 0);
              newMemberMap.set(act.memberName, newId);
            } else throw new Error('Missing name for ADD_MEMBER');
            break;

          case 'ADD_ACCOUNT':
            if (act.accountName && act.accountType) {
              const newId = await addAccount(act.accountName, act.accountType as AccountType, resolvedMemberId);
              newAccountMap.set(act.accountName, newId);
            } else throw new Error('Missing details for ADD_ACCOUNT');
            break;

          case 'CREATE_LOAN':
            if (resolvedMemberId && resolvedAccountId && act.amount) {
              result = await addLoan(resolvedMemberId, act.amount, resolvedAccountId, dateToUse, act.interestRate || 10);
            } else {
              const missing = [];
              if (!resolvedMemberId) missing.push('Member');
              if (!resolvedAccountId) missing.push('Account');
              if (!act.amount) missing.push('Amount');
              throw new Error(`Missing details for CREATE_LOAN: ${missing.join(', ')}`);
            }
            break;

          case 'TRANSFER':
            if (resolvedAccountId && act.toAccountId && act.amount) {
              result = await addTransfer(resolvedAccountId, act.toAccountId, act.amount, act.fundType || 'PRINCIPAL', dateToUse, notes, true);
            } else {
              const missing = [];
              if (!resolvedAccountId) missing.push('From Account');
              if (!act.toAccountId) missing.push('To Account');
              if (!act.amount) missing.push('Amount');
              throw new Error(`Missing details for TRANSFER: ${missing.join(', ')}`);
            }
            break;

          case 'CONTRIBUTION':
            if (resolvedMemberId && resolvedAccountId && act.amount) {
              result = await addContribution(resolvedMemberId, act.amount, resolvedAccountId, dateToUse, notes, true);
            } else {
              const missing = [];
              if (!resolvedMemberId) missing.push('Member');
              if (!resolvedAccountId) missing.push('Account');
              if (!act.amount) missing.push('Amount');
              throw new Error(`Missing details for CONTRIBUTION: ${missing.join(', ')}`);
            }
            break;

          case 'LOAN_REPAYMENT':
            if (resolvedMemberId && resolvedAccountId && act.amount) {
               const memberLoans = loans.filter(l => l.memberId === resolvedMemberId);
               const unpaidLoan = memberLoans.find(l => getLoanDetails(l).status !== 'PAID');
               if (unpaidLoan) {
                 result = await addRepayment(unpaidLoan.id, act.amount, resolvedAccountId, dateToUse, notes, true);
               } else {
                 result = `No unpaid loan for ${act.memberName || 'member'}`;
               }
            } else {
              const missing = [];
              if (!resolvedMemberId) missing.push('Member');
              if (!resolvedAccountId) missing.push('Account');
              if (!act.amount) missing.push('Amount');
              throw new Error(`Missing details for LOAN_REPAYMENT: ${missing.join(', ')}`);
            }
            break;

          case 'EXPENSE':
            if (resolvedAccountId && act.amount) {
              result = await addExpense(act.amount, resolvedAccountId, dateToUse, notes, true);
            } else {
              const missing = [];
              if (!resolvedAccountId) missing.push('Account');
              if (!act.amount) missing.push('Amount');
              throw new Error(`Missing details for EXPENSE: ${missing.join(', ')}`);
            }
            break;
            
          case 'OPENING_BALANCE':
            if (resolvedAccountId && act.amount) {
                result = await addOpeningBalance(resolvedAccountId, act.amount, act.fundType || 'PRINCIPAL', dateToUse, notes, true);
            } else {
              const missing = [];
              if (!resolvedAccountId) missing.push('Account');
              if (!act.amount) missing.push('Amount');
              throw new Error(`Missing details for OPENING_BALANCE: ${missing.join(', ')}`);
            }
            break;
        }

        if (result && typeof result === 'string' && result.includes('Failed')) {
            // Logic error from store (e.g., duplicates) returned as string
            throw new Error(result);
        }

        updatedActions[i].status = 'DONE';
        successCount++;

      } catch (e: any) {
        updatedActions[i].status = 'FAILED';
        failedCount++;
        console.error(`Action ${i} failed:`, e.message);
      }

      // Update UI every 5 actions or at the end to show progress
      if (i % 5 === 0 || i === updatedActions.length - 1) {
        await updateChatMessage(messageId, { actions: [...updatedActions] });
      }
    }

    setIsLoading(false);

    // Provide feedback if there were new attempts
    const totalNewAttempts = actions.filter(a => a.status !== 'DONE').length;
    if (totalNewAttempts > 0) {
        if (failedCount > 0) {
             await addChatMessage('ai', `I executed ${successCount} actions, but ${failedCount} failed to process. Check the list above for details.`);
        } else {
             await addChatMessage('ai', `✅ Successfully executed all ${successCount} actions.`);
        }
    }
  };

  const getActionIcon = (type: string) => {
    switch(type) {
      case 'ADD_MEMBER': return <User size={14} className="text-blue-600" />;
      case 'ADD_ACCOUNT': return <List size={14} className="text-purple-600" />;
      case 'CREATE_LOAN': return <Plus size={14} className="text-rose-600" />;
      case 'TRANSFER': return <ArrowRight size={14} className="text-slate-600" />;
      default: return <CheckCircle size={14} className="text-emerald-600" />;
    }
  };

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col max-w-4xl mx-auto">
      <div className="flex-none mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="text-purple-600" /> Admin AI Assistant
          </h1>
          <p className="text-slate-500">Multimodal Assistant: Text, Receipts, and Documents.</p>
        </div>
        {chatMessages.length > 0 && (
          <button 
            onClick={() => {
              if (window.confirm("Clear chat history?")) clearChatHistory();
            }}
            className="text-slate-400 hover:text-red-600 p-2"
            title="Clear History"
          >
            <Trash2 size={20} />
          </button>
        )}
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {chatMessages.length === 0 && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 shadow-sm text-slate-800">
                <div className="flex items-center gap-2 mb-1 opacity-70 text-xs">
                  <Bot size={12} />
                  <span>Admin AI</span>
                </div>
                <p className="whitespace-pre-wrap">
                  Hello! I can see and read receipts.<br/><br/>
                  Try uploading a photo of a receipt or handwritten note using the image icon below, and I'll convert it into a transaction for you.
                </p>
              </div>
            </div>
          )}

          {chatMessages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`
                max-w-[90%] md:max-w-[80%] rounded-2xl p-4 shadow-sm
                ${msg.sender === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}
              `}>
                <div className="flex items-center gap-2 mb-1 opacity-70 text-xs">
                  {msg.sender === 'user' ? <User size={12} /> : <Bot size={12} />}
                  <span>{msg.sender === 'user' ? 'You' : 'Admin AI'}</span>
                </div>
                
                {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}

                {/* Action Card List */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
                    <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                      <List size={14} /> 
                      {msg.actions.length} Proposed Actions
                    </h4>
                    
                    <div className="max-h-60 overflow-y-auto space-y-2 mb-3 pr-2">
                      {msg.actions.map((act, idx) => (
                        <div key={idx} className={`
                           p-2 rounded border text-xs flex justify-between items-center transition-colors
                           ${act.status === 'DONE' ? 'bg-emerald-50 border-emerald-100' : 
                             act.status === 'FAILED' ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}
                        `}>
                          <div className="flex items-center gap-2">
                            {act.status === 'DONE' ? (
                                <div className="text-emerald-600 bg-emerald-100 p-1 rounded-full"><CheckCircle size={12} /></div>
                            ) : act.status === 'FAILED' ? (
                                <div className="text-red-600 bg-red-100 p-1 rounded-full"><AlertCircle size={12} /></div>
                            ) : (
                                getActionIcon(act.type)
                            )}
                            
                            <div>
                              <span className={`font-bold block ${act.status === 'DONE' ? 'text-emerald-800' : act.status === 'FAILED' ? 'text-red-800' : 'text-slate-700'}`}>
                                {act.type?.replace('_', ' ') || 'Action'}
                              </span>
                              <span className="text-slate-500">
                                {act.memberName || act.accountName || 'System'} • {act.date || 'Today'}
                              </span>
                            </div>
                          </div>
                          {act.amount && (
                            <span className="font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                              {act.amount.toLocaleString()} MK
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <div className="text-xs text-slate-500 font-medium">
                        {msg.actions.every(a => a.status === 'DONE') ? 'All actions executed' : 'Click confirm to execute'}
                      </div>
                      <button 
                        onClick={() => handleConfirmActions(msg.id, msg.actions!)}
                        disabled={isLoading || msg.actions.every(a => a.status === 'DONE')}
                        className={`
                            py-1.5 px-4 rounded flex items-center justify-center gap-1 font-medium text-sm transition-colors
                            ${msg.actions.every(a => a.status === 'DONE') 
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'}
                        `}
                      >
                         {isLoading ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />} 
                         {msg.actions.every(a => a.status === 'DONE') ? 'Completed' : 'Confirm All'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-2 text-slate-500">
                <Loader2 size={16} className="animate-spin" />
                Processing...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-100">
          {selectedImage && (
            <div className="mb-2 flex items-center gap-2 bg-slate-100 p-2 rounded-lg w-fit">
              <img src={selectedImage} alt="Preview" className="h-12 w-12 object-cover rounded" />
              <span className="text-xs text-slate-500">Image attached</span>
              <button onClick={() => setSelectedImage(null)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
            </div>
          )}
          <form onSubmit={handleSend} className="flex gap-2">
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              onChange={handleImageSelect} 
              className="hidden" 
            />
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className="bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200 border border-slate-200"
              title="Upload Receipt/Image"
            >
              <ImageIcon size={20} />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={selectedImage ? "Describe this image..." : "Command me... e.g. 'Add expense'"}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900"
              autoFocus
            />
            <button 
              type="submit" 
              disabled={isLoading || (!input.trim() && !selectedImage)}
              className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
