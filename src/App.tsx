/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, TrendingDown, TrendingUp, Calendar, Target, History, 
  Settings as SettingsIcon, Info, ChevronRight, Download, Upload, 
  Trash2, CheckCircle2, AlertCircle, Eye, EyeOff, Sliders
} from 'lucide-react';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Line
} from 'recharts';

import { AppState, WeightEntry, UserGoal, DEFAULT_TAGS, AppSettings } from './types';
import { storageService } from './services/storage';
import { analyticsService } from './services/analytics';
import { cn } from './lib/utils';

export default function App() {
  const [state, setState] = useState<AppState>(storageService.loadData());
  const [isLogging, setIsLogging] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'insights' | 'settings'>('dashboard');

  useEffect(() => {
    storageService.saveData(state);
  }, [state]);

  const handleOnboard = (goal: UserGoal) => {
    setState(prev => ({ ...prev, goal, onboarded: true }));
  };

  const addEntry = (entry: Omit<WeightEntry, 'id'>) => {
    const newEntry: WeightEntry = { ...entry, id: crypto.randomUUID() };
    setState(prev => ({
      ...prev,
      entries: [...prev.entries, newEntry].sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
    }));
    setIsLogging(false);
  };

  const deleteEntry = (id: string) => {
    setState(prev => ({ ...prev, entries: prev.entries.filter(e => e.id !== id) }));
  };

  const updateSettings = (settings: Partial<AppSettings>) => {
    setState(prev => ({ ...prev, settings: { ...prev.settings, ...settings } }));
  };

  const updateGoal = (goal: Partial<UserGoal>) => {
    setState(prev => ({ ...prev, goal: prev.goal ? { ...prev.goal, ...goal } : null }));
  };

  const handleImportCsv = async (file: File) => {
    const newEntries = await storageService.importCsv(file);
    setState(prev => {
      const merged = [...prev.entries, ...newEntries].sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
      // Simple de-duplication by date (same day)
      const unique = merged.filter((entry, index, self) => 
        index === self.findIndex((e) => format(parseISO(e.date), 'yyyy-MM-dd') === format(parseISO(entry.date), 'yyyy-MM-dd'))
      );
      return { ...prev, entries: unique };
    });
  };

  const handleImportJson = async (file: File) => {
    const data = await storageService.importData(file);
    setState(data);
  };

  if (!state.onboarded) return <Onboarding onComplete={handleOnboard} initialWeight={state.entries[state.entries.length - 1]?.weight} />;

  return (
    <div className="min-h-screen pb-24 md:pb-0 md:pl-64">
      {/* Desktop Sidebar */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-200">
            <TrendingDown size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Pivot</h1>
        </div>
        <div className="space-y-2 flex-1">
          <NavLink active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Target size={20} />} label="Dashboard" />
          <NavLink active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={20} />} label="History" />
          <NavLink active={activeTab === 'insights'} onClick={() => setActiveTab('insights')} icon={<Info size={20} />} label="Insights" />
        </div>
        <div className="pt-6 border-t border-slate-100">
          <NavLink active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<SettingsIcon size={20} />} label="Settings" />
        </div>
      </nav>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center z-50">
        <MobileNavLink active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Target size={24} />} />
        <MobileNavLink active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={24} />} />
        <button onClick={() => setIsLogging(true)} className="w-14 h-14 bg-brand-500 rounded-full flex items-center justify-center text-white shadow-lg -mt-10 border-4 border-slate-50"><Plus size={28} /></button>
        <MobileNavLink active={activeTab === 'insights'} onClick={() => setActiveTab('insights')} icon={<Info size={24} />} />
        <MobileNavLink active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<SettingsIcon size={24} />} />
      </nav>

      <main className="max-w-4xl mx-auto p-6 md:p-10">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && <Dashboard state={state} onLogClick={() => setIsLogging(true)} />}
          {activeTab === 'history' && <HistoryView entries={state.entries} onDelete={deleteEntry} unit={state.goal?.unit || 'lbs'} />}
          {activeTab === 'insights' && <InsightsView state={state} />}
          {activeTab === 'settings' && (
            <SettingsView 
              state={state} 
              onUpdateSettings={updateSettings} 
              onUpdateGoal={updateGoal}
              onExport={storageService.exportData}
              onImportJson={handleImportJson}
              onImportCsv={handleImportCsv}
              onReset={() => setState({ goal: null, entries: [], onboarded: false, settings: { smoothingWindow: 10, hideRawNumbers: false } })} 
            />
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {isLogging && <LogModal onClose={() => setIsLogging(false)} onSave={addEntry} unit={state.goal?.unit || 'lbs'} lastWeight={state.entries[state.entries.length - 1]?.weight} />}
      </AnimatePresence>
    </div>
  );
}

