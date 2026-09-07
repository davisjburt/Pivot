/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, TrendingDown, TrendingUp, History,
  Settings as SettingsIcon, Info, Download, Upload,
  Trash2, CheckCircle2, AlertCircle, LogOut,
  Check, Home, Minus, CalendarCheck, Bell, BellOff, HeartPulse, Link2
} from 'lucide-react';
import { format, parseISO, addDays, differenceInDays, startOfWeek, eachDayOfInterval } from 'date-fns';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Line
} from 'recharts';
import ReactECharts from 'echarts-for-react';

import { AppState, WeightEntry, UserGoal, DEFAULT_TAGS, AppSettings } from './types';
import { storageService } from './services/storage';
import { analyticsService } from './services/analytics';
import {
  cloudflareService,
  onAuthStateChanged,
  signInWithGoogle,
  signOut,
  type CloudflareUser,
} from './services/cloudflareService';
import {
  isNativeHealthSupported,
  requestSystemHealthWriteAccess,
  saveLoggedWeightToSystemHealth,
  getSystemHealthConnectionInfo,
  type SystemHealthConnectionInfo,
} from './services/healthSync';
import { Capacitor } from '@capacitor/core';
import { cn } from './lib/utils';

/** The forecast-cone mark: a centerline track fanning into a widening band of uncertainty. */
function ForecastMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
      <path d="M20 6 L34 34 A18 18 0 0 1 6 34 Z" fill="currentColor" opacity="0.18" />
      <path d="M20 6 L20 34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="20" cy="6" r="2.5" fill="currentColor" />
    </svg>
  );
}

