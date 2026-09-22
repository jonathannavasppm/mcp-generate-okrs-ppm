import pino from "pino"

export const logger = pino({
  transport: {
    target: "pino-pretty",
    options: { destination: 2 },
  },
  level: process.env.LOG_LEVEL || "info",
})
