import React, { useState, useEffect, useMemo } from "react";
import { 
  Building2, 
  TrendingUp, 
  Bot, 
  BarChart3, 
  AlertCircle, 
  RefreshCcw, 
  Search,
  ChevronRight,
  User,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Bell,
  LogOut,
  LogIn,
  Layers,
  Activity,
  Plus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User as FirebaseUser 
} from "firebase/auth";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  updateDoc 
} from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import { getTrades, getSignals, analyzeSignalAI, generateDeepResearchReport } from "./services/api";
import { Trade, Signal, Stats, ResearchReport } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<"signals" | "trades" | "ai" | "stats" | "alerts">("signals");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userAlerts, setUserAlerts] = useState<any[]>([]);
  const [userNotifications, setUserNotifications] = useState<any[]>([]);
  const [newAlert, setNewAlert] = useState({ ticker: "", criteria_type: "SCORE", threshold: 80 });
  const [isAddingAlert, setIsAddingAlert] = useState(false);
  const [lastCheck, setLastCheck] = useState<number>(Date.now());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [tradeFilter, setTradeFilter] = useState("");
  const [logs, setLogs] = useState<{ ts: string; msg: string; type?: "ok" | "err" }[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const addLog = (msg: string, type?: "ok" | "err") => {
    setLogs(prev => [{ ts: new Date().toLocaleTimeString(), msg, type }, ...prev].slice(0, 50));
  };

  const fetchData = async () => {
    setIsRefreshing(true);
    addLog("Fetching trades and signals...");
    try {
      const [t, s] = await Promise.all([getTrades(), getSignals()]);
      setTrades(t);
      setSignals(s);
      addLog(`Loaded ${t.length} trades and ${s.length} signals`, "ok");
    } catch (error) {
      addLog("Failed to fetch data", "err");
      console.error(error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 300000); // 5 mins

    // Auth Listener
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        addLog(`Authenticated as ${u.email}`, "ok");
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribeAuth();
    };
  }, []);

  // Alerts & Notifications Listeners
  useEffect(() => {
    if (!user) {
      setUserAlerts([]);
      setUserNotifications([]);
      return;
    }

    const qAlerts = query(collection(db, "alerts"), where("uid", "==", user.uid));
    const unsubAlerts = onSnapshot(qAlerts, (snapshot) => {
      const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUserAlerts(alerts);
    }, (err) => console.error("Firestore Alerts Error:", err));

    const qNotifs = query(collection(db, "notifications"), where("uid", "==", user.uid));
    const unsubNotifs = onSnapshot(qNotifs, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUserNotifications(notifs);
    }, (err) => console.error("Firestore Notifs Error:", err));

    return () => {
      unsubAlerts();
      unsubNotifs();
    };
  }, [user]);

  // Watchdog Engine: Monitor Signals & Trigger Notifications
  useEffect(() => {
    if (!user || userAlerts.length === 0 || signals.length === 0) return;

    const activeAlerts = userAlerts.filter(a => a.isActive);
    if (activeAlerts.length === 0) return;

    activeAlerts.forEach(async (alert) => {
      const matchingSignal = signals.find(s => s.ticker === alert.ticker);
      if (!matchingSignal) return;

      let triggered = false;
      let triggerMsg = "";

      if (alert.criteria_type === "SCORE" && matchingSignal.score >= alert.threshold) {
        triggered = true;
        triggerMsg = `Signal score for ${alert.ticker} reached ${matchingSignal.score} (Threshold: ${alert.threshold})`;
      }

      if (triggered) {
        // Prevent spam: only trigger if not recently notified (within last 30 mins)
        const recentNotif = userNotifications.find(n => 
          n.alertId === alert.id && 
          (Date.now() - (n.timestamp?.toDate ? n.timestamp.toDate() : n.timestamp)) < 1800000
        );

        if (!recentNotif) {
          try {
            await addDoc(collection(db, "notifications"), {
              uid: user.uid,
              alertId: alert.id,
              ticker: alert.ticker,
              message: triggerMsg,
              timestamp: serverTimestamp(),
              isRead: false
            });
            addLog(`WATCHDOG TRIGGERED: ${alert.ticker}`, "ok");
          } catch (e) {
            console.error("Failed to generate notification", e);
          }
        }
      }
    });
  }, [signals, userAlerts, user, userNotifications]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      addLog("Authentication failed", "err");
    }
  };

  const handleLogout = () => signOut(auth);

  const createAlert = async () => {
    if (!user || !newAlert.ticker) return;
    setIsAddingAlert(true);
    try {
      await addDoc(collection(db, "alerts"), {
        ...newAlert,
        uid: user.uid,
        isActive: true,
        createdAt: serverTimestamp()
      });
      setNewAlert({ ticker: "", criteria_type: "SCORE", threshold: 80 });
      addLog(`Watchdog active for ${newAlert.ticker}`, "ok");
    } catch (error) {
      addLog("Failed to sync alert", "err");
    } finally {
      setIsAddingAlert(false);
    }
  };

  const deleteAlert = async (id: string) => {
    try {
      await deleteDoc(doc(db, "alerts", id));
      addLog("Watchdog decommissioned", "ok");
    } catch (error) {
      addLog("Failed to delete alert", "err");
    }
  };

  const toggleAlert = async (alert: any) => {
    try {
      await updateDoc(doc(db, "alerts", alert.id), { isActive: !alert.isActive });
    } catch (error) {
      addLog("Failed to toggle alert", "err");
    }
  };

  const handleSignalClick = (sig: Signal) => {
    setSelectedSignal(sig);
    setActiveTab("ai");
  };

  const runAIAnalysis = async () => {
    if (!selectedSignal || selectedSignal.ai_analysis) return;
    
    addLog(`AI analyzing ${selectedSignal.ticker}...`);
    try {
      const result = await analyzeSignalAI(selectedSignal);
      setSignals(prev => prev.map(s => s.ticker === selectedSignal.ticker ? { ...s, ai_analysis: result } : s));
      setSelectedSignal(prev => prev ? { ...prev, ai_analysis: result } : null);
      addLog(`AI completed analysis for ${selectedSignal.ticker}`, "ok");
    } catch (error) {
      addLog(`AI analysis failed for ${selectedSignal.ticker}`, "err");
    }
  };

  const runDeepResearch = async (ticker: string) => {
    setIsResearching(true);
    addLog(`COMMENCING DEEP FREQUENCY RESEARCH FOR ${ticker}...`);
    try {
      const report = await generateDeepResearchReport(ticker);
      setSignals(prev => prev.map(s => s.ticker === ticker ? { ...s, research_report: report } : s));
      if (selectedSignal?.ticker === ticker) {
        setSelectedSignal(prev => prev ? { ...prev, research_report: report } : null);
      }
      setShowReport(true);
      addLog(`FUNDAMENTAL & TECHNICAL RESEARCH COMPLETE FOR ${ticker}.`, "ok");
    } catch (error) {
      addLog(`RESEARCH SUBROUTINE FAILED FOR ${ticker}.`, "err");
    } finally {
      setIsResearching(false);
    }
  };

  const hotSignals = useMemo(() => {
    return [...signals].sort((a, b) => b.score - a.score).slice(0, 3);
  }, [signals]);

  const stats = useMemo<Stats>(() => {
    const buys = trades.filter(t => t.trade_type === "buy").length;
    const sells = trades.filter(t => t.trade_type === "sell").length;
    
    const tickerCounts: Record<string, number> = {};
    const polCounts: Record<string, number> = {};
    
    trades.forEach(t => {
      if (t.trade_type === "buy") {
        tickerCounts[t.ticker] = (tickerCounts[t.ticker] || 0) + 1;
      }
      polCounts[t.politician] = (polCounts[t.politician] || 0) + 1;
    });

    return {
      totalTrades: trades.length,
      buys,
      sells,
      topTickers: Object.entries(tickerCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([ticker, count]) => ({ ticker, count })),
      topPoliticians: Object.entries(polCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }))
    };
  }, [trades]);

  const filteredTrades = trades.filter(t => 
    t.ticker.toLowerCase().includes(tradeFilter.toLowerCase()) ||
    t.politician.toLowerCase().includes(tradeFilter.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)] relative selection:bg-[var(--accent)] selection:text-white">
      {/* Decorative Grid Background */}
      <div className="grid-bg opacity-30" />

      {/* Header */}
      <header className="flex items-center justify-between px-10 py-8 border-b border-[var(--border)] relative z-10">
        <div className="flex flex-col gap-1 ring-offset-[var(--bg)]">
          <div className="micro-label">Capitol Insider. Vol 01</div>
          <h1 className="editorial-header text-4xl italic tracking-tighter text-[var(--ink)]">
            Capitol <span className="font-serif">Insider</span>
          </h1>
        </div>
        <div className="flex items-center gap-8">
          <div className="flex flex-col items-end gap-1">
            <div className="micro-label">System Readiness</div>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${isRefreshing ? 'bg-[var(--accent)] animate-pulse' : 'bg-[var(--muted)]'}`} />
              <span className="text-[10px] mono tracking-widest text-[var(--muted)]">{isRefreshing ? 'SYNCHRONIZING' : 'OPERATIONAL'}</span>
            </div>
          </div>
          <button 
            onClick={fetchData} 
            disabled={isRefreshing}
            className="p-3 hover:text-[var(--accent)] border border-transparent hover:border-[var(--border)] transition-all disabled:opacity-50"
          >
            <RefreshCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar Tabs */}
        <aside className="w-72 bg-transparent border-r border-[var(--border)] flex flex-col p-8 gap-4 relative z-10">
          <div className="mb-6">
            <div className="micro-label mb-4 opacity-50">Navigation</div>
            <nav className="flex flex-col gap-1">
              <TabButton 
                active={activeTab === 'signals'} 
                onClick={() => setActiveTab('signals')}
                icon={<AlertCircle className="w-4 h-4" />}
                label="Signals"
                badge={signals.length}
              />
              <TabButton 
                active={activeTab === 'trades'} 
                onClick={() => setActiveTab('trades')}
                icon={<TrendingUp className="w-4 h-4" />}
                label="Trades"
              />
              <TabButton 
                active={activeTab === 'ai'} 
                onClick={() => setActiveTab('ai')}
                icon={<Bot className="w-4 h-4" />}
                label="Intelligence"
              />
              <TabButton 
                active={activeTab === 'alerts'} 
                onClick={() => setActiveTab('alerts')} 
                icon={<Bell size={16} />} 
                label="Watchdogs" 
                badge={userNotifications.filter(n => !n.isRead).length}
              />
              <TabButton 
                active={activeTab === 'stats'} 
                onClick={() => setActiveTab('stats')}
                icon={<BarChart3 className="w-4 h-4" />}
                label="Matrix"
              />
            </nav>
          </div>
          
          <div className="pt-8 border-t border-[var(--border)]">
              {user ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 px-4">
                    <img src={user.photoURL || ""} alt="" className="w-8 h-8 rounded-full border border-[var(--border)]" />
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-[10px] font-bold uppercase truncate">{user.displayName}</span>
                      <span className="text-[8px] opacity-40 truncate">{user.email}</span>
                    </div>
                  </div>
                  <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2 text-[var(--muted)] hover:text-[var(--accent)] transition-colors micro-label group">
                    <LogOut size={12} className="group-hover:translate-x-1 transition-transform" />
                    Sign Out
                  </button>
                </div>
              ) : (
                <button onClick={handleLogin} className="flex items-center gap-3 px-4 py-4 bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--accent)] hover:text-white transition-all micro-label w-full justify-center">
                  <LogIn size={14} />
                  Authorize Access
                </button>
              )}
            </div>

          <div className="mt-8">
            <div className="editorial-header text-xs italic border-t border-[var(--border)] pt-8 mb-4">
              Real-time synchronization with active market data.
            </div>
            <div className="micro-label mb-2 opacity-50">Operational Log</div>
            <div className="max-h-48 overflow-y-auto pr-2 space-y-3 no-scrollbar">
              {logs.map((log, i) => (
                <div key={i} className="flex flex-col gap-0.5 font-mono text-[9px] border-l border-[var(--border)] pl-3">
                  <span className="text-[var(--muted)] uppercase tracking-tighter">[{log.ts}]</span>
                  <span className={`tracking-tight ${log.type === 'ok' ? 'text-[var(--accent)]' : log.type === 'err' ? 'text-red-500' : 'text-[var(--muted)]'}`}>
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Tab View */}
        <section className="flex-1 overflow-y-auto bg-transparent p-12 relative z-0 no-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'signals' && (
              <motion.div 
                key="signals"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-12"
              >
                {/* Hot Watchlist */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-[1px] bg-[var(--accent)]" />
                      <h3 className="micro-label">High-Conviction Watchlist</h3>
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] animate-pulse">
                      Live Neural Monitoring Active
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
                    {hotSignals.map((signal) => (
                      <div key={signal.ticker} className="group relative bg-[var(--faint)] border border-[var(--border)] p-8 hover:bg-[var(--ink)] hover:text-[var(--bg)] transition-all cursor-pointer overflow-hidden" onClick={() => {
                        setSelectedSignal(signal);
                        setActiveTab('ai');
                      }}>
                        <div className="flex justify-between items-start mb-4">
                          <span className="editorial-header text-5xl uppercase italic leading-none">{signal.ticker}</span>
                          <span className={`px-2 py-0.5 text-[8px] font-black tracking-widest border ${
                            signal.action === 'BUY' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--muted)] text-[var(--muted)]'
                          } group-hover:border-[var(--bg)] group-hover:text-[var(--bg)]`}>
                            {signal.action}
                          </span>
                        </div>
                        <div className="text-3xl font-serif italic mb-6">
                          {signal.score}<span className="text-[10px] opacity-40">%</span>
                        </div>
                        <div className="space-y-2 mb-8">
                          <div className="micro-label opacity-40 group-hover:opacity-100 uppercase text-[8px]">Dominant Trigger</div>
                          <div className="text-[10px] font-mono leading-tight uppercase group-hover:opacity-70">{signal.reason.split('|')[0]}</div>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            runDeepResearch(signal.ticker);
                          }}
                          disabled={isResearching}
                          className="w-full py-3 border border-[var(--ink)] micro-label group-hover:border-[var(--bg)] hover:bg-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center justify-center gap-2"
                        >
                          {isResearching ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                          Scrutinize Data
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-[1px] bg-[var(--muted)] opacity-20" />
                    <h3 className="micro-label">All Active Signals</h3>
                  </div>
                  <div className="flex flex-col">
                    {signals.map((sig) => (
                      <SignalCard key={sig.ticker} signal={sig} onClick={() => handleSignalClick(sig)} />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'trades' && (
              <motion.div 
                key="trades"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-12"
              >
                <div className="flex items-baseline justify-between border-b-2 border-[var(--ink)] pb-4">
                  <h2 className="editorial-header text-7xl uppercase italic">Ledger</h2>
                  <div className="relative group">
                    <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] group-focus-within:text-[var(--accent)] transition-colors" />
                    <input 
                      type="text"
                      placeholder="AUDIT FILINGS..."
                      className="bg-transparent border-b border-[var(--muted)] pl-8 pr-4 py-2 text-sm uppercase tracking-widest focus:outline-none focus:border-[var(--accent)] transition-all w-80 font-mono"
                      value={tradeFilter}
                      onChange={(e) => setTradeFilter(e.target.value)}
                    />
                  </div>
                </div>
                <div className="bg-transparent overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="text-[var(--muted)] border-b border-[var(--border)]">
                      <tr>
                        <th className="pb-6 micro-label uppercase">Subject</th>
                        <th className="pb-6 micro-label uppercase">Asset</th>
                        <th className="pb-6 micro-label uppercase">Action</th>
                        <th className="pb-6 micro-label uppercase">Volume</th>
                        <th className="pb-6 micro-label uppercase">Scope</th>
                        <th className="pb-6 micro-label uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--faint)]">
                      {filteredTrades.map((t, i) => (
                        <tr key={i} className="group hover:bg-[var(--faint)] transition-colors">
                          <td className="py-6">
                            <div className="flex flex-col">
                              <span className="font-serif text-lg leading-none">{t.politician}</span>
                              <span className="text-[9px] tracking-widest opacity-40 uppercase pt-1">{t.party} Affiliate</span>
                            </div>
                          </td>
                          <td className="py-6 font-mono text-[var(--ink)] text-lg tracking-tighter">{t.ticker}</td>
                          <td className="py-6">
                            <span className={`text-[10px] tracking-[0.2em] font-bold uppercase ${
                              t.trade_type === 'buy' ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
                            }`}>
                              [{t.trade_type}]
                            </span>
                          </td>
                          <td className="py-6 text-[var(--muted)] font-mono text-xs">{t.size_range}</td>
                          <td className="py-6 italic font-serif text-[var(--muted)] text-sm truncate max-w-[200px]">{t.committee || "—"}</td>
                          <td className="py-6 font-mono text-[var(--muted)] text-[10px]">{t.trade_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredTrades.length === 0 && (
                    <div className="py-20 text-center font-serif italic text-[var(--muted)]">No trades found in this cycle.</div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'alerts' && (
              <motion.div 
                key="alerts"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-16 max-w-5xl"
              >
                <div className="flex items-baseline justify-between border-b-2 border-[var(--ink)] pb-4">
                  <h2 className="editorial-header text-7xl uppercase italic">Watchdogs</h2>
                  <div className="text-right">
                    <div className="micro-label">Status</div>
                    <div className="text-xs font-light tracking-widest text-[var(--accent)]">REAL-TIME MONITORING: ACTIVE</div>
                  </div>
                </div>

                {!user ? (
                  <div className="py-40 text-center space-y-8 bg-[var(--faint)] border border-dashed border-[var(--border)] p-12">
                    <div className="flex justify-center mb-6">
                      <ShieldAlert className="w-16 h-16 opacity-10" />
                    </div>
                    <h3 className="editorial-header text-4xl italic">Unauthorized Access</h3>
                    <p className="font-serif text-[var(--muted)] text-xl max-w-md mx-auto">
                      Biometric authorization is required to establish persistent reconnaissance watchdogs.
                    </p>
                    <button onClick={handleLogin} className="px-12 py-4 bg-[var(--ink)] text-[var(--bg)] micro-label hover:bg-[var(--accent)] hover:text-white transition-all">
                       Initialize Identity Link
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                    {/* Alert Creation */}
                    <div className="lg:col-span-4 space-y-10">
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-[1px] bg-[var(--accent)]" />
                          <h3 className="micro-label">New Objective</h3>
                        </div>
                        
                        <div className="space-y-6 bg-[var(--faint)] p-8 border border-[var(--border)]">
                          <div className="space-y-2">
                            <label className="text-[9px] uppercase tracking-widest opacity-40">Asset Ticker</label>
                            <input 
                              type="text" 
                              className="w-full bg-transparent border-b border-[var(--border)] py-2 font-mono text-xl uppercase focus:outline-none focus:border-[var(--accent)] transition-all"
                              placeholder="NVDA, AAPL..."
                              value={newAlert.ticker}
                              onChange={e => setNewAlert({...newAlert, ticker: e.target.value})}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] uppercase tracking-widest opacity-40">Criteria Subroutine</label>
                            <select 
                              className="w-full bg-transparent border-b border-[var(--border)] py-2 micro-label focus:outline-none cursor-pointer"
                              value={newAlert.criteria_type}
                              onChange={e => setNewAlert({...newAlert, criteria_type: e.target.value})}
                            >
                              <option value="SCORE">SIGNAL SCORE ≥</option>
                              <option value="PRICE_ABOVE">MARKET PRICE ≥</option>
                              <option value="PRICE_BELOW">MARKET PRICE ≤</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] uppercase tracking-widest opacity-40">Threshold Value</label>
                            <input 
                              type="number" 
                              className="w-full bg-transparent border-b border-[var(--border)] py-2 font-mono text-xl focus:outline-none focus:border-[var(--accent)] transition-all"
                              value={newAlert.threshold}
                              onChange={e => setNewAlert({...newAlert, threshold: Number(e.target.value)})}
                            />
                          </div>

                          <button 
                            onClick={createAlert}
                            disabled={isAddingAlert || !newAlert.ticker}
                            className="w-full py-4 bg-[var(--ink)] text-[var(--bg)] micro-label hover:bg-[var(--accent)] hover:text-white transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                          >
                            <Plus size={14} />
                            Deploy Watchdog
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-[1px] bg-[var(--muted)]" />
                          <h3 className="micro-label">Matrix Signal Log</h3>
                        </div>
                        <div className="font-mono text-[9px] text-[var(--muted)] space-y-2 h-40 overflow-y-auto custom-scrollbar opacity-60">
                          {logs.map((log, i) => (
                            <div key={i} className="flex gap-4">
                              <span className="opacity-30">[{log.ts}]</span>
                              <span className={log.type === 'err' ? 'text-red-500' : log.type === 'ok' ? 'text-[var(--accent)]' : ''}>
                                {log.msg}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Alert List */}
                    <div className="lg:col-span-8 space-y-12">
                      <div className="space-y-8">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-[1px] bg-[var(--accent)]" />
                          <h3 className="micro-label">Active Deployments</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-1">
                          {userAlerts.length === 0 ? (
                            <div className="py-20 text-center font-serif italic text-[var(--muted)] bg-[var(--faint)] border border-dashed border-[var(--border)]">
                              No active surveillance routines detected.
                            </div>
                          ) : (
                            userAlerts.map((alert: any) => (
                              <div key={alert.id} className="group relative flex items-center justify-between p-8 border border-[var(--border)] hover:bg-[var(--faint)] transition-all">
                                <div className="flex items-center gap-12">
                                  <div className="flex flex-col">
                                    <span className="editorial-header text-4xl italic leading-none">{alert.ticker}</span>
                                    <span className="text-[10px] uppercase tracking-widest opacity-40 pt-1">{alert.criteria_type.replace('_', ' ')}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="micro-label opacity-40 uppercase">Trigger</span>
                                    <span className="font-mono text-xl">{alert.threshold}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-6">
                                  <button 
                                    onClick={() => toggleAlert(alert)}
                                    className={`px-4 py-2 micro-label border transition-all ${
                                      alert.isActive 
                                      ? 'border-[var(--accent)] text-[var(--accent)]' 
                                      : 'border-[var(--border)] text-[var(--muted)]'
                                    }`}
                                  >
                                    {alert.isActive ? 'ACTIVE' : 'DORMANT'}
                                  </button>
                                  <button onClick={() => deleteAlert(alert.id)} className="p-3 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                    <ShieldAlert size={16} />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="space-y-8">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-[1px] bg-[var(--accent)]" />
                          <h3 className="micro-label">Intelligence Feed</h3>
                        </div>
                        
                        <div className="space-y-4">
                          {userNotifications.length === 0 ? (
                            <div className="py-12 text-center font-serif italic text-[var(--muted)] opacity-60">
                              Signal frequency remains within baseline parameters.
                            </div>
                          ) : (
                            [...userNotifications].sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)).map((n: any) => (
                              <div key={n.id} className={`p-6 border-l-2 flex flex-col gap-2 transition-all ${
                                n.isRead ? 'border-[var(--border)] opacity-60' : 'border-[var(--accent)] bg-[var(--faint)]'
                              }`}>
                                <div className="flex justify-between items-start">
                                  <span className="micro-label text-[var(--accent)]">{n.ticker} Trigger Detected</span>
                                  <span className="text-[9px] font-mono opacity-40">{new Date(n.timestamp?.toDate ? n.timestamp.toDate() : n.timestamp).toLocaleString()}</span>
                                </div>
                                <p className="font-serif italic text-lg">{n.message}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'ai' && (
              <motion.div 
                key="ai"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-12 max-w-6xl"
              >
                {!selectedSignal ? (
                  <div className="flex flex-col items-center justify-center py-40 text-[var(--muted)]">
                    <Bot className="w-12 h-12 mb-6 opacity-10" />
                    <div className="micro-label mb-2">Awaiting Objective</div>
                    <p className="font-serif italic text-xl">Select a signal for forensic computation.</p>
                  </div>
                ) : (
                  <div className="space-y-16">
                    <div className="relative">
                      <div className="absolute -top-12 -left-4 text-[180px] font-serif italic text-[var(--muted)] opacity-5 select-none pointer-events-none uppercase">
                        {selectedSignal.ticker}
                      </div>
                      <div className="flex flex-col gap-6 relative z-10">
                        <div className="flex items-center justify-between border-b-2 border-[var(--ink)] pb-6">
                          <div>
                            <div className="micro-label mb-2">Target Asset</div>
                            <h2 className="editorial-header text-9xl italic uppercase leading-none">{selectedSignal.ticker}</h2>
                          </div>
                          <div className="text-right flex flex-col items-end gap-2">
                            <div className="micro-label">Confidential Rating</div>
                            <div className="text-5xl font-serif italic">{selectedSignal.score}<span className="text-sm not-italic opacity-40">/100</span></div>
                            <div className={`px-4 py-1 text-[10px] tracking-[0.3em] font-black uppercase inline-block border ${
                              selectedSignal.action === 'BUY' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--muted)] text-[var(--muted)]'
                            }`}>
                              {selectedSignal.action}
                            </div>
                          </div>
                        </div>
                        <div className="bg-[var(--faint)] p-6 border border-[var(--border)] font-mono text-xs text-[var(--muted)] italic">
                          /// DETERMINISTIC LOGIC: {selectedSignal.reason}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                      <div className="lg:col-span-7 space-y-8">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-[1px] bg-[var(--accent)]" />
                          <h3 className="micro-label">The Forensic Reading</h3>
                        </div>
                        {selectedSignal.ai_analysis ? (
                          <div className="font-serif text-2xl leading-[1.6] text-[var(--ink)] space-y-6">
                            {selectedSignal.ai_analysis.split('\n').map((line, i) => (
                              <p key={i}>{line}</p>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-8">
                            <p className="font-serif italic text-[var(--muted)] text-xl">Analysis pending high-performance calculation.</p>
                            <button 
                              onClick={runAIAnalysis}
                              className="px-10 py-4 bg-[var(--ink)] text-[var(--bg)] micro-label hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer"
                            >
                              INVOKE AI FORENSICS
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="lg:col-span-5 space-y-8">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-[1px] bg-[var(--border)]" />
                          <h3 className="micro-label">Filings Context</h3>
                        </div>
                        <div className="space-y-4">
                          {selectedSignal.trades.map((t, i) => (
                            <div key={i} className="p-8 border border-[var(--border)] hover:bg-[var(--faint)] transition-colors group">
                              <div className="flex justify-between items-start mb-4">
                                <div className="font-serif text-xl italic">{t.politician}</div>
                                <div className="mono text-[10px] text-[var(--muted)] tracking-widest uppercase">{t.trade_date}</div>
                              </div>
                              <div className="flex justify-between items-end">
                                <div className="text-[9px] uppercase tracking-widest text-[var(--muted)] max-w-[200px] line-clamp-2">{t.committee}</div>
                                <div className="text-xl font-serif text-[var(--accent)]">{t.size_range}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'stats' && (
              <motion.div 
                key="stats"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-16"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 border border-[var(--border)]">
                  <StatCard label="Circulation" value={stats.totalTrades} subValue="Last 7 Days" />
                  <StatCard label="Accumulation" value={stats.buys} subValue={`${Math.round(stats.buys/stats.totalTrades * 100)}% of volume`} trend="up" />
                  <StatCard label="Liquidation" value={stats.sells} subValue={`${Math.round(stats.sells/stats.totalTrades * 100)}% of volume`} trend="down" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                  <div className="lg:col-span-7 space-y-10">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                      <h3 className="micro-label">High-Volume Concentrations</h3>
                      <div className="text-[10px] mono text-[var(--muted)]">01—10 RANK</div>
                    </div>
                    <div className="space-y-12">
                      {stats.topTickers.map((t, i) => (
                        <div key={t.ticker} className="relative group">
                          <div className="absolute -left-12 top-0 text-xl font-serif italic text-[var(--muted)] opacity-20">0{i+1}</div>
                          <div className="flex justify-between items-baseline mb-3">
                            <span className="editorial-header text-5xl uppercase italic text-[var(--ink)] leading-none">{t.ticker}</span>
                            <span className="micro-label opacity-40">{t.count} Operations</span>
                          </div>
                          <div className="h-[2px] w-full bg-[var(--faint)]">
                            <motion.div 
                              className="h-full bg-[var(--accent)]" 
                              initial={{ width: 0 }}
                              animate={{ width: `${(t.count / stats.topTickers[0].count) * 100}%` }}
                              transition={{ duration: 1.5, ease: "circOut" }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-5 space-y-10">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                      <h3 className="micro-label">Proprietor Activity</h3>
                      <div className="text-[10px] mono text-[var(--muted)]">RANKED BY FREQUENCY</div>
                    </div>
                    <div className="grid divide-y divide-[var(--border)]">
                      {stats.topPoliticians.map((p, i) => (
                        <div key={p.name} className="flex items-center justify-between py-6 group hover:pl-4 transition-all duration-500">
                          <div className="flex items-center gap-6">
                            <span className="font-serif italic text-[var(--muted)] text-sm">{i+1}.</span>
                            <span className="font-serif text-2xl tracking-tight leading-none group-hover:text-[var(--accent)] transition-colors">{p.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-[10px] tracking-widest text-[var(--ink)]">{p.count} UNITS</div>
                            <div className="text-[8px] uppercase tracking-tighter text-[var(--muted)]">Indexed File</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Footer Status */}
      <footer className="bg-transparent border-t border-[var(--border)] px-10 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-12 micro-label opacity-40">
          <span>SOURCE: CAPITOLTRADES</span>
          <span>POLL: 300S</span>
          <span>LOC: WAS.DC</span>
          <span className="text-[var(--accent)]">STATUS: SYNCHRONIZED</span>
        </div>
        <div className="micro-label opacity-40 uppercase">
          Editorial Edition // Capitol Insider Monitor
        </div>
      </footer>

      {/* Research Report Modal */}
      <AnimatePresence>
        {showReport && selectedSignal?.research_report && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-12 overflow-hidden"
          >
            <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" onClick={() => setShowReport(false)} />
            <motion.div 
              initial={{ y: 50, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 50, scale: 0.95 }}
              className="relative bg-[var(--bg)] w-full max-w-5xl h-[85vh] border border-[var(--border)] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between p-8 border-b border-[var(--border)] bg-[var(--faint)]">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-[var(--accent)]" />
                    <div className="micro-label text-[var(--accent)]">Institutional Research: {selectedSignal.ticker}</div>
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] italic">
                    Certified Intelligence Protocol // Updated {selectedSignal.research_report.last_updated}
                  </div>
                </div>
                <button onClick={() => setShowReport(false)} className="p-4 hover:bg-[var(--ink)] hover:text-[var(--bg)] transition-colors group border border-transparent hover:border-[var(--ink)]">
                  <span className="micro-label">Close Dossier</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-16 bg-[url('https://www.transparenttextures.com/patterns/grid-me.png')] bg-fixed">
                <div className="max-w-3xl mx-auto space-y-12">
                  <section className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-[1px] bg-[var(--accent)]" />
                      <h4 className="micro-label">Executive Abstract</h4>
                    </div>
                    <p className="font-serif text-3xl leading-relaxed italic text-[var(--ink)]">
                      "{selectedSignal.research_report.summary}"
                    </p>
                  </section>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                    <section className="space-y-8">
                      <div className="flex items-center gap-4 border-b border-[var(--faint)] pb-4">
                        <TrendingUp className="w-4 h-4 text-[var(--muted)]" />
                        <h4 className="micro-label">Fundamental Analysis</h4>
                      </div>
                      <div className="space-y-6">
                        <MetricRow label="P/E Ratio" value={selectedSignal.research_report.fundamental_analysis.pe_ratio} tooltip="The Price-to-Earnings Ratio measures the stock's current price relative to its per-share earnings. Helps determine if a stock is over- or undervalued." />
                        <MetricRow label="Market Cap" value={selectedSignal.research_report.fundamental_analysis.market_cap} tooltip="Capitalization: The total market value of a company's outstanding shares." />
                        <MetricRow label="Dividend Yield" value={selectedSignal.research_report.fundamental_analysis.dividend_yield} />
                        <MetricRow label="Revenue Growth" value={selectedSignal.research_report.fundamental_analysis.revenue_growth} />
                        <MetricRow label="Profit Margin" value={selectedSignal.research_report.fundamental_analysis.profit_margin} />
                        <p className="text-[10px] font-serif italic text-[var(--muted)] leading-relaxed pt-4 border-t border-[var(--faint)]">
                          {selectedSignal.research_report.fundamental_analysis.description}
                        </p>
                      </div>
                    </section>

                    <section className="space-y-8">
                      <div className="flex items-center gap-4 border-b border-[var(--faint)] pb-4">
                        <BarChart3 className="w-4 h-4 text-[var(--muted)]" />
                        <h4 className="micro-label">Technical Markers</h4>
                      </div>
                      <div className="space-y-6">
                        <MetricRow label="Primary Trend" value={selectedSignal.research_report.technical_analysis.trend} />
                        <MetricRow label="RSI indicator" value={selectedSignal.research_report.technical_analysis.rsi} tooltip="Relative Strength Index: A momentum indicator measuring the speed and change of price movements. Below 30 is oversold, above 70 is overbought." />
                        <MetricRow label="Moving Averages" value={selectedSignal.research_report.technical_analysis.moving_averages} />
                        <MetricRow label="Support / Resistance" value={selectedSignal.research_report.technical_analysis.support_resistance} />
                        <p className="text-[10px] font-serif italic text-[var(--muted)] leading-relaxed pt-4 border-t border-[var(--faint)]">
                          {selectedSignal.research_report.technical_analysis.description}
                        </p>
                      </div>
                    </section>
                  </div>

                  <section className="bg-[var(--faint)] p-12 border border-[var(--border)] space-y-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)] opacity-5 blur-3xl -mr-16 -mt-16" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <User className="w-4 h-4 text-[var(--accent)]" />
                        <h4 className="micro-label">Sentiment Convergence</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="micro-label text-[var(--muted)] opacity-40">Confidence:</span>
                        <span className="font-mono text-[var(--accent)]">{selectedSignal.research_report.sentiment.score}%</span>
                      </div>
                    </div>
                    <p className="font-serif text-xl italic text-[var(--muted)]">
                      {selectedSignal.research_report.sentiment.summary}
                    </p>
                    <div className="space-y-2">
                       <div className="micro-label text-[8px] opacity-40">Verified Intelligence Nodes</div>
                       <div className="flex flex-wrap gap-x-6 gap-y-2">
                          {selectedSignal.research_report.sentiment.sources.map((source, i) => (
                            <span key={i} className="text-[9px] font-mono tracking-tighter uppercase text-[var(--muted)]">{source}</span>
                          ))}
                       </div>
                    </div>
                  </section>

                  <section className="pt-8 border-t border-[var(--ink)] space-y-6">
                    <h4 className="micro-label text-[var(--accent)]">Research Conclusion</h4>
                    <p className="font-serif text-2xl leading-relaxed text-[var(--ink)] pb-12">
                       {selectedSignal.research_report.conclusion}
                    </p>
                  </section>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetricRow({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className="flex items-baseline justify-between group/metric relative">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] group-hover/metric:text-[var(--ink)] transition-colors">{label}</span>
        {tooltip && (
          <div className="group items-center inline-flex ml-1">
            <AlertCircle className="w-2.5 h-2.5 text-[var(--muted)] opacity-20 hover:opacity-100 transition-opacity cursor-help" />
            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-56 bg-[var(--ink)] text-[var(--bg)] p-4 text-[9px] uppercase tracking-widest leading-relaxed z-[60] border border-[var(--border)] shadow-xl">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      <span className="font-mono text-xs text-[var(--ink)] border-b border-dotted border-[var(--faint)] group-hover/metric:border-[var(--muted)] transition-all">{value}</span>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

function TabButton({ active, onClick, icon, label, badge }: TabButtonProps) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center justify-between w-full px-4 py-3 border-b border-[var(--border)] transition-all group ${
        active ? 'bg-[var(--faint)] text-[var(--accent)]' : 'text-[var(--muted)] hover:bg-[var(--faint)] hover:text-[var(--ink)]'
      }`}
    >
      <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
        <span className={active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}>{icon}</span>
        <span>{label}</span>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className={`text-[9px] font-mono tracking-tighter ${active ? 'text-[var(--accent)]' : 'text-[var(--muted)] opacity-50'}`}>
          [{badge.toString().padStart(2, '0')}]
        </span>
      )}
    </button>
  );
}

