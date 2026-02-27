import { db } from "../../config/db.js";

export const deletePenalty = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if penalty exists
    const existingPenalty = await db.execute(
      `SELECT id FROM penalties WHERE id = ?`,
      [id]
    );

    if (!existingPenalty.rows || existingPenalty.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Penalty not found",
      });
    }

    await db.execute(`DELETE FROM penalties WHERE id = ?`, [id]);

    res.json({
      success: true,
      message: "Penalty deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting penalty:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete penalty",
      error: error.message,
    });
  }
};
