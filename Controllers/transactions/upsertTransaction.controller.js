// controllers/transactions/transactionController.js

import { db } from "../../config/db.js";
import { v4 as uuidv4 } from "uuid";
import { calculatePenalties } from "../../utils/penaltyCalculator.js";

/**
 * Manual endpoint to force-recalculate and update penalties for all active tenants
 * @route POST /api/v1/penalties/calculate
 */
export const updateAllPenalties = async (req, res, next) => {
  try {
    const referenceDate = new Date();
    const currentMonth = referenceDate.toLocaleString("default", {
      month: "long",
    });
    const currentYear = referenceDate.getFullYear();

    const tenantsResult = await db.execute({
      sql: `SELECT id, buildingName, monthlyRent FROM tenants WHERE status = 'active'`,
      args: [],
    });

    const tenants = tenantsResult.rows;
    let updatedCount = 0;

    for (const tenant of tenants) {
      const monthlyResult = await db.execute({
        sql: `SELECT rentPaid, penalties FROM monthly_payments 
              WHERE tenant_id = ? AND month = ? AND year = ?`,
        args: [tenant.id, currentMonth, currentYear],
      });

      const currentRentPaid =
        monthlyResult.rows.length > 0
          ? Number(monthlyResult.rows[0].rentPaid)
          : 0;

      const calculatedPenalty = await calculatePenalties(
        tenant.id,
        tenant.buildingName,
        currentRentPaid,
        Number(tenant.monthlyRent),
        currentMonth,
        currentYear,
        referenceDate,
      );

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

      if (calculatedPenalty > 0) updatedCount++;
    }

    res.status(200).json({
      success: true,
      message: `Penalties updated for ${updatedCount} tenants`,
      updatedCount,
      totalTenantsProcessed: tenants.length,
    });
  } catch (error) {
    console.error("Error in updateAllPenalties:", error);
    next(error);
  }
};

