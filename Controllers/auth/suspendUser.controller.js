import { db } from "../../config/db.js";

export const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await db.execute(`SELECT id FROM users WHERE id = ?`, [
      id,
    ]);

    if (!existingUser.rows || existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Add status column if it doesn't exist (migration)
    try {
      await db.execute(`
        ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'
      `);
    } catch (e) {
      // Column might already exist
    }

    await db.execute(`UPDATE users SET status = 'suspended' WHERE id = ?`, [
      id,
    ]);

    // Fetch updated user
    const result = await db.execute(
      `
      SELECT id, username, mobile, role, status, created_at
      FROM users
      WHERE id = ?
    `,
      [id]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: "User suspended successfully",
    });
  } catch (error) {
    console.error("Error suspending user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to suspend user",
      error: error.message,
    });
  }
};
