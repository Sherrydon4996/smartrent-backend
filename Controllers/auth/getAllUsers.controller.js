import { db } from "../../config/db.js";

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT id, username, mobile, role, status, created_at
      FROM users
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      records: result.rows || [],
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
};
