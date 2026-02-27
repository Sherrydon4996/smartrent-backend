import { db } from "../../config/db.js";

/**
 * Get all monthly records + transactions for a specific tenant
 * GET /api/v1/tenants/:tenantId/monthly-records
 */
export const getTenantMonthlyRecords = async (req, res, next) => {
  const { tenantId } = req.params;

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      message: "Tenant ID required",
    });
  }

  try {
    // 1. Get tenant info (for fixed charges)
    const tenantResult = await db.execute({
      sql: `SELECT id, name, monthlyRent, waterBill, garbageBill FROM tenants WHERE id = ?`,
      args: [tenantId],
    });

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    const tenant = tenantResult.rows[0];
    const GARBAGE_FEE = Number(tenant.garbageBill) || 200;

    // 2. Get all monthly payment records
    const monthlyResult = await db.execute({
      sql: `
        SELECT 
          tenant_id AS tenantId,
          month,
          year,
          rentPaid,
          waterPaid,
          garbagePaid,
          depositPaid,
          penaltiesPaid,
          penalties,
          balanceDue,
          advanceBalance,
          waterBill,
          lastUpdated
        FROM monthly_payments
        WHERE tenant_id = ?
        ORDER BY 
          year DESC,
          CASE month
            WHEN 'December' THEN 12
            WHEN 'November' THEN 11
            WHEN 'October' THEN 10
            WHEN 'September' THEN 9
            WHEN 'August' THEN 8
            WHEN 'July' THEN 7
            WHEN 'June' THEN 6
            WHEN 'May' THEN 5
            WHEN 'April' THEN 4
            WHEN 'March' THEN 3
            WHEN 'February' THEN 2
            WHEN 'January' THEN 1
          END DESC
      `,
      args: [tenantId],
    });

    // 3. Get all transactions for this tenant
    const transactionsResult = await db.execute({
      sql: `
        SELECT 
          id,
          tenant_id AS tenantId,
          TotalAmount,
          rent,
          water,
          garbage,
          penalty,
          deposit,
          method,
          reference,
          date,
          timestamp,
          month,
          year,
          notes
        FROM transactions
        WHERE tenant_id = ?
        ORDER BY timestamp DESC
      `,
      args: [tenantId],
    });

    // 4. Group transactions by month/year
    const transactionsByMonth = {};
    transactionsResult.rows.forEach((tx) => {
      const key = `${tx.month}-${tx.year}`;
      if (!transactionsByMonth[key]) {
        transactionsByMonth[key] = [];
      }
      transactionsByMonth[key].push({
        id: tx.id,
        tenantId: tx.tenantId,
        TotalAmount: Number(tx.TotalAmount),
        rent: Number(tx.rent),
        water: Number(tx.water),
        garbage: Number(tx.garbage),
        penalty: Number(tx.penalty),
        deposit: Number(tx.deposit),
        method: tx.method,
        reference: tx.reference,
        date: tx.date,
        timestamp: tx.timestamp,
        month: tx.month,
        year: tx.year,
        notes: tx.notes,
      });
    });

    // 5. Combine monthly records with their transactions and calculate properly
    const records = monthlyResult.rows.map((r) => {
      const key = `${r.month}-${r.year}`;
      const transactions = transactionsByMonth[key] || [];

      // Get the actual amounts paid from monthly_payments OR calculate from transactions
      const rentPaid = Number(r.rentPaid) || 0;
      const waterPaid = Number(r.waterPaid) || 0;
      const garbagePaid = Number(r.garbagePaid) || 0;
      const depositPaid = Number(r.depositPaid) || 0;
      const penaltiesPaid = Number(r.penaltiesPaid) || 0;

      // Calculate what was due for this month
      const monthlyRent = Number(tenant.monthlyRent);
      const waterBill = Number(r.waterBill) || Number(tenant.waterBill);
      const totalDue =
        monthlyRent + waterBill + GARBAGE_FEE + Number(r.penalties);

      // Calculate total paid (excluding deposit)
      const totalPaidThisMonth =
        rentPaid + waterPaid + garbagePaid + penaltiesPaid;

      // Calculate balance
      const balanceDue = Math.max(0, totalDue - totalPaidThisMonth);

      return {
        tenantId: r.tenantId,
        month: r.month,
        year: r.year,
        monthlyRent,
        waterBill,
        garbageBill: GARBAGE_FEE,
        penalties: Number(r.penalties),

        // Actual payments
        rentPaid,
        waterPaid,
        garbagePaid,
        depositPaid,
        penaltiesPaid,

        // Effective payments (same as actual for now - implement carry-forward later)
        carriedForward: 0,
        effectiveRentPaid: rentPaid,
        effectiveWaterPaid: waterPaid,
        effectiveGarbagePaid: garbagePaid,
        effectivePenaltiesPaid: penaltiesPaid,

        balanceDue,
        advanceBalance: Number(r.advanceBalance) || 0,
        transactions,
        lastUpdated: r.lastUpdated,
      };
    });

    res.status(200).json({
      success: true,
      records,
    });
  } catch (err) {
    console.error("Error fetching tenant monthly records:", err);
    next(err);
  }
};
