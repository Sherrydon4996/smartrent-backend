import { db } from "../../config/db.js";

export const updatePenalty = async (req, res) => {
  try {
    const { id } = req.params;
    const { percentage } = req.body;

    // Validation
    if (percentage === undefined) {
      return res.status(400).json({
        success: false,
        message: "Percentage is required",
      });
    }

    if (percentage < 0 || percentage > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage must be between 0 and 100",
      });
    }

    // Check if penalty exists
    const existingPenalty = await db.execute(
      `SELECT id FROM penalties WHERE id = ?`,
      [id],
    );

    if (!existingPenalty.rows || existingPenalty.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Penalty not found",
      });
    }

    await db.execute(`UPDATE penalties SET percentage = ? WHERE id = ?`, [
      percentage,
      id,
    ]);

    // Fetch updated penalty
    const result = await db.execute(
      `
      SELECT p.id, p.building_id, p.percentage, p.created_at, b.name as building_name
      FROM penalties p
      LEFT JOIN buildings b ON p.building_id = b.id
      WHERE p.id = ?
    `,
      [id],
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: "Penalty updated successfully",
    });
  } catch (error) {
    console.error("Error updating penalty:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update penalty",
      error: error.message,
    });
  }
};
