// File: controllers/fetchMonthlyTransactions.js

import dayjs from "dayjs";
import { db } from "../../config/db.js";

export const fetchMonthlyTransactions = async (req, res, next) => {
  const { month, year } = req.query;

  if (!month || !year) {
    return res.status(400).json({
      success: false,
      message: "Missing month or year",
    });
  }

  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) {
    return res.status(400).json({
      success: false,
      message: "Year must be a valid number",
    });
  }

  try {
    // ── 1. Get all active tenants ────────────────────────────────────────────
    const tenantsResult = await db.execute({
      sql: `
        SELECT 
          id, name, mobile, houseNumber, buildingName,
          monthlyRent,
          waterBill   AS defaultWaterBill,
          garbageBill,                        -- ✅ fetched per tenant
          status, entryDate, tenant_credit
        FROM tenants
        WHERE status = 'active'
        ORDER BY buildingName, houseNumber
      `,
      args: [],
    });

    const tenants = tenantsResult.rows;

    // ── 2. Get all transactions for the selected month/year in one query ─────
    const transactionsResult = await db.execute({
      sql: `
        SELECT 
          id, tenant_id, waterBill, TotalAmount,
          rent, water, garbage, penalty, deposit,
          method, reference, date, timestamp, notes
        FROM transactions
        WHERE month = ? AND year = ?
        ORDER BY timestamp DESC
      `,
      args: [month, yearNum],
    });

    const allTransactions = transactionsResult.rows;

    // ── 3. Build one record per tenant ───────────────────────────────────────
    const records = [];

    for (const tenant of tenants) {
      const tenantTransactions = allTransactions.filter(
        (t) => t.tenant_id === tenant.id,
      );

      // ── Water bill: prefer monthly_payments stored value, else latest tx, else tenant default
      let currentWaterBill = Number(tenant.defaultWaterBill) || 0;
      const latestWaterTx = tenantTransactions.find(
        (tx) => tx.waterBill != null && Number(tx.waterBill) > 0,
      );
      if (latestWaterTx) {
        currentWaterBill = Number(latestWaterTx.waterBill);
      }

      const garbageBill = Number(tenant.garbageBill) || 0;

      let penalties = 0;

      // ── Payment totals ───────────────────────────────────────────────────
      let rentPaid = 0;
      let waterPaid = 0;
      let garbagePaid = 0;
      let depositPaid = 0;
      let penaltiesPaid = 0;
      let balanceDue = 0;

      // ── Try to load from monthly_payments summary ────────────────────────
      const summaryResult = await db.execute({
        sql: `
          SELECT 
            rentPaid,
            waterPaid,
            garbagePaid,
            depositPaid,
            penaltiesPaid,
            penalties,        -- ✅ FIX 2: now fetched (was missing from SELECT)
            balanceDue,
            waterBill
          FROM monthly_payments
          WHERE tenant_id = ? 
            AND month = ? 
            AND year = ?
          LIMIT 1
        `,
        args: [tenant.id, month, yearNum],
      });

      if (summaryResult.rows.length > 0) {
        const summary = summaryResult.rows[0];
        rentPaid = Number(summary.rentPaid) || 0;
        waterPaid = Number(summary.waterPaid) || 0;
        garbagePaid = Number(summary.garbagePaid) || 0;
        depositPaid = Number(summary.depositPaid) || 0;
        penaltiesPaid = Number(summary.penaltiesPaid) || 0;
        balanceDue = Number(summary.balanceDue) || 0;

        penalties = Number(summary.penalties) || 0;

        if (summary.waterBill) {
          currentWaterBill = Number(summary.waterBill);
        }
      } else {
        // ── Fallback: calculate from raw transactions ──────────────────────
        tenantTransactions.forEach((tx) => {
          rentPaid += Number(tx.rent) || 0;
          waterPaid += Number(tx.water) || 0;
          garbagePaid += Number(tx.garbage) || 0;
          depositPaid += Number(tx.deposit) || 0;
          penaltiesPaid += Number(tx.penalty) || 0;
        });

        penalties = 0;

        const totalDueThisMonth =
          Number(tenant.monthlyRent) +
          currentWaterBill +
          garbageBill + // ✅ uses correct per-tenant value
          penalties;

        const totalPaidThisMonth =
          rentPaid + waterPaid + garbagePaid + penaltiesPaid;

        balanceDue = Math.max(0, totalDueThisMonth - totalPaidThisMonth);
      }

      // Use tenant_credit as advanceBalance for UI
      const advanceBalance = Number(tenant.tenant_credit) || 0;

      // ── Format transactions ──────────────────────────────────────────────
      const formattedTransactions = tenantTransactions.map((tx) => ({
        id: tx.id,
        tenantId: tx.tenant_id,
        amount: Number(tx.TotalAmount) || 0,
        type: "rent",
        method: tx.method,
        reference: tx.reference,
        date: tx.date,
        timestamp: tx.timestamp,
        month,
        year: yearNum,
        notes: tx.notes || "",
      }));

      records.push({
        tenantId: tenant.id,
        name: tenant.name,
        houseNumber: tenant.houseNumber,
        mobile: tenant.mobile,
        buildingName: tenant.buildingName,
        monthlyRent: Number(tenant.monthlyRent) || 0,
        waterBill: currentWaterBill,
        garbageBill, // ✅ per-tenant value
        month,
        year: yearNum,
        rentPaid,
        waterPaid,
        garbagePaid,
        depositPaid,
        penaltiesPaid,
        penalties, // ✅ actual penalty charge owed
        balanceDue,
        advanceBalance, // tenant_credit from tenants table
        transactions: formattedTransactions,
        lastUpdated: tenantTransactions[0]?.timestamp || null,
        status: tenant.status,
        effectiveRentPaid: rentPaid,
        effectiveWaterPaid: waterPaid,
        effectiveGarbagePaid: garbagePaid,
        effectivePenaltiesPaid: penaltiesPaid,
      });
    }

    return res.status(200).json({
      success: true,
      count: records.length,
      month,
      year: yearNum,
      records,
    });
  } catch (err) {
    console.error("Error fetching monthly transactions:", err);
    next(err);
  }
};
