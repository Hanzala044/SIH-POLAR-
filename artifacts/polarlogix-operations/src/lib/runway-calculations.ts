export const DEFAULT_EMERGENCY_UPLIFT = 0.18;

function assertValidInputs(onHand: number, dailyBurn: number, uplift: number) {
  if (!Number.isFinite(onHand) || onHand < 0) {
    throw new Error("On-hand stock must be a finite, non-negative number.");
  }
  if (!Number.isFinite(dailyBurn) || dailyBurn <= 0) {
    throw new Error("Daily burn must be a finite number greater than zero.");
  }
  if (!Number.isFinite(uplift) || uplift < 0) {
    throw new Error("Emergency uplift must be a finite, non-negative fraction.");
  }
}

/**
 * Uses the approved operational runway expression:
 * runwayDays = Math.floor(onHand / dailyBurn * (1 - emergencyUplift))
 */
export function calculateRunwayDays(
  onHand: number,
  dailyBurn: number,
  emergencyUplift: number,
) {
  assertValidInputs(onHand, dailyBurn, emergencyUplift);
  if (emergencyUplift >= 1) {
    throw new Error("Runway uplift must be less than 1 (100%).");
  }

  return Math.floor((onHand / dailyBurn) * (1 - emergencyUplift));
}

/**
 * Uses the separately approved stock projection expression:
 * projectedLitresAtDayN = onHand - (dailyBurn * N * (1 + emergencyUpliftIfActive))
 *
 * Negative results are retained to show the modeled shortfall after stock-out.
 */
export function projectedLitresAtDayN(
  onHand: number,
  dailyBurn: number,
  day: number,
  emergencyUpliftIfActive: number,
) {
  assertValidInputs(onHand, dailyBurn, emergencyUpliftIfActive);
  if (!Number.isFinite(day) || day < 0) {
    throw new Error("Projection day must be a finite, non-negative number.");
  }

  return onHand - dailyBurn * day * (1 + emergencyUpliftIfActive);
}