export const upsertTransaction = async (req, res, next) => {
  const { tenantId, transaction, record } = req.body;

  if (!tenantId || !transaction) {
    return res.status(400).json({
      success: false,
      message:
        "Missing required fields: tenantId and transaction object required",
    });
  }

  try {
    const referenceDate = new Date();

    // 1. Fetch tenant data including per-tenant garbage bill
    const tenantResult = await db.execute({
      sql: `
        SELECT monthlyRent, tenant_credit, buildingName, garbageBill 
        FROM tenants 
        WHERE id = ?
      `,
      args: [tenantId],
    });

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    const tenant = tenantResult.rows[0];
    const monthlyRent = Number(tenant.monthlyRent);
    const currentCredit = Number(tenant.tenant_credit) || 0;
    const buildingName = tenant.buildingName;
    const garbageFee = Number(tenant.garbageBill) || 150; // fallback only if NULL

    // 2. Get current monthly summary (or defaults)
    const monthlyResult = await db.execute({
      sql: `
        SELECT * FROM monthly_payments 
        WHERE tenant_id = ? AND month = ? AND year = ?
      `,
      args: [tenantId, transaction.month, transaction.year],
    });

    const current = monthlyResult.rows[0] || {
      rentPaid: 0,
      waterPaid: 0,
      garbagePaid: 0,
      penaltiesPaid: 0,
      depositPaid: 0,
      waterBill: 0,
      penalties: 0,
      balanceDue: 0,
      advanceBalance: 0,
    };

    let currentWaterBill = Number(current.waterBill);
    if (
      typeof transaction.waterBill === "number" &&
      transaction.waterBill > 0
    ) {
      currentWaterBill = transaction.waterBill;
    }

    const storedPenalties = Number(current.penalties) || 0;

    let calculatedPenalties;
    if (storedPenalties > 0) {
      calculatedPenalties = storedPenalties;
    } else {
      const rentPaidBefore = Number(current.rentPaid) || 0;
      calculatedPenalties = await calculatePenalties(
        tenantId,
        buildingName,
        rentPaidBefore,
        monthlyRent,
        transaction.month,
        transaction.year,
        referenceDate,
      );
    }

    // Previous paid amounts
    const already = {
      rent: Number(current.rentPaid) || 0,
      water: Number(current.waterPaid) || 0,
      garbage: Number(current.garbagePaid) || 0,
      penalty: Number(current.penaltiesPaid) || 0,
    };

    const alreadyTotal =
      already.rent + already.water + already.garbage + already.penalty;

    // Total obligations this month
    const totalDueThisMonth =
      monthlyRent + currentWaterBill + garbageFee + calculatedPenalties;

    // Incoming payment amounts
    const incoming = {
      rent: Number(transaction.rent) || 0,
      water: Number(transaction.water) || 0,
      garbage: Number(transaction.garbage) || 0,
      penalty: Number(transaction.penalty) || 0,
    };

    // ✅ FIX: Remaining must never go below 0 — clamp with Math.max
    const remaining = {
      rent: Math.max(0, monthlyRent - already.rent),
      water: Math.max(0, currentWaterBill - already.water),
      garbage: Math.max(0, garbageFee - already.garbage),
      penalty: Math.max(0, calculatedPenalties - already.penalty),
    };

    // Allocate incoming payment (priority: penalty > water > garbage > rent)
    const allocated = { rent: 0, water: 0, garbage: 0, penalty: 0 };
    let excess = 0;

    // First pass: fill remaining obligations per category
    ["rent", "water", "garbage", "penalty"].forEach((cat) => {
      const paid = Math.min(incoming[cat], remaining[cat]);
      allocated[cat] = paid;
      excess += incoming[cat] - paid;
      remaining[cat] -= paid;
    });

    // Second pass: apply excess to remaining categories in priority order
    const priority = ["penalty", "water", "garbage", "rent"];
    while (excess > 0) {
      let applied = false;
      for (const cat of priority) {
        if (remaining[cat] > 0 && excess > 0) {
          const add = Math.min(excess, remaining[cat]);
          allocated[cat] += add;
          remaining[cat] -= add;
          excess -= add;
          applied = true;
        }
      }
      if (!applied) break;
    }

    const totalAllocated = Object.values(allocated).reduce((a, b) => a + b, 0);
    const newTotalPaid = alreadyTotal + totalAllocated;
    const newBalanceDue = Math.max(0, totalDueThisMonth - newTotalPaid);
    const advance = excess;
    const deposit = Number(transaction.deposit) || 0;

    // 4. Save the transaction
    await db.execute({
      sql: `
        INSERT INTO transactions (
          id, tenant_id, waterBill, TotalAmount,
          rent, water, garbage, penalty, deposit,
          method, reference, date, timestamp, month, year, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        transaction.id,
        tenantId,
        currentWaterBill,
        Object.values(incoming).reduce((a, b) => a + b, 0) + deposit,
        allocated.rent,
        allocated.water,
        allocated.garbage,
        allocated.penalty,
        deposit,
        transaction.method,
        transaction.reference,
        transaction.date,
        transaction.timestamp,
        transaction.month,
        transaction.year,
        transaction.notes || "",
      ],
    });

    // 5. Update monthly summary
    const monthlyId = uuidv4();
    await db.execute({
      sql: `
        INSERT INTO monthly_payments (
          id, tenant_id, month, year,
          rentPaid, waterPaid, garbagePaid, depositPaid, penaltiesPaid,
          penalties, balanceDue, advanceBalance, waterBill, lastUpdated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, month, year) DO UPDATE SET
          rentPaid       = rentPaid       + excluded.rentPaid,
          waterPaid      = waterPaid      + excluded.waterPaid,
          garbagePaid    = garbagePaid    + excluded.garbagePaid,
          depositPaid    = depositPaid    + excluded.depositPaid,
          penaltiesPaid  = penaltiesPaid  + excluded.penaltiesPaid,
          penalties      = MAX(penalties, excluded.penalties),
          balanceDue     = excluded.balanceDue,
          advanceBalance = excluded.advanceBalance,
          waterBill      = excluded.waterBill,
          lastUpdated    = excluded.lastUpdated
      `,
      args: [
        monthlyId,
        tenantId,
        transaction.month,
        transaction.year,
        allocated.rent,
        allocated.water,
        allocated.garbage,
        deposit,
        allocated.penalty,
        calculatedPenalties,
        newBalanceDue,
        advance,
        currentWaterBill,
        transaction.timestamp,
      ],
    });

    // 6. Update tenant's global credit (advance)
    if (advance > 0) {
      await db.execute({
        sql: `UPDATE tenants SET tenant_credit = tenant_credit + ? WHERE id = ?`,
        args: [advance, tenantId],
      });
    }

    // 7. Prepare response
    const updatedRecord = {
      ...(record || {}),
      rentPaid: already.rent + allocated.rent,
      waterPaid: already.water + allocated.water,
      garbagePaid: already.garbage + allocated.garbage,
      penaltiesPaid: already.penalty + allocated.penalty,
      depositPaid: (record?.depositPaid || 0) + deposit,
      balanceDue: newBalanceDue,
      advanceBalance: advance,
      waterBill: currentWaterBill,
      penalties: calculatedPenalties,
      garbageBill: garbageFee,
      tenantCredit: currentCredit + advance,
    };

    res.status(200).json({
      success: true,
      message: "Transaction recorded successfully",
      record: updatedRecord,
      creditAdded: advance > 0 ? advance : null,
      totalTenantCredit: currentCredit + advance,
      penaltiesCalculated: calculatedPenalties,
      garbageBillUsed: garbageFee,
    });
  } catch (err) {
    console.error("Error in upsertTransaction:", err);
    next(err);
  }
};
