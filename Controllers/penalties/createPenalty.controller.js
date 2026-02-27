import { db } from "../../config/db.js";
import { v4 as uuidv4 } from "uuid";

export const createPenalty = async (req, res) => {
  try {
    const { building_id, percentage } = req.body;

    // Validation
    if (!building_id || percentage === undefined) {
      return res.status(400).json({
        success: false,
        message: "Building ID and percentage are required",
      });
    }

    if (percentage < 0 || percentage > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage must be between 0 and 100",
      });
    }

    // Check if building exists
    const buildingExists = await db.execute(
      `SELECT id FROM buildings WHERE id = ?`,
      [building_id],
    );

    if (!buildingExists.rows || buildingExists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Building not found",
      });
    }

    // Check if penalty already exists for this building
    const existingPenalty = await db.execute(
      `SELECT id FROM penalties WHERE building_id = ?`,
      [building_id],
    );

    if (existingPenalty.rows && existingPenalty.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Penalty already exists for this building",
      });
    }

    // Create penalty
    const id = uuidv4();
    const created_at = new Date().toISOString();

    await db.execute(
      `
      INSERT INTO penalties (id, building_id, percentage, created_at)
      VALUES (?, ?, ?, ?)
    `,
      [id, building_id, percentage, created_at],
    );

    // Fetch created penalty
    const result = await db.execute(
      `
      SELECT p.id, p.building_id, p.percentage, p.created_at, b.name as building_name
      FROM penalties p
      LEFT JOIN buildings b ON p.building_id = b.id
      WHERE p.id = ?
    `,
      [id],
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Penalty created successfully",
    });
  } catch (error) {
    console.error("Error creating penalty:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create penalty",
      error: error.message,
    });
  }
};
