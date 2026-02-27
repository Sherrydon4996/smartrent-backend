import dayjs from "dayjs";
import { db } from "../../config/db.js";

/**
 * Gets the advance balance (credit) from the previous month
 * Used when creating new payment to automatically apply carry-forward
 */
export const getPreviousMonthAdvance = async (req, res, next) => {
  const { tenantId } = req.params;
  const { month, year } = req.query;

  if (!tenantId || !month || !year) {
    return res.status(400).json({
      success: false,
      message: "Missing required parameters: tenantId, month, year",
    });
  }

  try {
    const currentMonth = dayjs().month(dayjs().month(month).month());
    const previousMonth = currentMonth.subtract(1, "month");

    const prevMonthName = previousMonth.format("MMMM");
    const prevYear = previousMonth.year();

    const result = await db.execute({
      sql: `
        SELECT advanceBalance
        FROM monthly_payments
        WHERE tenant_id = ? 
          AND month = ? 
          AND year = ?
      `,
      args: [tenantId, prevMonthName, prevYear],
    });

    const advanceBalance = result.rows[0]?.advanceBalance || 0;

    return res.status(200).json({
      success: true,
      advanceBalance,
      previousMonth: prevMonthName,
      previousYear: prevYear,
    });
  } catch (err) {
    console.error("Error fetching previous advance:", err);
    next(err);
  }
};
