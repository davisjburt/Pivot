import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pivot.weighttracker",
  appName: "Pivot",
  webDir: "dist",
  ios: {
    contentInset: "automatic",
  },
};

export default config;
