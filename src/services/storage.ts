import { AppState, WeightEntry, UserGoal } from '../types';

const STORAGE_KEY = 'pivot_weight_tracker_data';

export const storageService = {
  saveData: (data: AppState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  loadData: (): AppState => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        goal: null,
        entries: [],
        onboarded: false,
        settings: {
          smoothingWindow: 10,
          hideRawNumbers: false,
        }
      };
    }
    const data = JSON.parse(saved);
    // Ensure settings exist for legacy data
    if (!data.settings) {
      data.settings = {
        smoothingWindow: 10,
        hideRawNumbers: false,
      };
    }
    return data;
  },

  exportData: () => {
    const data = storageService.loadData();
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
          const data = JSON.parse(e.target?.result as string);
          storageService.saveData(data);
          resolve(data);
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
