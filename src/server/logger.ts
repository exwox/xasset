import pino from "pino";
import { config } from "./config";

let instance: pino.Logger | undefined;
export function logger() { instance ??= pino({ level: config().LOG_LEVEL, redact: ["password", "passwordHash", "authorization", "cookie", "*.secret", "*.token"] }); return instance; }
