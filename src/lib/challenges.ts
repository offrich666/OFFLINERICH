export type ChallengeProgram = "instant" | "one-step" | "two-step";

export type AccountSize =
  | 5000
  | 10000
  | 25000
  | 50000
  | 100000
  | 200000
  | 500000
  | 1000000;

export const ACCOUNT_SIZES: AccountSize[] = [
  5000, 10000, 25000, 50000, 100000, 200000, 500000, 1000000,
];

export const PROGRAMS: {
  id: ChallengeProgram;
  name: string;
  tagline: string;
  phases: string;
}[] = [
  {
    id: "instant",
    name: "Instant Funded",
    tagline: "Trade funded capital from day one. No evaluation phase.",
    phases: "Funded immediately",
  },
  {
    id: "one-step",
    name: "One-Step Challenge",
    tagline: "Hit the profit target once. 24% less than Instant.",
    phases: "1 evaluation → Funded",
  },
  {
    id: "two-step",
    name: "Two-Step Challenge",
    tagline: "Classic path. Lowest fee. Two phases to funded.",
    phases: "Phase 1 → Phase 2 → Funded",
  },
];

/** Instant 5K = $500 (reactivation package). One-step = −24%. Two-step starts near $50. */
const INSTANT_PRICES: Record<AccountSize, number> = {
  5000: 500,
  10000: 750,
  25000: 1200,
  50000: 2000,
  100000: 3500,
  200000: 6000,
  500000: 12000,
  1000000: 20000,
};

const TWO_STEP_PRICES: Record<AccountSize, number> = {
  5000: 59,
  10000: 99,
  25000: 189,
  50000: 299,
  100000: 499,
  200000: 899,
  500000: 1699,
  1000000: 2899,
};

export function getChallengePrice(
  program: ChallengeProgram,
  size: AccountSize,
): number {
  if (program === "instant") return INSTANT_PRICES[size];
  if (program === "two-step") return TWO_STEP_PRICES[size];
  // one-step: 24% cheaper than instant
  return Math.round(INSTANT_PRICES[size] * 0.76);
}

export function formatAccountSize(size: number): string {
  if (size >= 1000000) return "$1M";
  if (size >= 1000) return `$${Math.round(size / 1000)}K`;
  return `$${size}`;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function parseProgram(value: string): ChallengeProgram | null {
  if (value === "instant" || value === "one-step" || value === "two-step") {
    return value;
  }
  return null;
}

export function parseAccountSize(value: string | number): AccountSize | null {
  const n = typeof value === "number" ? value : Number(value);
  return (ACCOUNT_SIZES as number[]).includes(n) ? (n as AccountSize) : null;
}

export function programLabel(program: ChallengeProgram): string {
  return PROGRAMS.find((p) => p.id === program)?.name ?? program;
}

/** Rules snapshot shown on challenge cards / dashboard. */
export const RULES = {
  profitTargetOneStep: "10%",
  profitTargetTwoStepP1: "8%",
  profitTargetTwoStepP2: "5%",
  maxDailyLoss: "5%",
  maxOverallLoss: "10%",
  minTradingDays: 5,
  profitSplit: "80%",
  payoutCycle: "Bi-weekly",
};

export const REACTIVATION = {
  program: "instant" as ChallengeProgram,
  size: 5000 as AccountSize,
  price: 500,
  unlocksProfitUsd: 1500,
  description:
    "Activate your legacy $10K profit balance ($1,500) by purchasing a new Instant 5K package.",
};
