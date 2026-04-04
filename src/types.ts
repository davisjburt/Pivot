export type WeightUnit = 'lbs' | 'kg';

export interface UserGoal {
  targetWeight: number;
  targetDate?: string;
  startWeight: number;
  startDate: string;
  unit: WeightUnit;
  milestoneSize: number; // e.g., 5 lbs
}

export interface WeightEntry {
  id: string;
  date: string; // ISO string
  weight: number;
  note?: string;
  tags: string[];
}

export interface AppSettings {
  smoothingWindow: number; // default 10
  hideRawNumbers: boolean;
  darkMode: boolean;
  remindersEnabled?: boolean;
  reminderTime?: string;
  /** When true, each logged weight is written to Apple Health (iOS) or Health Connect (Android). */
  syncToSystemHealth?: boolean;
}

export interface AppState {
  uid?: string;
  email?: string;
  name?: string;
  goal: UserGoal | null;
  entries: WeightEntry[];
  onboarded: boolean;
  settings: AppSettings;
}

export const DEFAULT_TAGS = [
  'Ate Late',
  'High Sodium',
  'Travel',
  'Heavy Workout',
  'Poor Sleep',
  'Stress',
  'Sore',
];
