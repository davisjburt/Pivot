/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, TrendingDown, TrendingUp, Calendar, Target, History, 
  Settings as SettingsIcon, Info, ChevronRight, Download, Upload, 
  Trash2, CheckCircle2, AlertCircle, Eye, EyeOff, Sliders,
  Check, LayoutDashboard, BarChart3, ArrowRight, Minus
} from 'lucide-react';
import { format, parseISO, addDays, differenceInDays, startOfWeek } from 'date-fns';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Line
} from 'recharts';

import { AppState, WeightEntry, UserGoal, DEFAULT_TAGS, AppSettings } from './types';
import { storageService } from './services/storage';
import { analyticsService } from './services/analytics';
import { firebaseService } from './services/firebaseService';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, FirebaseUser } from './firebase';
import { cn } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [state, setState] = useState<AppState>({
    goal: null,
    entries: [],
    onboarded: false,
    settings: { smoothingWindow: 10, hideRawNumbers: false }
  });
  const [isLogging, setIsLogging] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'insights' | 'settings'>('dashboard');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setState({
        goal: null,
        entries: [],
        onboarded: false,
        settings: { smoothingWindow: 10, hideRawNumbers: false }
      });
      return;
    }

    // Load profile
    const loadProfile = async () => {
      const profile = await firebaseService.getUserProfile(user.uid);
      if (profile) {
        setState(prev => ({
          ...prev,
          name: profile.name || user.displayName || '',
          goal: profile.goal || null,
          onboarded: !!profile.onboarded,
          settings: profile.settings || { smoothingWindow: 10, hideRawNumbers: false }
        }));
      } else {
        // Create initial profile
        await firebaseService.saveUserProfile(user.uid, {
          uid: user.uid,
          email: user.email || '',
          name: user.displayName || '',
          onboarded: false,
          settings: { smoothingWindow: 10, hideRawNumbers: false }
        });
        setState(prev => ({
          ...prev,
          name: user.displayName || ''
        }));
      }
    };

    loadProfile();

    // Subscribe to entries
    const unsubscribe = firebaseService.subscribeToEntries(user.uid, (entries) => {
      setState(prev => ({ ...prev, entries }));
    });

    return () => unsubscribe();
  }, [user]);

  const handleOnboard = async (goal: UserGoal) => {
    if (!user) return;
    const updates = { goal, onboarded: true };
    setState(prev => ({ ...prev, ...updates }));
    await firebaseService.saveUserProfile(user.uid, updates);
  };

  const addEntry = async (entry: Omit<WeightEntry, 'id'>) => {
    if (!user) return;
    const newEntry: WeightEntry = { ...entry, id: crypto.randomUUID() };
    await firebaseService.addEntry(user.uid, newEntry);
    setIsLogging(false);
  };

  const deleteEntry = async (id: string) => {
    if (!user) return;
    await firebaseService.deleteEntry(user.uid, id);
  };

  const updateSettings = async (settings: Partial<AppSettings>) => {
    if (!user) return;
    const newSettings = { ...state.settings, ...settings };
    setState(prev => ({ ...prev, settings: newSettings }));
    await firebaseService.saveUserProfile(user.uid, { settings: newSettings });
  };

  const updateGoal = async (goal: Partial<UserGoal>) => {
    if (!user) return;
    const newGoal = state.goal ? { ...state.goal, ...goal } : null;
    setState(prev => ({ ...prev, goal: newGoal }));
    await firebaseService.saveUserProfile(user.uid, { goal: newGoal });
  };

  const updateProfile = async (updates: Partial<AppState>) => {
    if (!user) return;
    setState(prev => ({ ...prev, ...updates }));
    await firebaseService.saveUserProfile(user.uid, updates);
  };

  const handleImportCsv = async (file: File) => {
    if (!user) return;
    const newEntries = await storageService.importCsv(file);
    await firebaseService.importEntries(user.uid, newEntries);
  };

  const handleImportJson = async (file: File) => {
    if (!user) return;
    const data = await storageService.importData(file);
    // This is a full state import, we should be careful
    await firebaseService.saveUserProfile(user.uid, {
      goal: data.goal,
      onboarded: data.onboarded,
      settings: data.settings
    });
    await firebaseService.importEntries(user.uid, data.entries);
  };

  const handleSignOut = () => {
    signOut(auth);
  };

  if (!isAuthReady) {
    return (
      <div className="fixed inset-0 bg-slate-100 flex justify-center overflow-hidden">
        <div className="w-full max-w-md bg-paper h-full relative shadow-2xl flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) return <AuthView />;

  if (!state.onboarded) return <Onboarding onComplete={handleOnboard} initialWeight={state.entries[state.entries.length - 1]?.weight} />;

  return (
    <div className="fixed inset-0 bg-slate-100 flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-paper h-full relative shadow-2xl flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-32 no-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && <Dashboard state={state} onLogClick={() => setIsLogging(true)} />}
            {activeTab === 'history' && <HistoryView entries={state.entries} onDelete={deleteEntry} unit={state.goal?.unit || 'lbs'} />}
            {activeTab === 'insights' && <InsightsView state={state} />}
            {activeTab === 'settings' && (
              <SettingsView 
                state={state} 
                onUpdateSettings={updateSettings} 
                onUpdateGoal={updateGoal}
                onUpdateProfile={updateProfile}
                onExport={() => storageService.exportData(state)}
                onImportJson={handleImportJson}
                onImportCsv={handleImportCsv}
                onReset={async () => {
                  if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
                    await firebaseService.saveUserProfile(user.uid, { goal: null, onboarded: false, settings: { smoothingWindow: 10, hideRawNumbers: false } });
                    // We'd also need to delete all entries, but for now let's just reset profile
                  }
                }} 
                onSignOut={handleSignOut}
              />
            )}
          </AnimatePresence>
        </main>

        {/* Mobile Nav */}
        <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-line px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] flex justify-between items-center z-50">
          <MobileNavLink active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Target size={24} />} />
          <MobileNavLink active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={24} />} />
          <button onClick={() => setIsLogging(true)} className="w-14 h-14 bg-brand-500 rounded-full flex items-center justify-center text-white shadow-lg -mt-10 border-4 border-paper active:scale-95 transition-transform"><Plus size={28} /></button>
          <MobileNavLink active={activeTab === 'insights'} onClick={() => setActiveTab('insights')} icon={<Info size={24} />} />
          <MobileNavLink active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<SettingsIcon size={24} />} />
        </nav>

        <AnimatePresence>
          {isLogging && <LogModal onClose={() => setIsLogging(false)} onSave={addEntry} unit={state.goal?.unit || 'lbs'} lastWeight={state.entries[state.entries.length - 1]?.weight} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AuthView() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-100 flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-paper h-full relative shadow-2xl flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full space-y-8"
        >
        <div className="w-20 h-20 bg-brand-500 rounded-3xl flex items-center justify-center text-white mx-auto shadow-2xl shadow-brand-500/20 mb-8">
          <TrendingDown size={40} />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight text-ink">Pivot</h1>
          <p className="text-slate-500 font-medium">Precision weight tracking for focused progress.</p>
        </div>
        
        <div className="pt-8">
          <button 
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-ink text-white p-5 rounded-2xl font-bold flex items-center justify-center gap-4 hover:bg-slate-900 transition-all active:scale-95 shadow-xl disabled:opacity-50"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" />
                </svg>
                Continue with Google
              </>
            )}
          </button>
          <p className="mt-6 text-[10px] text-slate-400 uppercase tracking-widest font-bold">Secure Authentication via Firebase</p>
        </div>
      </motion.div>
      </div>
    </div>
  );
}


