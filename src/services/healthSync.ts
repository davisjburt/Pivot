import { Capacitor } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";
import type { WeightUnit } from "../types";

const LB_TO_KG = 0.45359237;

export function isNativeHealthSupported(): boolean {
  return Capacitor.isNativePlatform();
}

/** Prompts for HealthKit / Health Connect write access for body mass. */
export async function requestSystemHealthWriteAccess(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const { available } = await Health.isAvailable();
  if (!available) return false;
  const status = await Health.requestAuthorization({
    write: ["weight"],
  });
  return status.writeAuthorized.includes("weight");
}

export async function saveLoggedWeightToSystemHealth(
  weight: number,
  unit: WeightUnit,
  dateIso: string,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { available } = await Health.isAvailable();
  if (!available) return;

  const check = await Health.checkAuthorization({
    write: ["weight"],
  });
  if (!check.writeAuthorized.includes("weight")) return;

  const kg = unit === "kg" ? weight : weight * LB_TO_KG;
  await Health.saveSample({
    dataType: "weight",
    value: kg,
    startDate: dateIso,
    endDate: dateIso,
  });
}
