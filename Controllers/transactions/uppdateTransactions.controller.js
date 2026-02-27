// // transactionController.js

// import { db } from "../../config/db.js";

// /**
//  * Upsert Transaction - Creates new transaction or updates existing one
//  * This handles both creating new transactions and updating water bills
//  */
// export const upsertTransaction = async (req, res, next) => {
//   try {
//     const { tenantId, transaction, record } = req.body;

//     if (!tenantId || !transaction) {
//       return res.status(400).json({
//         success: false,
//         message: "Tenant ID and transaction data are required",
//       });
//     }

//     // Check if transaction already exists
//     const existingTransaction = await db.execute({
//       sql: `SELECT * FROM transactions WHERE id = ?`,
//       args: [transaction.id],
//     });

//     let result;

//     if (existingTransaction.rows.length > 0) {
//       // UPDATE existing transaction
//       const updateFields = [];
//       const updateValues = [];

//       // Build dynamic update query
//       Object.keys(transaction).forEach((key) => {
//         if (key !== "id" && transaction[key] !== undefined) {
//           updateFields.push(`${key} = ?`);
//           updateValues.push(transaction[key]);
//         }
//       });

//       if (updateFields.length > 0) {
//         updateValues.push(transaction.id); // Add ID for WHERE clause

//         await db.execute({
//           sql: `UPDATE transactions SET ${updateFields.join(", ")} WHERE id = ?`,
//           args: updateValues,
//         });
//       }

//       result = { ...transaction, updated: true };
//     } else {
//       // INSERT new transaction
//       await db.execute({
//         sql: `
//           INSERT INTO transactions (
//             id, tenant_id, waterBill, TotalAmount, rent, water,
//             garbage, penalty, deposit, method, reference, date,
//             timestamp, month, year, notes
//           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//         `,
//         args: [
//           transaction.id,
//           transaction.tenant_id,
//           transaction.waterBill || 0,
//           transaction.TotalAmount,
//           transaction.rent,
//           transaction.water,
//           transaction.garbage,
//           transaction.penalty,
//           transaction.deposit || "0",
//           transaction.method,
//           transaction.reference,
//           transaction.date,
//           transaction.timestamp,
//           transaction.month,
//           transaction.year,
//           transaction.notes || "",
//         ],
//       });

//       result = { ...transaction, created: true };
//     }

//     // Update tenant's water bill if provided
//     if (transaction.waterBill !== undefined) {
//       await db.execute({
//         sql: `UPDATE tenants SET waterBill = ? WHERE id = ?`,
//         args: [transaction.waterBill, tenantId],
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message:
//         existingTransaction.rows.length > 0
//           ? "Transaction updated successfully"
//           : "Transaction created successfully",
//       transaction: result,
//       record: record, // Return the calculated record for frontend
//     });
//   } catch (err) {
//     console.error("Upsert transaction error:", err);
//     next(err);
//   }
// };

// /**
//  * Get monthly transactions for all tenants
//  * Returns aggregated payment data for a specific month and year
//  */
// export const getMonthlyTransactions = async (req, res, next) => {
//   try {
//     const { month, year } = req.query;

//     if (!month || !year) {
//       return res.status(400).json({
//         success: false,
//         message: "Month and year are required",
//       });
//     }

//     // Get all active tenants
//     const tenants = await db.execute({
//       sql: `SELECT * FROM tenants WHERE status = 'active'`,
//       args: [],
//     });

//     // Get all transactions for the specified month/year
//     const transactions = await db.execute({
//       sql: `
//         SELECT * FROM transactions
//         WHERE month = ? AND year = ?
//         ORDER BY timestamp DESC
//       `,
//       args: [month, parseInt(year)],
//     });

//     // Calculate records for each tenant
//     const records = [];

//     for (const tenant of tenants.rows) {
//       // Get tenant's transactions for this month
//       const tenantTransactions = transactions.rows.filter(
//         (t) => t.tenant_id === tenant.id,
//       );

//       // Get previous month's advance (if any)
//       const previousAdvance = await getPreviousMonthAdvanceBalance(
//         tenant.id,
//         month,
//         parseInt(year),
//       );

//       // Calculate totals
//       let rentPaid = 0;
//       let waterPaid = 0;
//       let garbagePaid = 0;
//       let penaltiesPaid = 0;
//       let depositPaid = 0;

//       tenantTransactions.forEach((tx) => {
//         rentPaid += parseFloat(tx.rent) || 0;
//         waterPaid += parseFloat(tx.water) || 0;
//         garbagePaid += parseFloat(tx.garbage) || 0;
//         penaltiesPaid += parseFloat(tx.penalty) || 0;
//         depositPaid += parseFloat(tx.deposit) || 0;
//       });

//       // Get current water bill (either from latest transaction or tenant record)
//       const currentWaterBill =
//         tenantTransactions.length > 0
//           ? tenantTransactions[0].waterBill
//           : tenant.waterBill || 0;

//       // Calculate balance
//       const GARBAGE_FEE = 200; // You might want to make this configurable
//       const totalDue = tenant.monthlyRent + currentWaterBill + GARBAGE_FEE;
//       const totalPaid =
//         rentPaid + waterPaid + garbagePaid + penaltiesPaid + previousAdvance;
//       const balance = totalDue - totalPaid;

