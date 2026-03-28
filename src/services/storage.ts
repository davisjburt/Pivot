import { AppState, WeightEntry, UserGoal } from '../types';

const STORAGE_KEY = 'pivot_weight_tracker_data';

export const storageService = {
  saveData: (data: AppState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  normalizeEntries: (rawEntries: any[]): WeightEntry[] => {
    if (!Array.isArray(rawEntries)) return [];
    return rawEntries.map(entry => {
      // Handle various key names (Date/date, Weight/weight, Tags/tags)
      const dateStr = entry.date || entry.Date || entry.time || entry.Time;
      const weightVal = entry.weight || entry.Weight || entry.value || entry.Value;
      const tagsRaw = entry.tags || entry.Tags || [];
      
      const weight = typeof weightVal === 'string' ? parseFloat(weightVal) : weightVal;
      const tags = Array.isArray(tagsRaw) 
        ? tagsRaw 
        : (typeof tagsRaw === 'string' ? tagsRaw.split(';').map((t: string) => t.trim()).filter(Boolean) : []);

      if (!dateStr || isNaN(weight)) return null;

      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;

      return {
        id: entry.id || crypto.randomUUID(),
        date: date.toISOString(),
        weight,
        tags
      };
    }).filter((e): e is WeightEntry => e !== null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  },

  validateData: (data: any): AppState => {
    const defaultState: AppState = {
      goal: null,
      entries: [],
      onboarded: false,
      settings: { smoothingWindow: 10, hideRawNumbers: false }
    };

    if (!data) return defaultState;

    // Case 1: Input is an array of entries
    if (Array.isArray(data)) {
      const entries = storageService.normalizeEntries(data);
      return {
        ...defaultState,
        entries,
        onboarded: false // Force onboarding to set a goal
      };
    }

    // Case 2: Input is an object (likely full AppState)
    if (typeof data === 'object') {
      const rawEntries = data.entries || data.WeightEntries || [];
      const entries = storageService.normalizeEntries(rawEntries);
      const goal = data.goal || null;

      return {
        goal,
        entries,
        onboarded: !!data.onboarded && goal !== null,
        settings: {
          smoothingWindow: typeof data.settings?.smoothingWindow === 'number' ? data.settings.smoothingWindow : 10,
          hideRawNumbers: !!data.settings?.hideRawNumbers,
        }
      };
    }

    return defaultState;
  },

  loadData: (): AppState => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return storageService.validateData({});
    }
    try {
      const data = JSON.parse(saved);
      return storageService.validateData(data);
    } catch (err) {
      return storageService.validateData({});
    }
  },

  exportData: (data: AppState) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pivot-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importData: (file: File): Promise<AppState> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const rawData = JSON.parse(e.target?.result as string);
          const validatedData = storageService.validateData(rawData);
          resolve(validatedData);
        } catch (err) {
          reject(new Error('Invalid file format'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  },

  importCsv: (file: File): Promise<WeightEntry[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n');
          const entries: WeightEntry[] = [];
          
          // Skip header if it exists
          const startIdx = lines[0].toLowerCase().includes('date') ? 1 : 0;
          
          for (let i = startIdx; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const [dateStr, weightStr, tagsStr] = line.split(',').map(s => s.trim());
            const weight = parseFloat(weightStr);
            
            if (!isNaN(weight) && dateStr) {
              const date = new Date(dateStr);
              if (!isNaN(date.getTime())) {
                entries.push({
                  id: crypto.randomUUID(),
                  date: date.toISOString(),
                  weight,
                  tags: tagsStr ? tagsStr.split(';').map(t => t.trim()) : []
                });
              }
            }
          }
          resolve(entries);
        } catch (err) {
          reject(new Error('Failed to parse CSV'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
};
