import { Router } from "express";
import { getAllUsers } from "./../../Controllers/auth/getAllUsers.controller.js";
import { createUser } from "./../../Controllers/auth/createUser.controller.js";
import {
  unsuspendUser,
  updateUser,
} from "./../../Controllers/auth/updateUser.controller.js";
import { deleteUser } from "./../../Controllers/auth/deleteUser.controller.js";
import { suspendUser } from "./../../Controllers/auth/suspendUser.controller.js";
import { activateUser } from "./../../Controllers/auth/activateUser.controller.js";

const adminRouter = Router();

adminRouter.get("/fetchAll", getAllUsers);
adminRouter.post("/create", createUser);
adminRouter.put("/update/:id", updateUser);
adminRouter.delete("/delete/:id", deleteUser);
adminRouter.put("/:id/suspend", suspendUser);
adminRouter.put("/:id/activate", activateUser);
adminRouter.put("/:id/unsuspend", unsuspendUser);

export default adminRouter;