//       const record = {
//         tenantId: tenant.id,
//         name: tenant.name,
//         houseNumber: tenant.houseNumber,
//         mobile: tenant.mobile,
//         buildingName: tenant.buildingName,
//         month,
//         year: parseInt(year),
//         monthlyRent: tenant.monthlyRent,
//         waterBill: currentWaterBill,
//         rentPaid,
//         waterPaid,
//         garbagePaid,
//         depositPaid,
//         penaltiesPaid,
//         penalties: 0, // You might want to calculate this based on payment delays
//         balanceDue: balance > 0 ? balance : 0,
//         advanceBalance: balance < 0 ? Math.abs(balance) : 0,
//         transactions: tenantTransactions.map((tx) => ({
//           id: tx.id,
//           tenantId: tx.tenant_id,
//           amount: parseFloat(tx.TotalAmount),
//           type: "payment", // You might want to determine this dynamically
//           method: tx.method,
//           reference: tx.reference,
//           date: tx.date,
//           timestamp: tx.timestamp,
//           month: tx.month,
//           year: tx.year,
//           notes: tx.notes,
//         })),
//         lastUpdated:
//           tenantTransactions.length > 0
//             ? tenantTransactions[0].timestamp
//             : new Date().toISOString(),
//         status: tenant.status,
//       };

//       records.push(record);
//     }

//     return res.status(200).json({
//       success: true,
//       records,
//       month,
//       year: parseInt(year),
//     });
//   } catch (err) {
//     console.error("Get monthly transactions error:", err);
//     next(err);
//   }
// };

// /**
//  * Helper function to get previous month's advance balance
//  */
// const getPreviousMonthAdvanceBalance = async (
//   tenantId,
//   currentMonth,
//   currentYear,
// ) => {
//   try {
//     // Month mapping
//     const months = [
//       "January",
//       "February",
//       "March",
//       "April",
//       "May",
//       "June",
//       "July",
//       "August",
//       "September",
//       "October",
//       "November",
//       "December",
//     ];

//     const currentMonthIndex = months.indexOf(currentMonth);
//     let previousMonth, previousYear;

//     if (currentMonthIndex === 0) {
//       // If current month is January, previous is December of last year
//       previousMonth = "December";
//       previousYear = currentYear - 1;
//     } else {
//       previousMonth = months[currentMonthIndex - 1];
//       previousYear = currentYear;
//     }

//     // Get tenant data
//     const tenant = await db.execute({
//       sql: `SELECT * FROM tenants WHERE id = ?`,
//       args: [tenantId],
//     });

//     if (tenant.rows.length === 0) return 0;

//     const tenantData = tenant.rows[0];

//     // Get previous month's transactions
//     const previousTransactions = await db.execute({
//       sql: `
//         SELECT * FROM transactions
//         WHERE tenant_id = ? AND month = ? AND year = ?
//       `,
//       args: [tenantId, previousMonth, previousYear],
//     });

//     if (previousTransactions.rows.length === 0) return 0;

//     // Calculate previous month's balance
//     let rentPaid = 0;
//     let waterPaid = 0;
//     let garbagePaid = 0;
//     let penaltiesPaid = 0;
//     let previousWaterBill = tenantData.waterBill || 0;

//     previousTransactions.rows.forEach((tx) => {
//       rentPaid += parseFloat(tx.rent) || 0;
//       waterPaid += parseFloat(tx.water) || 0;
//       garbagePaid += parseFloat(tx.garbage) || 0;
//       penaltiesPaid += parseFloat(tx.penalty) || 0;

//       // Get water bill from last transaction
//       if (tx.waterBill !== undefined) {
//         previousWaterBill = tx.waterBill;
//       }
//     });

//     const GARBAGE_FEE = 200;
//     const previousTotalDue =
//       tenantData.monthlyRent + previousWaterBill + GARBAGE_FEE;
//     const previousTotalPaid =
//       rentPaid + waterPaid + garbagePaid + penaltiesPaid;
//     const previousBalance = previousTotalDue - previousTotalPaid;

//     // Return advance balance (negative balance = overpayment)
//     return previousBalance < 0 ? Math.abs(previousBalance) : 0;
//   } catch (err) {
//     console.error("Error getting previous advance:", err);
//     return 0;
//   }
// };

// /**
//  * Get previous month's advance for a specific tenant
//  * API endpoint version
//  */
// export const getPreviousAdvance = async (req, res, next) => {
//   try {
//     const { tenantId } = req.params;
//     const { month, year } = req.query;

//     if (!month || !year) {
//       return res.status(400).json({
//         success: false,
//         message: "Month and year are required",
//       });
//     }

//     const advanceBalance = await getPreviousMonthAdvanceBalance(
//       tenantId,
//       month,
//       parseInt(year),
//     );

//     return res.status(200).json({
//       success: true,
//       tenantId,
//       advanceBalance,
//       month,
//       year: parseInt(year),
//     });
//   } catch (err) {
//     console.error("Get previous advance error:", err);
//     next(err);
//   }
// };

// /**
//  * Get all transactions for a specific tenant
//  */
