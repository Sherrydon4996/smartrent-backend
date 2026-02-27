import { Router } from "express";
import { createPenalty } from "./../../Controllers/penalties/createPenalty.controller.js";
import { updatePenalty } from "./../../Controllers/penalties/updatePenalty.controller.js";
import { deletePenalty } from "./../../Controllers/penalties/deletePenalty.controller.js";
import { updateAllPenalties } from "../../Controllers/transactions/upsertTransaction.controller.js";

const adminPenaltyRouter = Router();

adminPenaltyRouter.post("/create", createPenalty);
adminPenaltyRouter.put("/update/:id", updatePenalty);
adminPenaltyRouter.delete("/delete/:id", deletePenalty);
adminPenaltyRouter.post("/calculate", updateAllPenalties);

export default adminPenaltyRouter;
