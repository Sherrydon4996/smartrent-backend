import { db } from "./../../config/db.js";

// UI users
/**
 * Tenants.tsx//fetching
 */
export const fetchTenants = async (req, res, next) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res
      .status(400)
      .json({ success: false, message: "Month and year are required" });
  }

  try {
    // 1. Fetch tenants + current monthly payment only (no prev month join needed)
    const tenantsResult = await db.execute({
      sql: `
        SELECT 
          t.id, t.name, t.mobile, t.email, t.nextOfKinName, t.nextOfKinMobile,
          t.houseNumber, t.houseSize, t.area, t.monthlyRent, t.status,
          t.entryDate, t.leavingDate, t.waterBill as defaultWaterBill,
          t.garbageBill, t.depositRequired, t.depositPaid, t.buildingName,
          t.created_at, COALESCE(t.expenses, 0) AS expenses,
          COALESCE(t.tenant_credit, 0) AS tenantCredit,           -- ← new
          COALESCE(mp.waterBill, t.waterBill) AS waterBill,
          COALESCE(mp.penalties, 0) AS penalties
        FROM tenants t
        LEFT JOIN monthly_payments mp 
          ON t.id = mp.tenant_id 
          AND mp.month = ? 
          AND mp.year = ?
        ORDER BY t.created_at DESC
      `,
      args: [month, parseInt(year)],
    });

    const tenants = tenantsResult.rows;

    // 2. Fetch transactions (unchanged)
    const transactionsResult = await db.execute({
      sql: `
        SELECT 
          id, tenant_id, waterBill, TotalAmount, rent, water, garbage, penalty,
          deposit, method, reference, date, timestamp, month, year, notes, created_at
        FROM transactions
        WHERE month = ? AND year = ?
        ORDER BY timestamp DESC
      `,
      args: [month, parseInt(year)],
    });

    // 3. Group transactions + calculate total paid (excluding deposits)
    const transactionsByTenant = {};
    const paymentsByTenant = {};
    transactionsResult.rows.forEach((tx) => {
      const tid = tx.tenant_id;
      if (!transactionsByTenant[tid]) {
        transactionsByTenant[tid] = [];
        paymentsByTenant[tid] = 0;
      }
      transactionsByTenant[tid].push(tx);
      if (!tx.deposit || tx.deposit <= 0) {
        paymentsByTenant[tid] += tx.TotalAmount || 0;
      }
    });

    // 4. Simplified balance calculation – NO advance logic here anymore
    const processedTenants = tenants.map((tenant) => {
      const totalBill =
        tenant.monthlyRent +
        tenant.waterBill +
        tenant.garbageBill +
        tenant.penalties;

      const totalPaid = paymentsByTenant[tenant.id] || 0;

      let balanceDue = totalBill - totalPaid;

      // We NO LONGER touch / calculate advance here
      // balanceDue can be negative → that becomes credit, but we show tenant_credit separately

      return {
        ...tenant,
        expenses: tenant.expenses || 0,
        totalBill,
        totalPaid,
        balanceDue: Math.max(0, balanceDue), // only positive = amount owed
        advanceThisMonth: balanceDue < 0 ? Math.abs(balanceDue) : 0, // optional – payment this month
        tenantCredit: tenant.tenantCredit || 0, // ← the persistent credit field
        transactions: transactionsByTenant[tenant.id] || [],
      };
    });

    res.status(200).json({
      success: true,
      count: processedTenants.length,
      records: processedTenants,
    });
  } catch (err) {
    console.error("Error fetching tenants:", err);
    next(err);
  }
};
