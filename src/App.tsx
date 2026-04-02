/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, TrendingDown, TrendingUp, Calendar, Target, History, 
  Settings as SettingsIcon, Info, ChevronRight, Download, Upload, 
  Trash2, CheckCircle2, AlertCircle, Eye, LogOut, Sliders,
  Check, Home, BarChart3, ArrowRight, Minus, Flame, Bell, BellOff
} from 'lucide-react';
import { format, parseISO, addDays, differenceInDays, startOfWeek, eachDayOfInterval } from 'date-fns';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Line, LineChart, ReferenceLine, Brush
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
    settings: { smoothingWindow: 10, hideRawNumbers: false, darkMode: false }
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
        settings: { smoothingWindow: 10, hideRawNumbers: false, darkMode: false }
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
          settings: profile.settings || { smoothingWindow: 10, hideRawNumbers: false, darkMode: false }
        }));
      } else {
        // Create initial profile
        await firebaseService.saveUserProfile(user.uid, {
          uid: user.uid,
          email: user.email || '',
          name: user.displayName || '',
          onboarded: false,
          settings: { smoothingWindow: 10, hideRawNumbers: false, darkMode: false }
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

  useEffect(() => {
    if (state.settings?.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.settings?.darkMode]);

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
          <MobileNavLink active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Home size={24} />} />
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
    <div className="fixed inset-0 bg-paper flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-white h-full relative shadow-2xl border-x border-line flex flex-col items-center justify-center p-6 text-center">
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
          <p className="text-slate-600 font-medium">Precision weight tracking for focused progress.</p>
        </div>
        
        <div className="pt-8">
          <button 
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-brand-600 text-white p-5 rounded-2xl font-bold flex items-center justify-center gap-4 hover:bg-brand-500 transition-all active:scale-95 shadow-xl shadow-brand-600/25 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </>
            )}
          </button>
          <p className="mt-6 text-[10px] text-slate-500 uppercase tracking-widest font-bold">Secure Authentication via Firebase</p>
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
  const completed = useMemo(
    () => analyticsService.getCompletedMilestones(state.entries, state.goal!, state.settings.smoothingWindow),
    [state.entries, state.goal, state.settings.smoothingWindow]
  );
  const nextMilestone = milestones.find(m => !completed.find(c => c.id === m.id));
  const predictions = useMemo(() => analyticsService.getPredictions(state.entries, state.goal!, state.settings.smoothingWindow), [state.entries, state.goal, state.settings.smoothingWindow]);
  const streak = useMemo(() => analyticsService.getStreak(state.entries), [state.entries]);

  const displayWeight = (w: number) => state.settings.hideRawNumbers ? '—' : w.toFixed(1);
  const nextMilestoneProgress = useMemo(() => {
    if (!state.goal || !latest || !nextMilestone) return 0;

    const isLosing = state.goal.targetWeight < state.goal.startWeight;
    const previousMilestone = [...milestones]
      .reverse()
      .find(m => isLosing ? m.target > nextMilestone.target : m.target < nextMilestone.target);
    const startPoint = previousMilestone ? previousMilestone.target : state.goal.startWeight;
    const endPoint = nextMilestone.target;
    const totalDistance = Math.abs(endPoint - startPoint);
    if (totalDistance === 0) return 100;

    const progressDistance = isLosing
      ? startPoint - latest.weight
      : latest.weight - startPoint;
    const rawPercent = (progressDistance / totalDistance) * 100;
    return Math.min(100, Math.max(0, rawPercent));
  }, [state.goal, latest, nextMilestone, milestones]);
  const getMilestoneProgress = (milestoneTarget: number) => {
    if (!state.goal || !latest) return 0;
    const isLosing = state.goal.targetWeight < state.goal.startWeight;
    const previousMilestone = [...milestones]
      .reverse()
      .find(m => isLosing ? m.target > milestoneTarget : m.target < milestoneTarget);
    const startPoint = previousMilestone ? previousMilestone.target : state.goal.startWeight;
    const totalDistance = Math.abs(milestoneTarget - startPoint);
    if (totalDistance === 0) return 100;

    const progressDistance = isLosing
      ? startPoint - latest.weight
      : latest.weight - startPoint;
    const rawPercent = (progressDistance / totalDistance) * 100;
    return Math.min(100, Math.max(0, rawPercent));
  };

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

      {streak.current > 0 && (
        <div className={cn("p-4 rounded-2xl flex items-center justify-between border", streak.isNewRecord && streak.current > 1 ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-brand-50 border-brand-100 text-brand-900")}>
           <div className="flex items-center gap-3">
             <div className={cn("p-2 rounded-xl", streak.isNewRecord && streak.current > 1 ? "bg-amber-100" : "bg-brand-100")}>
               <Flame size={20} className={streak.isNewRecord && streak.current > 1 ? "text-amber-600" : "text-brand-600"} />
             </div>
             <div>
               <p className="font-bold">{streak.current} Day Streak!</p>
               <p className="text-xs opacity-80">{streak.isNewRecord && streak.current > 1 ? "New personal record! Keep it up!" : `Longest streak: ${streak.longest} days`}</p>
             </div>
           </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Today's Weight" value={latest ? displayWeight(latest.weight) : '—'} unit={state.goal?.unit} subValue={latest ? `Trend: ${latest.trendWeight.toFixed(1)}` : ''} trend="neutral" />
        <MilestoneBucketCard
          label="Next Milestone"
          value={nextMilestone?.target.toFixed(1) || '—'}
          unit={state.goal?.unit}
          percentage={nextMilestone ? nextMilestoneProgress : 0}
          subValue={nextMilestone ? `${Math.abs((latest?.trendWeight || 0) - nextMilestone.target).toFixed(1)} to go` : 'No milestone set'}
        />
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
            const isActive = nextMilestone?.id === m.id;
            const percent = getMilestoneProgress(m.target);
            return (
              <div key={m.id} className={cn(
                "relative overflow-hidden flex-shrink-0 w-24 p-4 rounded-2xl border text-center transition-all",
                isCompleted
                  ? "border-brand-200 text-brand-700 shadow-sm shadow-brand-50"
                  : isActive
                    ? "border-brand-400 text-brand-800 shadow-md shadow-brand-200 ring-2 ring-brand-300/70"
                    : "border-slate-100 text-slate-400"
              )}>
                <div className="absolute inset-0 bg-slate-50" />
                <div
                  className={cn(
                    "absolute bottom-0 left-0 right-0 transition-all duration-500",
                    isActive ? "bg-brand-300" : "bg-brand-100"
                  )}
                  style={{ height: `${percent}%` }}
                />
                <div className="relative z-10">
                <p className="text-[10px] font-bold uppercase mb-1 tracking-wider">{m.label}</p>
                <p className="text-base font-black">{m.target.toFixed(0)}</p>
                <p className="mt-2 text-[9px] font-black uppercase tracking-wider text-brand-900">{Math.round(percent)}%</p>
                {isCompleted && <CheckCircle2 size={14} className="mx-auto mt-2" />}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </motion.div>
  );
}

function MilestoneBucketCard({ label, value, unit, percentage, subValue }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-line shadow-sm flex flex-col justify-between">
      <div>
        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">{label}</p>
        <div className="flex items-baseline gap-1">
          <h4 className="text-3xl font-bold text-ink tracking-tight">{value}</h4>
          {unit && <span className="text-slate-400 text-sm font-medium">{unit}</span>}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="relative h-10 rounded-xl border border-brand-200 bg-brand-50 overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 bg-brand-500/80 transition-all duration-500"
            style={{ height: `${percentage}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-900">{Math.round(percentage)}% filled</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{subValue}</p>
      </div>
    </div>
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
  const [isProjectionFullscreen, setIsProjectionFullscreen] = useState(false);
  const [projectionRange, setProjectionRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const ratePerDay = useMemo(
    () => analyticsService.getRateOfChange(state.entries, 30, state.settings.smoothingWindow),
    [state.entries, state.settings.smoothingWindow]
  );
  const ratePerWeek = ratePerDay * 7;
  const milestones = useMemo(() => analyticsService.getMilestones(state.goal!), [state.goal]);
  const completed = useMemo(
    () => analyticsService.getCompletedMilestones(state.entries, state.goal!, state.settings.smoothingWindow),
    [state.entries, state.goal, state.settings.smoothingWindow]
  );
  const predictions = useMemo(() => analyticsService.getPredictions(state.entries, state.goal!, state.settings.smoothingWindow), [state.entries, state.goal, state.settings.smoothingWindow]);
  const spikes = useMemo(() => analyticsService.detectSpikes(state.entries, state.settings.smoothingWindow), [state.entries, state.settings.smoothingWindow]);
  const latestSpike = spikes[spikes.length - 1];
  const trendData = useMemo(
    () => analyticsService.getTrendData(state.entries, state.settings.smoothingWindow),
    [state.entries, state.settings.smoothingWindow]
  );
  const projectionRows = useMemo(() => {
    if (!state.goal || trendData.length === 0) return [];

    const sortedEntries = [...state.entries].sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
    const actualByDay = new Map<string, number>();
    sortedEntries.forEach(entry => {
      actualByDay.set(format(parseISO(entry.date), 'yyyy-MM-dd'), entry.weight);
    });

    const trendByDay = new Map<string, number>();
    trendData.forEach(entry => {
      trendByDay.set(format(parseISO(entry.date), 'yyyy-MM-dd'), entry.trendWeight);
    });

    const firstActualDate = parseISO(sortedEntries[0].date);
    const latestTrendPoint = trendData[trendData.length - 1];
    const latestDate = parseISO(latestTrendPoint.date);
    const goalDate = predictions?.likely ?? addDays(latestDate, 90);
    const allDates = eachDayOfInterval({ start: firstActualDate, end: goalDate });
    const isLosing = state.goal.targetWeight < state.goal.startWeight;
    const expectedDirection = isLosing ? -1 : 1;

    // Blend regression slope from recent trend data with current 30-day velocity.
    const recentTrend = trendData.slice(-Math.min(45, trendData.length));
    let regressionSlope = ratePerDay;
    if (recentTrend.length >= 2) {
      const x0 = parseISO(recentTrend[0].date).getTime();
      const points = recentTrend.map(p => ({
        x: (parseISO(p.date).getTime() - x0) / (1000 * 60 * 60 * 24),
        y: p.trendWeight
      }));
      const n = points.length;
      const sumX = points.reduce((s, p) => s + p.x, 0);
      const sumY = points.reduce((s, p) => s + p.y, 0);
      const sumXY = points.reduce((s, p) => s + (p.x * p.y), 0);
      const sumXX = points.reduce((s, p) => s + (p.x * p.x), 0);
      const denominator = (n * sumXX) - (sumX * sumX);
      if (denominator !== 0) {
        regressionSlope = ((n * sumXY) - (sumX * sumY)) / denominator;
      }
    }

    let projectedDailySlope = (regressionSlope * 0.7) + (ratePerDay * 0.3);
    if (!Number.isFinite(projectedDailySlope) || projectedDailySlope === 0) {
      projectedDailySlope = ratePerDay;
    }

    // Ensure projection direction is coherent with the goal.
    if (Math.sign(projectedDailySlope) !== expectedDirection) {
      projectedDailySlope = expectedDirection * Math.max(0.02, Math.abs(ratePerDay));
    }

    // Build day-by-day forecasts with slight deceleration near target:
    // likely, optimistic, and conservative paths.
    const projectedLikelyByDay = new Map<string, number>();
    const projectedOptimisticByDay = new Map<string, number>();
    const projectedConservativeByDay = new Map<string, number>();
    const initialRemaining = Math.max(0.01, Math.abs(state.goal.targetWeight - latestTrendPoint.trendWeight));
    let projectedLikely = latestTrendPoint.trendWeight;
    let projectedOptimistic = latestTrendPoint.trendWeight;
    let projectedConservative = latestTrendPoint.trendWeight;
    for (let i = 1; i <= differenceInDays(goalDate, latestDate); i++) {
      const d = addDays(latestDate, i);
      const step = (weight: number, slope: number) => {
        const remaining = state.goal.targetWeight - weight;
        const remainingRatio = Math.min(1, Math.abs(remaining) / initialRemaining);
        const damping = 0.55 + (0.45 * remainingRatio);
        let next = weight + (slope * damping);
        if (isLosing && next < state.goal.targetWeight) next = state.goal.targetWeight;
        if (!isLosing && next > state.goal.targetWeight) next = state.goal.targetWeight;
        return next;
      };

      projectedLikely = step(projectedLikely, projectedDailySlope);
      projectedOptimistic = step(projectedOptimistic, projectedDailySlope * 1.2);
      projectedConservative = step(projectedConservative, projectedDailySlope * 0.8);

      const dayKey = format(d, 'yyyy-MM-dd');
      projectedLikelyByDay.set(dayKey, projectedLikely);
      projectedOptimisticByDay.set(dayKey, projectedOptimistic);
      projectedConservativeByDay.set(dayKey, projectedConservative);
    }

    return allDates.map((date, idx) => {
      const key = format(date, 'yyyy-MM-dd');
      const actual = actualByDay.get(key);
      const trend = trendByDay.get(key);

      let projectedLikelyValue: number | null = null;
      let projectedOptimisticValue: number | null = null;
      let projectedConservativeValue: number | null = null;
      if (date > latestDate) {
        projectedLikelyValue = projectedLikelyByDay.get(key) ?? null;
        projectedOptimisticValue = projectedOptimisticByDay.get(key) ?? null;
        projectedConservativeValue = projectedConservativeByDay.get(key) ?? null;
      }

      const modeledWeight = trend ?? projectedLikelyValue ?? (actual ?? null);
      const toGoal = modeledWeight !== null ? Math.abs(modeledWeight - state.goal.targetWeight) : null;

      let progressPct = 0;
      if (modeledWeight !== null) {
        const total = Math.abs(state.goal.startWeight - state.goal.targetWeight);
        const moved = Math.abs(state.goal.startWeight - modeledWeight);
        progressPct = total > 0 ? Math.min(100, Math.max(0, (moved / total) * 100)) : 0;
      }

      return {
        idx: idx + 1,
        date,
        actual: actual ?? null,
        trend: trend ?? null,
        projectedLikely: projectedLikelyValue,
        projectedOptimistic: projectedOptimisticValue,
        projectedConservative: projectedConservativeValue,
        toGoal,
        progressPct,
        phase: date > latestDate ? 'Projected' : 'Actual'
      };
    });
  }, [state.goal, state.entries, trendData, predictions, ratePerDay]);
  const projectionYDomain = useMemo(() => {
    if (projectionRows.length === 0 || !state.goal) return ['auto', 'auto'] as const;
    const values = projectionRows.flatMap(r => [r.actual, r.trend, r.projectedLikely, r.projectedOptimistic, r.projectedConservative].filter((v): v is number => v !== null));
    values.push(state.goal.targetWeight, state.goal.startWeight);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.2, (max - min) * 0.035);
    return [min - pad, max + pad] as const;
  }, [projectionRows, state.goal]);
  const projectionMinWidth = Math.max(960, projectionRows.length * 12);

  useEffect(() => {
    if (projectionRows.length === 0) return;
    const endIndex = projectionRows.length - 1;
    const startIndex = Math.max(0, endIndex - 120);
    setProjectionRange({ startIndex, endIndex });
  }, [projectionRows.length]);

  const zoomProjection = (factor: number) => {
    if (!projectionRange) return;
    const total = projectionRows.length;
    const currentWindow = Math.max(10, projectionRange.endIndex - projectionRange.startIndex + 1);
    const nextWindow = Math.min(total, Math.max(10, Math.round(currentWindow * factor)));
    const center = Math.round((projectionRange.startIndex + projectionRange.endIndex) / 2);
    const half = Math.floor(nextWindow / 2);
    let startIndex = Math.max(0, center - half);
    let endIndex = Math.min(total - 1, startIndex + nextWindow - 1);
    startIndex = Math.max(0, endIndex - nextWindow + 1);
    setProjectionRange({ startIndex, endIndex });
  };

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
              <span className={cn("text-5xl font-bold", ratePerWeek < 0 ? "text-brand-600" : "text-red-500")}>
                {ratePerWeek > 0 ? '+' : ''}{ratePerWeek.toFixed(2)}
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
                        {isCompleted?.date && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(parseISO(isCompleted.date), 'MMM d, yyyy')}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white border border-line rounded-2xl p-10 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-10">Goal Projection</h3>
            <div className="space-y-10">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Likely Completion</p>
                <p className="text-4xl font-bold text-brand-400">{predictions ? format(predictions.likely, 'MMMM d, yyyy') : 'Insufficient Data'}</p>
                <p className="text-xs text-slate-500 mt-2">Calculated using your current 30-day average velocity.</p>
              </div>
              
              <div className="grid grid-cols-1 gap-6 pt-10 border-t border-line">
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
          
          <div className="mt-10 p-4 bg-slate-50 rounded-xl border border-line">
            <p className="text-[10px] text-slate-400 leading-relaxed italic">
              "Weight management is a marathon, not a sprint. Focus on the trend, not the daily number."
            </p>
          </div>
        </div>

        <section className="bg-white border border-line rounded-2xl p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
            <h3 className="text-sm font-bold text-ink">Start-to-Goal Projection Graph</h3>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">
              Actual datapoints through today, statistical projections after latest entry
            </p>
            </div>
            <button
              onClick={() => setIsProjectionFullscreen(true)}
              className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold uppercase tracking-widest text-slate-600"
            >
              Full Screen
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line">
            <div className="min-w-[960px] h-[360px] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projectionRows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => format(d, 'MMM d')}
                    minTickGap={32}
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={projectionYDomain}
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const row = payload[0]?.payload;
                      return (
                        <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 text-xs">
                          <p className="font-bold text-slate-600 mb-1">{format(label, 'MMMM d, yyyy')}</p>
                          <p className="text-slate-700">Actual: {row.actual !== null ? row.actual.toFixed(1) : '—'} {state.goal?.unit}</p>
                          <p className="text-brand-600">Trend: {row.trend !== null ? row.trend.toFixed(1) : '—'} {state.goal?.unit}</p>
                          <p className="text-slate-500">Likely: {row.projectedLikely !== null ? row.projectedLikely.toFixed(1) : '—'} {state.goal?.unit}</p>
                          <p className="text-emerald-600">Optimistic: {row.projectedOptimistic !== null ? row.projectedOptimistic.toFixed(1) : '—'} {state.goal?.unit}</p>
                          <p className="text-amber-600">Conservative: {row.projectedConservative !== null ? row.projectedConservative.toFixed(1) : '—'} {state.goal?.unit}</p>
                          <p className="text-slate-500 mt-1">{row.phase}</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={state.goal?.targetWeight} stroke="#1e3a8a" strokeDasharray="4 4" />
                  <ReferenceLine x={trendData.length > 0 ? parseISO(trendData[trendData.length - 1].date) : undefined} stroke="#64748b" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls={false}
                    name="Actual"
                  />
                  <Line
                    type="monotone"
                    dataKey="trend"
                    stroke="#1e40af"
                    strokeWidth={3}
                    dot={{ r: 0 }}
                    connectNulls={false}
                    name="Trend"
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedLikely"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    strokeDasharray="5 4"
                    dot={{ r: 0 }}
                    connectNulls={false}
                    name="Likely Projection"
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedOptimistic"
                    stroke="#10b981"
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    dot={{ r: 0 }}
                    connectNulls={false}
                    name="Optimistic"
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedConservative"
                    stroke="#f59e0b"
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    dot={{ r: 0 }}
                    connectNulls={false}
                    name="Conservative"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>

      {isProjectionFullscreen && (
        <div className="fixed inset-0 z-[200] bg-paper p-4 md:p-6">
          <div className="h-full w-full bg-white border border-line rounded-2xl shadow-2xl flex flex-col">
            <div className="p-4 border-b border-line flex items-center justify-between gap-3">
              <button
                onClick={() => setIsProjectionFullscreen(false)}
                className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold uppercase tracking-widest text-slate-600"
              >
                Back
              </button>
              <h3 className="text-sm md:text-base font-bold text-ink">Projection Explorer</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => zoomProjection(1.5)}
                  className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold uppercase tracking-widest text-slate-600"
                >
                  Zoom Out
                </button>
                <button
                  onClick={() => zoomProjection(0.7)}
                  className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold uppercase tracking-widest text-slate-600"
                >
                  Zoom In
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-x-auto p-4">
              <div style={{ minWidth: `${projectionMinWidth}px` }} className="h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={projectionRows}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => format(d, 'MMM d')}
                      minTickGap={24}
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis domain={projectionYDomain} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const row = payload[0]?.payload;
                        return (
                          <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 text-xs">
                            <p className="font-bold text-slate-600 mb-1">{format(label, 'MMMM d, yyyy')}</p>
                            <p className="text-slate-700">Actual: {row.actual !== null ? row.actual.toFixed(1) : '—'} {state.goal?.unit}</p>
                            <p className="text-brand-600">Trend: {row.trend !== null ? row.trend.toFixed(1) : '—'} {state.goal?.unit}</p>
                            <p className="text-slate-500">Likely: {row.projectedLikely !== null ? row.projectedLikely.toFixed(1) : '—'} {state.goal?.unit}</p>
                            <p className="text-emerald-600">Optimistic: {row.projectedOptimistic !== null ? row.projectedOptimistic.toFixed(1) : '—'} {state.goal?.unit}</p>
                            <p className="text-amber-600">Conservative: {row.projectedConservative !== null ? row.projectedConservative.toFixed(1) : '—'} {state.goal?.unit}</p>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={state.goal?.targetWeight} stroke="#1e3a8a" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="actual" stroke="#94a3b8" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                    <Line type="monotone" dataKey="trend" stroke="#1e40af" strokeWidth={3} dot={{ r: 0 }} connectNulls={false} />
                    <Line type="monotone" dataKey="projectedLikely" stroke="#3b82f6" strokeWidth={2.5} strokeDasharray="5 4" dot={{ r: 0 }} connectNulls={false} />
                    <Line type="monotone" dataKey="projectedOptimistic" stroke="#10b981" strokeWidth={1.8} strokeDasharray="4 4" dot={{ r: 0 }} connectNulls={false} />
                    <Line type="monotone" dataKey="projectedConservative" stroke="#f59e0b" strokeWidth={1.8} strokeDasharray="4 4" dot={{ r: 0 }} connectNulls={false} />
                    <Brush
                      dataKey="idx"
                      height={24}
                      stroke="#1e40af"
                      startIndex={projectionRange?.startIndex}
                      endIndex={projectionRange?.endIndex}
                      onChange={(range) => {
                        if (typeof range?.startIndex === 'number' && typeof range?.endIndex === 'number') {
                          setProjectionRange({ startIndex: range.startIndex, endIndex: range.endIndex });
                        }
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
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
  const [remindersEnabled, setRemindersEnabled] = useState(state.settings.remindersEnabled || false);
  const [reminderTime, setReminderTime] = useState(state.settings.reminderTime || '08:00');
  const [pushSupported, setPushSupported] = useState('serviceWorker' in navigator && 'PushManager' in window);

  // Helper function for VAPID key
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const handleToggleReminders = async (enabled: boolean) => {
    if (!pushSupported) {
      alert("Push notifications are not supported on this device/browser. On iOS, you must add this app to your Home Screen first.");
      return;
    }

    if (enabled) {
      if (window.self !== window.top) {
        alert("Push notifications cannot be enabled inside the preview iframe. Please open the app in a new tab (using the arrow icon in the top right) to enable reminders.");
        return;
      }

      try {
        let permission = Notification.permission;
        if (permission !== 'granted') {
          permission = await new Promise((resolve) => {
            const promise = Notification.requestPermission(resolve);
            if (promise) {
              promise.then(resolve);
            }
          });
        }

        if (permission !== 'granted') {
          alert("Permission denied for notifications.");
          return;
        }

        const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
        const activeRegistration = await navigator.serviceWorker.ready;
        
        const response = await fetch(`${import.meta.env.BASE_URL}api/vapidPublicKey`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Backend server not found. Push notifications require a Node.js backend and will not work on static hosts like GitHub Pages.');
          }
          throw new Error(`Failed to fetch VAPID key: ${response.statusText}`);
        }
        const vapidPublicKey = (await response.text()).trim();
        
        if (!vapidPublicKey) {
          throw new Error('VAPID key is empty');
        }

        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
        
        // If there's an existing subscription (e.g. from an old VAPID key), unsubscribe first
        let subscription = await activeRegistration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }

        subscription = await activeRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });

        const subResponse = await fetch(`${import.meta.env.BASE_URL}api/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription,
            userId: state.uid || 'anonymous',
            time: reminderTime,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })
        });

        if (!subResponse.ok) {
          throw new Error('Failed to save subscription on server');
        }

        setRemindersEnabled(true);
        onUpdateSettings({ ...state.settings, remindersEnabled: true, reminderTime });
        setStatus({ type: 'success', message: 'Reminders enabled!' });
      } catch (error: any) {
        console.error("Error enabling reminders:", error);
        alert(`Failed to enable reminders: ${error.message || error}`);
        setStatus({ type: 'error', message: 'Failed to enable reminders.' });
      }
    } else {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
        
        await fetch(`${import.meta.env.BASE_URL}api/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: state.uid || 'anonymous' })
        });

        setRemindersEnabled(false);
        onUpdateSettings({ ...state.settings, remindersEnabled: false });
        setStatus({ type: 'success', message: 'Reminders disabled.' });
      } catch (error) {
        console.error("Error disabling reminders:", error);
      }
    }
  };

  const handleTimeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setReminderTime(newTime);
    onUpdateSettings({ ...state.settings, reminderTime: newTime });
    
    if (remindersEnabled) {
      handleToggleReminders(true); // Re-subscribe to update time on server
    }
  };

  const handleTestNotification = async () => {
    try {
      await fetch(`${import.meta.env.BASE_URL}api/test-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: state.uid || 'anonymous' })
      });
    } catch (error) {
      console.error("Error sending test notification:", error);
    }
  };

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
          <LogOut size={20} />
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
                    "absolute top-1 w-4 h-4 bg-[#ffffff] rounded-full transition-all",
                    state.settings.hideRawNumbers ? "left-7" : "left-1"
                  )} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">Dark Mode</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Toggle app theme</p>
                </div>
                <button 
                  onClick={() => onUpdateSettings({ darkMode: !state.settings.darkMode })}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    state.settings.darkMode ? "bg-brand-500" : "bg-slate-200"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-[#ffffff] rounded-full transition-all",
                    state.settings.darkMode ? "left-7" : "left-1"
                  )} />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-line shadow-sm space-y-8">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notifications</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink flex items-center gap-2">
                    {remindersEnabled ? <Bell size={16} className="text-brand-500" /> : <BellOff size={16} className="text-slate-400" />}
                    Daily Reminders
                  </p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Lockscreen push notifications</p>
                </div>
                <button 
                  onClick={() => handleToggleReminders(!remindersEnabled)}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    remindersEnabled ? "bg-brand-500" : "bg-slate-200"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-[#ffffff] rounded-full transition-all",
                    remindersEnabled ? "left-7" : "left-1"
                  )} />
                </button>
              </div>
              
              <AnimatePresence>
                {remindersEnabled && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <div className="flex items-center justify-between pt-4 border-t border-line">
                      <div>
                        <p className="text-sm font-bold text-ink">Reminder Time</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">When to notify you</p>
                      </div>
                      <input 
                        type="time" 
                        value={reminderTime}
                        onChange={handleTimeChange}
                        className="p-2 bg-slate-50 rounded-lg font-bold outline-none border border-transparent focus:border-brand-500 text-sm"
                      />
                    </div>
                    <button 
                      onClick={handleTestNotification}
                      className="w-full py-3 bg-brand-50 text-brand-700 font-bold rounded-xl text-sm hover:bg-brand-100 transition-colors"
                    >
                      Send Test Notification
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {!pushSupported && (
                <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100">
                  Push notifications are not supported in this browser. If you are on iOS, tap "Share" and "Add to Home Screen" to enable them.
                </p>
              )}
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-line shadow-sm space-y-8">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data Management</h3>
            <div className="grid grid-cols-1 gap-3">
              <button onClick={onExport} className="w-full p-4 bg-slate-900 rounded-xl font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2">
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
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const handleSave = () => {
    const now = new Date();
    const [year, month, day] = date.split('-').map(Number);
    const entryDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());
    
    onSave({ 
      date: entryDate.toISOString(), 
      weight: parseFloat(weight), 
      tags 
    });
  };

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
          <div className="flex justify-center">
            <input 
              type="date" 
              value={date}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-100 text-slate-600 font-bold px-4 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
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
            onClick={handleSave} 
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
      <div className="w-full max-w-md bg-slate-900 h-full relative shadow-2xl flex flex-col items-center justify-center p-6">
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
                <button onClick={() => setUnit('lbs')} className={cn("flex-1 py-4 rounded-xl font-bold transition-all", unit === 'lbs' ? "bg-slate-900 shadow-lg" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>lbs</button>
                <button onClick={() => setUnit('kg')} className={cn("flex-1 py-4 rounded-xl font-bold transition-all", unit === 'kg' ? "bg-slate-900 shadow-lg" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>kg</button>
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
                  <input type="number" step="0.1" value={currentWeight} onChange={(e) => setCurrentWeight(e.target.value)} className="w-full p-4 bg-slate-50 text-ink placeholder:text-slate-400 rounded-xl text-2xl font-bold outline-none border border-line focus:border-brand-500 focus:bg-white transition-all" placeholder="0.0" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Goal Weight ({unit})</label>
                  <input type="number" step="0.1" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} className="w-full p-4 bg-slate-50 text-ink placeholder:text-slate-400 rounded-xl text-2xl font-bold outline-none border border-line focus:border-brand-500 focus:bg-white transition-all" placeholder="0.0" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Milestone Size</label>
                  <select value={milestoneSize} onChange={(e) => setMilestoneSize(e.target.value)} className="w-full p-4 bg-slate-50 text-ink rounded-xl font-bold outline-none border border-line focus:border-brand-500 focus:bg-white transition-all appearance-none">
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
