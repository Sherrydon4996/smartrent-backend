// controllers/reportController.js - FIXED VERSION
// KEY FIXES:
// 1. Payment History Report: Excludes credit_settlement transactions by default
// 2. Annual Summary Report: Excludes credit_settlement from income calculations
// 3. All reports: Use monthly_payments table as source of truth (already has correct totals)

import { db } from "../../config/db.js";

// Helper functions for parameter sanitization
function sanitizeParam(value) {
  return value === undefined || value === "" ? null : value;
}

function sanitizeNumericParam(value, defaultValue = 0) {
  if (value === undefined || value === "" || value === null)
    return defaultValue;
  const num = parseInt(value);
  return isNaN(num) ? defaultValue : num;
}

function sanitizeMonthParam(value) {
  if (value) return value;
  return new Date().toLocaleString("default", { month: "long" });
}

function sanitizeYearParam(value) {
  if (value) return parseInt(value);
  return new Date().getFullYear();
}

/**
 * GET /api/v1/reports/tenant-balances
 * Uses monthly_payments as source of truth - no transaction summing
 */
export const getTenantBalanceReport = async (req, res, next) => {
  const { buildingName, month, year, status } = req.query;

  try {
    const currentMonth = sanitizeMonthParam(month);
    const currentYear = sanitizeYearParam(year);
    const sqlStatus = status || "active";
    const sqlBuilding = sanitizeParam(buildingName);

    const query = `
      SELECT 
        t.id as tenantId,
        t.name,
        t.mobile,
        t.houseNumber,
        t.buildingName,
        t.monthlyRent,
        t.garbageBill as expectedGarbage,
        t.status,
        t.entryDate,
        t.tenant_credit,

        COALESCE(mp.waterBill, 0) as actualWaterBill,
        COALESCE(mp.penalties, 0) as penalties,
        
        -- Amounts paid (from monthly_payments - already correct)
        COALESCE(mp.rentPaid, 0) as rentPaid,
        COALESCE(mp.waterPaid, 0) as waterPaid,
        COALESCE(mp.garbagePaid, 0) as garbagePaid,
        COALESCE(mp.penaltiesPaid, 0) as penaltiesPaid,

        -- Calculate totals
        (t.monthlyRent + t.garbageBill + COALESCE(mp.waterBill, 0) + COALESCE(mp.penalties, 0)) as totalDue,
        (COALESCE(mp.rentPaid, 0) + COALESCE(mp.garbagePaid, 0) + 
         COALESCE(mp.waterPaid, 0) + COALESCE(mp.penaltiesPaid, 0)) as totalPaid,

        mp.month,
        mp.year,
        mp.lastUpdated
        
      FROM tenants t
      LEFT JOIN monthly_payments mp ON 
        t.id = mp.tenant_id 
        AND mp.month = ? 
        AND mp.year = ?
      WHERE t.status = ?
        AND (? IS NULL OR t.buildingName = ?)
      ORDER BY t.buildingName, t.houseNumber
    `;

    const result = await db.execute({
      sql: query,
      args: [currentMonth, currentYear, sqlStatus, sqlBuilding, sqlBuilding],
    });

    const summary = {
      totalTenants: result.rows.length,
      totalExpectedRent: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      totalCredit: 0,
      tenantsWithDebt: 0,
      tenantsWithCredit: 0,
      tenantsNotPaid: 0,
      byBuilding: {},
    };

    const processedRows = result.rows.map((row) => {
      const totalDue = Number(row.totalDue) || 0;
      const totalPaid = Number(row.totalPaid) || 0;
      const outstandingBalance = Math.max(0, totalDue - totalPaid);
      const creditBalance = Number(row.tenant_credit) || 0;

      summary.totalExpectedRent += totalDue;
      summary.totalCollected += totalPaid;
      summary.totalOutstanding += outstandingBalance;
      summary.totalCredit += creditBalance;

      if (outstandingBalance > 0) summary.tenantsWithDebt++;
      if (creditBalance > 0) summary.tenantsWithCredit++;
      if (totalPaid === 0) summary.tenantsNotPaid++;

      const building = row.buildingName || "Unknown";
      if (!summary.byBuilding[building]) {
        summary.byBuilding[building] = {
          tenantCount: 0,
          totalRent: 0,
          totalCollected: 0,
          totalOutstanding: 0,
          totalCredit: 0,
        };
      }
      const b = summary.byBuilding[building];
      b.tenantCount++;
      b.totalRent += totalDue;
      b.totalCollected += totalPaid;
      b.totalOutstanding += outstandingBalance;
      b.totalCredit += creditBalance;

      return {
        ...row,
        totalDue,
        totalPaid,
        outstandingBalance,
        tenant_credit: creditBalance,
      };
    });

    res.status(200).json({
      success: true,
      data: processedRows,
      summary,
      filters: {
        buildingName,
        month: currentMonth,
        year: currentYear,
        status: sqlStatus,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error in tenant balance report:", err);
    next(err);
  }
};

/**
 * GET /api/v1/reports/payment-history
 * FIXED: Excludes credit_settlement transactions to prevent double counting
 */
export const getPaymentHistoryReport = async (req, res, next) => {
  const {
    buildingName,
    tenantId,
    startDate,
    endDate,
    limit,
    includeSettlements,
  } = req.query;

  try {
    const sqlBuildingName = sanitizeParam(buildingName);
    const sqlTenantId = sanitizeParam(tenantId);
    const sqlStartDate = sanitizeParam(startDate);
    const sqlEndDate = sanitizeParam(endDate);
    const sqlLimit = sanitizeNumericParam(limit, 500);
    const sqlIncludeSettlements = includeSettlements === "true";

    let query = `
      SELECT 
        t.id,
        t.name as tenantName,
        t.mobile,
        t.houseNumber,
        t.buildingName,
        tr.id as transactionId,
        CAST(tr.totalAmount AS INTEGER) as totalAmount,
        CAST(tr.rent AS INTEGER) as rent,
        CAST(tr.water AS INTEGER) as water,
        CAST(tr.garbage AS INTEGER) as garbage,
        CAST(tr.penalty AS INTEGER) as penalty,
        CAST(tr.deposit AS INTEGER) as deposit,
        tr.method,
        tr.reference,
        tr.date,
        tr.month,
        tr.year,
        tr.notes,
        tr.timestamp
      FROM transactions tr
      INNER JOIN tenants t ON tr.tenant_id = t.id
      WHERE 1=1
    `;

    const args = [];

    // CRITICAL FIX: Exclude credit settlements unless explicitly requested
    if (!sqlIncludeSettlements) {
      query += ` AND tr.method != 'credit_settlement'`;
    }

    if (sqlBuildingName) {
      query += ` AND t.buildingName = ?`;
      args.push(sqlBuildingName);
    }

    if (sqlTenantId) {
      query += ` AND t.id = ?`;
      args.push(sqlTenantId);
    }

    if (sqlStartDate) {
      query += ` AND tr.date >= ?`;
      args.push(sqlStartDate);
    }

    if (sqlEndDate) {
      query += ` AND tr.date <= ?`;
      args.push(sqlEndDate);
    }

    query += ` ORDER BY tr.timestamp DESC LIMIT ?`;
    args.push(sqlLimit);

    const result = await db.execute({ sql: query, args });

    const summary = {
      totalTransactions: result.rows.length,
      totalAmount: 0,
      totalRent: 0,
      totalWater: 0,
      totalGarbage: 0,
      totalPenalties: 0,
      totalDeposits: 0,
      byMethod: {},
      byBuilding: {},
    };

    result.rows.forEach((row) => {
      const amount = parseInt(row.totalAmount) || 0;
      const rent = parseInt(row.rent) || 0;
      const water = parseInt(row.water) || 0;
      const garbage = parseInt(row.garbage) || 0;
      const penalty = parseInt(row.penalty) || 0;
      const deposit = parseInt(row.deposit) || 0;

      summary.totalAmount += amount;
      summary.totalRent += rent;
      summary.totalWater += water;
      summary.totalGarbage += garbage;
      summary.totalPenalties += penalty;
      summary.totalDeposits += deposit;

      const method = row.method || "Unknown";
      if (!summary.byMethod[method]) {
        summary.byMethod[method] = { count: 0, amount: 0 };
      }
      summary.byMethod[method].count++;
      summary.byMethod[method].amount += amount;

      const building = row.buildingName || "Unknown";
      if (!summary.byBuilding[building]) {
        summary.byBuilding[building] = { count: 0, amount: 0 };
      }
      summary.byBuilding[building].count++;
      summary.byBuilding[building].amount += amount;
    });

    res.status(200).json({
      success: true,
      data: result.rows,
      summary,
      filters: { buildingName, tenantId, startDate, endDate, limit: sqlLimit },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error generating payment history report:", err);
    next(err);
  }
};

/**
 * GET /api/v1/reports/monthly-income
 * Uses monthly_payments as source of truth
 */
export const getMonthlyIncomeReport = async (req, res, next) => {
  const { buildingName, year, month } = req.query;

  try {
    const targetYear = sanitizeYearParam(year);
    const currentMonth = sanitizeMonthParam(month);
    const sqlBuildingName = sanitizeParam(buildingName);

    let query = `
      SELECT 
        t.id as tenantId,
        t.name as tenantName,
        t.mobile,
        t.houseNumber,
        t.buildingName,
        t.monthlyRent,
        t.garbageBill,
        
        -- Expected amounts
        t.monthlyRent as expectedRent,
        COALESCE(mp.waterBill, 0) as expectedWater,
        t.garbageBill as expectedGarbage,
        
        -- Collected amounts (from monthly_payments - already correct)
        COALESCE(mp.rentPaid, 0) as rentCollected,
        COALESCE(mp.waterPaid, 0) as waterCollected,
        COALESCE(mp.garbagePaid, 0) as garbageCollected,
        COALESCE(mp.penaltiesPaid, 0) as penaltiesCollected,
        COALESCE(mp.depositPaid, 0) as depositsCollected,
        
        -- Calculate totals
        (t.monthlyRent + t.garbageBill + COALESCE(mp.waterBill, 0)) as totalExpected,
        (COALESCE(mp.rentPaid, 0) + COALESCE(mp.waterPaid, 0) + COALESCE(mp.garbagePaid, 0)) as totalCollected,
        
        ? as month,
        ? as year
        
      FROM tenants t
      LEFT JOIN monthly_payments mp ON 
        t.id = mp.tenant_id 
        AND mp.month = ?
        AND mp.year = ?
      WHERE t.status = 'active'
    `;

    const args = [currentMonth, targetYear, currentMonth, targetYear];

    if (sqlBuildingName) {
      query += ` AND t.buildingName = ?`;
      args.push(sqlBuildingName);
    }

    query += ` ORDER BY t.buildingName, t.houseNumber`;

    const result = await db.execute({ sql: query, args });

    const summary = {
      month: currentMonth,
      year: targetYear,
      totalTenants: result.rows.length,
      totalExpected: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      totalAdvance: 0,
      collectionRate: 0,
    };

    const processedData = result.rows.map((row) => {
      const totalExpected = Number(row.totalExpected) || 0;
      const totalCollected = Number(row.totalCollected) || 0;
      const balance = totalCollected - totalExpected;

      const outstanding = balance < 0 ? Math.abs(balance) : 0;
      const advance = balance > 0 ? balance : 0;

      summary.totalExpected += totalExpected;
      summary.totalCollected += totalCollected;
      summary.totalOutstanding += outstanding;
      summary.totalAdvance += advance;

      return {
        ...row,
        totalExpected,
        totalCollected,
        outstanding,
        advance,
      };
    });

    summary.collectionRate =
      summary.totalExpected > 0
        ? parseFloat(
            ((summary.totalCollected / summary.totalExpected) * 100).toFixed(2),
          )
        : 0;

    res.status(200).json({
      success: true,
      data: processedData,
      summary,
      filters: { buildingName, year: targetYear, month: currentMonth },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error generating monthly income report:", err);
    next(err);
  }
};

/**
 * GET /api/v1/reports/outstanding-balances
 * Uses monthly_payments for accurate balance calculations
 */
export const getOutstandingBalancesReport = async (req, res, next) => {
  const { buildingName, minBalance } = req.query;

  try {
    const sqlBuildingName = sanitizeParam(buildingName);
    const sqlMinBalance = sanitizeNumericParam(minBalance, 0);

    let query = `
      SELECT 
        t.id,
        t.name,
        t.mobile,
        t.houseNumber,
        t.buildingName,
        t.monthlyRent,
        t.garbageBill,
        t.status,
        t.entryDate,
        t.tenant_credit
      FROM tenants t
      WHERE t.status = 'active'
    `;

    const args = [];

    if (sqlBuildingName) {
      query += ` AND t.buildingName = ?`;
      args.push(sqlBuildingName);
    }

    query += ` ORDER BY t.buildingName, t.houseNumber`;

    const tenantsResult = await db.execute({ sql: query, args });
    const tenantsWithBalances = [];

    for (const tenant of tenantsResult.rows) {
      const paymentsQuery = `
        SELECT 
          month,
          year,
          waterBill,
          rentPaid,
          waterPaid,
          garbagePaid,
          penaltiesPaid,
          penalties,
          lastUpdated
        FROM monthly_payments
        WHERE tenant_id = ?
        ORDER BY year DESC, 
          CASE month
            WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
            WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
            WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
            WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
          END DESC
      `;

      const paymentsResult = await db.execute({
        sql: paymentsQuery,
        args: [tenant.id],
      });

      let totalExpected = 0;
      let totalPaid = 0;
      let monthsWithBalance = 0;
      let lastPaymentDate = null;

      paymentsResult.rows.forEach((payment) => {
        const monthExpected =
          tenant.monthlyRent +
          tenant.garbageBill +
          (Number(payment.waterBill) || 0) +
          (Number(payment.penalties) || 0);

        const monthPaid =
          (Number(payment.rentPaid) || 0) +
          (Number(payment.waterPaid) || 0) +
          (Number(payment.garbagePaid) || 0) +
          (Number(payment.penaltiesPaid) || 0);

        totalExpected += monthExpected;
        totalPaid += monthPaid;

        if (monthExpected > monthPaid) {
          monthsWithBalance++;
        }

        if (
          payment.lastUpdated &&
          (!lastPaymentDate || payment.lastUpdated > lastPaymentDate)
        ) {
          lastPaymentDate = payment.lastUpdated;
        }
      });

      if (paymentsResult.rows.length === 0) {
        totalExpected = tenant.monthlyRent + tenant.garbageBill;
        totalPaid = 0;
        monthsWithBalance = 1;
      }

      const totalOutstanding = Math.max(0, totalExpected - totalPaid);
      const totalAdvance = Number(tenant.tenant_credit) || 0;

      if (totalOutstanding > sqlMinBalance) {
        tenantsWithBalances.push({
          ...tenant,
          totalOutstanding,
          totalAdvance,
          monthsWithBalance,
          lastPaymentDate: lastPaymentDate || null,
        });
      }
    }

    tenantsWithBalances.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    const summary = {
      totalTenantsOwing: tenantsWithBalances.length,
      totalOutstanding: 0,
      totalAdvance: 0,
      averageDebt: 0,
      byBuilding: {},
    };

    tenantsWithBalances.forEach((row) => {
      const outstanding = Number(row.totalOutstanding) || 0;
      const advance = Number(row.totalAdvance) || 0;

      summary.totalOutstanding += outstanding;
      summary.totalAdvance += advance;

      const building = row.buildingName || "Unknown";
      if (!summary.byBuilding[building]) {
        summary.byBuilding[building] = { count: 0, amount: 0 };
      }
      summary.byBuilding[building].count++;
      summary.byBuilding[building].amount += outstanding;
    });

    summary.averageDebt =
      summary.totalTenantsOwing > 0
        ? summary.totalOutstanding / summary.totalTenantsOwing
        : 0;

    res.status(200).json({
      success: true,
      data: tenantsWithBalances,
      summary,
      filters: { buildingName, minBalance: sqlMinBalance },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error generating outstanding balances report:", err);
    next(err);
  }
};

/**
 * GET /api/v1/reports/annual-summary
 * FIXED: Excludes credit_settlement transactions from income
 */
export const getAnnualSummaryReport = async (req, res, next) => {
  const { year, buildingName } = req.query;

  try {
    const targetYear = sanitizeYearParam(year);
    const sqlBuildingName = sanitizeParam(buildingName);

    // Get yearly data from monthly_payments table (paid amounts for THIS YEAR)
    const yearlyPaidQuery = `
      SELECT 
        SUM(mp.rentPaid) as rentPaid,
        SUM(mp.waterPaid) as waterPaid,
        SUM(mp.garbagePaid) as garbagePaid,
        SUM(mp.penaltiesPaid) as penaltiesPaid,
        COUNT(DISTINCT mp.tenant_id) as tenantsWithPayments
      FROM monthly_payments mp
      INNER JOIN tenants t ON mp.tenant_id = t.id
      WHERE mp.year = ?
        AND (? IS NULL OR t.buildingName = ?)
    `;

    const yearlyPaidResult = await db.execute({
      sql: yearlyPaidQuery,
      args: [targetYear, sqlBuildingName, sqlBuildingName],
    });

    // Get all-time payments (no year limit - ALL payments EVER)
    const allTimePaidQuery = `
      SELECT 
        SUM(mp.rentPaid) as rentPaid,
        SUM(mp.waterPaid) as waterPaid,
        SUM(mp.garbagePaid) as garbagePaid,
        SUM(mp.penaltiesPaid) as penaltiesPaid
      FROM monthly_payments mp
      INNER JOIN tenants t ON mp.tenant_id = t.id
      WHERE (? IS NULL OR t.buildingName = ?)
    `;

    const allTimePaidResult = await db.execute({
      sql: allTimePaidQuery,
      args: [sqlBuildingName, sqlBuildingName],
    });

    // Get tenant_credit (advance balances) - this is added to BOTH yearly and all-time
    const tenantCreditQuery = `
      SELECT 
        SUM(tenant_credit) as totalTenantCredit
      FROM tenants
      WHERE status = 'active'
        AND (? IS NULL OR buildingName = ?)
    `;

    const tenantCreditResult = await db.execute({
      sql: tenantCreditQuery,
      args: [sqlBuildingName, sqlBuildingName],
    });

    // Get tenant statistics
    const tenantQuery = `
      SELECT 
        COUNT(CASE WHEN status = 'active' THEN 1 END) as activeTenants,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactiveTenants,
        COUNT(DISTINCT buildingName) as buildingCount
      FROM tenants
      WHERE (? IS NULL OR buildingName = ?)
    `;

    const tenantResult = await db.execute({
      sql: tenantQuery,
      args: [sqlBuildingName, sqlBuildingName],
    });

    // Monthly breakdown from monthly_payments (paid amounts only)
    const monthlyQuery = `
      SELECT 
        mp.month,
        SUM(mp.rentPaid + mp.waterPaid + mp.garbagePaid + mp.penaltiesPaid) as income,
        COUNT(DISTINCT mp.tenant_id) as transactions
      FROM monthly_payments mp
      INNER JOIN tenants t ON mp.tenant_id = t.id
      WHERE mp.year = ?
        AND (? IS NULL OR t.buildingName = ?)
      GROUP BY mp.month
      ORDER BY 
        CASE mp.month
          WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
          WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
          WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
          WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
        END
    `;

    const monthlyResult = await db.execute({
      sql: monthlyQuery,
      args: [targetYear, sqlBuildingName, sqlBuildingName],
    });

    // Calculate totals
    const yearlyPaid = yearlyPaidResult.rows[0] || {};
    const allTimePaid = allTimePaidResult.rows[0] || {};
    const tenantCredit = tenantCreditResult.rows[0] || {};

    const totalTenantCredit = Number(tenantCredit.totalTenantCredit || 0);

    // This year's income = payments made this year + tenant credit
    const totalYearlyIncome =
      Number(yearlyPaid.rentPaid || 0) +
      Number(yearlyPaid.waterPaid || 0) +
      Number(yearlyPaid.garbagePaid || 0) +
      Number(yearlyPaid.penaltiesPaid || 0) +
      totalTenantCredit; // ADD tenant credit

    // All-time income = all payments ever + tenant credit
    const totalAllTimeIncome =
      Number(allTimePaid.rentPaid || 0) +
      Number(allTimePaid.waterPaid || 0) +
      Number(allTimePaid.garbagePaid || 0) +
      Number(allTimePaid.penaltiesPaid || 0) +
      totalTenantCredit; // ADD tenant credit

    const summary = {
      year: targetYear,
      income: {
        // This year's collections (payments + advances)
        rentIncome: Number(yearlyPaid.rentPaid || 0),
        waterIncome: Number(yearlyPaid.waterPaid || 0),
        garbageIncome: Number(yearlyPaid.garbagePaid || 0),
        penaltyIncome: Number(yearlyPaid.penaltiesPaid || 0),
        tenantCredit: totalTenantCredit,
        totalIncome: totalYearlyIncome,
        transactionCount: Number(yearlyPaid.tenantsWithPayments || 0),
      },
      allTime: {
        // All-time collections (all payments + advances)
        rentPaid: Number(allTimePaid.rentPaid || 0),
        waterPaid: Number(allTimePaid.waterPaid || 0),
        garbagePaid: Number(allTimePaid.garbagePaid || 0),
        penaltiesPaid: Number(allTimePaid.penaltiesPaid || 0),
        tenantCredit: totalTenantCredit,
        totalIncome: totalAllTimeIncome,
      },
      tenants: tenantResult.rows[0] || {},
      monthlyBreakdown: monthlyResult.rows,
      averageMonthlyIncome: 0,
    };

    const monthsWithData = monthlyResult.rows.length || 1;
    summary.averageMonthlyIncome = totalYearlyIncome / monthsWithData;

    res.status(200).json({
      success: true,
      data: summary,
      filters: { year: targetYear, buildingName },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error generating annual summary report:", err);
    next(err);
  }
};
