import { db } from "../../config/db.js";

export const getGlobalUnitTypes = async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT id, name, created_at
      FROM unit_types
      ORDER BY name ASC
    `);

    res.json({
      success: true,
      records: result.rows || [],
    });
  } catch (error) {
    console.error("Error fetching unit types:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch unit types",
      error: error.message,
    });
  }
};
