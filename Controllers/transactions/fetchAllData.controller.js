// import { db } from "../../config/db.js";
// import dayjs from "dayjs";

// // Fetch monthly records for all tenants (combines tenant info + transaction aggregates)
// export const fetchMonthlyTransactions = async (req, res, next) => {
//   const { month, year } = req.query;

//   if (!month || !year) {
//     return res.status(400).json({
//       success: false,
//       message: "Missing month or year",
//     });
//   }

//   try {
//     // Get all active tenants
//     const tenantsResult = await db.execute({
//       sql: `
//         SELECT
//           id, name, mobile, houseNumber, buildingName,
//           monthlyRent, waterBill as defaultWaterBill, garbageBill,
//           status, entryDate
//         FROM tenants
//         WHERE status = 'active'
//         ORDER BY buildingName, houseNumber
//       `,
//       args: [],
//     });

//     const tenants = tenantsResult.rows;

//     // Get all transactions for this month/year
//     const transactionsResult = await db.execute({
//       sql: `
//         SELECT
//           id, tenant_id, waterBill, TotalAmount,
//           rent, water, garbage, penalty, deposit,
//           method, reference, date, timestamp, notes
//         FROM transactions
//         WHERE month = ? AND year = ?
//         ORDER BY timestamp DESC
//       `,
//       args: [month, Number(year)],
//     });

//     const allTransactions = transactionsResult.rows;

//     // Get previous month's advance balances
//     const previousMonth = dayjs()
//       .month(dayjs().month(month).month())
//       .subtract(1, "month");
//     const prevMonthName = previousMonth.format("MMMM");
//     const prevYear = previousMonth.year();

//     const previousAdvancesResult = await db.execute({
//       sql: `
//         SELECT tenant_id, advanceBalance
//         FROM monthly_payments
//         WHERE month = ? AND year = ?
//       `,
//       args: [prevMonthName, prevYear],
//     });

//     const previousAdvances = {};
//     previousAdvancesResult.rows.forEach((row) => {
//       previousAdvances[row.tenant_id] = row.advanceBalance || 0;
//     });

//     // Build records for each tenant
//     const records = tenants.map((tenant) => {
//       // Get all transactions for this tenant this month
//       const tenantTransactions = allTransactions.filter(
//         (t) => t.tenant_id === tenant.id
//       );

//       // Aggregate payments from transactions
//       let rentPaid = 0;
//       // let waterPaid = 0;
//       let garbagePaid = 0;
//       let depositPaid = 0;
//       let penaltiesPaid = 0;
//       let currentWaterBill = tenant.defaultWaterBill || 0;
//       let penalties = 0;

//       tenantTransactions.forEach((tx) => {
//         rentPaid += parseFloat(tx.rent) || 0;
//         waterPaid += parseFloat(tx.water) || 0;
//         garbagePaid += parseFloat(tx.garbage) || 0;
//         depositPaid += parseFloat(tx.deposit) || 0;
//         penaltiesPaid += parseFloat(tx.penalty) || 0;

//         // Use the latest waterBill from transactions (if updated)
//         if (tx.waterBill > 0) {
//           currentWaterBill = tx.waterBill;
//         }
//       });

//       // Get previous advance
//       const previousAdvance = previousAdvances[tenant.id] || 0;

//       // Calculate totals
//       const totalDue =
//         tenant.monthlyRent + currentWaterBill + tenant.garbageBill + penalties;
//       const totalPaid = rentPaid + waterPaid + garbagePaid + penaltiesPaid;
//       const totalPaidWithAdvance = totalPaid + previousAdvance;

//       // Calculate balance
//       const balance = totalDue - totalPaidWithAdvance;
//       const balanceDue = balance > 0 ? balance : 0;
//       const advanceBalance = balance < 0 ? Math.abs(balance) : 0;

//       // Format transactions for frontend
//       const formattedTransactions = tenantTransactions.map((tx) => ({
//         id: tx.id,
//         tenantId: tx.tenant_id,
//         amount: tx.TotalAmount,
//         type: "rent",
//         method: tx.method,
//         reference: tx.reference,
//         date: tx.date,
//         timestamp: tx.timestamp,
//         month: month,
//         year: Number(year),
//         notes: tx.notes || "",
//       }));

