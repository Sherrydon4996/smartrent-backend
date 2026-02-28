import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { globalErrorHandler } from "./middlewares/globalErroHandler.js";
import {
  createTables,
  runMigrations,
} from "./Controllers/createTables.controller.js";

// Import penalty cron job
import { startPenaltyCron } from "./Controllers/penalties/Penaltycron.controller.js";

// Middleware
import { authenticate } from "./middlewares/Authentication.js";
import { authorizeAdmin } from "./middlewares/adminAuthentication.js";

// Routers
import reportRouter from "./RouteHandlers/report.routes.js";
import userRouter from "./RouteHandlers/userRoutes/user.routes.js";
import authRouter from "./RouteHandlers/auth.routes.js";
import tenantAdminsRoute from "./RouteHandlers/tenantRoutes/tenantsAdmins.route.js";
import tenantUsersRoute from "./RouteHandlers/tenantRoutes/tenantsUser.routes.js";
import adminBuildingRouter from "./RouteHandlers/buildingsRoutes/adminBuildings.route.js";
import userBuildingRouter from "./RouteHandlers/buildingsRoutes/userBuildings.routes.js";
import adminMaintenanceRouter from "./RouteHandlers/maintenanceRoutes/adminsMaintenance.routes.js";
import userMaintenanceRouter from "./RouteHandlers/maintenanceRoutes/userMaintenance.routes.js";
import adminPenaltyRouter from "./RouteHandlers/penaltyRoutes/adminPenalty.route.js";
import userPenaltyRouter from "./RouteHandlers/penaltyRoutes/userPenalty.routes.js";
import adminSettingsRouter from "./RouteHandlers/settingsRoutes/adminSettingsRoute.js";
import userSettingsRouter from "./RouteHandlers/settingsRoutes/userSettings.route.js";
import adminTransactionRouter from "./RouteHandlers/transactionsRoutes/adminTransaction.route.js";
import userTransactionRouter from "./RouteHandlers/transactionsRoutes/userTransaction.route.js";
import { checkSession } from "./middlewares/checkSessionHandler.js";
import adminRouter from "./RouteHandlers/userRoutes/admin.route.js";
import AiRouter from "./RouteHandlers/AiHelper/Ai.routes.js";
import PortfolioRouter from "./RouteHandlers/portfolioRoutes/portfolio.routes.js";
import SMSrouter from "./RouteHandlers/SMS/SMS.routes.js";

const app = express();

// Global middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://www.harrytechservices.com",
      "https://tenants-smartrent.com",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Public routes (no authentication required)
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/portfolio", PortfolioRouter);

// Protected user routes (authentication + session check)
app.use("/api/v1/tenants", authenticate, checkSession, tenantUsersRoute);
app.use("/api/v1/buildings", authenticate, checkSession, userBuildingRouter);
app.use("/api/v1/users", authenticate, checkSession, userRouter);
app.use("/api/v1/penalties", authenticate, checkSession, userPenaltyRouter);
app.use("/api/v1/settings", authenticate, checkSession, userSettingsRouter);
app.use("/api/v1", authenticate, checkSession, userTransactionRouter);
app.use("/api/v1/reports", authenticate, checkSession, reportRouter);
app.use(
  "/api/v1/maintenance",
  authenticate,
  checkSession,
  userMaintenanceRouter,
);
app.use("/api/v1/ai", authenticate, checkSession, AiRouter);

// Protected admin routes (authentication + session check + admin authorization)
app.use(
  "/api/v1/admin/tenants",
  authenticate,
  checkSession,
  authorizeAdmin,
  tenantAdminsRoute,
);
app.use(
  "/api/v1/admin/buildings",
  authenticate,
  checkSession,
  authorizeAdmin,
  adminBuildingRouter,
);
app.use(
  "/api/v1/admin/maintenance",
  authenticate,
  checkSession,
  authorizeAdmin,
  adminMaintenanceRouter,
);
app.use(
  "/api/v1/admin/penalties",
  authenticate,
  checkSession,
  authorizeAdmin,
  adminPenaltyRouter,
);
app.use(
  "/api/v1/admin/settings",
  authenticate,
  checkSession,
  authorizeAdmin,
  adminSettingsRouter,
);
app.use(
  "/api/v1/admin",
  authenticate,
  checkSession,
  authorizeAdmin,
  adminTransactionRouter,
);
app.use(
  "/api/v1/admin/users",
  authenticate,
  checkSession,
  authorizeAdmin,
  adminRouter,
);
app.use(
  "/api/v1/admin/receipts",
  authenticate,
  checkSession,
  authorizeAdmin,
  SMSrouter,
);

// Error handler (must be last)
app.use(globalErrorHandler);

const PORT = process.env.PORT || 3000;

// Initialize database and start server
const startServer = async () => {
  try {
    // Create database tables and run migrations
    await createTables();
    await runMigrations();

    // Start the penalty calculation cron job
    startPenaltyCron();
    console.log("✅ Penalty calculation cron job initialized");

    // Start the Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running at http://localhost:${PORT}`);
      console.log(
        `📊 Automatic penalty calculation is active (runs daily at 12:01 AM)`,
      );
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
startServer();
