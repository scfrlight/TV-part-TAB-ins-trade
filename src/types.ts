export interface Trade {
  politician: string;
  party: string;
  ticker: string;
  company: string;
  trade_type: string;
  size_range: string;
  filed_date: string;
  trade_date: string;
  committee: string;
  sector: string;
  filed_after_days: number;
}

export interface ScoreFactor {
  label: string;
  points: number;
  description: string;
}

export interface ResearchReport {
  summary: string;
  fundamental_analysis: {
    pe_ratio: string;
    market_cap: string;
    dividend_yield: string;
    revenue_growth: string;
    profit_margin: string;
    description: string;
  };
  technical_analysis: {
    trend: string;
    rsi: string;
    moving_averages: string;
    support_resistance: string;
    description: string;
  };
  sentiment: {
    score: number; // 0-100
    sources: string[];
    summary: string;
  };
  conclusion: string;
  last_updated: string;
}

export interface Signal {
  ticker: string;
  action: "BUY" | "SELL" | "WATCH";
  score: number;
  reason: string;
  trades: Trade[];
  timestamp: string;
  ai_analysis?: string;
  score_breakdown?: ScoreFactor[];
  research_report?: ResearchReport;
}

export interface Stats {
  totalTrades: number;
  buys: number;
  sells: number;
  topTickers: { ticker: string; count: number }[];
  topPoliticians: { name: string; count: number }[];
}