//       return {
//         tenantId: tenant.id,
//         name: tenant.name,
//         houseNumber: tenant.houseNumber,
//         mobile: tenant.mobile,
//         buildingName: tenant.buildingName,
//         monthlyRent: tenant.monthlyRent,
//         waterBill: currentWaterBill,
//         month: month,
//         year: Number(year),
//         rentPaid,
//         waterPaid,
//         garbagePaid,
//         depositPaid,
//         penaltiesPaid,
//         penalties,
//         balanceDue,
//         advanceBalance,
//         transactions: formattedTransactions,
//         lastUpdated: tenantTransactions[0]?.timestamp || "",
//         status: tenant.status,
//       };
//     });

//     res.status(200).json({
//       success: true,
//       count: records.length,
//       records: records,
//     });
//   } catch (err) {
//     console.error("Error fetching monthly transactions:", err);
//     next(err);
//   }
// };

// // Upsert transaction (create new transaction and update monthly summary)
// export const upsertTransaction = async (req, res, next) => {
//   const { tenantId, transaction, record } = req.body;

//   if (!tenantId || !transaction) {
//     return res.status(400).json({
//       success: false,
//       message: "Missing required fields",
//     });
//   }

//   try {
//     // 1. Insert the transaction
//     await db.execute({
//       sql: `
//         INSERT INTO transactions (
//           id, tenant_id, waterBill, TotalAmount,
//           rent, water, garbage, penalty, deposit,
//           method, reference, date, timestamp, month, year, notes
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//       `,
//       args: [
//         transaction.id,
//         tenantId,
//         transaction.waterBill || 0,
//         transaction.TotalAmount,
//         transaction.rent,
//         transaction.water,
//         transaction.garbage,
//         transaction.penalty,
//         transaction.deposit || "0",
//         transaction.method,
//         transaction.reference,
//         transaction.date,
//         transaction.timestamp,
//         transaction.month,
//         transaction.year,
//         transaction.notes || "",
//       ],
//     });

//     // 2. Update or insert monthly_payments summary
//     const monthlyId = `${tenantId}-${transaction.month}-${transaction.year}`;

//     await db.execute({
//       sql: `
//         INSERT INTO monthly_payments (
//           id, tenant_id, month, year,
//           rentPaid, waterPaid, garbagePaid, depositPaid, penaltiesPaid,
//           penalties, balanceDue, advanceBalance, waterBill, lastUpdated
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//         ON CONFLICT(tenant_id, month, year) DO UPDATE SET
//           rentPaid = rentPaid + excluded.rentPaid,
//           waterPaid = waterPaid + excluded.waterPaid,
//           garbagePaid = garbagePaid + excluded.garbagePaid,
//           depositPaid = depositPaid + excluded.depositPaid,
//           penaltiesPaid = penaltiesPaid + excluded.penaltiesPaid,
//           balanceDue = excluded.balanceDue,
//           advanceBalance = excluded.advanceBalance,
//           waterBill = excluded.waterBill,
//           lastUpdated = excluded.lastUpdated
//       `,
//       args: [
//         monthlyId,
//         tenantId,
//         record.month,
//         record.year,
//         parseFloat(transaction.rent) || 0,
//         parseFloat(transaction.water) || 0,
//         parseFloat(transaction.garbage) || 0,
//         parseFloat(transaction.deposit) || 0,
//         parseFloat(transaction.penalty) || 0,
//         record.penalties || 0,
//         record.balanceDue,
//         record.advanceBalance,
//         record.waterBill,
//         transaction.timestamp,
//       ],
//     });

//     res.status(200).json({
//       success: true,
//       message: "Transaction saved successfully",
//       record: record,
//     });
//   } catch (err) {
//     console.error("Error upserting transaction:", err);
//     next(err);
//   }
// };

// // Get previous month's advance balance for a tenant

export const getTenantTransactions = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { startDate, endDate, month, year } = req.query;

    let sql = `SELECT * FROM transactions WHERE tenant_id = ?`;
    let args = [tenantId];

    if (month && year) {
      sql += ` AND month = ? AND year = ?`;
      args.push(month, parseInt(year));
    } else if (startDate && endDate) {
      sql += ` AND date BETWEEN ? AND ?`;
      args.push(startDate, endDate);
    }

    sql += ` ORDER BY timestamp DESC`;

    const transactions = await db.execute({ sql, args });

    return res.status(200).json({
      success: true,
      transactions: transactions.rows,
      count: transactions.rows.length,
    });
  } catch (err) {
    console.error("Get tenant transactions error:", err);
    next(err);
  }
};
