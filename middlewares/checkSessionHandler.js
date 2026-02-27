// middlewares/checkSession.js
import { db } from "../config/db.js";
import { AppError } from "../utils/error.js";

// Simple in-memory cache (you could use Redis in production)
const sessionCache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds

export const checkSession = async (req, res, next) => {
  if (!req.user) {
    return next(
      new AppError("Authentication required", 401, "NOT_AUTHENTICATED"),
    );
  }

  const userId = req.user.id;
  const now = Date.now();

  // Check cache first
  const cached = sessionCache.get(userId);
  if (cached && now < cached.expiresAt) {
    // Session was valid within last 30 seconds, skip DB check
    return next();
  }

  try {
    const userResult = await db.execute(
      `SELECT session_expires_at FROM users WHERE id = ?`,
      [userId],
    );

    const user = userResult.rows[0];

    if (!user) {
      sessionCache.delete(userId);
      return next(new AppError("User not found", 401, "USER_NOT_FOUND"));
    }

    const sessionExpiry = user.session_expires_at
      ? new Date(user.session_expires_at)
      : null;

    if (!sessionExpiry || new Date() > sessionExpiry) {
      // Session expired - clean up
      sessionCache.delete(userId);
      await db.execute(`DELETE FROM refresh_tokens WHERE user_id = ?`, [
        userId,
      ]);

      return next(
        new AppError(
          "Session expired. Please log in again.",
          401,
          "SESSION_EXPIRED",
        ),
      );
    }

    // Session valid - cache it
    sessionCache.set(userId, {
      expiresAt: now + CACHE_TTL,
      sessionExpiry: sessionExpiry.getTime(),
    });

    next();
  } catch (error) {
    console.error("Session check error:", error);
    return next(
      new AppError("Session verification failed", 500, "SESSION_CHECK_FAILED"),
    );
  }
};

// Clean up cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of sessionCache.entries()) {
    if (now > data.expiresAt) {
      sessionCache.delete(userId);
    }
  }
}, 60000); // Clean every minute
