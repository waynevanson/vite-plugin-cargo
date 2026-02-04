import { createDebug } from "obug";

// I hate this. Maybe use pino? It's for me and not anyone else
export const debug = createDebug("vite-plugin-cargo");
