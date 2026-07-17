export const PLAN_NAMES = ["free", "starter", "pro", "agency"] as const;

export type PlanName = (typeof PLAN_NAMES)[number];

const configuredFreeLimit = Number(process.env.FREE_MONTHLY_LEAD_LIMIT ?? 25);
const freeMonthlyLeadLimit =
  Number.isFinite(configuredFreeLimit) && configuredFreeLimit > 0 ? Math.floor(configuredFreeLimit) : 25;

export const PLANS: Record<
  PlanName,
  {
    label: string;
    monthlyLeadLimit: number;
    price: number;
  }
> = {
  free: {
    label: "Free",
    monthlyLeadLimit: freeMonthlyLeadLimit,
    price: 0,
  },
  starter: {
    label: "Starter",
    monthlyLeadLimit: 500,
    price: 19,
  },
  pro: {
    label: "Pro",
    monthlyLeadLimit: 2_500,
    price: 49,
  },
  agency: {
    label: "Agency",
    monthlyLeadLimit: 10_000,
    price: 99,
  },
};

export function isPlanName(value: unknown): value is PlanName {
  return typeof value === "string" && PLAN_NAMES.includes(value as PlanName);
}
