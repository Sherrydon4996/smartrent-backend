import { db } from "../../config/db.js";

export const createGlobalUnitType = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Unit type name is required",
      });
    }

    // Check if unit type already exists
    const existingType = await db.execute(
      `SELECT id FROM unit_types WHERE name = ?`,
      [name.trim()]
    );

    if (existingType.rows && existingType.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Unit type already exists",
      });
    }

    const id = uuidv4();
    const created_at = new Date().toISOString();

    await db.execute(
      `
      INSERT INTO unit_types (id, name, created_at)
      VALUES (?, ?, ?)
    `,
      [id, name.trim(), created_at]
    );

    const result = await db.execute(
      `SELECT id, name, created_at FROM unit_types WHERE id = ?`,
      [id]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Unit type created successfully",
    });
  } catch (error) {
    console.error("Error creating unit type:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create unit type",
      error: error.message,
    });
  }
};
