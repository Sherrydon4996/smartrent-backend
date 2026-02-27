import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/db.js";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../../config/env.js";

const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // ✅ Change this back to 2 hours

// Login: Authenticate and issue tokens
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    const result = await db.execute(`SELECT * FROM users WHERE username = ?`, [
      username,
    ]);

    if (!result.rows?.length) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const user = result.rows[0];

    if (user.status !== "active") {
      return res
        .status(403)
        .json({ success: false, message: "Account suspended" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    /* ──────────────── CREATE SESSION ──────────────── */
    const sessionStartedAt = new Date();
    const sessionExpiresAt = new Date(
      sessionStartedAt.getTime() + SESSION_DURATION_MS,
    );

    await db.execute(
      `UPDATE users 
       SET session_started_at = ?, session_expires_at = ?
       WHERE id = ?`,
      [sessionStartedAt.toISOString(), sessionExpiresAt.toISOString(), user.id],
    );
    /* ───────────────────────────────────────────────────── */

    // Access token (short-lived)
    const accessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      ACCESS_TOKEN,
      { expiresIn: "15m" },
    );

    // Refresh token
    const refreshToken = jwt.sign({ id: user.id }, REFRESH_TOKEN, {
      expiresIn: "7d",
    });

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await db.execute(
      `INSERT INTO refresh_tokens (id, user_id, token, expires_at)
       VALUES (?, ?, ?, ?)`,
      [uuidv4(), user.id, refreshToken, expiresAt],
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Login failed" });
  }
};

export const refresh = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: "No refresh token",
      code: "NO_REFRESH_TOKEN",
    });
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, REFRESH_TOKEN);
  } catch (error) {
    console.error("🔴 Token verification error:", error.message);
    return res.status(401).json({
      success: false,
      message: "Invalid refresh token",
      code: "INVALID_REFRESH_TOKEN",
    });
  }

  const userId = payload.id;

  try {
    // Check refresh token exists in database
    const tokenResult = await db.execute(
      `SELECT * FROM refresh_tokens 
       WHERE token = ? AND user_id = ? AND expires_at > CURRENT_TIMESTAMP`,
      [refreshToken, userId],
    );

    if (!tokenResult.rows.length) {
      return res.status(401).json({
        success: false,
        message: "Refresh token revoked",
        code: "REFRESH_TOKEN_REVOKED",
      });
    }

    // Get user + session
    const userResult = await db.execute(
      `SELECT id, username, role, status, session_expires_at 
       FROM users WHERE id = ?`,
      [userId],
    );

    const user = userResult.rows[0];

    if (!user || user.status !== "active") {
      return res.status(401).json({
        success: false,
        message: "Account invalid",
        code: "ACCOUNT_INVALID",
      });
    }

    /* ──────────────── SESSION EXPIRY CHECK ──────────────── */
    const now = new Date();
    const sessionExpiry = user.session_expires_at
      ? new Date(user.session_expires_at)
      : null;

    if (!sessionExpiry || now > sessionExpiry) {
      console.log("🔴 SESSION EXPIRED - Logging user out");

      // Delete all refresh tokens for this user
      await db.execute(`DELETE FROM refresh_tokens WHERE user_id = ?`, [
        userId,
      ]);

      // Clear session data
      await db.execute(
        `UPDATE users 
         SET session_started_at = NULL, session_expires_at = NULL
         WHERE id = ?`,
        [userId],
      );

      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
        code: "SESSION_EXPIRED",
      });
    }

    /* ────────────────────────────────────────────────────────── */

    // Generate new access token
    const newAccessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      ACCESS_TOKEN,
      { expiresIn: "15m" },
    );

    // ✅ Return BOTH accessToken AND user
    res.json({
      success: true,
      accessToken: newAccessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("🔥 Refresh error:", error);
    return res.status(500).json({
      success: false,
      message: "Token refresh failed",
      code: "REFRESH_FAILED",
    });
  }
};

// Logout: Revoke refresh token and clear session
export const logout = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  let userId = null;

  if (refreshToken) {
    try {
      // Decode the refresh token to get user ID
      const payload = jwt.verify(refreshToken, REFRESH_TOKEN);
      userId = payload.id;

      // Delete the specific refresh token
      await db.execute(`DELETE FROM refresh_tokens WHERE token = ?`, [
        refreshToken,
      ]);
    } catch (error) {
      console.error("Error decoding refresh token:", error);
    }
  }

  // Use userId from token OR from req.user (set by middleware)
  const userIdToUse = userId || req.user?.id;

  if (userIdToUse) {
    // Clear session data in database
    await db.execute(
      `UPDATE users 
       SET session_started_at = NULL, session_expires_at = NULL
       WHERE id = ?`,
      [userIdToUse],
    );
  }

  // Clear the refresh token cookie
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
  });

  res.json({ success: true, message: "Logged out" });
};