interface SignalCardProps {
  key?: React.Key;
  signal: Signal;
  onClick: () => void;
}

function SignalCard({ signal, onClick }: SignalCardProps) {
  const isBuy = signal.action === 'BUY';

  return (
    <div 
      onClick={onClick}
      className="group relative flex flex-col p-10 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--faint)] transition-all overflow-hidden"
    >
      <div className="flex items-center justify-between w-full mb-8">
        <div className="flex items-baseline gap-12 relative z-10 transition-transform duration-500 group-hover:translate-x-4">
          <div className="editorial-header text-6xl italic uppercase leading-none text-[var(--ink)]">{signal.ticker}</div>
          <div className="flex flex-col gap-1">
            <div className="micro-label">{signal.action}</div>
            <div className="text-xs italic font-serif text-[var(--muted)] tracking-tight max-w-md line-clamp-1">{signal.reason}</div>
          </div>
        </div>
        
        <div className="text-right relative z-10 transition-transform duration-500 group-hover:-translate-x-4">
          <div className="micro-label opacity-40">Confidence</div>
          <div className={`text-4xl font-serif italic ${isBuy ? 'text-[var(--accent)]' : 'text-[var(--ink)]'}`}>
            {signal.score}<span className="text-[10px] not-italic opacity-40 ml-1">%</span>
          </div>
        </div>
      </div>

      {signal.score_breakdown && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 border-t border-[var(--faint)] relative z-10">
          {signal.score_breakdown.map((factor, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex justify-between items-baseline">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--ink)]">{factor.label}</span>
                <span className="font-mono text-[9px] text-[var(--accent)]">+{factor.points}</span>
              </div>
              <p className="text-[10px] font-serif italic text-[var(--muted)] leading-relaxed">
                {factor.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Hover decoration */}
      <div className="absolute right-0 top-0 bottom-0 w-1 bg-[var(--accent)] scale-y-0 group-hover:scale-y-100 transition-transform origin-bottom duration-500" />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  subValue: string;
  trend?: "up" | "down";
}

function StatCard({ label, value, subValue, trend }: StatCardProps) {
  return (
    <div className="p-10 bg-transparent border-r border-[var(--border)] last:border-r-0 flex flex-col justify-between">
      <div className="micro-label mb-8 opacity-60">{label}</div>
      <div className="flex items-baseline gap-4">
        <div className="editorial-header text-6xl italic leading-none">{value}</div>
        {trend && (
          <div className={`text-xs font-mono tracking-widest ${trend === 'up' ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
            [{trend === 'up' ? '+' : '-'}]
          </div>
        )}
      </div>
      <div className="mt-4 text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">{subValue}</div>
    </div>
  );
}
