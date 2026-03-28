import { WeightEntry, UserGoal } from '../types';
import { subDays, isSameDay, parseISO, differenceInDays, addDays, startOfDay } from 'date-fns';

export const analyticsService = {
  // Exponential Moving Average for smoothing
  getTrendData: (entries: WeightEntry[], windowSize = 10) => {
    if (entries.length === 0) return [];
    
    const sorted = [...entries].sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
    const alpha = 2 / (windowSize + 1);
    
    let currentEMA = sorted[0].weight;
    
    return sorted.map((entry, index) => {
      if (index === 0) {
        return { ...entry, trendWeight: currentEMA };
      }
      currentEMA = (entry.weight * alpha) + (currentEMA * (1 - alpha));
      return {
        ...entry,
        trendWeight: currentEMA
      };
    });
  },

  getMilestones: (goal: UserGoal) => {
    if (!goal) return [];
    const { startWeight, targetWeight, milestoneSize } = goal;
    const isLosing = targetWeight < startWeight;
    const totalDiff = Math.abs(startWeight - targetWeight);
    const count = Math.ceil(totalDiff / milestoneSize);
    
    const milestones = [];
    for (let i = 1; i <= count; i++) {
      const weight = isLosing 
        ? startWeight - (i * milestoneSize)
        : startWeight + (i * milestoneSize);
      
      // Don't overshoot the goal
      const finalWeight = isLosing 
        ? Math.max(weight, targetWeight)
        : Math.min(weight, targetWeight);
        
      milestones.push({
        id: i,
        target: finalWeight,
        label: `Milestone ${i}`
      });
      
      if (finalWeight === targetWeight) break;
    }
    return milestones;
  },

  getCompletedMilestones: (entries: WeightEntry[], goal: UserGoal) => {
    if (entries.length === 0 || !goal) return [];
    const milestones = analyticsService.getMilestones(goal);
    const trendData = analyticsService.getTrendData(entries);
    const latestTrend = trendData[trendData.length - 1].trendWeight;
    const isLosing = goal.targetWeight < goal.startWeight;

    return milestones.filter(m => isLosing ? latestTrend <= m.target : latestTrend >= m.target);
  },

  getRateOfChange: (entries: WeightEntry[], days = 30, windowSize = 10) => {
    if (entries.length < 2) return 0;
    const trendData = analyticsService.getTrendData(entries, windowSize);
    const latest = trendData[trendData.length - 1];
    
    // Find the entry closest to 'days' ago by searching backwards
    let past = trendData[0];
    for (let i = trendData.length - 2; i >= 0; i--) {
      const d = differenceInDays(parseISO(latest.date), parseISO(trendData[i].date));
      if (d >= days) {
        past = trendData[i];
        break;
      }
    }
    
    const diffDays = Math.max(1, differenceInDays(parseISO(latest.date), parseISO(past.date)));
    return (latest.trendWeight - past.trendWeight) / diffDays; // per day
  },

  getPredictions: (entries: WeightEntry[], goal: UserGoal, windowSize = 10) => {
    if (entries.length < 7 || !goal) return null;
    
    const trendData = analyticsService.getTrendData(entries, windowSize);
    const latest = trendData[trendData.length - 1];
    const ratePerDay = analyticsService.getRateOfChange(entries, 30, windowSize);
    
    const currentTrend = latest.trendWeight;
    const remaining = Math.abs(currentTrend - goal.targetWeight);
    
    // Check if moving in wrong direction
    const isLosing = goal.targetWeight < goal.startWeight;
    if ((isLosing && ratePerDay >= 0) || (!isLosing && ratePerDay <= 0)) return null;

    const absRate = Math.abs(ratePerDay);
    const latestDate = parseISO(latest.date);
    
    return {
      likely: addDays(latestDate, Math.round(remaining / absRate)),
      optimistic: addDays(latestDate, Math.round(remaining / (absRate * 1.15))),
      pessimistic: addDays(latestDate, Math.round(remaining / (absRate * 0.85)))
    };
  },

  detectSpikes: (entries: WeightEntry[], windowSize = 10) => {
    if (entries.length < 2) return [];
    const trendData = analyticsService.getTrendData(entries, windowSize);
    return trendData.filter(e => Math.abs(e.weight - e.trendWeight) > (e.trendWeight * 0.01));
  }
};
