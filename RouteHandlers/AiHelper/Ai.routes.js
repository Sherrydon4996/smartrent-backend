// RouteHandlers/ai.routes.js

import express from "express";
import {
  clearConversation,
  getContext,
  processAIQuery,
} from "../../Controllers/aiHelper/Ai.controller.js";

const AiRouter = express.Router();

// Process AI query
AiRouter.post("/query", processAIQuery);
AiRouter.post("/clear", clearConversation);

// Get system context (for debugging - can be removed in production)
AiRouter.get("/context", getContext);

export default AiRouter;