function NavLink({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all", active ? "bg-brand-50 text-brand-600 font-semibold" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")}>
      {icon} <span>{label}</span>
      {active && <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500" />}
    </button>
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
      className="space-y-6 md:space-y-8"
    >
      <header className="flex justify-between items-start md:items-end">
        <div>
          <p className="text-slate-500 font-medium text-sm md:text-base">Your Progress</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Trend: <span className="text-brand-600">{latest?.trendWeight.toFixed(1)} {state.goal?.unit}</span>
          </h2>
        </div>
        <button 
          onClick={onLogClick} 
          className="hidden md:flex items-center gap-2 bg-brand-500 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:bg-brand-600 transition-all active:scale-95"
        >
          <Plus size={20} /> Log Weight
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
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

      <section className="bg-white p-4 md:p-6 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-bold text-lg mb-4 md:mb-6">Trend vs Actual</h3>
        <div className="h-[250px] md:h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData.slice(-30)}>
              <defs>
                <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
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
              <Area type="monotone" dataKey="trendWeight" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorTrend)" animationDuration={1000} />
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
                isCompleted ? "bg-emerald-50 border-emerald-100 text-emerald-700 shadow-sm shadow-emerald-50" : "bg-slate-50 border-slate-100 text-slate-400"
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
    <div className="bg-white p-5 md:p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
      <div>
        <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mb-1">{label}</p>
        <div className="flex items-baseline gap-1">
          <h4 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{value}</h4>
          {unit && <span className="text-slate-400 text-xs md:text-sm font-medium">{unit}</span>}
        </div>
      </div>
      {subValue && (
        <div className="mt-3 md:mt-4 flex items-center gap-1.5">
          {trend === 'down' && <TrendingDown size={14} className="text-emerald-500" />}
          {trend === 'up' && <TrendingUp size={14} className="text-rose-500" />}
          <p className="text-[11px] md:text-xs text-slate-500 font-semibold">{subValue}</p>
        </div>
      )}
    </div>
  );
}

