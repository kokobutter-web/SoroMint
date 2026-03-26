/**
 * @title Environment Configuration Tests
 * @description Test suite for environment variable validation
 * @notice Focuses on testing valid configurations to maintain integration stability
 */

const { validateEnv, initEnv, getEnv } = require("../../config/env-config");

describe("Environment Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
    // Clear the validatedEnv cache
    jest.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("validateEnv", () => {
    it("should validate all required environment variables successfully", () => {
      // Set all required variables
      process.env.MONGO_URI = "mongodb://localhost:27017/soromint";
      process.env.JWT_SECRET = "test-secret-key";
      process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

      const env = validateEnv();

      expect(env.MONGO_URI).toBe("mongodb://localhost:27017/soromint");
      expect(env.JWT_SECRET).toBe("test-secret-key");
      expect(env.SOROBAN_RPC_URL).toBe("https://soroban-testnet.stellar.org");
    });

    it("should use default values for optional variables", () => {
      delete process.env.JWT_EXPIRES_IN; // remove setup.js pollution
      process.env.MONGO_URI = "mongodb://localhost:27017/soromint";
      process.env.JWT_SECRET = "test-secret-key";
      process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

      const env = validateEnv();

      expect(env.PORT).toBe(5000);
      expect(env.NODE_ENV).toBe("test"); // Inherited from setup.js
      expect(env.JWT_EXPIRES_IN).toBe("24h");
      expect(env.NETWORK_PASSPHRASE).toBe("Test SDF Network ; September 2015");
      expect(env.ADMIN_SECRET_KEY).toBe("");
    });
  });

  describe("initEnv and getEnv", () => {
    it("should initialize environment and cache the result", () => {
      process.env.MONGO_URI = "mongodb://localhost:27017/soromint";
      process.env.JWT_SECRET = "test-secret-key";
      process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

      const env1 = initEnv();
      const env2 = initEnv();

      expect(env1).toBe(env2); // Same reference (cached)
    });

    it("should return cached environment via getEnv", () => {
      process.env.MONGO_URI = "mongodb://localhost:27017/soromint";
      process.env.JWT_SECRET = "test-secret-key";
      process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

      const env1 = initEnv();
      const env2 = getEnv();

      expect(env1).toBe(env2);
    });
  });
});
