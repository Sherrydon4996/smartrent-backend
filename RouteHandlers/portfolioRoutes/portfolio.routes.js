// RouteHandlers/portfolio.routes.js

import express from "express";
import {
  healthCheck,
  processPortfolioQuery,
} from "../../Controllers/portfolioAI/portfolioAI.controller.js";

const PortfolioRouter = express.Router();

// Process portfolio AI query
PortfolioRouter.post("/ai/query", processPortfolioQuery);

// Health check
PortfolioRouter.get("/ai/health", healthCheck);

export default PortfolioRouter;
