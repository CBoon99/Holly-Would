import { migrate } from "../lib/db/migrate";
import { ensureDataDirs } from "../lib/paths";

ensureDataDirs();
migrate();
console.log("Schema applied.");
