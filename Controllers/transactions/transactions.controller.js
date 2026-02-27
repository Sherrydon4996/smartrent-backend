//UI users
/**
 * paymentUpdateModal.tsx
 */

// File: controllers/transactionController.js

import { db } from "../../config/db.js";
import { v4 as uuidv4 } from "uuid";

const GARBAGE_FEE = 150;

export const upsertTransaction = async (req, res, next) => {
  const { tenantId, transaction, record } = req.body;

  if (!tenantId || !transaction) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  try {
    // Get tenant monthly rent and current credit
    const tenantResult = await db.execute({
      sql: `SELECT monthlyRent, tenant_credit FROM tenants WHERE id = ?`,
      args: [tenantId],
    });

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    const monthlyRent = Number(tenantResult.rows[0].monthlyRent);
    const currentTenantCredit = Number(tenantResult.rows[0].tenant_credit) || 0;

    // Fetch current monthly record
    const monthlyResult = await db.execute({
      sql: `SELECT * FROM monthly_payments WHERE tenant_id = ? AND month = ? AND year = ?`,
      args: [tenantId, transaction.month, transaction.year],
    });

    let currentRecord = {
      rentPaid: 0,
      waterPaid: 0,
      garbagePaid: 0,
      penaltiesPaid: 0,
      depositPaid: 0,
      waterBill: 0,
      penalties: 0,
      balanceDue: 0,
    };

    if (monthlyResult.rows.length > 0) {
      currentRecord = monthlyResult.rows[0];
    }

    let currentWaterBill = Number(currentRecord.waterBill);
    if (transaction.waterBill > 0) {
      currentWaterBill = Number(transaction.waterBill);
    }

    const penalties = 0;

    const alreadyRent = Number(currentRecord.rentPaid) || 0;
    const alreadyWater = Number(currentRecord.waterPaid) || 0;
    const alreadyGarbage = Number(currentRecord.garbagePaid) || 0;
    const alreadyPenalty = Number(currentRecord.penaltiesPaid) || 0;
    const alreadyTotal =
      alreadyRent + alreadyWater + alreadyGarbage + alreadyPenalty;

    const totalDue = monthlyRent + currentWaterBill + GARBAGE_FEE + penalties;

    let amounts = {
      rent: parseFloat(transaction.rent) || 0,
      water: parseFloat(transaction.water) || 0,
      garbage: parseFloat(transaction.garbage) || 0,
      penalty: parseFloat(transaction.penalty) || 0,
    };

    let remainings = {
      rent: monthlyRent - alreadyRent,
      water: currentWaterBill - alreadyWater,
      garbage: GARBAGE_FEE - alreadyGarbage,
      penalty: penalties - alreadyPenalty,
    };

    let effectives = { rent: 0, water: 0, garbage: 0, penalty: 0 };
    let excess = 0;

    Object.keys(amounts).forEach((cat) => {
      const newAm = amounts[cat];
      const rem = remainings[cat];
      effectives[cat] = Math.min(newAm, rem);
      excess += newAm - effectives[cat];
      remainings[cat] -= effectives[cat];
    });

    const order = ["penalty", "water", "garbage", "rent"];

    while (excess > 0) {
      let allocated = false;
      order.forEach((cat) => {
        if (remainings[cat] > 0 && excess > 0) {
          const add = Math.min(excess, remainings[cat]);
          effectives[cat] += add;
          remainings[cat] -= add;
          excess -= add;
          allocated = true;
        }
      });
      if (!allocated) break;
    }

    const effectiveTotal = Object.values(effectives).reduce(
      (sum, val) => sum + val,
      0,
    );
    const originalBillPayment = Object.values(amounts).reduce(
      (sum, val) => sum + val,
      0,
    );
    const newTotalPaid = alreadyTotal + effectiveTotal;
    const newBalanceDue = Math.max(0, totalDue - newTotalPaid);
    const advanceAmount = excess; // This goes to tenant_credit
    const newDeposit = parseFloat(transaction.deposit) || 0;

    // 1. Insert current transaction (with effective allocation)
    await db.execute({
      sql: `INSERT INTO transactions (
        id, tenant_id, waterBill, TotalAmount,
        rent, water, garbage, penalty, deposit,
        method, reference, date, timestamp, month, year, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        transaction.id,
        tenantId,
        currentWaterBill,
        originalBillPayment + newDeposit,
        effectives.rent,
        effectives.water,
        effectives.garbage,
        effectives.penalty,
        newDeposit,
        transaction.method,
        transaction.reference,
        transaction.date,
        transaction.timestamp,
        transaction.month,
        transaction.year,
        transaction.notes || "",
      ],
    });

    // 2. Update current month's monthly_payments (NO advanceBalance stored here)
    const monthlyId = uuidv4();

    await db.execute({
      sql: `INSERT INTO monthly_payments (
        id, tenant_id, month, year,
        rentPaid, waterPaid, garbagePaid, depositPaid, penaltiesPaid,
        penalties, balanceDue, waterBill, lastUpdated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, month, year) DO UPDATE SET
        rentPaid = rentPaid + excluded.rentPaid,
        waterPaid = waterPaid + excluded.waterPaid,
        garbagePaid = garbagePaid + excluded.garbagePaid,
        depositPaid = depositPaid + excluded.depositPaid,
        penaltiesPaid = penaltiesPaid + excluded.penaltiesPaid,
        balanceDue = excluded.balanceDue,
        waterBill = excluded.waterBill,
        lastUpdated = excluded.lastUpdated`,
      args: [
        monthlyId,
        tenantId,
        transaction.month,
        transaction.year,
        effectives.rent,
        effectives.water,
        effectives.garbage,
        newDeposit,
        effectives.penalty,
        penalties,
        newBalanceDue,
        currentWaterBill,
        transaction.timestamp,
      ],
    });

    // 3. Update tenant_credit in tenants table (ONLY place where advance is stored)
    if (advanceAmount > 0) {
      await db.execute({
        sql: `UPDATE tenants SET tenant_credit = tenant_credit + ? WHERE id = ?`,
        args: [advanceAmount, tenantId],
      });
    }

    // 4. Return updated record
    const newTenantCredit = currentTenantCredit + advanceAmount;

    const returnedRecord = {
      ...record,
      rentPaid: alreadyRent + effectives.rent,
      waterPaid: alreadyWater + effectives.water,
      garbagePaid: alreadyGarbage + effectives.garbage,
      penaltiesPaid: alreadyPenalty + effectives.penalty,
      depositPaid: (record.depositPaid || 0) + newDeposit,
      balanceDue: newBalanceDue,
      waterBill: currentWaterBill,
      effectiveRentPaid: alreadyRent + effectives.rent,
      effectiveWaterPaid: alreadyWater + effectives.water,
      effectiveGarbagePaid: alreadyGarbage + effectives.garbage,
      effectivePenaltiesPaid: alreadyPenalty + effectives.penalty,
      tenantCredit: newTenantCredit, // Global credit
    };

    res.status(200).json({
      success: true,
      message: "Transaction saved successfully",
      record: returnedRecord,
      creditAdded: advanceAmount > 0 ? advanceAmount : null,
      totalTenantCredit: newTenantCredit,
    });
  } catch (err) {
    console.error("Error upserting transaction:", err);
    next(err);
  }
};
