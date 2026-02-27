// File: controllers/settlementController.js

import { db } from "../../config/db.js";
import { v4 as uuidv4 } from "uuid";

const GARBAGE_FEE = 150;

export const settlePaymentWithAdvance = async (req, res) => {
  const { tenantId, month, year } = req.body;

  if (!tenantId || !month || !year) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: tenantId, month, year",
    });
  }

  try {
    // 1. Get tenant details including tenant_credit
    const tenantResult = await db.execute({
      sql: `SELECT monthlyRent, garbageBill, tenant_credit FROM tenants WHERE id = ?`,
      args: [tenantId],
    });

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    const tenant = tenantResult.rows[0];
    const monthlyRent = Number(tenant.monthlyRent) || 0;
    const garbageBill = Number(tenant.garbageBill) || GARBAGE_FEE;
    const tenantCredit = Number(tenant.tenant_credit) || 0;

    // Check if there's any credit available
    if (tenantCredit <= 0) {
      return res.status(400).json({
        success: false,
        message: "No tenant credit available for settlement",
      });
    }

    // 2. Get or create monthly payment record
    const recordResult = await db.execute({
      sql: `SELECT * FROM monthly_payments 
            WHERE tenant_id = ? AND month = ? AND year = ?`,
      args: [tenantId, month, year],
    });

    let record;

    if (recordResult.rows.length === 0) {
      // Create a new monthly_payments record for this month
      const monthlyId = uuidv4();

      await db.execute({
        sql: `INSERT INTO monthly_payments (
          id, tenant_id, month, year,
          rentPaid, waterPaid, garbagePaid, depositPaid, penaltiesPaid,
          penalties, balanceDue, waterBill, lastUpdated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          monthlyId,
          tenantId,
          month,
          year,
          0, // rentPaid
          0, // waterPaid
          0, // garbagePaid
          0, // depositPaid
          0, // penaltiesPaid
          0, // penalties
          monthlyRent + 0 + garbageBill, // balanceDue (rent + water[0] + garbage)
          0, // waterBill starts at 0
          new Date().toISOString(),
        ],
      });

      // Fetch the newly created record
      const newRecordResult = await db.execute({
        sql: `SELECT * FROM monthly_payments 
              WHERE tenant_id = ? AND month = ? AND year = ?`,
        args: [tenantId, month, year],
      });

      record = newRecordResult.rows[0];
    } else {
      record = recordResult.rows[0];
    }

    // 3. Calculate outstanding balances for the selected month
    const rentPaid = Number(record.rentPaid) || 0;
    const waterPaid = Number(record.waterPaid) || 0;
    const garbagePaid = Number(record.garbagePaid) || 0;
    const waterBill = Number(record.waterBill) || 0; // Defaults to 0 if not set

    const rentOutstanding = Math.max(0, monthlyRent - rentPaid);
    const waterOutstanding = Math.max(0, waterBill - waterPaid);
    const garbageOutstanding = Math.max(0, garbageBill - garbagePaid);
    const totalOutstanding =
      rentOutstanding + waterOutstanding + garbageOutstanding;

    if (totalOutstanding <= 0) {
      return res.status(400).json({
        success: false,
        message: "No outstanding balance to settle for this month",
      });
    }

    // 4. Calculate settlement amount (use available tenant credit)
    const settlementAmount = Math.min(tenantCredit, totalOutstanding);

    // 5. Settle in priority order: rent -> garbage -> water
    let remainingSettlement = settlementAmount;
    const settlements = { rent: 0, garbage: 0, water: 0 };
    let newRentPaid = rentPaid;
    let newGarbagePaid = garbagePaid;
    let newWaterPaid = waterPaid;

    // Settle rent first
    if (rentOutstanding > 0 && remainingSettlement > 0) {
      const settleAmount = Math.min(rentOutstanding, remainingSettlement);
      settlements.rent = settleAmount;
      newRentPaid += settleAmount;
      remainingSettlement -= settleAmount;
    }

    // Then garbage
    if (garbageOutstanding > 0 && remainingSettlement > 0) {
      const settleAmount = Math.min(garbageOutstanding, remainingSettlement);
      settlements.garbage = settleAmount;
      newGarbagePaid += settleAmount;
      remainingSettlement -= settleAmount;
    }

    // Finally water
    if (waterOutstanding > 0 && remainingSettlement > 0) {
      const settleAmount = Math.min(waterOutstanding, remainingSettlement);
      settlements.water = settleAmount;
      newWaterPaid += settleAmount;
      remainingSettlement -= settleAmount;
    }

    const totalSettled =
      settlements.rent + settlements.garbage + settlements.water;
    const remainingCredit = tenantCredit - totalSettled;

    // Calculate new balance
    const newBalanceDue = Math.max(
      0,
      monthlyRent +
        waterBill +
        garbageBill -
        newRentPaid -
        newWaterPaid -
        newGarbagePaid,
    );

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timestamp = now.toISOString();

    // 6. Create settlement transaction
    const transactionId = `SETTLE-${Date.now()}`;

    await db.execute({
      sql: `INSERT INTO transactions (
        id, tenant_id, waterBill, totalAmount, rent, water, garbage, penalty, 
        deposit, method, reference, date, timestamp, month, year, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        transactionId,
        tenantId,
        waterBill,
        totalSettled,
        settlements.rent,
        settlements.water,
        settlements.garbage,
        0,
        0,
        "credit_settlement",
        `AUTO-SETTLE-${Date.now().toString().slice(-8)}`,
        dateStr,
        timestamp,
        month,
        year,
        `Settlement from tenant credit. Rent: ${settlements.rent}, Garbage: ${settlements.garbage}, Water: ${settlements.water}`,
      ],
    });

    // 7. Update the month's record
    await db.execute({
      sql: `UPDATE monthly_payments 
            SET rentPaid = ?,
                waterPaid = ?,
                garbagePaid = ?,
                balanceDue = ?,
                lastUpdated = ?
            WHERE tenant_id = ? AND month = ? AND year = ?`,
      args: [
        newRentPaid,
        newWaterPaid,
        newGarbagePaid,
        newBalanceDue,
        timestamp,
        tenantId,
        month,
        year,
      ],
    });

    // 8. Deduct from tenant_credit in tenants table
    await db.execute({
      sql: `UPDATE tenants SET tenant_credit = ? WHERE id = ?`,
      args: [remainingCredit, tenantId],
    });

    // 9. Fetch updated record
    const updatedRecordResult = await db.execute({
      sql: `SELECT * FROM monthly_payments 
            WHERE tenant_id = ? AND month = ? AND year = ?`,
      args: [tenantId, month, year],
    });

    return res.status(200).json({
      success: true,
      message: `Successfully settled ${totalSettled} from tenant credit for ${month} ${year}`,
      settlements: {
        rent: settlements.rent,
        garbage: settlements.garbage,
        water: settlements.water,
      },
      remainingTenantCredit: remainingCredit,
      totalSettled,
      updatedRecord: updatedRecordResult.rows[0],
    });
  } catch (error) {
    console.error("Settlement error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to settle payment with credit",
    });
  }
};
