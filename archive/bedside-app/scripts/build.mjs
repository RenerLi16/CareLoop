import { buildStaticApp } from "../src/static-app.js";
import { fileURLToPath } from "node:url";
const target = fileURLToPath(new URL("../dist/", import.meta.url));
console.log(`Static offline app built at ${buildStaticApp(target)}`);
