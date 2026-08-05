
import { GoogleGenAI, Type } from "@google/genai";
import { Member, Account, Loan, Transaction, AccountType, ActionDraft, ChatMessage } from "../types";

// Initialize Gemini Client
const getAiClient = () => {
  const apiKey = 
    (import.meta as any).env?.VITE_GEMINI_API_KEY || 
    process.env.GEMINI_API_KEY || 
    process.env.API_KEY || 
    '';
    
  if (!apiKey || apiKey.includes('YOUR_API_KEY')) return null;
  
  try {
    return new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  } catch (e) {
    console.error("Failed to initialize Gemini Client:", e);
    return null;
  }
};

// Define the schema for the AI response
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    type: {
      type: Type.STRING,
      description: "The type of response: DRAFT_ACTIONS for creating transaction/entity actions, or ANSWER for answering queries, reporting stats, collections, and account balance details."
    },
    text: {
      type: Type.STRING,
      description: "A comprehensive answer to the user's query or a brief confirmation of drafted actions."
    },
    actions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { 
            type: Type.STRING,
            description: "The action type: CONTRIBUTION, LOAN_REPAYMENT, CREATE_LOAN, ADD_MEMBER, ADD_ACCOUNT, EXPENSE, TRANSFER, OPENING_BALANCE"
          },
          memberId: { type: Type.STRING, description: "The UUID of the member from the provided list." },
          accountId: { type: Type.STRING, description: "The UUID of the account from the provided list." },
          amount: { type: Type.NUMBER, description: "The transaction amount. MUST be a positive number." },
          date: { type: Type.STRING, description: "The date in YYYY-MM-DD format." },
          notes: { type: Type.STRING, description: "A short description of the transaction." },
          memberName: { type: Type.STRING, description: "The name of the member (required for ADD_MEMBER, or if memberId is unknown)." },
          accountName: { type: Type.STRING, description: "The name of the account (required for ADD_ACCOUNT, or if accountId is unknown)." },
          accountType: { type: Type.STRING, description: "CASH, MOBILE, or BANK (required for ADD_ACCOUNT)." },
          fundType: { type: Type.STRING, description: "PRINCIPAL or INTEREST (relevant for TRANSFER/OPENING_BALANCE)." }
        },
        required: ["type", "amount"]
      }
    }
  },
  required: ["type", "text"]
};

export interface AIResponse {
  type: 'ANSWER' | 'DRAFT_ACTIONS';
  text?: string;
  actions?: ActionDraft[];
}

