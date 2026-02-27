import { Router } from "express";
import { getAllPenalties } from "./../../Controllers/penalties/getAllPenalties.controller.js";
import { getPenaltyById } from "./../../Controllers/penalties/getPenaltyById.controller.js";
import { getPenaltyByBuilding } from "./../../Controllers/penalties/getPenaltyByBuilding.controller.js";

const userPenaltyRouter = Router();

userPenaltyRouter.get("/get", getAllPenalties);
userPenaltyRouter.get("/get/:id", getPenaltyById);
userPenaltyRouter.get("/penalties/building/:buildingId", getPenaltyByBuilding);

export default userPenaltyRouter;
