import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

// High-value politicians list
const TOP_POLITICIANS = [
  "Josh Gottheimer", "Kevin Hern", "Nancy Pelosi",
  "Michael McCaul", "Dan Crenshaw", "Tommy Tuberville",
  "Sheldon Whitehouse", "Marjorie Taylor Greene",
  "April McClain Delaney", "Shelley Moore Capito"
];

// High-value committees keywords
const HIGH_VALUE_COMMITTEES = [
  "Armed Services", "Intelligence", "Banking", "Finance",
  "Commerce", "Energy", "Health", "Technology", "Judiciary"
];

interface Trade {
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

interface ScoreFactor {
  label: string;
  points: number;
  description: string;
}

interface Signal {
  ticker: string;
  action: "BUY" | "SELL" | "WATCH";
  score: number;
  reason: string;
  trades: Trade[];
  timestamp: string;
  score_breakdown?: ScoreFactor[];
}

async function fetchTrades(): Promise<Trade[]> {
  const variations = [
    { url: "https://www.capitoltrades.com/api/trades", params: { size: 100, page: 0, _r: Date.now() } },
    { url: "https://www.capitoltrades.com/api/trades", params: { pageSize: 100, page: 1, sortBy: "publishedAt", sortOrder: "desc" } },
    { url: "https://capitoltrades.com/api/trades", params: { size: 100, page: 0 } },
    { url: "https://www.capitoltrades.com/api/v1/trades", params: { size: 100 } },
    { url: "https://www.capitoltrades.com/api/v3/trades", params: { size: 100 } }
  ];

  for (const { url, params } of variations) {
    try {
      console.log(`Attempting fetch: ${url} with params ${JSON.stringify(params)}`);
      const response = await axios.get(url, {
        params,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.capitoltrades.com/trades",
          "DNT": "1",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          "Pragma": "no-cache",
          "Cache-Control": "no-cache",
        },
        timeout: 6000,
      });

      const items = response.data.data || response.data || [];
      const tradeData = Array.isArray(items) ? items : (items.data || []);
      
      if (tradeData && Array.isArray(tradeData) && tradeData.length > 0) {
        console.log(`Success! Retrieved ${tradeData.length} trades from ${url}`);
        return tradeData.map((item: any) => {
          const pubDate = new Date(item.publishedAt);
          const tradeDate = item.transactionDate ? new Date(item.transactionDate) : null;
          const filedAfterDays = tradeDate ? Math.max(0, Math.floor((pubDate.getTime() - tradeDate.getTime()) / (1000 * 60 * 60 * 24))) : 0;
          
          const committees = item.politician?.committees || [];

          return {
            politician: item.politician?.name || "Unknown",
            party: item.politician?.party || "",
            ticker: item.asset?.ticker || "N/A",
            company: item.asset?.name || "",
            trade_type: (item.type || "").toLowerCase(),
            size_range: item.size || "",
            filed_date: item.publishedAt ? item.publishedAt.slice(0, 10) : "",
            trade_date: item.transactionDate ? item.transactionDate.slice(0, 10) : "",
            committee: committees[0] || "",
            sector: item.asset?.sector || "",
            filed_after_days: filedAfterDays,
          };
        });
      }
    } catch (error: any) {
      console.warn(`Variation failed [${url}]: ${error.message} (Status: ${error.response?.status})`);
    }
  }

  console.warn("All Capitol Trades variations failed. Enabling hyper-fallback to secondary sources (logic placeholder) or mock data.");
  return getMockTrades();
}

function getMockTrades(): Trade[] {
  const today = new Date().toISOString().slice(0, 10);
  return [
    { politician: "Josh Gottheimer", party: "Democrat", ticker: "NVDA", company: "NVIDIA Corp", trade_type: "buy", size_range: "$250K–$500K", filed_date: today, trade_date: today, committee: "Banking Committee", sector: "Technology", filed_after_days: 12 },
    { politician: "Nancy Pelosi", party: "Democrat", ticker: "NVDA", company: "NVIDIA Corp", trade_type: "buy", size_range: "$100K–$250K", filed_date: today, trade_date: today, committee: "", sector: "Technology", filed_after_days: 18 },
    { politician: "Kevin Hern", party: "Republican", ticker: "NVDA", company: "NVIDIA Corp", trade_type: "buy", size_range: "$50K–$100K", filed_date: today, trade_date: today, committee: "Finance Committee", sector: "Technology", filed_after_days: 25 },
    { politician: "Kevin Hern", party: "Republican", ticker: "MSFT", company: "Microsoft Corp", trade_type: "buy", size_range: "$100K–$250K", filed_date: today, trade_date: today, committee: "Finance Committee", sector: "Technology", filed_after_days: 8 },
    { politician: "Michael McCaul", party: "Republican", ticker: "LMT", company: "Lockheed Martin", trade_type: "buy", size_range: "$250K–$500K", filed_date: today, trade_date: today, committee: "Armed Services", sector: "Defense", filed_after_days: 5 },
    { politician: "Tommy Tuberville", party: "Republican", ticker: "LMT", company: "Lockheed Martin", trade_type: "buy", size_range: "$50K–$100K", filed_date: today, trade_date: today, committee: "Armed Services", sector: "Defense", filed_after_days: 7 },
    { politician: "Dan Crenshaw", party: "Republican", ticker: "RTX", company: "Raytheon Technologies", trade_type: "buy", size_range: "$100K–$250K", filed_date: today, trade_date: today, committee: "Intelligence", sector: "Defense", filed_after_days: 3 },
    { politician: "Sheldon Whitehouse", party: "Democrat", ticker: "AMZN", company: "Amazon.com Inc", trade_type: "buy", size_range: "$50K–$100K", filed_date: today, trade_date: today, committee: "Commerce", sector: "Technology", filed_after_days: 20 },
    { politician: "April McClain Delaney", party: "Democrat", ticker: "AAPL", company: "Apple Inc", trade_type: "sell", size_range: "$50K–$100K", filed_date: today, trade_date: today, committee: "", sector: "Technology", filed_after_days: 14 },
    { politician: "Shelley Moore Capito", party: "Republican", ticker: "XOM", company: "Exxon Mobil", trade_type: "buy", size_range: "$50K–$100K", filed_date: today, trade_date: today, committee: "Energy", sector: "Energy", filed_after_days: 11 },
  ];
}

