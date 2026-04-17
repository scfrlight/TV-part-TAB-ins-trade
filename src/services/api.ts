import axios from "axios";
import { GoogleGenAI, Type } from "@google/genai";
import { Trade, Signal, ResearchReport } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function getTrades(): Promise<Trade[]> {
  const response = await axios.get("/api/trades");
  return response.data;
}

export async function getSignals(): Promise<Signal[]> {
  const response = await axios.get("/api/signals");
  return response.data;
}

export async function analyzeSignalAI(signal: Signal): Promise<string> {
  const tradeNodes = signal.trades.slice(0, 8).map(t => 
    `- ${t.politician} (${t.party}) | ${t.trade_type.toUpperCase()} ${signal.ticker} | ${t.size_range} | filed ${t.filed_after_days}d after | committee: ${t.committee || "N/A"}`
  ).join("\n");

  const prompt = `You are a concise financial analyst specializing in congressional trading signals.

SIGNAL: ${signal.action} ${signal.ticker}  Score: ${signal.score}/100
Triggers: ${signal.reason}

Congressional trades:
${tradeNodes}

Provide a 3-sentence analysis:
1. Why this signal is notable
2. Key risk / caveat
3. Suggested entry tactic (e.g. limit order, wait for pullback)
Be direct and factual. No disclaimers.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "AI Analysis unavailable.";
  } catch (error) {
    console.error("AI Analysis error:", error);
    return "Error generating AI analysis.";
  }
}

export async function generateDeepResearchReport(ticker: string): Promise<ResearchReport> {
  const prompt = `Perform a thorough institutional-grade research report on ${ticker}.
Search at least 10 financial resources (Bloomberg, Reuters, CNBC, WSJ, MarketWatch, Yahoo Finance, Investing.com, Seeking Alpha, etc.) to confirm the current stock status and investment thesis.

Focus on:
1. Fundamental Analysis: P/E Ratio (price-to-earnings), Market Cap, Dividends, Revenue Growth, Profit Margins.
2. Technical Analysis: Current Trend, RSI indicators, Moving Averages (50/200 day), Support/Resistance levels.
3. Market Sentiment: Social media buzz, analyst ratings, news sentiment.

Ensure all data is up-to-date as of April 2026.
Explain financial terms (like P/E ratio) simply for the user within the descriptions.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            fundamental_analysis: {
              type: Type.OBJECT,
              properties: {
                pe_ratio: { type: Type.STRING },
                market_cap: { type: Type.STRING },
                dividend_yield: { type: Type.STRING },
                revenue_growth: { type: Type.STRING },
                profit_margin: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["pe_ratio", "market_cap", "dividend_yield", "revenue_growth", "profit_margin", "description"]
            },
            technical_analysis: {
              type: Type.OBJECT,
              properties: {
                trend: { type: Type.STRING },
                rsi: { type: Type.STRING },
                moving_averages: { type: Type.STRING },
                support_resistance: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["trend", "rsi", "moving_averages", "support_resistance", "description"]
            },
            sentiment: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.NUMBER },
                sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                summary: { type: Type.STRING }
              },
              required: ["score", "sources", "summary"]
            },
            conclusion: { type: Type.STRING }
          },
          required: ["summary", "fundamental_analysis", "technical_analysis", "sentiment", "conclusion"]
        },
        tools: [{ googleSearch: {} }]
      }
    });

    const report = JSON.parse(response.text || "{}");
    return {
      ...report,
      last_updated: new Date().toLocaleDateString()
    };
  } catch (error) {
    console.error("Deep Research error:", error);
    throw new Error("Failed to generate deep research report.");
  }
}
