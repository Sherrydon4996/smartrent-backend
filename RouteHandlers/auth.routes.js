import { Router } from "express";
import { login, logout, refresh } from "../Controllers/auth/auth.controller.js";
import { me } from "../Controllers/auth/verify.controller.js";
import { authenticate } from "../middlewares/Authentication.js";

const authRouter = Router();

authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", authenticate, logout);
authRouter.get("/me", authenticate, me);

export default authRouter;