function HistoryView({ entries, onDelete, unit }: any) {
  const sorted = [...entries].sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <header>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">History</h2>
        <p className="text-slate-500 text-sm md:text-base">Your logged entries over time</p>
      </header>
      <div className="space-y-3">
        {sorted.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-100 text-center">
            <History className="text-slate-200 mx-auto mb-4" size={48} />
            <p className="text-slate-400 font-medium">No entries yet.</p>
          </div>
        ) : (
          sorted.map((entry) => (
            <div key={entry.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between group active:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-50 rounded-xl flex flex-col items-center justify-center text-brand-600">
                  <span className="text-[9px] font-bold uppercase leading-none">{format(parseISO(entry.date), 'MMM')}</span>
                  <span className="text-sm md:text-lg font-bold leading-tight">{format(parseISO(entry.date), 'd')}</span>
                </div>
                <div>
                  <p className="font-bold text-lg md:text-xl text-slate-900">{entry.weight.toFixed(1)} <span className="text-sm font-normal text-slate-400">{unit}</span></p>
                  <div className="flex flex-wrap gap-1 mt-1">{entry.tags.map(tag => <span key={tag} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">{tag}</span>)}</div>
                </div>
              </div>
              <button 
                onClick={() => onDelete(entry.id)} 
                className="p-3 text-slate-300 hover:text-rose-500 md:opacity-0 md:group-hover:opacity-100 transition-all active:scale-90"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function InsightsView({ state }: { state: AppState }) {
  const predictions = useMemo(() => analyticsService.getPredictions(state.entries, state.goal!, state.settings.smoothingWindow), [state.entries, state.goal, state.settings.smoothingWindow]);
  const spikes = useMemo(() => analyticsService.detectSpikes(state.entries, state.settings.smoothingWindow), [state.entries, state.settings.smoothingWindow]);
  const latestSpike = spikes[spikes.length - 1];

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="space-y-8">
      <h2 className="text-3xl font-bold tracking-tight">Insights</h2>
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-bold text-xl mb-6 flex items-center gap-2"><Calendar className="text-emerald-600" /> Predictions</h3>
        {predictions ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <PredictionCard label="Optimistic" date={predictions.optimistic} color="text-emerald-600" />
            <PredictionCard label="Likely" date={predictions.likely} color="text-brand-600" />
            <PredictionCard label="Pessimistic" date={predictions.pessimistic} color="text-slate-400" />
          </div>
        ) : <p className="text-slate-500 italic">Log more data to see predictions.</p>}
      </div>

      {latestSpike && (
        <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
          <h4 className="font-bold text-amber-800 flex items-center gap-2 mb-2"><AlertCircle size={18} /> Recent Spike Detected</h4>
          <p className="text-sm text-amber-700">Your weight on {format(parseISO(latestSpike.date), 'MMM d')} was higher than your trend. Don't worry! This is normal and could be due to sodium, water retention, or a heavy workout. The blue trend line is what matters.</p>
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

function SettingsView({ state, onUpdateSettings, onUpdateGoal, onExport, onImportJson, onImportCsv, onReset }: any) {
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
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
      <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
      
      <AnimatePresence>
        {status && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "p-4 rounded-2xl flex items-center gap-3 font-bold text-sm",
              status.type === 'success' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
            )}
          >
            {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-6">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Goal Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Start Weight ({state.goal?.unit})</label>
            <input 
              type="number" 
              step="0.1"
              value={state.goal?.startWeight || ''} 
              onChange={(e) => onUpdateGoal({ startWeight: parseFloat(e.target.value) })}
              className="w-full p-3 bg-slate-50 rounded-xl font-bold outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Target Weight ({state.goal?.unit})</label>
            <input 
              type="number" 
              step="0.1"
              value={state.goal?.targetWeight || ''} 
              onChange={(e) => onUpdateGoal({ targetWeight: parseFloat(e.target.value) })}
              className="w-full p-3 bg-slate-50 rounded-xl font-bold outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Milestone Size ({state.goal?.unit})</label>
          <input 
            type="number" 
            step="1"
            value={state.goal?.milestoneSize || ''} 
            onChange={(e) => onUpdateGoal({ milestoneSize: parseFloat(e.target.value) })}
            className="w-full p-3 bg-slate-50 rounded-xl font-bold outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
          <p className="text-[10px] text-slate-400">Smaller milestones (e.g., 5 lbs) keep motivation high!</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-6">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Preferences</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><Eye className="text-slate-400" /> <div><p className="font-bold">Focus Mode</p><p className="text-xs text-slate-500">Hide exact daily numbers</p></div></div>
          <button onClick={() => onUpdateSettings({ hideRawNumbers: !state.settings.hideRawNumbers })} className={cn("w-12 h-6 rounded-full transition-all relative", state.settings.hideRawNumbers ? "bg-brand-500" : "bg-slate-200")}>
            <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", state.settings.hideRawNumbers ? "left-7" : "left-1")} />
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3"><Sliders className="text-slate-400" /> <p className="font-bold">Smoothing Window</p></div>
          <input type="range" min="5" max="30" value={state.settings.smoothingWindow} onChange={(e) => onUpdateSettings({ smoothingWindow: parseInt(e.target.value) })} className="w-full accent-brand-500" />
          <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase"><span>Aggressive (5)</span><span>Balanced (10)</span><span>Smooth (30)</span></div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Data Management</h3>
        
        <button onClick={onExport} className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all group">
          <div className="flex items-center gap-3"><Download className="text-slate-400 group-hover:text-brand-500" /> <span className="font-bold">Export Data (JSON)</span></div>
          <ChevronRight size={18} className="text-slate-300" />
        </button>

        <label className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all group cursor-pointer">
          <div className="flex items-center gap-3"><Upload className="text-slate-400 group-hover:text-brand-500" /> <span className="font-bold">Import Data (JSON)</span></div>
          <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && handleJson(e.target.files[0])} />
          <ChevronRight size={18} className="text-slate-300" />
        </label>

        <label className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all group cursor-pointer">
          <div className="flex items-center gap-3"><Upload className="text-slate-400 group-hover:text-emerald-500" /> <span className="font-bold">Import Scale Data (CSV)</span></div>
          <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])} />
          <ChevronRight size={18} className="text-slate-300" />
        </label>
        
        <p className="text-[10px] text-slate-400 px-2 italic">CSV Format: Date, Weight, Tags (optional, semicolon separated)</p>
      </div>

      <button onClick={onReset} className="w-full p-4 bg-rose-50 text-rose-600 rounded-2xl font-bold hover:bg-rose-100 transition-all">Reset All Data</button>
    </motion.div>
  );
}

function LogModal({ onClose, onSave, unit, lastWeight }: any) {
  const [weight, setWeight] = useState(lastWeight?.toString() || '');
  const [tags, setTags] = useState<string[]>([]);
  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div 
        initial={{ y: '100%' }} 
        animate={{ y: 0 }} 
        exit={{ y: '100%' }} 
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-lg bg-white rounded-t-[32px] md:rounded-[40px] p-6 md:p-10 shadow-2xl"
      >
        <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6 md:hidden" />
        <div className="flex justify-between items-center mb-6 md:mb-8">
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
                className="text-6xl md:text-7xl font-black text-brand-600 w-48 md:w-56 text-center outline-none bg-transparent" 
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
    <div className="min-h-screen bg-brand-500 flex items-center justify-center p-4 md:p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="w-full max-w-md bg-white rounded-[32px] md:rounded-[40px] p-8 md:p-12 shadow-2xl"
      >
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8 text-center">
              <div className="w-20 h-20 bg-brand-50 text-brand-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
                <TrendingDown size={40} />
              </div>
              <div>
                <h2 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Pivot</h2>
                <p className="text-slate-500 font-medium">Weight tracking, redefined.</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setUnit('lbs')} className={cn("flex-1 py-4 rounded-2xl font-bold transition-all active:scale-95", unit === 'lbs' ? "bg-brand-500 text-white shadow-lg shadow-brand-100" : "bg-slate-100 text-slate-500")}>lbs</button>
                <button onClick={() => setUnit('kg')} className={cn("flex-1 py-4 rounded-2xl font-bold transition-all active:scale-95", unit === 'kg' ? "bg-brand-500 text-white shadow-lg shadow-brand-100" : "bg-slate-100 text-slate-500")}>kg</button>
              </div>
              <button onClick={() => setStep(2)} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all">Get Started</button>
            </motion.div>
          ) : (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-black text-slate-900">Set Your Goal</h2>
                <p className="text-slate-500 text-sm">We'll break this down into milestones.</p>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Current Weight</label>
                  <input type="number" step="0.1" value={currentWeight} onChange={(e) => setCurrentWeight(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl text-xl font-bold outline-none focus:ring-2 focus:ring-brand-500/20 transition-all" placeholder="0.0" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Goal Weight</label>
                  <input type="number" step="0.1" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl text-xl font-bold outline-none focus:ring-2 focus:ring-brand-500/20 transition-all" placeholder="0.0" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Milestone Size ({unit})</label>
                  <select value={milestoneSize} onChange={(e) => setMilestoneSize(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-brand-500/20 transition-all appearance-none">
                    <option value="2">2 {unit} chunks</option>
                    <option value="5">5 {unit} chunks</option>
                    <option value="10">10 {unit} chunks</option>
                  </select>
                </div>
              </div>
              <button 
                onClick={() => onComplete({ unit, startWeight: parseFloat(currentWeight), startDate: new Date().toISOString(), targetWeight: parseFloat(targetWeight), milestoneSize: parseFloat(milestoneSize) })} 
                disabled={!currentWeight || !targetWeight}
                className="w-full py-5 bg-brand-500 text-white rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all disabled:opacity-50"
              >
                Start Journey
              </button>
              <button onClick={() => setStep(1)} className="w-full py-2 text-slate-400 font-bold text-sm">Back</button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
