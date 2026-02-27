// controllers/tenantPaymentController.js
import { db } from "../../config/db.js";

/**
 * Get all monthly records + transactions for all tenants
 * GET /api/v1/tenants/getAllMonthlyRecords
 */
export const getAllMonthlyRecords = async (req, res, next) => {
  const { month, year } = req.query;

  if (!month || !year) {
    return res.status(400).json({
      success: false,
      message: "Month and year are required parameters",
    });
  }

  try {
    // 1. Get all tenants with their fixed charges
    const tenantsResult = await db.execute({
      sql: `
        SELECT 
          t.id, 
          t.name, 
          t.houseNumber, 
          t.mobile, 
          t.monthlyRent, 
          t.waterBill, 
          t.garbageBill,
          t.buildingName,
          t.status
        FROM tenants t
        WHERE t.status = 'active'
      `,
    });

    const tenants = tenantsResult.rows.reduce((acc, tenant) => {
      acc[tenant.id] = {
        ...tenant,
        monthlyRent: Number(tenant.monthlyRent),
        waterBill: Number(tenant.waterBill),
        garbageBill: Number(tenant.garbageBill) || 200,
      };
      return acc;
    }, {});

    // 2. Get all monthly payment records for the specified month/year
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
        WHERE month = ? AND year = ?
        ORDER BY 
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
      args: [month, year],
    });

    // 3. Get all transactions for this month/year
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
        WHERE month = ? AND year = ?
        ORDER BY timestamp DESC
      `,
      args: [month, year],
    });

    // 4. Group transactions by tenant
    const transactionsByTenant = {};
    transactionsResult.rows.forEach((tx) => {
      const tenantId = tx.tenantId;
      if (!transactionsByTenant[tenantId]) {
        transactionsByTenant[tenantId] = [];
      }
      transactionsByTenant[tenantId].push({
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

    // 5. Create records for all tenants (include tenants with no monthly record yet)
    const records = tenantsResult.rows.map((tenant) => {
      const tenantId = tenant.id;
      const tenantData = tenants[tenantId];

      // Find monthly record for this tenant
      const monthlyRecord = monthlyResult.rows.find(
        (r) => r.tenantId === tenantId
      );

      // Get transactions for this tenant
      const transactions = transactionsByTenant[tenantId] || [];

      // Use monthly record data or defaults
      const rentPaid = monthlyRecord ? Number(monthlyRecord.rentPaid) || 0 : 0;
      const waterPaid = monthlyRecord
        ? Number(monthlyRecord.waterPaid) || 0
        : 0;
      const garbagePaid = monthlyRecord
        ? Number(monthlyRecord.garbagePaid) || 0
        : 0;
      const depositPaid = monthlyRecord
        ? Number(monthlyRecord.depositPaid) || 0
        : 0;
      const penaltiesPaid = monthlyRecord
        ? Number(monthlyRecord.penaltiesPaid) || 0
        : 0;
      const penalties = monthlyRecord
        ? Number(monthlyRecord.penalties) || 0
        : 0;
      const advanceBalance = monthlyRecord
        ? Number(monthlyRecord.advanceBalance) || 0
        : 0;
      const waterBill = monthlyRecord
        ? Number(monthlyRecord.waterBill) || tenantData.waterBill
        : tenantData.waterBill;

      // Calculate what was due for this month
      const monthlyRent = tenantData.monthlyRent;
      const garbageBill = tenantData.garbageBill;
      const totalDue = monthlyRent + waterBill + garbageBill + penalties;

      // Calculate total paid (excluding deposit)
      const totalPaidThisMonth =
        rentPaid + waterPaid + garbagePaid + penaltiesPaid;

      // Calculate balance
      const balanceDue = Math.max(0, totalDue - totalPaidThisMonth);

      return {
        tenantId: tenantId,
        name: tenant.name,
        houseNumber: tenant.houseNumber,
        mobile: tenant.mobile,
        buildingName: tenant.buildingName,
        month: month,
        year: parseInt(year),
        monthlyRent,
        waterBill,
        garbageBill,
        penalties,

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
        advanceBalance,
        transactions,
        lastUpdated: monthlyRecord ? monthlyRecord.lastUpdated : null,
        status: tenant.status || "active",
      };
    });

    res.status(200).json({
      success: true,
      records,
      month,
      year,
      totalRecords: records.length,
    });
  } catch (err) {
    console.error("Error fetching all monthly records:", err);
    next(err);
  }
};
