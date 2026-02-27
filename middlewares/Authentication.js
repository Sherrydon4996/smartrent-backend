// middlewares/Authentication.js
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN } from "../config/env.js";
import { AppError } from "../utils/error.js";

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(
      new AppError("Unauthorized: No token provided", 401, "NO_TOKEN"),
    );
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, ACCESS_TOKEN);
    req.user = payload; // Attach user data to req (id, username, role)
    next();
  } catch (error) {
    // ✅ Pass JWT errors to global error handler
    // It will automatically handle JsonWebTokenError and TokenExpiredError with 401
    return next(error);
  }
};
