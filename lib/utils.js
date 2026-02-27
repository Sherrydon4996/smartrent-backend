// import jwt from "jsonwebtoken";
// import { ACCESS_TOKEN, NODE_ENV } from "../config/env.js";

// export function generateToken(userId, res) {
//   const token = jwt.sign({ userId }, ACCESS_TOKEN, { expiresIn: "7d" });

//   res.cookie("token", token, {
//     httpOnly: true,
//     secure: NODE_ENV !== "development",
//     sameSite: "strict",
//     path: "/",
//     maxAge: 1000 * 60 * 60 * 24,
//   });
// }

export const HOUSE_PRICES = {
  single_room: { min: 3500, max: 3800, label: "Single" },
  bedsitter: { min: 5500, max: 6500, label: "Bedsitter" },
  "1_bedroom": { max: 9000, label: "1 B-room" },
  "2_bedroom": { max: 12000, label: "2 B-room" },
  "3_bedroom": { max: 18000, label: "3 B-room" },
};
