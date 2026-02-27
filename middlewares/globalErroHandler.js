import jwt from "jsonwebtoken";
import { AppError } from "../utils/error.js";

export const globalErrorHandler = (err, req, res, next) => {
  let error = err;

  /* ======================
     🔐 JWT ERRORS
  ====================== */

  if (err.name === "JsonWebTokenError") {
    error = new AppError("Invalid authentication token", 401, "JWT_INVALID");
  }

  if (err.name === "TokenExpiredError") {
    error = new AppError("Authentication token expired", 401, "JWT_EXPIRED");
  }

  /* ======================
     🗄️ TURSO / SQLITE ERRORS
  ====================== */

  // UNIQUE / CONSTRAINT errors (Turso-safe)
  if (err.code?.startsWith("SQLITE_CONSTRAINT")) {
    error = new AppError(
      "Duplicate value detected. This record already exists.",
      400,
      "DB_CONSTRAINT"
    );
  }

  // Table missing
  if (err.message?.includes("no such table")) {
    error = new AppError(
      "Database table not found. Migration may be missing.",
      500,
      "DB_TABLE_MISSING"
    );
  }

  // SQL syntax error
  if (err.message?.includes("syntax error")) {
    error = new AppError("Database query syntax error", 500, "DB_SYNTAX_ERROR");
  }

  /* ======================
     🧪 VALIDATION ERRORS
  ====================== */

  if (err.name === "ValidationError") {
    error = new AppError(err.message, 400, "VALIDATION_ERROR");
  }

  /* ======================
     🔒 AUTH ERRORS (PASSTHROUGH)
  ====================== */

  if (err.statusCode === 401 || err.statusCode === 403) {
    error = new AppError(
      err.message || "Authorization error",
      err.statusCode,
      err.code || "AUTH_ERROR"
    );
  }

  /* ======================
     🚨 FALLBACK (UNKNOWN)
  ====================== */

  if (!error.isOperational) {
    console.error("🔥 UNEXPECTED ERROR:", err);

    error = new AppError(
      "Something went wrong. Please try again later.",
      500,
      "INTERNAL_ERROR"
    );
  }

  /* ======================
     📤 RESPONSE
  ====================== */

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    code: error.code,
  });
};
