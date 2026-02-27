import { AppError } from "../utils/error.js";

export const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return next(
      new AppError(
        "Access denied. Admin privileges are required to perform this action.",
        403,
        "ADMIN_ONLY",
      ),
    );
  }

  next();
};
