import { db } from "../../config/db.js";

export const getAllPenalties = async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT p.id, p.building_id, p.percentage, p.created_at, b.name as building_name
      FROM penalties p
      LEFT JOIN buildings b ON p.building_id = b.id
      ORDER BY p.created_at DESC
    `);

    res.json({
      success: true,
      records: result.rows || [],
    });
  } catch (error) {
    console.error("Error fetching penalties:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch penalties",
      error: error.message,
    });
  }
};
