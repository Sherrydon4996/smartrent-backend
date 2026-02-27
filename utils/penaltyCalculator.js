// utils/penaltyCalculator.js

import { db } from "../config/db.js";

/**
 * Helper function to get month index (0-11).
 */
export const getMonthIndex = (monthName) => {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months.indexOf(monthName);
};

/**
 * Calculate penalties for a tenant based on outstanding rent balance.
 *
 * @param {string} tenantId - The tenant's ID.
 * @param {string} buildingName - The building name.
 * @param {number} currentMonthRentPaid - Amount of rent already paid this month.
 * @param {number} monthlyRent - The tenant's monthly rent amount.
 * @param {string} month - Month name (e.g., "January").
 * @param {number} year - Year.
 * @param {Date} [referenceDate=new Date()] - The date to calculate as-of.
 * @returns {Promise<number>} - Total accumulated penalties (0 if none).
 *
 * LOGIC:
 * - Effective due: 5th, or entry + 5 days if entered after 5th in this month.
 * - Penalty on outstanding rent only.
 * - Formula: (outstanding × percentage / 100) × daysLate (capped at month end).
 * - No penalty if paid on time, no outstanding, or in grace period.
 * - Accumulative: Caller should use MAX with previous to prevent decrease.
 */
export const calculatePenalties = async (
  tenantId,
  buildingName,
  currentMonthRentPaid,
  monthlyRent,
  month,
  year,
  referenceDate = new Date(),
) => {
  try {
    const outstandingRent = Math.max(0, monthlyRent - currentMonthRentPaid);
    if (outstandingRent <= 0) {
      return 0;
    }

    // Get tenant entry date
    const tenantResult = await db.execute({
      sql: `SELECT entryDate FROM tenants WHERE id = ?`,
      args: [tenantId],
    });

    if (tenantResult.rows.length === 0) {
      return 0;
    }

    const entryDate = new Date(tenantResult.rows[0].entryDate);
    const entryMonth = entryDate.toLocaleString("default", { month: "long" });
    const entryYear = entryDate.getFullYear();

    // Get building penalty percentage
    const buildingResult = await db.execute({
      sql: `SELECT id FROM buildings WHERE name = ?`,
      args: [buildingName],
    });

    if (buildingResult.rows.length === 0) {
      return 0;
    }

    const buildingId = buildingResult.rows[0].id;

    const penaltyResult = await db.execute({
      sql: `SELECT percentage FROM penalties WHERE building_id = ?`,
      args: [buildingId],
    });

    if (penaltyResult.rows.length === 0) {
      return 0;
    }

    const penaltyPercentage = Number(penaltyResult.rows[0].percentage);

    // Calculate effective due date
    const monthIndex = getMonthIndex(month);
    let effectiveDue = new Date(year, monthIndex, 5);

    if (entryMonth === month && entryYear === year) {
      const graceDue = new Date(entryDate);
      graceDue.setDate(graceDue.getDate() + 5);
      if (graceDue > effectiveDue) {
        effectiveDue = graceDue;
      }
    }

    // Cap reference date at end of month
    const monthEnd = new Date(year, monthIndex + 1, 0);
    const effectiveRefDate =
      referenceDate > monthEnd ? monthEnd : referenceDate;

    // If not yet due, no penalty
    if (effectiveRefDate <= effectiveDue) {
      return 0;
    }

    // Calculate days late
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysLate = Math.floor(
      (effectiveRefDate.getTime() - effectiveDue.getTime()) / msPerDay,
    );

    if (daysLate <= 0) {
      return 0;
    }

    // Calculate total penalty
    const dailyPenalty = (outstandingRent * penaltyPercentage) / 100;
    const totalPenalty = Math.round(dailyPenalty * daysLate);

    return totalPenalty;
  } catch (error) {
    console.error("Error calculating penalties:", error);
    return 0;
  }
};
