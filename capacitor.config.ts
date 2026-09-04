import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pivot.weighttracker",
  appName: "Pivot",
  webDir: "dist/client",
  ios: {
    contentInset: "automatic",
  },
};

export default config;
