/**
 * @title SoroMint Server Entry Point
 * @description Main application entry point with environment validation
 * @notice Initializes server with validated environment variables
 */

// Initialize and validate environment variables FIRST (fail-fast)
const { initEnv } = require("./config/env-config");
initEnv();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const Token = require("./models/Token");
const DeploymentAudit = require("./models/DeploymentAudit");
const stellarService = require("./services/stellar-service");
const {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
} = require("./middleware/error-handler");
const {
  logger,
  correlationIdMiddleware,
  httpLoggerMiddleware,
  logStartupInfo,
  logDatabaseConnection,
} = require("./utils/logger");
const { setupSwagger } = require("./config/swagger");
const { authenticate } = require("./middleware/auth");
const authRoutes = require("./routes/auth-routes");
const statusRoutes = require("./routes/status-routes");
const auditRoutes = require("./routes/audit-routes");
const tokenRoutes = require("./routes/token-routes");

const { getEnv } = require("./config/env-config");

const app = express();
const env = getEnv();
const PORT = env.PORT;

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware (must be early in the chain)
app.use(correlationIdMiddleware);
app.use(httpLoggerMiddleware);

// Set up API Documentation
setupSwagger(app);

if (process.env.NODE_ENV !== 'test') {
  // Database Connection
  mongoose
    .connect(env.MONGO_URI)
    .then(() => {
      logDatabaseConnection(true);
    })
    .catch((err) => {
      logDatabaseConnection(false, err);
    });
}

// Routes
app.use("/api", statusRoutes);
app.use("/api", auditRoutes);
app.use("/api", tokenRoutes);
app.use("/api/auth", authRoutes);

// 404 handler for undefined routes
app.use(notFoundHandler);

// Centralized error handling middleware (must be last)
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logStartupInfo(PORT, env.NETWORK_PASSPHRASE);
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(
      `📚 API Documentation available at http://localhost:${PORT}/api-docs`,
    );
  });
}

module.exports = app;
