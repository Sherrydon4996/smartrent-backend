import { createClient } from "@libsql/client";
import { TURSO_API, TURSO_URL } from "./env.js";

export const db = createClient({
  url: TURSO_URL,
  authToken: TURSO_API,
});