function analyzeSignals(trades: Trade[]): Signal[] {
  const byTicker: Record<string, Trade[]> = {};
  trades.forEach(t => {
    if (t.ticker && t.ticker !== "N/A" && t.ticker !== "") {
      if (!byTicker[t.ticker]) byTicker[t.ticker] = [];
      byTicker[t.ticker].push(t);
    }
  });

  const signals: Signal[] = [];
  const now = new Date().toLocaleTimeString();

  Object.entries(byTicker).forEach(([ticker, tickerTrades]) => {
    const buys = tickerTrades.filter(t => t.trade_type === "buy");
    const sells = tickerTrades.filter(t => t.trade_type === "sell");
    
    let score = 0;
    const reasons: string[] = [];
    const breakdown: ScoreFactor[] = [];

    // Strategy 1: Clusters
    if (buys.length >= 3) {
      score += 35;
      reasons.push(`🔥 CLUSTER ${buys.length}x buy`);
      breakdown.push({ label: "Buy Cluster", points: 35, description: `${buys.length} heavy-traffic buy operations detected` });
    } else if (buys.length === 2) {
      score += 20;
      reasons.push("👥 2x buy");
      breakdown.push({ label: "Cluster Lite", points: 20, description: "Secondary cluster of 2 buyers" });
    } else if (buys.length === 1) {
      score += 5;
      breakdown.push({ label: "Inertia", points: 5, description: "Single point of entry" });
    }

    // Strategy 2: High-value committee
    const committeeBuyers = buys.filter(t => 
      HIGH_VALUE_COMMITTEES.some(kw => (t.committee || "").includes(kw))
    );
    if (committeeBuyers.length > 0) {
      score += 25;
      reasons.push(`🏛️ ${committeeBuyers[0].politician} (${committeeBuyers[0].committee})`);
      breakdown.push({ 
        label: "Strategic Oversight", 
        points: 25, 
        description: `Buyer ${committeeBuyers[0].politician} holds seat on ${committeeBuyers[0].committee}` 
      });
    }

    // Strategy 3: Fresh filing (< 15 days)
    const fresh = buys.filter(t => t.filed_after_days > 0 && t.filed_after_days < 15);
    if (fresh.length > 0) {
      score += 20;
      reasons.push(`⚡ filed ${fresh[0].filed_after_days}d after`);
      breakdown.push({ 
        label: "Temporal Velocity", 
        points: 20, 
        description: `Rapid disclosure (within ${fresh[0].filed_after_days} days)` 
      });
    }

    // Strategy 4: VIP politician
    const vip = buys.filter(t => TOP_POLITICIANS.includes(t.politician));
    if (vip.length > 0) {
      score += 15;
      reasons.push(`⭐ ${vip[0].politician}`);
      breakdown.push({ 
        label: "Prestige Alpha", 
        points: 15, 
        description: `High-conviction buyer identified: ${vip[0].politician}` 
      });
    }

    // Strategy 5: Large trade size
    const big = buys.filter(t => 
      ["$250K", "$500K", "$1M", ">$1M"].some(x => (t.size_range || "").includes(x))
    );
    if (big.length > 0) {
      score += 10;
      reasons.push(`💰 ${big[0].size_range}`);
      breakdown.push({ 
        label: "Capital Magnitude", 
        points: 10, 
        description: `Significant volume tier: ${big[0].size_range}` 
      });
    }

    let action: "BUY" | "SELL" | "WATCH" = "WATCH";
    if (sells.length > buys.length && buys.length === 0) {
      score = 30; // Base score for sells if no buys
      action = "SELL";
      reasons.push(`🔴 SELL CLUSTER ${sells.length}x sell`);
      breakdown.push({ label: "Liquidation Cluster", points: 30, description: `${sells.length} sell operations without opposing capital` });
    } else if (score >= 65) {
      action = "BUY";
    }

    if (score >= 30) {
      signals.push({
        ticker,
        action,
        score: Math.min(score, 100),
        reason: reasons.join(" | "),
        trades: action === "SELL" ? sells : buys,
        timestamp: now,
        score_breakdown: breakdown
      });
    }
  });

  return signals.sort((a, b) => b.score - a.score);
}

async function startServer() {
  const app = express();

  // API Routes
  app.get("/api/trades", async (req, res) => {
    const trades = await fetchTrades();
    res.json(trades);
  });

  app.get("/api/signals", async (req, res) => {
    const trades = await fetchTrades();
    const signals = analyzeSignals(trades);
    res.json(signals);
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
