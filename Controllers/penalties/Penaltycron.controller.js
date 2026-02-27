// controllers/penalties/Penaltycron.controller.js

import cron from "node-cron";
import { v4 as uuidv4 } from "uuid";
import { calculatePenalties } from "../../utils/penaltyCalculator.js";
import { db } from "../../config/db.js";

/**
 * Update penalties for all active tenants automatically.
 * Runs daily, calculates penalties for the current month,
 * and updates the monthly_payments table with the latest accumulated penalty.
 */
const updateAllPenaltiesAutomatically = async (referenceDate = new Date()) => {
  try {
    console.log("🔄 Starting automatic daily penalty calculation...");

    const currentMonth = referenceDate.toLocaleString("default", {
      month: "long",
    });
    const currentYear = referenceDate.getFullYear();

    // Get all active tenants
    const tenantsResult = await db.execute({
      sql: `SELECT id, buildingName, monthlyRent FROM tenants WHERE status = 'active'`,
      args: [],
    });

    const tenants = tenantsResult.rows;
    let updatedCount = 0;
    let errorCount = 0;

    for (const tenant of tenants) {
      try {
        // Get current month's payment record
        const monthlyResult = await db.execute({
          sql: `SELECT rentPaid, penalties FROM monthly_payments 
                WHERE tenant_id = ? AND month = ? AND year = ?`,
          args: [tenant.id, currentMonth, currentYear],
        });

        const currentRentPaid =
          monthlyResult.rows.length > 0
            ? Number(monthlyResult.rows[0].rentPaid)
            : 0;

        // Calculate penalties using shared utility
        const calculatedPenalty = await calculatePenalties(
          tenant.id,
          tenant.buildingName,
          currentRentPaid,
          Number(tenant.monthlyRent),
          currentMonth,
          currentYear,
          referenceDate,
        );

        // Update monthly_payments with new penalty (use MAX to make it non-decreasing)
        const monthlyId = uuidv4();

        await db.execute({
          sql: `INSERT INTO monthly_payments (
            id, tenant_id, month, year,
            rentPaid, waterPaid, garbagePaid, depositPaid, penaltiesPaid,
            penalties, balanceDue, advanceBalance, waterBill, lastUpdated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id, month, year) DO UPDATE SET
            penalties = MAX(penalties, excluded.penalties),
            lastUpdated = excluded.lastUpdated`,
          args: [
            monthlyId,
            tenant.id,
            currentMonth,
            currentYear,
            currentRentPaid,
            0,
            0,
            0,
            0,
            calculatedPenalty,
            0,
            0,
            0,
            referenceDate.toISOString(),
          ],
        });

        if (calculatedPenalty > 0) {
          updatedCount++;
        }
      } catch (tenantError) {
        console.error(`❌ Error processing tenant ${tenant.id}:`, tenantError);
        errorCount++;
      }
    }

    console.log(`✅ Penalty calculation completed:`);
    console.log(`   - Total tenants processed: ${tenants.length}`);
    console.log(`   - Tenants with penalties: ${updatedCount}`);
    console.log(`   - Errors: ${errorCount}`);
  } catch (error) {
    console.error("❌ Error in penalty calculation cron job:", error);
  }
};

/**
 * Start the cron job.
 * Schedule: Every day at 12:01 AM (midnight).
 */
export const startPenaltyCron = () => {
  cron.schedule("1 0 * * *", async () => {
    console.log(
      `⏰ Running penalty calculation cron job at ${new Date().toISOString()}`,
    );
    await updateAllPenaltiesAutomatically();
  });

  console.log(
    "✅ Penalty calculation cron job initialized (runs daily at 12:01 AM)",
  );
};

export { updateAllPenaltiesAutomatically };
