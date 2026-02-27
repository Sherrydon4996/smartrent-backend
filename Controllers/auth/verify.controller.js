// RouteHandlers/auth.routes.js
import express from "express";

import jwt from "jsonwebtoken";
import { db } from "../../config/db.js";

const SECRET = process.env.JWT_SECRET || "your-fallback-secret";
const router = express.Router();

// GET /api/v1/auth/me
export async function me(req, res) {
  try {
    const userId = req.user.id;

    // Fetch user info from DB
    const userResult = await db.execute(
      "SELECT id, username, role, status FROM users WHERE id = ?",
      [userId],
    );

    const user = userResult.rows[0];
    if (!user || user.status !== "active") {
      return res
        .status(403)
        .json({ success: false, message: "Account invalid" });
    }

    // Optional: Issue new short-lived access token
    const accessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      SECRET,
      { expiresIn: "10m" },
    );

    res.json({ success: true, user, accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
