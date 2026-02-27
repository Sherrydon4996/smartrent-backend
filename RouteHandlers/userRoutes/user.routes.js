import { Router } from "express";

import { getUserById } from "./../../Controllers/auth/getUserById.controller.js";

const userRouter = Router();

userRouter.get("/:id", getUserById);

export default userRouter;
