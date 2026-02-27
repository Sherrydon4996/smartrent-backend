import { db } from "../../config/db.js";

export const activateUser = async (req, res) => {
  try {
    const { id } = req.params;

    await db.execute(`UPDATE users SET status = 'active' WHERE id = ?`, [id]);

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
      message: "User activated successfully",
    });
  } catch (error) {
    console.error("Error activating user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to activate user",
      error: error.message,
    });
  }
};