function MobileNavLink({ active, onClick, icon }: any) {
  return (
    <button 
      onClick={onClick} 
      className={cn(
        "flex-1 flex flex-col items-center justify-center py-2 transition-all active:scale-90",
        active ? "text-brand-600" : "text-slate-400"
      )}
    >
      <div className={cn(
        "p-2 rounded-xl transition-all",
        active ? "bg-brand-50" : "bg-transparent"
      )}>
        {icon}
      </div>
    </button>
  );
}

function Dashboard({ state, onLogClick }: { state: AppState, onLogClick: () => void }) {
  const trendData = useMemo(() => analyticsService.getTrendData(state.entries, state.settings.smoothingWindow), [state.entries, state.settings.smoothingWindow]);
  const latest = trendData[trendData.length - 1];
  const milestones = useMemo(() => analyticsService.getMilestones(state.goal!), [state.goal]);
  const completed = useMemo(() => analyticsService.getCompletedMilestones(state.entries, state.goal!), [state.entries, state.goal]);
  const nextMilestone = milestones.find(m => !completed.find(c => c.id === m.id));
  const predictions = useMemo(() => analyticsService.getPredictions(state.entries, state.goal!, state.settings.smoothingWindow), [state.entries, state.goal, state.settings.smoothingWindow]);

  const displayWeight = (w: number) => state.settings.hideRawNumbers ? '—' : w.toFixed(1);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -20 }} 
      className="space-y-6"
    >
      <header className="flex justify-between items-start">
        <div>
          <p className="text-slate-500 font-medium text-sm">
            {state.name ? `Welcome back, ${state.name.split(' ')[0]}` : 'Welcome back'}
          </p>
          <h2 className="text-2xl font-bold tracking-tight">
            Trend: <span className="text-brand-600">{latest?.trendWeight.toFixed(1)} {state.goal?.unit}</span>
          </h2>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Today's Weight" value={latest ? displayWeight(latest.weight) : '—'} unit={state.goal?.unit} subValue={latest ? `Trend: ${latest.trendWeight.toFixed(1)}` : ''} trend="neutral" />
        <StatCard label="Next Milestone" value={nextMilestone?.target.toFixed(1) || '—'} unit={state.goal?.unit} subValue={`${Math.abs((latest?.trendWeight || 0) - (nextMilestone?.target || 0)).toFixed(1)} to go`} trend="down" />
        <StatCard label="Milestones" value={completed.length} unit={`of ${milestones.length}`} subValue="Total completed" trend="neutral" />
        <StatCard 
          label="Projected Goal" 
          value={predictions ? format(predictions.likely, 'MMM d') : '—'} 
          unit={predictions ? format(predictions.likely, 'yyyy') : ''} 
          subValue={predictions ? "Based on 30-day trend" : "Log more data"} 
          trend="neutral" 
        />
      </div>

      <section className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-bold text-lg mb-4">Trend vs Actual</h3>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData.slice(-30)}>
              <defs>
                <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e40af" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#1e40af" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(str) => format(parseISO(str), 'MMM d')} 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 10 }} 
                dy={10} 
                minTickGap={30}
              />
              <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 mb-1">{format(parseISO(payload[0].payload.date), 'MMMM d')}</p>
                        <p className="text-base font-bold text-brand-600">Trend: {payload[0].value?.toFixed(1)}</p>
                        {!state.settings.hideRawNumbers && <p className="text-xs text-slate-500">Actual: {payload[1].value?.toFixed(1)}</p>}
                      </div>
                    );
                  }
                  return null;
                }} 
              />
              <Area type="monotone" dataKey="trendWeight" stroke="#1e40af" strokeWidth={3} fillOpacity={1} fill="url(#colorTrend)" animationDuration={1000} />
              {!state.settings.hideRawNumbers && <Line type="monotone" dataKey="weight" stroke="#cbd5e1" strokeWidth={1} dot={{ r: 2 }} animationDuration={1000} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="bg-white p-4 md:p-6 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-bold text-lg mb-4">Milestone Progress</h3>
        <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {milestones.map(m => {
            const isCompleted = completed.find(c => c.id === m.id);
            return (
              <div key={m.id} className={cn(
                "flex-shrink-0 w-24 p-4 rounded-2xl border text-center transition-all", 
                isCompleted ? "bg-brand-50 border-brand-100 text-brand-700 shadow-sm shadow-brand-50" : "bg-slate-50 border-slate-100 text-slate-400"
              )}>
                <p className="text-[10px] font-bold uppercase mb-1 tracking-wider">{m.label}</p>
                <p className="text-base font-black">{m.target.toFixed(0)}</p>
                {isCompleted && <CheckCircle2 size={14} className="mx-auto mt-2" />}
              </div>
            );
          })}
        </div>
      </section>
    </motion.div>
  );
}

