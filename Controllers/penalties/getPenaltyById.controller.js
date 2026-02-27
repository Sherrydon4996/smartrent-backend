import { db } from "../../config/db.js";

export const getPenaltyById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.execute(
      `
      SELECT p.id, p.building_id, p.percentage, p.created_at, b.name as building_name
      FROM penalties p
      LEFT JOIN buildings b ON p.building_id = b.id
      WHERE p.id = ?
    `,
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Penalty not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching penalty:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch penalty",
      error: error.message,
    });
  }
};
