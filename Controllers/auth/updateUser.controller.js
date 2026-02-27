// backend/controllers/userController.js

import bcrypt from "bcrypt";
import { db } from "../../config/db.js";

// Update user
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, mobile, role, password } = req.body;

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

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (username) {
      updates.push("username = ?");
      values.push(username);
    }

    if (mobile) {
      updates.push("mobile = ?");
      values.push(mobile);
    }

    if (role) {
      updates.push("role = ?");
      values.push(role);
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push("password = ?");
      values.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    values.push(id);

    await db.execute(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      values,
    );

    // Fetch updated user
    const result = await db.execute(
      `
      SELECT id, username, mobile, role, status, created_at
      FROM users
      WHERE id = ?
    `,
      [id],
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: "User updated successfully",
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });
  }
};

// Suspend user
export const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await db.execute(
      `SELECT id, status FROM users WHERE id = ?`,
      [id],
    );

    if (!existingUser.rows || existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update user status to suspended
    await db.execute(`UPDATE users SET status = ? WHERE id = ?`, [
      "suspended",
      id,
    ]);

    // Fetch updated user
    const result = await db.execute(
      `
      SELECT id, username, mobile, role, status, created_at
      FROM users
      WHERE id = ?
    `,
      [id],
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

// Unsuspend user
export const unsuspendUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await db.execute(
      `SELECT id, status FROM users WHERE id = ?`,
      [id],
    );

    if (!existingUser.rows || existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update user status to active
    await db.execute(`UPDATE users SET status = ? WHERE id = ?`, [
      "active",
      id,
    ]);

    // Fetch updated user
    const result = await db.execute(
      `
      SELECT id, username, mobile, role, status, created_at
      FROM users
      WHERE id = ?
    `,
      [id],
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: "User unsuspended successfully",
    });
  } catch (error) {
    console.error("Error unsuspending user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unsuspend user",
      error: error.message,
    });
  }
};
