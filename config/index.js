import dotenv from "dotenv";

dotenv.config();

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const workerMaxConcurrency = parseInteger(process.env.WORKER_MAX_CONCURRENCY, 4);

export const config = {
  port: parseInteger(process.env.PORT, 3500),
  logLevel: process.env.LOG_LEVEL,
  logFile: process.env.LOGGER_FILE,
  hl7: {
    host: process.env.HL7_HOST || "localhost",
    sendPort: parseInteger(process.env.HL7_SEND_PORT, 8080),
    receivePort: parseInteger(process.env.HL7_RECEIVE_PORT, 8080),
  },
  db: {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInteger(process.env.DB_PORT, 5432),
    apiPoolMax: parseInteger(process.env.DB_API_POOL_MAX, 20),
    workerPoolMax: parseInteger(
      process.env.DB_WORKER_POOL_MAX,
      Math.max(workerMaxConcurrency + 2, 30),
    ),
    idleTimeoutMillis: parseInteger(process.env.DB_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMillis: parseInteger(
      process.env.DB_CONNECTION_TIMEOUT_MS,
      30000,
    ),
  },
  worker: {
    maxConcurrency: workerMaxConcurrency,
  },
  oracle: {
    libDir: process.env.ORACLE_LIB_DIR,
    user: process.env.HIS_DB_USER,
    password: process.env.HIS_DB_PASSWORD,
    connectString: `${process.env.HIS_DB_HOST}:${process.env.HIS_DB_PORT}/${process.env.HIS_DB_DATABASE}`,
    poolTimeout: parseInteger(process.env.ORACLE_POOL_TIMEOUT, 60),
    queueTimeout: parseInteger(process.env.ORACLE_QUEUE_TIMEOUT, 60000),
    sharedPoolMin: parseInteger(process.env.ORACLE_SHARED_POOL_MIN, 0),
    sharedPoolMax: parseInteger(process.env.ORACLE_SHARED_POOL_MAX, 6),
    sharedPoolIncrement: parseInteger(process.env.ORACLE_SHARED_POOL_INCREMENT, 1),
    apiPoolMin: parseInteger(process.env.ORACLE_API_POOL_MIN, 0),
    apiPoolMax: parseInteger(process.env.ORACLE_API_POOL_MAX, 6),
    apiPoolIncrement: parseInteger(process.env.ORACLE_API_POOL_INCREMENT, 1),
    jobPoolMin: parseInteger(process.env.ORACLE_JOB_POOL_MIN, 0),
    jobPoolMax: parseInteger(process.env.ORACLE_JOB_POOL_MAX, 16),
    jobPoolIncrement: parseInteger(process.env.ORACLE_JOB_POOL_INCREMENT, 4),
  },
};