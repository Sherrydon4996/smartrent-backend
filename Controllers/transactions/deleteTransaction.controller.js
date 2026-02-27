import { db } from "../../config/db.js";

/**
 * Delete a transaction
 */
export const deleteTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if transaction exists
    const transaction = await db.execute({
      sql: `SELECT * FROM transactions WHERE id = ?`,
      args: [id],
    });

    if (transaction.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Delete the transaction
    await db.execute({
      sql: `DELETE FROM transactions WHERE id = ?`,
      args: [id],
    });

    return res.status(200).json({
      success: true,
      message: "Transaction deleted successfully",
    });
  } catch (err) {
    console.error("Delete transaction error:", err);
    next(err);
  }
};
