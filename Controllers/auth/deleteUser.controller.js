import { db } from "../../config/db.js";

export const deleteUser = async (req, res) => {
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

    await db.execute(`DELETE FROM users WHERE id = ?`, [id]);

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: error.message,
    });
  }
};
