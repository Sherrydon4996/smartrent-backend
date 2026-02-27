import { db } from "../../config/db.js";

// Add to your existing reportController.js
export const getMonthlyPaymentsDetail = async (req, res, next) => {
  const { buildingName, month, year } = req.query;

  try {
    const currentMonth =
      month || new Date().toLocaleString("default", { month: "long" });
    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const sqlBuildingName = buildingName || null;

    const query = `
      SELECT 
        t.id as tenantId,
        t.name as tenantName,
        t.mobile,
        t.houseNumber,
        t.buildingName,
        t.monthlyRent,
        t.garbageBill as expectedGarbage,
        t.status,
        
        -- Monthly payment details
        mp.month,
        mp.year,
        COALESCE(mp.waterBill, 0) as expectedWater,
        COALESCE(mp.penalties, 0) as expectedPenalties,
        COALESCE(mp.rentPaid, 0) as rentPaid,
        COALESCE(mp.waterPaid, 0) as waterPaid,
        COALESCE(mp.garbagePaid, 0) as garbagePaid,
        COALESCE(mp.penaltiesPaid, 0) as penaltiesPaid,
        mp.balanceDue,
        mp.advanceBalance,
        mp.lastUpdated
        
      FROM tenants t
      LEFT JOIN monthly_payments mp ON 
        t.id = mp.tenant_id 
        AND mp.month = ? 
        AND mp.year = ?
      WHERE t.status = 'active'
        AND (? IS NULL OR t.buildingName = ?)
      ORDER BY t.buildingName, t.houseNumber
    `;

    const result = await db.execute({
      sql: query,
      args: [currentMonth, currentYear, sqlBuildingName, sqlBuildingName],
    });

    const summary = {
      month: currentMonth,
      year: currentYear,
      totalTenants: result.rows.length,
      totalExpectedRent: 0,
      totalExpectedWater: 0,
      totalExpectedGarbage: 0,
      totalExpectedPenalties: 0,
      totalRentPaid: 0,
      totalWaterPaid: 0,
      totalGarbagePaid: 0,
      totalPenaltiesPaid: 0,
      totalBalanceDue: 0,
      totalAdvanceBalance: 0,
      paidTenants: 0,
      partialTenants: 0,
      notPaidTenants: 0,
    };

    const processedData = result.rows.map((row) => {
      const expectedRent = Number(row.monthlyRent) || 0;
      const expectedWater = Number(row.expectedWater) || 0;
      const expectedGarbage = Number(row.expectedGarbage) || 0;
      const expectedPenalties = Number(row.expectedPenalties) || 0;

      const rentPaid = Number(row.rentPaid) || 0;
      const waterPaid = Number(row.waterPaid) || 0;
      const garbagePaid = Number(row.garbagePaid) || 0;
      const penaltiesPaid = Number(row.penaltiesPaid) || 0;

      const totalExpected =
        expectedRent + expectedWater + expectedGarbage + expectedPenalties;
      const totalPaid = rentPaid + waterPaid + garbagePaid + penaltiesPaid;
      const balance = totalPaid - totalExpected;

      let paymentStatus = "Not Paid";
      if (rentPaid >= expectedRent) paymentStatus = "Paid";
      else if (rentPaid > 0) paymentStatus = "Partial";

      // Update summary
      summary.totalExpectedRent += expectedRent;
      summary.totalExpectedWater += expectedWater;
      summary.totalExpectedGarbage += expectedGarbage;
      summary.totalExpectedPenalties += expectedPenalties;

      summary.totalRentPaid += rentPaid;
      summary.totalWaterPaid += waterPaid;
      summary.totalGarbagePaid += garbagePaid;
      summary.totalPenaltiesPaid += penaltiesPaid;

      summary.totalBalanceDue += Math.max(0, -balance);
      summary.totalAdvanceBalance += Math.max(0, balance);

      if (paymentStatus === "Paid") summary.paidTenants++;
      else if (paymentStatus === "Partial") summary.partialTenants++;
      else if (paymentStatus === "Not Paid") summary.notPaidTenants++;

      return {
        ...row,
        expectedRent,
        expectedWater,
        expectedGarbage,
        expectedPenalties,
        totalExpected,

        rentPaid,
        waterPaid,
        garbagePaid,
        penaltiesPaid,
        totalPaid,

        balance,
        outstanding: balance < 0 ? Math.abs(balance) : 0,
        advance: balance > 0 ? balance : 0,

        paymentStatus,
        collectionRate:
          totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0,
      };
    });

    res.status(200).json({
      success: true,
      data: processedData,
      summary,
      filters: {
        buildingName,
        month: currentMonth,
        year: currentYear,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error generating monthly payments detail report:", err);
    next(err);
  }
};
