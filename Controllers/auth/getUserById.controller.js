import { db } from "../../config/db.js";

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.execute(
      `
      SELECT id, username, mobile, role, status, created_at
      FROM users
      WHERE id = ?
    `,
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user",
      error: error.message,
    });
  }
};
