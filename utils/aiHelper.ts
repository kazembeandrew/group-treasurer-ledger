
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
    return new GoogleGenAI({ apiKey });
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
      description: "The type of response: DRAFT_ACTIONS for transaction drafts, ANSWER for general questions or clarifications."
    },
    text: {
      type: Type.STRING,
      description: "A brief confirmation or clarification message."
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
  imageBase64?: string // New optional parameter
): Promise<AIResponse> => {
  
  const ai = getAiClient();
  
  if (!ai) {
    return {
      type: 'ANSWER',
      text: "I'm sorry, but the AI Assistant is not configured correctly. Please ensure the Gemini API Key is set in your environment variables (GEMINI_API_KEY)."
    };
  }

  const activeMembers = context.members.map(m => ({ id: m.id, name: m.name }));
  const activeAccounts = context.accounts.map(a => ({ id: a.id, name: a.account_name, type: a.type }));
  
  // Calculate loan details for context
  const activeLoans = context.loans
    .filter(l => l.date_given <= context.workingDate)
    .map(l => {
       const m = context.members.find(mem => mem.id === l.memberId);
       const interest = l.interest_amount ?? (l.amount_given * (l.interest_rate / 100));
       const totalDue = l.amount_given + interest;
       const paid = context.transactions
         .filter(t => t.related_loan_id === l.id && t.transaction_type === 'LOAN_REPAYMENT' && t.date <= context.workingDate)
         .reduce((sum, t) => sum + t.amount, 0);
       return { 
         id: l.id, 
         member: m?.name, 
         amount: l.amount_given, 
         balance: totalDue - paid,
         date: l.date_given 
       };
    })
    .filter(l => l.balance > 0);

  const systemInstruction = `
    You are the ADMIN AI for 'WealthShare'. Your goal is to convert natural language requests into structured JSON actions for the database.

    CURRENT DATABASE STATE:
    Reference Date: ${context.workingDate}
    Members: ${JSON.stringify(activeMembers)}
    Accounts: ${JSON.stringify(activeAccounts)}
    Active Loans: ${JSON.stringify(activeLoans)}
    
    TASK:
    Analyze the user's input and identify if they want to perform financial transactions.
    If the user provides a list or describes multiple transactions (e.g. "124 payments"), you MUST generate an action for EVERY SINGLE ONE. Do not summarize or skip any.
    
    ACTION TYPES:
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
    4. IF MEMBER NOT FOUND: If the name implies an existing member but isn't found, output type "ANSWER" and ask for clarification.
    5. JSON ONLY: Your output must be raw JSON. No markdown.
    6. NO TRUNCATION: Include EVERY action requested. If there are 100 payments, generate 100 action objects.
    
    RESPONSE SCHEMA:
    {
      "type": "DRAFT_ACTIONS" | "ANSWER",
      "text": "Confirmation message.",
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
    
    EXAMPLES:
    Input: "Andrew paid 1000 today"
    Output: { "type": "DRAFT_ACTIONS", "text": "I've drafted a contribution for Andrew.", "actions": [{ "type": "CONTRIBUTION", "memberId": "matched-uuid-for-andrew", "amount": 1000, "accountId": "default-cash-id", "date": "${context.workingDate}" }] }
  `;

  try {
    const contentParts: any[] = [];
    
    if (imageBase64) {
      // Remove data URL prefix if present
      const base64Data = imageBase64.split(',')[1] || imageBase64;
      contentParts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data
        }
      });
      contentParts.push({ text: "Analyze this image and create the appropriate transaction actions. " + userPrompt });
    } else {
      contentParts.push({ text: userPrompt });
    }

    const response = await ai.models.generateContent({
      model: imageBase64 ? 'gemini-2.5-flash-image' : 'gemini-3.1-pro-preview',
      contents: {
        role: 'user',
        parts: contentParts
      },
      config: {
        systemInstruction: systemInstruction,
        // Only use JSON mode for the text model, as it's not supported for the image model
        ...(imageBase64 ? {} : { 
          responseMimeType: "application/json",
          responseSchema: responseSchema
        }),
        maxOutputTokens: 8192, 
        temperature: 0.1, 
      }
    });

    const responseText = response.text;
    if (!responseText) throw new Error("Empty response from AI");

    // Attempt to clean markdown if present (e.g. ```json ... ```)
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const parsed = JSON.parse(cleanedText);
      return parsed as AIResponse;
    } catch (parseError: any) {
      console.error("JSON Parse Error. Length:", cleanedText.length, "Text start:", cleanedText.substring(0, 100), "Text end:", cleanedText.substring(cleanedText.length - 100));
      if (cleanedText.length > 10000) {
        throw new Error(`The response was too large (${cleanedText.length} characters) and appears to have been truncated. Please try processing fewer transactions at once.`);
      }
      throw parseError;
    }

  } catch (error: any) {
    console.error("AI Error:", error);
    return {
      type: 'ANSWER',
      text: `I'm having trouble processing that request: ${error.message || "Unknown error"}`
    };
  }
};
