import express from "express";
import { config } from "./config/index.js";
import cors from "cors";
import {
  checkDatabaseConnection,
  closeDatabasePool,
  configureDatabasePool,
  getDatabasePoolSettings,
} from "./config/pgDB.js";

import Routes from "./routes/index.js";
import { clientLogger } from "./config/logger.js";
import { closeAllOraclePools } from "./config/oracle-dynamic.js";
import { getCurrentDateWithRiyadh } from "./lib/segments/datesFormate.js";

import net from "net";
import bodyParser from "body-parser";
import { pathToFileURL } from "url";
import { createShutdownHandler } from "./util/shutdown.js";

const app = express();
let server = null;

app.use(express.json());
app.use(cors());
app.use(bodyParser.text({ type: "*/*" }));

const shutdown = createShutdownHandler({
  server: null,
  closeDatabasePool,
  closeOraclePools: closeAllOraclePools,
  labels: { process: "api" },
});

async function initializeApp() {
  try {
    configureDatabasePool({ role: "api" });

    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      throw new Error("PostgreSQL connection fail");
    }
    clientLogger.info("✅ PostgreSQL connected successfully");


    server = app.listen(config.port, () => {
      clientLogger.info(
        `HL7 Generator running on http://localhost:${config.port}`,
      );
      clientLogger.info(
        `API PostgreSQL pool max: ${getDatabasePoolSettings().max}`,
      );
    });

    server.__shutdown = createShutdownHandler({
      server,
      closeDatabasePool,
      closeOraclePools: closeAllOraclePools,
      labels: { process: "api" },
    });
  } catch (error) {
    clientLogger.error(
      "fail to initialize application:" + JSON.stringify(error),
    );
    process.exit(1);
  }
}

app.use("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Welcome to the HL7 Generator API",
    timestamp: getCurrentDateWithRiyadh(),
  });
});

app.use("/api/v1/hl7", Routes);

app.use("/send-hl7-msg", async (req, res) => {
  const hl7Message = req.body;

  function sendHL7viaMLLP(message) {
    const host = config.hl7.host || "localhost";
    const port = config.hl7.receivePort;

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const mllpWrapped = `\x0B${message}\x1C\x0D`;

      socket.connect(port, host, () => {
        socket.write(mllpWrapped);
      });

      socket.on("data", (data) => {
        const ack = data.toString();
        socket.destroy();
        resolve(ack);
      });

      socket.on("error", (err) => reject(err));

      setTimeout(() => {
        socket.destroy();
        reject(new Error("Timeout waiting for ACK"));
      }, 5000);
    });
  }

  try {
    const ack = await sendHL7viaMLLP(hl7Message);
    res.json({ success: true, ack, message: "HL7 message sent successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;
  const errorMessage = err.message || "Internal Server Error";
  const errorCode = err.code || "UNKNOWN_ERROR";

  clientLogger.error(
    "Application error:" +
      JSON.stringify({
        error: {
          message: errorMessage,
          code: errorCode,
          statusCode,
          stack: err.stack,
          name: err.name,
        },
        request: {
          method: req.method,
          url: req.originalUrl || req.url,
          path: req.path,
          query: req.query,
          params: req.params,
          ip: req.ip || req.connection?.remoteAddress,
          userAgent: req.get("user-agent"),
        },
        timestamp: new Date().toISOString(),
      }),
  );

  const isDevelopment = process.env.NODE_ENV !== "production";

  const errorResponse = {
    success: false,
    error: {
      message: isDevelopment ? errorMessage : "Internal Server Error",
      code: errorCode,
      ...(isDevelopment && {
        stack: err.stack,
        details: err.details || null,
      }),
    },
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(errorResponse);
});

app.use((req, res) => {
  clientLogger.warn(
    "Route not found:" +
      JSON.stringify({
        method: req.method,
        url: req.originalUrl || req.url,
        ip: req.ip || req.connection?.remoteAddress,
      }),
  );

  res.status(404).json({
    success: false,
    error: {
      message: "Route not found",
      code: "NOT_FOUND",
      path: req.originalUrl || req.url,
    },
  });
});

process.on("SIGTERM", () => {
  clientLogger.debug("CLOSING>>>>>>>>>>>>>>>>");
  const handler = server?.__shutdown || shutdown;
  handler("SIGTERM");
});

process.on("SIGINT", () => {
  clientLogger.debug("CLOSING>>>>>>>>>>>>>>>>");
  const handler = server?.__shutdown || shutdown;
  handler("SIGINT");
});

process.on("unhandledRejection", (reason, promise) => {
  clientLogger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on("uncaughtException", (error) => {
  clientLogger.error("Uncaught Exception:" + JSON.stringify(error));
  const handler = server?.__shutdown || shutdown;
  handler("uncaughtException");
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  initializeApp();
}