/** A small inline trend sparkline with a widening cone of uncertainty at the leading edge. */
function ForecastSparkline({ points, isLosing }: { points: number[]; isLosing: boolean }) {
  if (points.length < 2) return null;
  const w = 280;
  const h = 56;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(0.5, max - min);
  const stepX = (w - pad * 2) / (points.length - 1);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const coords = points.map((v, i) => [pad + i * stepX, y(v)] as const);
  const linePath = coords.map(([x, yy], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yy.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const coneSpread = 10;
  const coneTip = isLosing ? -1 : 1;
  const conePath = `M ${last[0].toFixed(1)} ${last[1].toFixed(1)} L ${w - pad} ${(last[1] - coneSpread).toFixed(1)} L ${w - pad} ${(last[1] + coneSpread).toFixed(1)} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14" preserveAspectRatio="none">
      <path d={conePath} className="fill-cone" />
      <path d={linePath} fill="none" className="stroke-track" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" className="fill-track" />
    </svg>
  );
}

export default function App() {
  const [user, setUser] = useState<CloudflareUser | null>(null);
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
    const unsubscribe = onAuthStateChanged((u) => {
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
      const profile = await cloudflareService.getUserProfile(user.uid);
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
        await cloudflareService.saveUserProfile(user.uid, {
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
    const unsubscribe = cloudflareService.subscribeToEntries(user.uid, (entries) => {
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
    await cloudflareService.saveUserProfile(user.uid, updates);
  };

  const addEntry = async (entry: Omit<WeightEntry, 'id'>) => {
    if (!user) return;
    const newEntry: WeightEntry = { ...entry, id: crypto.randomUUID() };
    await cloudflareService.addEntry(user.uid, newEntry);
    if (state.settings.syncToSystemHealth) {
      try {
        await saveLoggedWeightToSystemHealth(
          newEntry.weight,
          state.goal?.unit || "lbs",
          newEntry.date,
        );
      } catch (err) {
        console.warn("Could not sync weight to system health:", err);
      }
    }
    setIsLogging(false);
  };

  const deleteEntry = async (id: string) => {
    if (!user) return;
    await cloudflareService.deleteEntry(user.uid, id);
  };

  const updateSettings = async (settings: Partial<AppSettings>) => {
    if (!user) return;
    const newSettings = { ...state.settings, ...settings };
    setState(prev => ({ ...prev, settings: newSettings }));
    await cloudflareService.saveUserProfile(user.uid, { settings: newSettings });
  };

  const updateGoal = async (goal: Partial<UserGoal>) => {
    if (!user) return;
    const newGoal = state.goal ? { ...state.goal, ...goal } : null;
    setState(prev => ({ ...prev, goal: newGoal }));
    await cloudflareService.saveUserProfile(user.uid, { goal: newGoal });
  };

  const updateProfile = async (updates: Partial<AppState>) => {
    if (!user) return;
    setState(prev => ({ ...prev, ...updates }));
    await cloudflareService.saveUserProfile(user.uid, updates);
  };

  const handleImportCsv = async (file: File) => {
    if (!user) return;
    const newEntries = await storageService.importCsv(file);
    await cloudflareService.importEntries(user.uid, newEntries);
  };

  const handleImportJson = async (file: File) => {
    if (!user) return;
    const data = await storageService.importData(file);
    // This is a full state import, we should be careful
    await cloudflareService.saveUserProfile(user.uid, {
      goal: data.goal,
      onboarded: data.onboarded,
      settings: data.settings
    });
    await cloudflareService.importEntries(user.uid, data.entries);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (!isAuthReady) {
    return (
      <div className="fixed inset-0 bg-[#2a2620] flex justify-center overflow-hidden">
        <div className="w-full max-w-md bg-paper h-full relative shadow-2xl flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-line-strong border-t-track rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) return <AuthView />;

  if (!state.onboarded) return <Onboarding onComplete={handleOnboard} initialWeight={state.entries[state.entries.length - 1]?.weight} />;

  return (
    <div className="fixed inset-0 bg-[#2a2620] flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-paper h-full relative shadow-2xl flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-32 no-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && <Dashboard state={state} onLogClick={() => setIsLogging(true)} />}
            {activeTab === 'history' && <HistoryView entries={state.entries} onDelete={deleteEntry} unit={state.goal?.unit || 'lbs'} hideRawNumbers={state.settings.hideRawNumbers} />}
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
                nativeHealthLabel={Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'}
                showSystemHealthSync={isNativeHealthSupported()}
                onRequestSystemHealthAccess={requestSystemHealthWriteAccess}
                onReset={async () => {
                  if (confirm('Are you sure you want to reset all data? This deletes every logged entry and cannot be undone.')) {
                    await Promise.all(state.entries.map(entry => cloudflareService.deleteEntry(user.uid, entry.id)));
                    await cloudflareService.saveUserProfile(user.uid, { goal: null, onboarded: false, settings: { smoothingWindow: 10, hideRawNumbers: false, darkMode: false } });
                  }
                }}
                onSignOut={handleSignOut}
              />
            )}
          </AnimatePresence>
        </main>

        {/* Instrument rail */}
        <nav className="absolute bottom-0 left-0 right-0 bg-surface border-t border-line px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] flex justify-between items-center z-50">
          <MobileNavLink active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Home size={20} />} label="Home" />
          <MobileNavLink active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={20} />} label="Log" />
          <button onClick={() => setIsLogging(true)} aria-label="Record a reading" className="w-14 h-12 bg-track rounded-md flex items-center justify-center text-white shadow-lg -mt-6 border-2 border-paper active:scale-95 transition-transform">
            <Plus size={24} />
          </button>
          <MobileNavLink active={activeTab === 'insights'} onClick={() => setActiveTab('insights')} icon={<Info size={20} />} label="Forecast" />
          <MobileNavLink active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<SettingsIcon size={20} />} label="Setup" />
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

  const handleLogin = () => {
    setLoading(true);
    signInWithGoogle();
  };

  return (
    <div className="fixed inset-0 bg-[#2a2620] flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-paper h-full relative shadow-2xl flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full space-y-8"
        >
          <ForecastMark size={56} className="text-track mx-auto" />
          <div className="space-y-2">
            <h1 className="text-5xl font-display font-bold tracking-tight text-ink">Pivot</h1>
            <p className="text-ink-muted font-medium">Your trend, forecast — not just today's reading.</p>
          </div>

          <div className="pt-8">
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-track text-white p-5 rounded-md font-bold flex items-center justify-center gap-4 hover:bg-track-deep transition-all active:scale-95 shadow-lg disabled:opacity-50"
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
            <p className="mt-6 legend-label text-[10px] text-ink-faint">Secure authentication via Cloudflare</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function MobileNavLink({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-1 py-1.5 transition-all active:scale-90",
        active ? "text-track" : "text-ink-faint"
      )}
    >
      {icon}
      <span className="legend-label text-[8px] leading-none">{label}</span>
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
  const isLosing = !!state.goal && state.goal.targetWeight < state.goal.startWeight;

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
      <header>
        <p className="text-ink-muted font-medium text-sm">
          {state.name ? `Welcome back, ${state.name.split(' ')[0]}` : 'Welcome back'}
        </p>
        <p className="legend-label text-[10px] text-ink-faint mt-3 mb-1">Trend Forecast</p>
        <h2 className="tabular text-4xl font-bold text-track-deep tracking-tight">
          {latest ? latest.trendWeight.toFixed(1) : '—'} <span className="text-xl text-ink-muted font-sans font-medium">{state.goal?.unit}</span>
        </h2>
        {trendData.length >= 2 && (
          <div className="mt-3">
            <ForecastSparkline points={trendData.slice(-14).map(d => d.trendWeight)} isLosing={isLosing} />
          </div>
        )}
      </header>

      {streak.current > 0 && (
        <div className={cn("px-4 py-3 border-y flex items-center gap-3", streak.isNewRecord && streak.current > 1 ? "bg-advisory-bg border-advisory/30 text-advisory" : "bg-surface-hover border-line text-ink-muted")}>
          <CalendarCheck size={18} className="shrink-0" />
          <div>
            <p className="font-bold text-sm text-ink">{streak.current} Day Streak</p>
            <p className="text-xs opacity-80">{streak.isNewRecord && streak.current > 1 ? "New personal record — keep it up." : `Longest streak: ${streak.longest} days`}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today's Reading" value={latest ? displayWeight(latest.weight) : '—'} unit={state.goal?.unit} subValue={latest ? `Trend ${latest.trendWeight.toFixed(1)}` : ''} />
        <MilestoneBucketCard
          label="Next Milestone"
          value={nextMilestone?.target.toFixed(1) || '—'}
          unit={state.goal?.unit}
          percentage={nextMilestone ? nextMilestoneProgress : 0}
          subValue={nextMilestone ? `${Math.abs((latest?.trendWeight || 0) - nextMilestone.target).toFixed(1)} to go` : 'No milestone set'}
        />
        <StatCard label="Milestones" value={completed.length} unit={`of ${milestones.length}`} subValue="Completed" />
        <StatCard
          label="Projected Goal"
          value={predictions ? format(predictions.likely, 'MMM d') : '—'}
          unit={predictions ? format(predictions.likely, 'yyyy') : ''}
          subValue={predictions ? "30-day trend" : "Log more data"}
        />
      </div>

      <section className="bg-surface p-4 rounded-md border border-line">
        <h3 className="legend-label text-[11px] text-ink-muted mb-4">Trend vs. Actual</h3>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData.slice(-30)}>
              <defs>
                <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--theme-track)" stopOpacity={0.16}/>
                  <stop offset="95%" stopColor="var(--theme-track)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="var(--theme-line)" />
              <XAxis
                dataKey="date"
                tickFormatter={(str) => format(parseISO(str), 'MMM d')}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--theme-ink-faint)', fontSize: 10 }}
                dy={10}
                minTickGap={30}
              />
              <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-surface p-3 rounded-md shadow-lg border border-line">
                        <p className="legend-label text-[10px] text-ink-faint mb-1">{format(parseISO(payload[0].payload.date), 'MMMM d')}</p>
                        <p className="tabular text-sm font-bold text-track-deep">Trend {payload[0].value?.toFixed(1)}</p>
                        {!state.settings.hideRawNumbers && <p className="text-xs text-ink-muted">Actual {payload[1].value?.toFixed(1)}</p>}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area type="monotone" dataKey="trendWeight" stroke="var(--theme-track)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorTrend)" animationDuration={1000} />
              {!state.settings.hideRawNumbers && <Line type="monotone" dataKey="weight" stroke="var(--theme-line-strong)" strokeWidth={1} dot={{ r: 2 }} animationDuration={1000} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="bg-surface p-4 rounded-md border border-line">
        <h3 className="legend-label text-[11px] text-ink-muted mb-4">Milestone Gauge</h3>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-4 px-4">
          {milestones.map(m => {
            const isCompleted = completed.find(c => c.id === m.id);
            const isActive = nextMilestone?.id === m.id;
            const percent = getMilestoneProgress(m.target);
            return (
              <div key={m.id} className={cn(
                "relative overflow-hidden flex-shrink-0 w-20 p-3 rounded-sm border text-center transition-all",
                isCompleted
                  ? "border-track/40 text-track-deep"
                  : isActive
                    ? "border-track text-track-deep ring-1 ring-track/40"
                    : "border-line text-ink-faint"
              )}>
                <div className="absolute inset-0 bg-surface-hover" />
                <div
                  className={cn(
                    "absolute bottom-0 left-0 right-0 transition-all duration-500",
                    isActive ? "bg-track-soft" : "bg-cone"
                  )}
                  style={{ height: `${percent}%` }}
                />
                <div className="relative z-10">
                  <p className="legend-label text-[9px] mb-1">{m.label}</p>
                  <p className="tabular text-sm font-bold text-ink">{m.target.toFixed(0)}</p>
                  <p className="mt-1.5 legend-label text-[8px] text-track-deep">{Math.round(percent)}%</p>
                  {isCompleted && <CheckCircle2 size={12} className="mx-auto mt-1.5 text-track" />}
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
    <div className="bg-surface p-4 rounded-md border border-line flex flex-col justify-between">
      <div>
        <p className="legend-label text-[9px] text-ink-faint mb-1.5">{label}</p>
        <div className="flex items-baseline gap-1">
          <h4 className="tabular text-2xl font-bold text-ink tracking-tight">{value}</h4>
          {unit && <span className="text-ink-faint text-xs font-medium">{unit}</span>}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="relative h-7 rounded-sm border border-line bg-cone overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 bg-track/70 transition-all duration-500"
            style={{ height: `${percentage}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="legend-label text-[8px] text-ink">{Math.round(percentage)}%</span>
          </div>
        </div>
        <p className="legend-label text-[9px] text-ink-muted">{subValue}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, subValue }: any) {
  return (
    <div className="bg-surface p-4 rounded-md border border-line flex flex-col justify-between">
      <div>
        <p className="legend-label text-[9px] text-ink-faint mb-1.5">{label}</p>
        <div className="flex items-baseline gap-1">
          <h4 className="tabular text-2xl font-bold text-ink tracking-tight">{value}</h4>
          {unit && <span className="text-ink-faint text-xs font-medium">{unit}</span>}
        </div>
      </div>
      {subValue && (
        <p className="mt-3 legend-label text-[9px] text-ink-muted">{subValue}</p>
      )}
    </div>
  );
}

function HistoryView({ entries, onDelete, unit, hideRawNumbers }: { entries: WeightEntry[], onDelete: (id: string) => void, unit: string, hideRawNumbers?: boolean }) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirmTimeoutRef = React.useRef<number | null>(null);

  const handleDeleteClick = (id: string) => {
    if (confirmingId === id) {
      if (confirmTimeoutRef.current) window.clearTimeout(confirmTimeoutRef.current);
      setConfirmingId(null);
      onDelete(id);
      return;
    }
    if (confirmTimeoutRef.current) window.clearTimeout(confirmTimeoutRef.current);
    setConfirmingId(id);
    confirmTimeoutRef.current = window.setTimeout(() => setConfirmingId(null), 3000);
  };

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
        <h2 className="text-3xl font-display font-bold text-ink">Log</h2>
        <p className="legend-label text-[10px] text-ink-faint mt-1">Full Reading History</p>
      </header>

      <div className="bg-surface border border-line rounded-md overflow-hidden">
        <div className="divide-y divide-line">
          {groupedWeeks.length === 0 ? (
            <div className="p-12 text-center text-ink-faint font-medium">No entries recorded yet.</div>
          ) : (
            groupedWeeks.map((week) => (
              <div key={week.weekStart.toISOString()}>
                <div className="bg-surface-hover px-5 py-2 border-b border-line flex justify-between items-center">
                  <span className="legend-label text-[10px] text-ink-muted">
                    Week of {format(week.weekStart, 'MMM d, yyyy')}
                  </span>
                  {hideRawNumbers ? (
                    <div className="legend-label text-[10px] text-ink-faint">Hidden</div>
                  ) : week.delta !== 0 ? (
                    <div className={cn("flex items-center gap-1 legend-label text-[10px]", week.delta > 0 ? "text-advisory" : "text-track-deep")}>
                      {week.delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {Math.abs(week.delta).toFixed(1)} {unit}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 legend-label text-[10px] text-ink-faint">
                      <Minus size={12} /> No change
                    </div>
                  )}
                </div>
                <div className="divide-y divide-line">
                  {week.entries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between py-3.5 px-5 hover:bg-surface-hover transition-colors group">
                      <div>
                        <div className="text-sm font-semibold text-ink">
                          {format(parseISO(entry.date), 'MMM d, yyyy')}
                        </div>
                        <div className="legend-label text-[9px] text-ink-faint mt-0.5">
                          {format(parseISO(entry.date), 'h:mm a')}
                        </div>
                        {entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {entry.tags.map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 bg-surface-active text-ink-muted rounded-sm legend-label text-[9px]">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end">
                          <div className="tabular text-base font-bold text-ink text-right">
                            {hideRawNumbers ? '—' : <>{entry.weight.toFixed(1)} <span className="text-ink-faint font-normal text-xs">{unit}</span></>}
                          </div>
                          {!hideRawNumbers && entry.delta !== 0 && (
                            <div className={cn("flex items-center gap-0.5 legend-label text-[9px] mt-0.5", entry.delta > 0 ? "text-advisory" : "text-track-deep")}>
                              {entry.delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                              {Math.abs(entry.delta).toFixed(1)}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteClick(entry.id)}
                          aria-label={confirmingId === entry.id ? `Confirm delete entry from ${format(parseISO(entry.date), 'MMM d, yyyy')}` : `Delete entry from ${format(parseISO(entry.date), 'MMM d, yyyy')}`}
                          className={cn(
                            "p-3.5 rounded-sm transition-all legend-label text-[9px] flex items-center gap-1",
                            confirmingId === entry.id ? "text-white bg-danger" : "text-ink-faint hover:text-danger hover:bg-danger-bg"
                          )}
                        >
                          {confirmingId === entry.id ? 'Confirm?' : <Trash2 size={16} />}
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

    // Start the chart at the first period of consistent logging
    // (>= 3 entries within a rolling 14-day window).
    let consistentStartIdx = 0;
    for (let i = 0; i < sortedEntries.length; i++) {
      const windowStart = parseISO(sortedEntries[i].date);
      let countInWindow = 1;
      for (let j = i + 1; j < sortedEntries.length; j++) {
        const diff = differenceInDays(parseISO(sortedEntries[j].date), windowStart);
        if (diff > 14) break;
        countInWindow++;
      }
      if (countInWindow >= 3) {
        consistentStartIdx = i;
        break;
      }
    }
    const firstActualDate = parseISO(sortedEntries[consistentStartIdx].date);
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
    // Keep perspective realistic: wider vertical scale prevents exaggerated slopes.
    const pad = Math.max(2, (max - min) * 0.3);
    return [min - pad, max + pad] as const;
  }, [projectionRows, state.goal]);
  const projectionMinWidth = Math.max(920, projectionRows.length * 8);
  const projectionChartOption = useMemo(() => {
    const dates = projectionRows.map(r => format(r.date, 'MMM d'));
    const actual = projectionRows.map(r => r.actual);
    const actualGapBridge = projectionRows.map(() => null as number | null);
    const actualIndexes = actual
      .map((v, i) => (v !== null ? i : -1))
      .filter(i => i >= 0);
    for (let k = 0; k < actualIndexes.length - 1; k++) {
      const start = actualIndexes[k];
      const end = actualIndexes[k + 1];
      if (end - start <= 1) continue;
      const startVal = actual[start] as number;
      const endVal = actual[end] as number;
      for (let i = start; i <= end; i++) {
        const t = (i - start) / (end - start);
        actualGapBridge[i] = startVal + ((endVal - startVal) * t);
      }
    }
    const trend = projectionRows.map(r => r.trend);
    const likely = projectionRows.map(r => r.projectedLikely);
    const optimistic = projectionRows.map(r => r.projectedOptimistic);
    const conservative = projectionRows.map(r => r.projectedConservative);
    const latestActualIndex = projectionRows.findLastIndex(r => r.phase === 'Actual');

    return {
      animation: true,
      grid: { left: 44, right: 22, top: 28, bottom: 72 },
      tooltip: { trigger: 'axis' },
      legend: {
        top: 0,
        textStyle: { color: '#56617a', fontSize: 11, fontFamily: 'Inter' },
        data: ['Actual', 'Gap Bridge', 'Trend', 'Likely', 'Optimistic', 'Conservative']
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { color: '#8992a6', fontSize: 10 },
        axisLine: { lineStyle: { color: '#ddd3b8' } }
      },
      yAxis: {
        type: 'value',
        min: projectionYDomain[0],
        max: projectionYDomain[1],
        axisLabel: { color: '#8992a6', fontSize: 10 },
        splitLine: { lineStyle: { color: '#e7dfc9' } }
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        { type: 'slider', xAxisIndex: 0, height: 20, bottom: 20, borderColor: '#ddd3b8' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'none' }
      ],
      series: [
        { name: 'Actual', type: 'line', data: actual, showSymbol: true, symbolSize: 4, smooth: 0.25, lineStyle: { color: '#8992a6', width: 2 } },
        {
          name: 'Gap Bridge',
          type: 'line',
          data: actualGapBridge,
          showSymbol: false,
          smooth: 0.45,
          lineStyle: { color: '#92661c', width: 2, type: 'dashed', opacity: 0.9 }
        },
        { name: 'Trend', type: 'line', data: trend, showSymbol: false, smooth: 0.3, lineStyle: { color: '#c1502b', width: 3 } },
        { name: 'Likely', type: 'line', data: likely, showSymbol: false, smooth: 0.3, lineStyle: { color: '#c1502b', width: 2, type: 'dashed', opacity: 0.6 } },
        { name: 'Optimistic', type: 'line', data: optimistic, showSymbol: false, smooth: 0.3, lineStyle: { color: '#2f6b4c', width: 2, type: 'dashed' } },
        { name: 'Conservative', type: 'line', data: conservative, showSymbol: false, smooth: 0.3, lineStyle: { color: '#92661c', width: 2, type: 'dashed' } }
      ],
      markLine: {
        symbol: 'none',
        lineStyle: { type: 'dashed', color: '#14213d', width: 1.5 },
        data: [{ yAxis: state.goal?.targetWeight, name: 'Goal' }]
      },
      markArea: latestActualIndex >= 0 ? {
        itemStyle: { color: 'rgba(193, 80, 43, 0.06)' },
        data: [[{ xAxis: latestActualIndex + 1 }, { xAxis: projectionRows.length - 1 }]]
      } : undefined
    };
  }, [projectionRows, projectionYDomain, state.goal?.targetWeight]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-10"
    >
      <header>
        <h2 className="text-3xl font-display font-bold text-ink">Forecast</h2>
        <p className="legend-label text-[10px] text-ink-faint mt-1">Trend Modeling &amp; Velocity</p>
      </header>

      {latestSpike && (
        <div className="bg-advisory-bg px-4 py-3 border-y border-advisory/30 flex gap-3 items-start">
          <AlertCircle size={18} className="text-advisory mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-ink text-sm">Recent Spike — Explained</h4>
            <p className="text-xs text-ink-muted mt-1 leading-relaxed">
              Your reading on {format(parseISO(latestSpike.date), 'MMM d')} sat above trend. This is normal water-weight fluctuation; the forecast track remains your primary indicator.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <div className="space-y-6">
          <div className="bg-surface border border-line rounded-md p-6">
            <h3 className="legend-label text-[10px] text-ink-faint mb-5">Current Velocity</h3>
            {(() => {
              const hasEnoughData = state.entries.length >= 2;
              const isLosingGoal = !!state.goal && state.goal.targetWeight < state.goal.startWeight;
              const isGoodDirection = isLosingGoal ? ratePerWeek <= 0 : ratePerWeek >= 0;
              return (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className={cn(
                      "tabular text-4xl font-bold",
                      !hasEnoughData ? "text-ink-faint" : isGoodDirection ? "text-track-deep" : "text-danger"
                    )}>
                      {hasEnoughData ? `${ratePerWeek > 0 ? '+' : ''}${ratePerWeek.toFixed(2)}` : '—'}
                    </span>
                    <span className="text-ink-muted font-medium text-sm">{state.goal?.unit} / week</span>
                  </div>
                  <p className="text-xs text-ink-muted mt-3 leading-relaxed">
                    {hasEnoughData
                      ? "Based on your trailing 30-day trend. This velocity drives your projected goal dates."
                      : "Log at least two readings to see your weekly velocity."}
                  </p>
                </>
              );
            })()}
          </div>

          <div className="bg-surface border border-line rounded-md p-6">
            <h3 className="legend-label text-[10px] text-ink-faint mb-5">Milestone Track</h3>
            <div className="space-y-5">
              {milestones.map((m, i) => {
                const isCompleted = completed.find(c => c.id === m.id);
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className={cn(
                      "w-6 h-6 rounded-sm flex items-center justify-center legend-label text-[10px] shrink-0",
                      isCompleted ? "bg-track text-white" : "bg-surface-hover text-ink-faint border border-line"
                    )}>
                      {isCompleted ? <Check size={12} /> : i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-baseline">
                        <span className={cn("tabular text-sm font-bold", isCompleted ? "text-ink" : "text-ink-faint")}>{m.target.toFixed(1)} {state.goal?.unit}</span>
                        {isCompleted?.date && <span className="legend-label text-[9px] text-ink-faint">{format(parseISO(isCompleted.date), 'MMM d, yyyy')}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-line rounded-md p-8 flex flex-col justify-between">
          <div>
            <h3 className="legend-label text-[10px] text-ink-faint mb-8">Goal Projection</h3>
            <div className="space-y-8">
              <div>
                <p className="legend-label text-[9px] text-ink-muted mb-1.5">Likely Completion</p>
                <p className="text-3xl font-display font-bold text-track-deep">{predictions ? format(predictions.likely, 'MMMM d, yyyy') : 'Insufficient Data'}</p>
                <p className="text-xs text-ink-muted mt-2">Calculated from your current 30-day average velocity.</p>
              </div>

              <div className="grid grid-cols-1 gap-5 pt-8 border-t border-line">
                <div>
                  <p className="legend-label text-[9px] text-ink-muted mb-1.5">Optimistic Scenario</p>
                  <p className="tabular text-lg font-bold text-ink">{predictions ? format(predictions.optimistic, 'MMMM d, yyyy') : '—'}</p>
                  <p className="text-[10px] text-ink-faint mt-1">Assumes 20% increase in velocity.</p>
                </div>
                <div>
                  <p className="legend-label text-[9px] text-ink-muted mb-1.5">Conservative Scenario</p>
                  <p className="tabular text-lg font-bold text-ink">{predictions ? format(predictions.pessimistic, 'MMMM d, yyyy') : '—'}</p>
                  <p className="text-[10px] text-ink-faint mt-1">Assumes 20% decrease in velocity.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-surface-hover rounded-sm border border-line">
            <p className="text-[11px] text-ink-muted leading-relaxed italic">
              "A forecast is a range, not a promise. Trust the trend, not any single reading."
            </p>
          </div>
        </div>

        <section className="bg-surface border border-line rounded-md p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-ink">Start-to-Goal Forecast</h3>
              <p className="legend-label text-[9px] text-ink-faint mt-1">
                Observed readings through today, statistical projection after
              </p>
            </div>
            <button
              onClick={() => setIsProjectionFullscreen(true)}
              className="px-3 py-2 rounded-sm bg-surface-hover hover:bg-surface-active legend-label text-[10px] text-ink-muted"
            >
              Full Screen
            </button>
          </div>
          <div className="overflow-x-auto rounded-sm border border-line">
            <div style={{ minWidth: `${projectionMinWidth}px` }}>
              <ReactECharts option={projectionChartOption} style={{ width: '100%', height: 360 }} />
            </div>
          </div>
        </section>
      </div>

      {isProjectionFullscreen && (
        <div className="fixed inset-0 z-[200] bg-paper p-4 md:p-6">
          <div className="h-full w-full bg-surface border border-line rounded-md shadow-2xl flex flex-col">
            <div className="p-4 border-b border-line flex items-center justify-between gap-3">
              <button
                onClick={() => setIsProjectionFullscreen(false)}
                className="px-3 py-2 rounded-sm bg-surface-hover hover:bg-surface-active legend-label text-[10px] text-ink-muted"
              >
                Back
              </button>
              <h3 className="text-sm md:text-base font-bold text-ink">Forecast Explorer</h3>
              <p className="legend-label text-[9px] text-ink-faint">Pinch/scroll to zoom and pan</p>
            </div>
            <div className="flex-1 overflow-x-auto p-4">
              <div style={{ minWidth: `${Math.max(1200, projectionRows.length * 10)}px`, height: '100%' }}>
                <ReactECharts option={projectionChartOption} style={{ width: '100%', height: '100%' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function SettingsView({ state, onUpdateSettings, onUpdateGoal, onUpdateProfile, onExport, onImportJson, onImportCsv, nativeHealthLabel, showSystemHealthSync, onRequestSystemHealthAccess, onReset, onSignOut }: any) {
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [healthInfo, setHealthInfo] = useState<SystemHealthConnectionInfo | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [remindersEnabled, setRemindersEnabled] = useState(state.settings.remindersEnabled || false);
  const [reminderTime, setReminderTime] = useState(state.settings.reminderTime || '08:00');
  const [pushSupported, setPushSupported] = useState('serviceWorker' in navigator && 'PushManager' in window);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const vapidConfigured = Boolean(vapidPublicKey);

  useEffect(() => {
    void cloudflareService.getVapidPublicKey()
      .then(setVapidPublicKey)
      .catch((error) => console.error('Unable to load the VAPID public key', error));
  }, []);

  const refreshHealthConnection = useCallback(async () => {
    if (!showSystemHealthSync) return;
    setHealthLoading(true);
    try {
      const info = await getSystemHealthConnectionInfo();
      setHealthInfo(info);
    } finally {
      setHealthLoading(false);
    }
  }, [showSystemHealthSync]);

  useEffect(() => {
    void refreshHealthConnection();
  }, [refreshHealthConnection, state.settings.syncToSystemHealth]);

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
    if (!vapidConfigured) {
      alert("Reminders are not configured for this deployment yet. Add the VAPID keys to the Cloudflare Worker.");
      return;
    }

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

        if (!vapidPublicKey) {
          throw new Error('The Cloudflare Worker has no VAPID public key configured.');
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

        await cloudflareService.saveReminderSubscription(state.uid || 'anonymous', {
          subscription: subscription.toJSON(),
          time: reminderTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          remindersEnabled: true
        });

        setRemindersEnabled(true);
        onUpdateSettings({ ...state.settings, remindersEnabled: true, reminderTime });
        setStatus({ type: 'success', message: 'Reminders enabled! Cloudflare will deliver them on schedule.' });
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

        await cloudflareService.deleteReminderSubscription(state.uid || 'anonymous');

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
      setStatus({
        type: 'success',
        message: 'Reminder delivery is managed by the Cloudflare scheduled Worker.'
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
      className="space-y-8"
    >
      <header className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-display font-bold text-ink">Setup</h2>
          <p className="legend-label text-[10px] text-ink-faint mt-1">Calibration &amp; Data</p>
        </div>
        <button
          onClick={onSignOut}
          className="p-3 bg-surface-hover text-ink-muted rounded-sm hover:bg-surface-active transition-all active:scale-95"
          title="Sign Out"
        >
          <LogOut size={18} />
        </button>
      </header>

      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "px-4 py-3 flex items-center gap-3 font-bold legend-label text-[10px] border-y",
              status.type === 'success' ? "bg-verified-bg text-verified border-verified/30" : "bg-danger-bg text-danger border-danger/30"
            )}
          >
            {status.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
            {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-surface p-6 rounded-md border border-line space-y-6">
          <h3 className="legend-label text-[10px] text-ink-faint">Profile &amp; Goals</h3>
          <div className="grid grid-cols-1 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="settings-display-name" className="legend-label text-[9px] text-ink-faint">Display Name</label>
              <input
                id="settings-display-name"
                type="text"
                value={state.name || ''}
                onChange={(e) => onUpdateProfile({ name: e.target.value })}
                placeholder="Your Name"
                className="w-full p-3.5 bg-surface-hover rounded-sm font-bold outline-none border border-transparent focus:border-track transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="settings-start-weight" className="legend-label text-[9px] text-ink-faint">Start Weight ({state.goal?.unit})</label>
              <input
                id="settings-start-weight"
                type="number"
                step="0.1"
                value={state.goal?.startWeight || ''}
                onChange={(e) => onUpdateGoal({ startWeight: parseFloat(e.target.value) })}
                className="w-full p-3.5 bg-surface-hover rounded-sm font-bold outline-none border border-transparent focus:border-track transition-all tabular"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="settings-target-weight" className="legend-label text-[9px] text-ink-faint">Target Weight ({state.goal?.unit})</label>
              <input
                id="settings-target-weight"
                type="number"
                step="0.1"
                value={state.goal?.targetWeight || ''}
                onChange={(e) => onUpdateGoal({ targetWeight: parseFloat(e.target.value) })}
                className="w-full p-3.5 bg-surface-hover rounded-sm font-bold outline-none border border-transparent focus:border-track transition-all tabular"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="settings-milestone-size" className="legend-label text-[9px] text-ink-faint">Milestone Size ({state.goal?.unit})</label>
              <input
                id="settings-milestone-size"
                type="number"
                step="1"
                value={state.goal?.milestoneSize || ''}
                onChange={(e) => onUpdateGoal({ milestoneSize: parseFloat(e.target.value) })}
                className="w-full p-3.5 bg-surface-hover rounded-sm font-bold outline-none border border-transparent focus:border-track transition-all tabular"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-surface p-6 rounded-md border border-line space-y-6">
            <h3 className="legend-label text-[10px] text-ink-faint">Display Preferences</h3>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">Smoothing Window</p>
                  <p className="legend-label text-[9px] text-ink-faint">Days: {state.settings.smoothingWindow}</p>
                </div>
                <input
                  type="range"
                  min="3"
                  max="30"
                  aria-label={`Smoothing window: ${state.settings.smoothingWindow} days`}
                  value={state.settings.smoothingWindow}
                  onChange={(e) => onUpdateSettings({ smoothingWindow: parseInt(e.target.value) })}
                  className="w-32 accent-track"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">Privacy Mode</p>
                  <p className="legend-label text-[9px] text-ink-faint">Hide raw numbers</p>
                </div>
                <button
                  onClick={() => onUpdateSettings({ hideRawNumbers: !state.settings.hideRawNumbers })}
                  role="switch"
                  aria-checked={state.settings.hideRawNumbers}
                  aria-label="Privacy Mode: hide raw numbers"
                  className={cn(
                    "w-11 h-6 rounded-full transition-all relative",
                    state.settings.hideRawNumbers ? "bg-track" : "bg-line-strong"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                    state.settings.hideRawNumbers ? "left-6" : "left-1"
                  )} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">Dark Mode</p>
                  <p className="legend-label text-[9px] text-ink-faint">Chart room, night lighting</p>
                </div>
                <button
                  onClick={() => onUpdateSettings({ darkMode: !state.settings.darkMode })}
                  role="switch"
                  aria-checked={state.settings.darkMode}
                  aria-label="Dark Mode"
                  className={cn(
                    "w-11 h-6 rounded-full transition-all relative",
                    state.settings.darkMode ? "bg-track" : "bg-line-strong"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                    state.settings.darkMode ? "left-6" : "left-1"
                  )} />
                </button>
              </div>
            </div>
          </div>

          {showSystemHealthSync && (() => {
            const healthReady = healthInfo?.available === true;
            const hasWrite = healthInfo?.writeAuthorized === true;
            const syncOn = Boolean(state.settings.syncToSystemHealth);
            const isFullyConnected = syncOn && healthReady && hasWrite;
            const needsPermission = syncOn && healthReady && !hasWrite;

            const handleHealthConnect = async () => {
              const granted = await onRequestSystemHealthAccess();
              if (!granted) {
                setStatus({
                  type: 'error',
                  message: `Allow ${nativeHealthLabel} access to write body weight, or try again.`,
                });
                return;
              }
              onUpdateSettings({ syncToSystemHealth: true });
              setStatus({
                type: 'success',
                message: `Connected to ${nativeHealthLabel}. New logs will sync.`,
              });
              await refreshHealthConnection();
            };

            const handleHealthSyncToggle = async () => {
              const next = !state.settings.syncToSystemHealth;
              if (next) {
                const granted = await onRequestSystemHealthAccess();
                if (!granted) {
                  setStatus({
                    type: 'error',
                    message: `Permission required to write to ${nativeHealthLabel}.`,
                  });
                  return;
                }
              }
              onUpdateSettings({ syncToSystemHealth: next });
              if (next) {
                setStatus({
                  type: 'success',
                  message: `${nativeHealthLabel} sync enabled.`,
                });
              }
              await refreshHealthConnection();
            };

            return (
              <div className="bg-surface p-6 rounded-md border border-line space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="legend-label text-[10px] text-ink-faint">
                    {nativeHealthLabel}
                  </h3>
                  {healthLoading ? (
                    <span className="legend-label text-[9px] text-ink-faint shrink-0">Checking…</span>
                  ) : !healthInfo?.available ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-hover text-ink-muted legend-label text-[9px] shrink-0">
                      Unavailable
                    </span>
                  ) : isFullyConnected ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-verified-bg text-verified legend-label text-[9px] shrink-0">
                      <CheckCircle2 size={11} strokeWidth={2.5} aria-hidden />
                      Connected
                    </span>
                  ) : needsPermission ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-advisory-bg text-advisory legend-label text-[9px] shrink-0">
                      <AlertCircle size={11} strokeWidth={2.5} aria-hidden />
                      Permission needed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-hover text-ink-muted legend-label text-[9px] shrink-0">
                      Not connected
                    </span>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-sm bg-track-soft text-track-deep shrink-0">
                    <HeartPulse size={18} aria-hidden />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-bold text-ink">
                      {Capacitor.getPlatform() === 'ios'
                        ? 'Sync weight to Apple Health'
                        : `Sync weight to ${nativeHealthLabel}`}
                    </p>
                    <p className="text-xs text-ink-muted leading-relaxed">
                      Connect once so Pivot can save body-mass samples when you log. Units follow your goal; Health stores kilograms.
                    </p>
                  </div>
                </div>

                {!healthLoading && healthInfo?.available && !isFullyConnected && (
                  <button
                    type="button"
                    onClick={() => void handleHealthConnect()}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-sm bg-track text-white text-sm font-bold hover:bg-track-deep transition-colors active:scale-[0.99]"
                  >
                    <Link2 size={16} aria-hidden />
                    {Capacitor.getPlatform() === 'ios'
                      ? 'Connect to Apple Health'
                      : `Connect to ${nativeHealthLabel}`}
                  </button>
                )}

                {!healthLoading && healthInfo?.available && isFullyConnected && (
                  <p className="text-xs text-verified font-medium flex items-center gap-2">
                    <CheckCircle2 size={15} className="shrink-0" aria-hidden />
                    You&apos;re connected. New weight entries will appear in the Health app under Body Measurements.
                  </p>
                )}

                {!healthLoading && needsPermission && (
                  <p className="text-xs text-advisory bg-advisory-bg border border-advisory/30 rounded-sm px-3 py-2">
                    {`Sync is on in Pivot, but this app doesn't have permission to write weight. Tap Connect above or enable Body Mass in Settings → Health → Data Access & Devices.`}
                  </p>
                )}

                <div className="flex items-center justify-between gap-4 pt-2 border-t border-line">
                  <div>
                    <p className="text-sm font-bold text-ink">Save new logs to {nativeHealthLabel}</p>
                    <p className="legend-label text-[9px] text-ink-faint mt-0.5">
                      Off when disconnected
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleHealthSyncToggle()}
                    role="switch"
                    aria-checked={state.settings.syncToSystemHealth}
                    aria-label={`Save new logs to ${nativeHealthLabel}`}
                    className={cn(
                      'w-11 h-6 rounded-full transition-all relative shrink-0',
                      state.settings.syncToSystemHealth ? 'bg-track' : 'bg-line-strong',
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-1 w-4 h-4 bg-white rounded-full transition-all',
                        state.settings.syncToSystemHealth ? 'left-6' : 'left-1',
                      )}
                    />
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="bg-surface p-6 rounded-md border border-line space-y-6">
            <h3 className="legend-label text-[10px] text-ink-faint">Notifications</h3>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink flex items-center gap-2">
                    {remindersEnabled ? <Bell size={15} className="text-track" /> : <BellOff size={15} className="text-ink-faint" />}
                    Daily Reminders
                  </p>
                  <p className="legend-label text-[9px] text-ink-faint">Lockscreen push notifications</p>
                </div>
                <button
                  onClick={() => handleToggleReminders(!remindersEnabled)}
                  disabled={!vapidConfigured}
                  role="switch"
                  aria-checked={remindersEnabled}
                  aria-label="Daily Reminders"
                  className={cn(
                    "w-11 h-6 rounded-full transition-all relative disabled:opacity-40 disabled:cursor-not-allowed",
                    remindersEnabled ? "bg-track" : "bg-line-strong"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                    remindersEnabled ? "left-6" : "left-1"
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
                        <p className="legend-label text-[9px] text-ink-faint">When to notify you</p>
                      </div>
                      <input
                        type="time"
                        value={reminderTime}
                        onChange={handleTimeChange}
                        className="p-2 bg-surface-hover rounded-sm font-bold outline-none border border-transparent focus:border-track text-sm tabular"
                      />
                    </div>
                    <button
                      onClick={handleTestNotification}
                      className="w-full py-3 bg-track-soft text-track-deep font-bold rounded-sm text-sm hover:opacity-90 transition-colors"
                    >
                      Send Test Notification
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {!pushSupported && (
                <p className="text-xs text-advisory bg-advisory-bg p-3 rounded-sm border border-advisory/30">
                  Push notifications are not supported in this browser. If you are on iOS, tap "Share" and "Add to Home Screen" to enable them.
                </p>
              )}
              {!vapidConfigured && (
                <p className="text-xs text-advisory bg-advisory-bg p-3 rounded-sm border border-advisory/30">
                  Reminders are not configured for this deployment. Set <span className="font-bold">VAPID_PUBLIC_KEY</span> and <span className="font-bold">VAPID_PRIVATE_KEY</span> on the Cloudflare Worker.
                </p>
              )}
            </div>
          </div>

          <div className="bg-surface p-6 rounded-md border border-line space-y-6">
            <h3 className="legend-label text-[10px] text-ink-faint">Data Management</h3>
            <div className="grid grid-cols-1 gap-3">
              <button onClick={onExport} className="w-full p-3.5 bg-ink text-paper rounded-sm font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2">
                <Download size={16} /> Export JSON
              </button>
              <div className="grid grid-cols-2 gap-3">
                <label className="p-3.5 bg-surface border border-line rounded-sm font-bold text-sm hover:bg-surface-hover transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <Upload size={16} /> JSON
                  <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && handleJson(e.target.files[0])} className="hidden" />
                </label>
                <label className="p-3.5 bg-surface border border-line rounded-sm font-bold text-sm hover:bg-surface-hover transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <Upload size={16} /> CSV
                  <input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])} className="hidden" />
                </label>
              </div>
              <button onClick={onReset} className="w-full p-4 text-danger font-bold legend-label text-[10px] hover:bg-danger-bg rounded-sm transition-all mt-3">
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
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const now = new Date();
      const [year, month, day] = date.split('-').map(Number);
      const entryDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());

      await onSave({
        date: entryDate.toISOString(),
        weight: parseFloat(weight),
        tags
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-ink/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-md bg-surface rounded-t-xl p-6 pb-12 shadow-2xl border-t border-line"
      >
        <div className="w-10 h-1 bg-line-strong rounded-full mx-auto mb-6" />
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-display font-bold tracking-tight text-ink">Record a Reading</h3>
          <button onClick={onClose} aria-label="Close" className="p-3 text-ink-faint hover:bg-surface-hover rounded-full transition-all active:scale-90">
            <Plus size={22} className="rotate-45" />
          </button>
        </div>
        <div className="space-y-8">
          <div className="flex justify-center">
            <input
              type="date"
              value={date}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Entry date"
              className="bg-surface-hover text-ink-muted font-bold px-4 py-2 rounded-sm text-sm outline-none focus:ring-2 focus:ring-track tabular"
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
                aria-label={`Weight in ${unit}`}
                className="tabular text-6xl font-bold text-track-deep w-48 text-center outline-none bg-transparent"
              />
              <span className="text-2xl font-bold text-ink-faint">{unit}</span>
            </div>
          </div>
          <div>
            <p className="legend-label text-[10px] text-ink-faint mb-4 text-center">Any factors today?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {DEFAULT_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                  aria-pressed={tags.includes(tag)}
                  className={cn(
                    "px-3.5 py-2 rounded-sm text-sm font-bold transition-all active:scale-95",
                    tags.includes(tag) ? "bg-track text-white" : "bg-surface-hover text-ink-muted hover:bg-surface-active"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={!weight || isSaving}
            className="w-full py-4 bg-track text-white rounded-md font-bold text-lg shadow-lg hover:bg-track-deep disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
          >
            {isSaving && <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {isSaving ? 'Saving…' : 'Save Entry'}
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
    <div className="fixed inset-0 bg-[#2a2620] flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-paper h-full relative shadow-2xl flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full bg-surface rounded-md p-8 shadow-xl border border-line"
        >
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-10 text-center">
                <ForecastMark size={48} className="text-track mx-auto" />
                <div>
                  <h2 className="text-4xl font-display font-bold text-ink mb-2">Pivot</h2>
                  <p className="legend-label text-[10px] text-ink-faint">Your Trend, Forecast</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setUnit('lbs')} className={cn("flex-1 py-3.5 rounded-sm font-bold transition-all", unit === 'lbs' ? "bg-ink text-paper" : "bg-surface-hover text-ink-muted hover:bg-surface-active")}>lbs</button>
                  <button onClick={() => setUnit('kg')} className={cn("flex-1 py-3.5 rounded-sm font-bold transition-all", unit === 'kg' ? "bg-ink text-paper" : "bg-surface-hover text-ink-muted hover:bg-surface-active")}>kg</button>
                </div>
                <button onClick={() => setStep(2)} className="w-full py-4 bg-track text-white rounded-md font-bold text-sm tracking-widest uppercase shadow-lg hover:bg-track-deep transition-all active:scale-95">Get Started</button>
              </motion.div>
            ) : (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                <div className="text-center">
                  <h2 className="text-2xl font-display font-bold text-ink">Set Your Goal</h2>
                  <p className="legend-label text-[10px] text-ink-faint mt-1">Define Your Trajectory</p>
                </div>
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label htmlFor="onboard-current-weight" className="legend-label text-[9px] text-ink-faint">Current Weight ({unit})</label>
                    <input id="onboard-current-weight" type="number" step="0.1" value={currentWeight} onChange={(e) => setCurrentWeight(e.target.value)} className="tabular w-full p-3.5 bg-surface-hover text-ink placeholder:text-ink-faint rounded-sm text-2xl font-bold outline-none border border-line focus:border-track transition-all" placeholder="0.0" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="onboard-goal-weight" className="legend-label text-[9px] text-ink-faint">Goal Weight ({unit})</label>
                    <input id="onboard-goal-weight" type="number" step="0.1" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} className="tabular w-full p-3.5 bg-surface-hover text-ink placeholder:text-ink-faint rounded-sm text-2xl font-bold outline-none border border-line focus:border-track transition-all" placeholder="0.0" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="onboard-milestone-size" className="legend-label text-[9px] text-ink-faint">Milestone Size</label>
                    <select id="onboard-milestone-size" value={milestoneSize} onChange={(e) => setMilestoneSize(e.target.value)} className="w-full p-3.5 bg-surface-hover text-ink rounded-sm font-bold outline-none border border-line focus:border-track transition-all appearance-none">
                      <option value="2">2 {unit} chunks</option>
                      <option value="5">5 {unit} chunks</option>
                      <option value="10">10 {unit} chunks</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => onComplete({ unit, startWeight: parseFloat(currentWeight), startDate: new Date().toISOString(), targetWeight: parseFloat(targetWeight), milestoneSize: parseFloat(milestoneSize) })}
                  disabled={!currentWeight || !targetWeight}
                  className="w-full py-4 bg-track text-white rounded-md font-bold text-sm tracking-widest uppercase shadow-lg hover:bg-track-deep transition-all active:scale-95 disabled:opacity-50"
                >
                  Start Journey
                </button>
                <button onClick={() => setStep(1)} className="w-full py-2 text-ink-faint font-bold legend-label text-[9px]">Back</button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