export const askFinancialAssistant = async (
  userPrompt: string, 
  context: { 
    members: Member[], 
    accounts: Account[], 
    loans: Loan[], 
    transactions: Transaction[],
    workingDate: string,
    chatHistory: ChatMessage[]
  },
  imageBase64?: string
): Promise<AIResponse> => {
  
  const ai = getAiClient();
  
  if (!ai) {
    return {
      type: 'ANSWER',
      text: "I'm sorry, but the AI Assistant is not configured correctly. Please ensure the Gemini API Key is set in your environment variables (GEMINI_API_KEY)."
    };
  }

  // 1. Member Summaries with Total Collections & Activity
  const memberSummaries = context.members.map(m => {
    const memberTrans = context.transactions.filter(t => t.memberId === m.id && t.date <= context.workingDate);
    const totalContributed = memberTrans
      .filter(t => t.transaction_type === 'CONTRIBUTION')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalRepayments = memberTrans
      .filter(t => t.transaction_type === 'LOAN_REPAYMENT')
      .reduce((sum, t) => sum + t.amount, 0);
    const contributions = memberTrans
      .filter(t => t.transaction_type === 'CONTRIBUTION')
      .sort((a, b) => b.date.localeCompare(a.date));
    const lastContributionDate = contributions.length > 0 ? contributions[0].date : 'None';

    return {
      id: m.id,
      name: m.name,
      active: m.active,
      advance_credit: m.advance_credit || 0,
      total_contributions: totalContributed,
      total_loan_repayments: totalRepayments,
      last_contribution_date: lastContributionDate
    };
  });

  // 2. Account Summaries with Calculated Balances
  const accountSummaries = context.accounts.map(a => {
    const accTrans = context.transactions.filter(t => t.accountId === a.id && t.date <= context.workingDate);
    const principal = accTrans.filter(t => t.fund_type === 'PRINCIPAL').reduce((sum, t) => sum + t.amount, 0);
    const interest = accTrans.filter(t => t.fund_type === 'INTEREST').reduce((sum, t) => sum + t.amount, 0);
    return {
      id: a.id,
      account_name: a.account_name,
      type: a.type,
      active: a.active,
      principal_balance: principal,
      interest_balance: interest,
      total_balance: principal + interest
    };
  });

  // 3. Active Loans Details
  const activeLoans = context.loans
    .filter(l => l.date_given <= context.workingDate)
    .map(l => {
       const m = context.members.find(mem => mem.id === l.memberId);
       const interest = l.interest_amount ?? (l.amount_given * (l.interest_rate / 100));
       const totalDue = l.amount_given + interest;
       const paid = context.transactions
         .filter(t => t.related_loan_id === l.id && t.transaction_type === 'LOAN_REPAYMENT' && t.date <= context.workingDate)
         .reduce((sum, t) => sum + t.amount, 0);
       const balance = totalDue - paid;
       return { 
         id: l.id, 
         member: m?.name || l.borrowerName || 'Non-member', 
         amount_given: l.amount_given, 
         interest_rate: l.interest_rate,
         total_due: totalDue,
         amount_paid: paid,
         balance: balance,
         date_given: l.date_given,
         due_date: l.due_date,
         status: balance <= 0 ? 'PAID' : (context.workingDate > l.due_date ? 'OVERDUE' : 'UNPAID')
       };
    });

  // 4. Collections Summary for Today / Reference Date
  const todayCollections = context.transactions
    .filter(t => t.transaction_type === 'CONTRIBUTION' && t.date === context.workingDate)
    .map(t => {
      const m = context.members.find(mem => mem.id === t.memberId);
      const a = context.accounts.find(acc => acc.id === t.accountId);
      return {
        member: m?.name || 'Unknown',
        amount: t.amount,
        account: a?.account_name || 'Cash',
        notes: t.notes
      };
    });

  // 5. Overall Transaction Totals
  const transactionTotals = {
    total_contributions: context.transactions.filter(t => t.transaction_type === 'CONTRIBUTION' && t.date <= context.workingDate).reduce((s, t) => s + t.amount, 0),
    total_loans_given: context.transactions.filter(t => t.transaction_type === 'LOAN_GIVEN' && t.date <= context.workingDate).reduce((s, t) => s + t.amount, 0),
    total_loan_repayments: context.transactions.filter(t => t.transaction_type === 'LOAN_REPAYMENT' && t.date <= context.workingDate).reduce((s, t) => s + t.amount, 0),
    total_expenses: context.transactions.filter(t => t.transaction_type === 'EXPENSE' && t.date <= context.workingDate).reduce((s, t) => s + t.amount, 0),
    total_opening_balances: context.transactions.filter(t => t.transaction_type === 'OPENING_BALANCE' && t.date <= context.workingDate).reduce((s, t) => s + t.amount, 0)
  };

  // 6. Recent 60 Transactions with Full Human-Readable Details
  const recentTransactions = context.transactions
    .filter(t => t.date <= context.workingDate)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 60)
    .map(t => {
      const m = context.members.find(mem => mem.id === t.memberId);
      const a = context.accounts.find(acc => acc.id === t.accountId);
      return {
        id: t.id,
        date: t.date,
        type: t.transaction_type,
        fund_type: t.fund_type,
        memberName: m?.name || null,
        accountName: a?.account_name || null,
        amount: t.amount,
        notes: t.notes
      };
    });

  const systemInstruction = `
    You are the ADMIN AI for 'WealthShare'. You have FULL ACCESS to all collections, transactions, account balances, and member contribution histories.

    CURRENT DATABASE & COLLECTIONS STATE:
    Reference Date: ${context.workingDate}
    
    1. MEMBER SUMMARIES (COLLECTIONS & CREDIT):
    ${JSON.stringify(memberSummaries, null, 2)}

    2. ACCOUNTS & BALANCES:
    ${JSON.stringify(accountSummaries, null, 2)}

    3. ACTIVE LOANS:
    ${JSON.stringify(activeLoans, null, 2)}

    4. TODAY'S COLLECTIONS (${context.workingDate}):
    ${JSON.stringify(todayCollections, null, 2)}

    5. OVERALL TRANSACTION TOTALS:
    ${JSON.stringify(transactionTotals, null, 2)}

    6. RECENT TRANSACTIONS / COLLECTIONS LOG (Latest up to 60):
    ${JSON.stringify(recentTransactions, null, 2)}

    TASK:
    - If the user asks a QUESTION or requests a SUMMARY, REPORT, or BALANCE INFO about collections, member payments, account totals, or transaction history:
      Provide a detailed, clear, accurate, and professional text answer. Use type "ANSWER".
    
    - If the user provides a list or requests to PERFORM/RECORD financial transactions or actions (e.g. "Add 1000 contribution for Andrew", "124 payments", or image receipt):
      Generate a draft action for EVERY SINGLE requested transaction. Use type "DRAFT_ACTIONS". Do not summarize or skip any transaction.
    
    ACTION TYPES (for DRAFT_ACTIONS):
    - CONTRIBUTION: "Member paid money", "Daily share", "Savings"
    - LOAN_REPAYMENT: "Member paid back loan", "Repayment"
    - CREATE_LOAN: "Give loan to Member", "Member borrowed"
    - ADD_MEMBER: "Add new member X"
    - ADD_ACCOUNT: "Create new account"
    - EXPENSE: "Bought stationary", "Transport costs"
    - TRANSFER: "Move money from X to Y"
    - OPENING_BALANCE: "Start balance", "Initial funds", "Add previous balance"
    
    CRITICAL RULES:
    1. MATCH NAMES: You MUST match names from the "Members" list provided above. Support fuzzy matching (e.g. "Andy" -> "Andrew").
    2. USE IDS: When a member or account matches, use their 'id' in the JSON output.
    3. DEFAULTS: 
       - If Account not specified, use the first 'CASH' account ID.
       - Date format: YYYY-MM-DD (Use Reference Date ${context.workingDate} if not specified).
       - fundType: Defaults to 'PRINCIPAL'.
    4. ACCURACY: Base all numbers, totals, and collection status directly on the database state provided above.
    5. JSON ONLY: Your output must be raw JSON conforming to the response schema.
    6. NO TRUNCATION: Include EVERY action requested.
    
    RESPONSE SCHEMA:
    {
      "type": "DRAFT_ACTIONS" | "ANSWER",
      "text": "Comprehensive answer or confirmation message.",
      "actions": [
        {
          "type": "CONTRIBUTION" | "LOAN_REPAYMENT" | "CREATE_LOAN" | "ADD_MEMBER" | "ADD_ACCOUNT" | "EXPENSE" | "TRANSFER" | "OPENING_BALANCE",
          "memberId": "UUID",
          "accountId": "UUID",
          "amount": Number,
          "date": "YYYY-MM-DD",
          "notes": "Description",
          "memberName": "Name (ADD_MEMBER only)",
          "accountName": "Name (ADD_ACCOUNT only)",
          "accountType": "CASH" | "MOBILE" | "BANK",
          "fundType": "PRINCIPAL" | "INTEREST"
        }
      ]
    }
  `;

  try {
    const contentParts: any[] = [];
    
    if (imageBase64) {
      const base64Data = imageBase64.split(',')[1] || imageBase64;
      const mimeType = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      contentParts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      });
      contentParts.push({ text: "Analyze this image and create the appropriate transaction actions or answer questions. " + userPrompt });
    } else {
      contentParts.push({ text: userPrompt });
    }

    const modelsToTry = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    let responseText: string | undefined = undefined;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: {
            role: 'user',
            parts: contentParts
          },
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            maxOutputTokens: 8192, 
            temperature: 0.1, 
          }
        });
        responseText = response.text;
        if (responseText) break;
      } catch (err: any) {
        lastError = err;
        const errStr = String(err?.message || err);
        // If it's a 429 quota error or model error, try the next model candidate
        if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('404')) {
          console.warn(`Model ${modelName} encountered issue: ${errStr}. Retrying with fallback model...`);
          await new Promise(res => setTimeout(res, 1000));
          continue;
        }
        throw err;
      }
    }

    if (!responseText) {
      if (lastError) throw lastError;
      throw new Error("Empty response from AI");
    }

    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const parsed = JSON.parse(cleanedText);
      return parsed as AIResponse;
    } catch (parseError: any) {
      console.error("JSON Parse Error. Length:", cleanedText.length, "Text start:", cleanedText.substring(0, 100), "Text end:", cleanedText.substring(cleanedText.length - 100));
      if (cleanedText.length > 10000) {
        throw new Error(`The response was too large (${cleanedText.length} characters) and appears to have been truncated. Please try processing fewer items at once.`);
      }
      throw parseError;
    }

  } catch (error: any) {
    console.error("AI Error details:", error);
    
    let errorMsg = error.message || "Unknown error";
    
    if (errorMsg.includes('403') || errorMsg.includes('PERMISSION_DENIED')) {
      errorMsg = "Access to the Gemini API model was denied (403 Permission Denied). Please check your API key configuration in Settings > Secrets or ensure the key has access to the Gemini API.";
    } else if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || (error.status === 429)) {
      errorMsg = "The AI Assistant's quota has been exceeded (Rate Limit). This usually happens with the free tier of Gemini. Please wait a minute or two and try again.";
    } else if (errorMsg.includes('500') || errorMsg.includes('INTERNAL')) {
      errorMsg = "The AI service is currently experiencing an internal error. Please try again in a few moments.";
    }

    return {
      type: 'ANSWER',
      text: `I'm having trouble processing that request: ${errorMsg}`
    };
  }
};

