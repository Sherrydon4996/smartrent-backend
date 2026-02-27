// backend/controllers/userController.js

import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/db.js";

// Create new user
export const createUser = async (req, res) => {
  try {
    const { username, mobile, password, role = "user" } = req.body;

    // Validation
    if (!username || !mobile || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, mobile, and password are required",
      });
    }

    // Check if username already exists
    const existingUser = await db.execute(
      `SELECT id FROM users WHERE username = ?`,
      [username]
    );

    if (existingUser.rows && existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const id = uuidv4();
    const created_at = new Date().toISOString();

    await db.execute(
      `
      INSERT INTO users (id, username, mobile, password, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [id, username, mobile, hashedPassword, role, created_at]
    );

    // Fetch created user (without password)
    const result = await db.execute(
      `
      SELECT id, username, mobile, role, status, created_at
      FROM users
      WHERE id = ?
    `,
      [id]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "User created successfully",
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: error.message,
    });
  }
};