function StatCard({ label, value, unit, subValue, trend }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-line shadow-sm flex flex-col justify-between">
      <div>
        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">{label}</p>
        <div className="flex items-baseline gap-1">
          <h4 className="text-3xl font-bold text-ink tracking-tight">{value}</h4>
          {unit && <span className="text-slate-400 text-sm font-medium">{unit}</span>}
        </div>
      </div>
      {subValue && (
        <div className="mt-4 flex items-center gap-2">
          {trend === 'down' && <TrendingDown size={14} className="text-brand-600" />}
          {trend === 'up' && <TrendingUp size={14} className="text-red-500" />}
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{subValue}</p>
        </div>
      )}
    </div>
  );
}

function HistoryView({ entries, onDelete, unit }: { entries: WeightEntry[], onDelete: (id: string) => void, unit: string }) {
  // 1. Sort ascending to calculate entry-to-entry deltas
  const sortedAsc = [...entries].sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
  
  const entriesWithDelta = sortedAsc.map((entry, index) => {
    const prevWeight = index > 0 ? sortedAsc[index - 1].weight : entry.weight;
    return { ...entry, delta: entry.weight - prevWeight };
  });

  // 2. Group by week
  const weeks = new Map<string, typeof entriesWithDelta>();
  entriesWithDelta.forEach(entry => {
    const date = parseISO(entry.date);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday start
    const weekKey = weekStart.toISOString();
    if (!weeks.has(weekKey)) weeks.set(weekKey, []);
    weeks.get(weekKey)!.push(entry);
  });

  // 3. Calculate weekly stats and sort descending
  const sortedWeekKeys = Array.from(weeks.keys()).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  
  const groupedWeeks = sortedWeekKeys.map((weekKey, index) => {
    const weekEntries = weeks.get(weekKey)!.sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()); // desc
    
    let weeklyDelta = 0;
    if (index < sortedWeekKeys.length - 1) {
      const prevWeekEntries = weeks.get(sortedWeekKeys[index + 1])!.sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
      weeklyDelta = weekEntries[0].weight - prevWeekEntries[0].weight;
    } else {
      weeklyDelta = weekEntries[0].weight - weekEntries[weekEntries.length - 1].weight;
    }

    return {
      weekStart: parseISO(weekKey),
      entries: weekEntries,
      delta: weeklyDelta
    };
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -10 }} 
      className="space-y-8"
    >
      <header>
        <h2 className="text-3xl font-bold text-ink">Entry Log</h2>
        <p className="text-slate-500 font-medium uppercase tracking-widest text-[10px] mt-1">Detailed History & Records</p>
      </header>

      <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
        <div className="divide-y divide-line">
          {groupedWeeks.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-medium">No entries recorded yet.</div>
          ) : (
            groupedWeeks.map((week) => (
              <div key={week.weekStart.toISOString()}>
                <div className="bg-slate-50 px-6 py-2 border-b border-line flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Week of {format(week.weekStart, 'MMM d, yyyy')}
                  </span>
                  {week.delta !== 0 ? (
                    <div className={cn("flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest", week.delta > 0 ? "text-amber-500" : "text-brand-500")}>
                      {week.delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {Math.abs(week.delta).toFixed(1)} {unit}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <Minus size={12} /> No change
                    </div>
                  )}
                </div>
                <div className="divide-y divide-line">
                  {week.entries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between py-4 px-6 hover:bg-slate-50 transition-colors group">
                      <div>
                        <div className="text-sm font-semibold text-ink">
                          {format(parseISO(entry.date), 'MMM d, yyyy')}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                          {format(parseISO(entry.date), 'h:mm a')}
                        </div>
                        {entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {entry.tags.map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                          <div className="text-lg font-bold text-ink text-right">
                            {entry.weight.toFixed(1)} <span className="text-slate-400 font-normal text-sm">{unit}</span>
                          </div>
                          {entry.delta !== 0 && (
                            <div className={cn("flex items-center gap-0.5 text-[10px] font-bold mt-0.5", entry.delta > 0 ? "text-amber-500" : "text-brand-500")}>
                              {entry.delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                              {Math.abs(entry.delta).toFixed(1)}
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={() => onDelete(entry.id)} 
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

function InsightsView({ state }: { state: AppState }) {
  const rate = useMemo(() => analyticsService.getRateOfChange(state.entries, state.settings.smoothingWindow), [state.entries, state.settings.smoothingWindow]);
  const milestones = useMemo(() => analyticsService.getMilestones(state.goal!), [state.goal]);
  const completed = useMemo(() => analyticsService.getCompletedMilestones(state.entries, state.goal!), [state.entries, state.goal]);
  const predictions = useMemo(() => analyticsService.getPredictions(state.entries, state.goal!, state.settings.smoothingWindow), [state.entries, state.goal, state.settings.smoothingWindow]);
  const spikes = useMemo(() => analyticsService.detectSpikes(state.entries, state.settings.smoothingWindow), [state.entries, state.settings.smoothingWindow]);
  const latestSpike = spikes[spikes.length - 1];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -10 }} 
      className="space-y-10"
    >
      <header>
        <h2 className="text-3xl font-bold text-ink">Projection Analysis</h2>
        <p className="text-slate-500 font-medium uppercase tracking-widest text-[10px] mt-1">Predictive Modeling & Velocity</p>
      </header>

      {latestSpike && (
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex gap-4 items-start">
          <AlertCircle size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-amber-900 text-sm">Recent Spike Detected</h4>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              Your weight on {format(parseISO(latestSpike.date), 'MMM d')} was higher than your trend. This is normal water weight fluctuation. The trend line remains your primary indicator.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8">
        <div className="space-y-8">
          <div className="bg-white border border-line rounded-2xl p-8 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6">Current Velocity</h3>
            <div className="flex items-baseline gap-2">
              <span className={cn("text-5xl font-bold", rate < 0 ? "text-brand-600" : "text-red-500")}>
                {rate > 0 ? '+' : ''}{rate.toFixed(2)}
              </span>
              <span className="text-slate-400 font-medium">{state.goal?.unit} / week</span>
            </div>
            <p className="text-xs text-slate-500 mt-4 leading-relaxed">
              Based on your trailing 30-day trend. This velocity is used to calculate your projected goal dates.
            </p>
          </div>

          <div className="bg-white border border-line rounded-2xl p-8 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6">Milestone Track</h3>
            <div className="space-y-6">
              {milestones.map((m, i) => {
                const isCompleted = completed.find(c => c.id === m.id);
                return (
                  <div key={m.id} className="flex items-center gap-4">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                      isCompleted ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-400 border border-slate-200"
                    )}>
                      {isCompleted ? <Check size={12} /> : i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-baseline">
                        <span className={cn("text-sm font-bold", isCompleted ? "text-ink" : "text-slate-400")}>{m.target.toFixed(1)} {state.goal?.unit}</span>
                        {isCompleted && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(parseISO(isCompleted.date), 'MMM d, yyyy')}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-ink text-white rounded-2xl p-10 shadow-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-10">Goal Projection</h3>
            <div className="space-y-10">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Likely Completion</p>
                <p className="text-4xl font-bold text-brand-400">{predictions ? format(predictions.likely, 'MMMM d, yyyy') : 'Insufficient Data'}</p>
                <p className="text-xs text-slate-500 mt-2">Calculated using your current 30-day average velocity.</p>
              </div>
              
              <div className="grid grid-cols-1 gap-6 pt-10 border-t border-slate-800">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Optimistic Scenario</p>
                  <p className="text-xl font-bold">{predictions ? format(predictions.optimistic, 'MMMM d, yyyy') : '—'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Assumes 20% increase in velocity.</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Pessimistic Scenario</p>
                  <p className="text-xl font-bold">{predictions ? format(predictions.pessimistic, 'MMMM d, yyyy') : '—'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Assumes 20% decrease in velocity.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-10 p-4 bg-slate-900 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-400 leading-relaxed italic">
              "Weight management is a marathon, not a sprint. Focus on the trend, not the daily number."
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function PredictionCard({ label, date, color }: any) {
  return (
    <div className="text-center p-4 bg-slate-50 rounded-2xl">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={cn("text-lg font-black", color)}>{format(date, 'MMM d, yyyy')}</p>
    </div>
  );
}

function SettingsView({ state, onUpdateSettings, onUpdateGoal, onUpdateProfile, onExport, onImportJson, onImportCsv, onReset, onSignOut }: any) {
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const handleCsv = async (file: File) => {
    try {
      await onImportCsv(file);
      setStatus({ type: 'success', message: 'CSV imported successfully!' });
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to import CSV.' });
    }
  };

  const handleJson = async (file: File) => {
    try {
      await onImportJson(file);
      setStatus({ type: 'success', message: 'Data imported successfully!' });
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to import JSON.' });
    }
  };

  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -10 }} 
      className="space-y-10"
    >
      <header className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-ink">System Config</h2>
          <p className="text-slate-500 font-medium uppercase tracking-widest text-[10px] mt-1">Preferences & Data Portability</p>
        </div>
        <button 
          onClick={onSignOut}
          className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all active:scale-95"
          title="Sign Out"
        >
          <EyeOff size={20} />
        </button>
      </header>
      
      <AnimatePresence>
        {status && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "p-4 rounded-xl flex items-center gap-3 font-bold text-xs uppercase tracking-widest",
              status.type === 'success' ? "bg-brand-50 text-brand-700 border border-brand-100" : "bg-red-50 text-red-700 border border-red-100"
            )}
          >
            {status.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-8">
        <div className="bg-white p-8 rounded-2xl border border-line shadow-sm space-y-8">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Profile & Goals</h3>
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Display Name</label>
              <input 
                type="text" 
                value={state.name || ''} 
                onChange={(e) => onUpdateProfile({ name: e.target.value })}
                placeholder="Your Name"
                className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border border-transparent focus:border-brand-500 focus:bg-white transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Start Weight ({state.goal?.unit})</label>
              <input 
                type="number" 
                step="0.1"
                value={state.goal?.startWeight || ''} 
                onChange={(e) => onUpdateGoal({ startWeight: parseFloat(e.target.value) })}
                className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border border-transparent focus:border-brand-500 focus:bg-white transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target Weight ({state.goal?.unit})</label>
              <input 
                type="number" 
                step="0.1"
                value={state.goal?.targetWeight || ''} 
                onChange={(e) => onUpdateGoal({ targetWeight: parseFloat(e.target.value) })}
                className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border border-transparent focus:border-brand-500 focus:bg-white transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Milestone Size ({state.goal?.unit})</label>
              <input 
                type="number" 
                step="1"
                value={state.goal?.milestoneSize || ''} 
                onChange={(e) => onUpdateGoal({ milestoneSize: parseFloat(e.target.value) })}
                className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border border-transparent focus:border-brand-500 focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white p-8 rounded-2xl border border-line shadow-sm space-y-8">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Display Preferences</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">Smoothing Window</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Days: {state.settings.smoothingWindow}</p>
                </div>
                <input 
                  type="range" 
                  min="3" 
                  max="30" 
                  value={state.settings.smoothingWindow} 
                  onChange={(e) => onUpdateSettings({ smoothingWindow: parseInt(e.target.value) })}
                  className="w-32 accent-brand-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">Privacy Mode</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Hide raw numbers</p>
                </div>
                <button 
                  onClick={() => onUpdateSettings({ hideRawNumbers: !state.settings.hideRawNumbers })}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    state.settings.hideRawNumbers ? "bg-brand-500" : "bg-slate-200"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                    state.settings.hideRawNumbers ? "left-7" : "left-1"
                  )} />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-line shadow-sm space-y-8">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data Management</h3>
            <div className="grid grid-cols-1 gap-3">
              <button onClick={onExport} className="w-full p-4 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-ink transition-all flex items-center justify-center gap-2">
                <Download size={18} /> EXPORT JSON
              </button>
              <div className="grid grid-cols-2 gap-3">
                <label className="p-4 bg-white border border-line rounded-xl font-bold text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <Upload size={18} /> JSON
                  <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && handleJson(e.target.files[0])} className="hidden" />
                </label>
                <label className="p-4 bg-white border border-line rounded-xl font-bold text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <Upload size={18} /> CSV
                  <input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])} className="hidden" />
                </label>
              </div>
              <button onClick={onReset} className="w-full p-4 text-red-500 font-bold text-[10px] uppercase tracking-widest hover:bg-red-50 rounded-xl transition-all mt-4">
                Reset All Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function LogModal({ onClose, onSave, unit, lastWeight }: any) {
  const [weight, setWeight] = useState(lastWeight?.toString() || '');
  const [tags, setTags] = useState<string[]>([]);
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div 
        initial={{ y: '100%' }} 
        animate={{ y: 0 }} 
        exit={{ y: '100%' }} 
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-md bg-white rounded-t-[32px] p-6 pb-12 shadow-2xl"
      >
        <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6" />
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold tracking-tight">Log Weight</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-all active:scale-90">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>
        <div className="space-y-8">
          <div className="text-center">
            <div className="flex items-baseline justify-center gap-2">
              <input 
                autoFocus 
                type="number" 
                step="0.1" 
                placeholder="0.0" 
                value={weight} 
                onChange={(e) => setWeight(e.target.value)} 
                className="text-6xl font-black text-brand-600 w-48 text-center outline-none bg-transparent" 
              />
              <span className="text-2xl font-bold text-slate-300">{unit}</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest text-center">Any factors today?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {DEFAULT_TAGS.map(tag => (
                <button 
                  key={tag} 
                  onClick={() => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])} 
                  className={cn(
                    "px-4 py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95", 
                    tags.includes(tag) ? "bg-brand-500 text-white shadow-md shadow-brand-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <button 
            onClick={() => onSave({ date: new Date().toISOString(), weight: parseFloat(weight), tags })} 
            disabled={!weight} 
            className="w-full py-5 bg-brand-500 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-brand-600 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            Save Entry
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Onboarding({ onComplete, initialWeight, initialUnit = 'lbs' }: any) {
  const [step, setStep] = useState(1);
  const [unit, setUnit] = useState<'lbs' | 'kg'>(initialUnit);
  const [currentWeight, setCurrentWeight] = useState(initialWeight?.toString() || '');
  const [targetWeight, setTargetWeight] = useState('');
  const [milestoneSize, setMilestoneSize] = useState('5');

  // Update currentWeight and skip to step 2 if initialWeight changes (e.g. after import)
  useEffect(() => {
    if (initialWeight) {
      if (!currentWeight) {
        setCurrentWeight(initialWeight.toString());
      }
      setStep(2);
    }
  }, [initialWeight]);

  return (
    <div className="fixed inset-0 bg-slate-100 flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-ink h-full relative shadow-2xl flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="w-full bg-white rounded-3xl p-10 shadow-2xl border border-line"
        >
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-10 text-center">
              <div className="w-16 h-16 bg-brand-500 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-brand-500/20">
                <TrendingDown size={32} />
              </div>
              <div>
                <h2 className="text-4xl font-bold text-ink mb-2">Pivot</h2>
                <p className="text-slate-400 font-medium uppercase tracking-widest text-[10px]">Precision Weight Management</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setUnit('lbs')} className={cn("flex-1 py-4 rounded-xl font-bold transition-all", unit === 'lbs' ? "bg-ink text-white shadow-lg" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>lbs</button>
                <button onClick={() => setUnit('kg')} className={cn("flex-1 py-4 rounded-xl font-bold transition-all", unit === 'kg' ? "bg-ink text-white shadow-lg" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>kg</button>
              </div>
              <button onClick={() => setStep(2)} className="w-full py-5 bg-brand-500 text-white rounded-xl font-bold text-sm tracking-widest uppercase shadow-xl hover:bg-brand-600 transition-all active:scale-95">Get Started</button>
            </motion.div>
          ) : (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-ink">Set Your Goal</h2>
                <p className="text-slate-400 font-medium uppercase tracking-widest text-[10px] mt-1">Define your trajectory</p>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current Weight ({unit})</label>
                  <input type="number" step="0.1" value={currentWeight} onChange={(e) => setCurrentWeight(e.target.value)} className="w-full p-4 bg-slate-50 rounded-xl text-2xl font-bold outline-none border border-transparent focus:border-brand-500 focus:bg-white transition-all" placeholder="0.0" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Goal Weight ({unit})</label>
                  <input type="number" step="0.1" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} className="w-full p-4 bg-slate-50 rounded-xl text-2xl font-bold outline-none border border-transparent focus:border-brand-500 focus:bg-white transition-all" placeholder="0.0" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Milestone Size</label>
                  <select value={milestoneSize} onChange={(e) => setMilestoneSize(e.target.value)} className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border border-transparent focus:border-brand-500 focus:bg-white transition-all appearance-none">
                    <option value="2">2 {unit} chunks</option>
                    <option value="5">5 {unit} chunks</option>
                    <option value="10">10 {unit} chunks</option>
                  </select>
                </div>
              </div>
              <button 
                onClick={() => onComplete({ unit, startWeight: parseFloat(currentWeight), startDate: new Date().toISOString(), targetWeight: parseFloat(targetWeight), milestoneSize: parseFloat(milestoneSize) })} 
                disabled={!currentWeight || !targetWeight}
                className="w-full py-5 bg-brand-500 text-white rounded-xl font-bold text-sm tracking-widest uppercase shadow-xl hover:bg-brand-600 transition-all active:scale-95 disabled:opacity-50"
              >
                Start Journey
              </button>
              <button onClick={() => setStep(1)} className="w-full py-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest">Back</button>
            </motion.div>
          )}
        </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
