/**
 * @title Token Routes Tests
 * @author SoroMint Team
 * @notice Comprehensive test suite for token management routes
 * @dev Tests cover token creation, validation, and retrieval
 */

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Token = require("../../models/Token");
const User = require("../../models/User");
const { generateToken } = require("../../middleware/auth");
const { errorHandler } = require("../../middleware/error-handler");
const tokenRoutes = require("../../routes/token-routes");

// Test environment setup
let mongoServer;
let app;
let testUser;
let validToken;

// Valid Stellar public keys for testing
const TEST_PUBLIC_KEY =
  "GDZYF2MVD4MMJIDNVTVCKRWP7F55N56CGKUCLH7SZ7KJQLGMMFMNVOVP";
const TEST_CONTRACT_ID =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

beforeAll(async () => {
  // Setup in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Set test environment variables
  process.env.JWT_SECRET = "test-secret-key-for-testing-only";
  process.env.JWT_EXPIRES_IN = "1h";

  // Setup Express app
  app = express();
  app.use(express.json());

  // Mock request metadata middleware
  app.use((req, res, next) => {
    req.correlationId = "test-correlation-id";
    next();
  });

  app.use("/api", tokenRoutes);
  app.use(errorHandler);

  // Create test user
  testUser = new User({
    publicKey: TEST_PUBLIC_KEY,
    username: "testadmin",
    role: "admin",
  });
  await testUser.save();

  // Generate valid token
  validToken = generateToken(TEST_PUBLIC_KEY, "testadmin");
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;
});

describe("Token Routes", () => {
  beforeEach(async () => {
    await Token.deleteMany({});
  });

  describe("POST /api/tokens", () => {
    const validTokenData = {
      name: "Test Token",
      symbol: "TEST",
      decimals: 7,
      contractId: TEST_CONTRACT_ID,
      ownerPublicKey: TEST_PUBLIC_KEY,
    };

    it("should create a new token successfully with valid data", async () => {
      const response = await request(app)
        .post("/api/tokens")
        .set("Authorization", `Bearer ${validToken}`)
        .send(validTokenData);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe(validTokenData.name);
      expect(response.body.symbol).toBe(validTokenData.symbol);

      // Verify in DB
      const token = await Token.findOne({ symbol: "TEST" });
      expect(token).toBeDefined();
      expect(token.name).toBe("Test Token");
    });

    it("should reject creation if name is too short", async () => {
      const response = await request(app)
        .post("/api/tokens")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...validTokenData, name: "T" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(response.body.error).toContain("name");
    });

    it("should reject creation if symbol is invalid (lowercase)", async () => {
      const response = await request(app)
        .post("/api/tokens")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...validTokenData, symbol: "test" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(response.body.error).toContain("symbol");
    });

    it("should reject creation if decimals is out of range", async () => {
      const response = await request(app)
        .post("/api/tokens")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...validTokenData, decimals: 20 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("decimals");
    });

    it("should reject creation if contractId is invalid", async () => {
      const response = await request(app)
        .post("/api/tokens")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...validTokenData, contractId: "INVALID" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("contractId");
    });

    it("should reject creation if ownerPublicKey is invalid", async () => {
      const response = await request(app)
        .post("/api/tokens")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...validTokenData, ownerPublicKey: "INVALID" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("ownerPublicKey");
    });

    it("should reject creation if required fields are missing", async () => {
      const response = await request(app)
        .post("/api/tokens")
        .set("Authorization", `Bearer ${validToken}`)
        .send({
          name: "Missing Fields",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("symbol");
      expect(response.body.error).toContain("contractId");
      expect(response.body.error).toContain("ownerPublicKey");
    });

    it("should use default value for decimals if not provided", async () => {
      const { decimals, ...rest } = validTokenData;
      const response = await request(app)
        .post("/api/tokens")
        .set("Authorization", `Bearer ${validToken}`)
        .send(rest);

      expect(response.status).toBe(201);
      expect(response.body.decimals).toBe(7);
    });
  });

  describe("GET /api/tokens/:owner", () => {
    it("should return tokens for a specific owner with pagination metadata", async () => {
      // Seed some data
      await new Token({
        name: "Token 1",
        symbol: "TK1",
        decimals: 7,
        contractId: TEST_CONTRACT_ID.replace("A", "1"),
        ownerPublicKey: TEST_PUBLIC_KEY,
        createdAt: new Date(Date.now() - 1000),
      }).save();

      await new Token({
        name: "Token 2",
        symbol: "TK2",
        decimals: 7,
        contractId: TEST_CONTRACT_ID.replace("A", "2"),
        ownerPublicKey: TEST_PUBLIC_KEY,
        createdAt: new Date(),
      }).save();

      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].symbol).toBe("TK2"); // Sorted newest first
      expect(response.body.data[1].symbol).toBe("TK1");
      expect(response.body.metadata).toEqual({
        totalCount: 2,
        page: 1,
        totalPages: 1,
        limit: 20,
        search: null,
      });
    });

    it("should respect limit and page parameters", async () => {
      // Seed 5 tokens
      for (let i = 1; i <= 5; i++) {
        await new Token({
          name: `Token ${i}`,
          symbol: `TK${i}`,
          decimals: 7,
          contractId: TEST_CONTRACT_ID.slice(0, -1) + i,
          ownerPublicKey: TEST_PUBLIC_KEY,
          createdAt: new Date(Date.now() + i * 1000),
        }).save();
      }

      // Request page 1 with limit 2
      const res1 = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?limit=2&page=1`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res1.body.data.length).toBe(2);
      expect(res1.body.data[0].symbol).toBe("TK5"); // Newest
      expect(res1.body.metadata.totalPages).toBe(3);

      // Request page 3 with limit 2
      const res3 = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?limit=2&page=3`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res3.body.data.length).toBe(1);
      expect(res3.body.data[0].symbol).toBe("TK1"); // Oldest
    });

    it("should return empty list if owner has no tokens", async () => {
      const response = await request(app)
        .get(
          "/api/tokens/GABCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        )
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.metadata.totalCount).toBe(0);
    });
  });

  describe("GET /api/tokens/:owner with search", () => {
    beforeEach(async () => {
      // Seed tokens with different names and symbols
      await new Token({
        name: "SoroMint Token",
        symbol: "SORO",
        decimals: 7,
        contractId: TEST_CONTRACT_ID.replace("A", "1"),
        ownerPublicKey: TEST_PUBLIC_KEY,
        createdAt: new Date(Date.now() - 3000),
      }).save();

      await new Token({
        name: "SoroGold Asset",
        symbol: "SGOLD",
        decimals: 7,
        contractId: TEST_CONTRACT_ID.replace("A", "2"),
        ownerPublicKey: TEST_PUBLIC_KEY,
        createdAt: new Date(Date.now() - 2000),
      }).save();

      await new Token({
        name: "Bitcoin Wrapped",
        symbol: "BTC",
        decimals: 8,
        contractId: TEST_CONTRACT_ID.replace("A", "3"),
        ownerPublicKey: TEST_PUBLIC_KEY,
        createdAt: new Date(Date.now() - 1000),
      }).save();

      await new Token({
        name: "Ethereum Token",
        symbol: "ETH",
        decimals: 18,
        contractId: TEST_CONTRACT_ID.replace("A", "4"),
        ownerPublicKey: TEST_PUBLIC_KEY,
        createdAt: new Date(),
      }).save();
    });

    it("should search tokens by name (case-insensitive)", async () => {
      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?search=soro`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data.map((t) => t.symbol).sort()).toEqual(["SGOLD", "SORO"]);
      expect(response.body.metadata.search).toBe("soro");
      expect(response.body.metadata.totalCount).toBe(2);
    });

    it("should search tokens by symbol (case-insensitive)", async () => {
      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?search=BTC`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].symbol).toBe("BTC");
      expect(response.body.metadata.search).toBe("BTC");
    });

    it("should perform case-insensitive search", async () => {
      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?search=SORO`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data.map((t) => t.symbol).sort()).toEqual(["SGOLD", "SORO"]);
    });

    it("should support partial matching", async () => {
      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?search=token`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data.map((t) => t.symbol).sort()).toEqual(["ETH", "SORO"]);
    });

    it("should return empty array for non-matching search", async () => {
      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?search=xyz123`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.metadata.totalCount).toBe(0);
      expect(response.body.metadata.search).toBe("xyz123");
    });

    it("should return all tokens when search is empty", async () => {
      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?search=`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(4);
      expect(response.body.metadata.totalCount).toBe(4);
      expect(response.body.metadata.search).toBeNull();
    });

    it("should return all tokens when search parameter is not provided", async () => {
      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(4);
      expect(response.body.metadata.totalCount).toBe(4);
      expect(response.body.metadata.search).toBeNull();
    });

    it("should combine search with pagination", async () => {
      // Search for "soro" with limit 1
      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?search=soro&limit=1&page=1`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.metadata.totalCount).toBe(2);
      expect(response.body.metadata.totalPages).toBe(2);
      expect(response.body.metadata.search).toBe("soro");
    });

    it("should reject search query that is too long", async () => {
      const longSearch = "a".repeat(51);
      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?search=${longSearch}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(response.body.error).toContain("Search query must not exceed 50 characters");
    });

    it("should reject invalid pagination with search", async () => {
      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?search=soro&page=0`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(response.body.error).toContain("Page");
    });

    it("should only search within the specified owner's tokens", async () => {
      // Create a token for a different owner
      await new Token({
        name: "SoroOther Token",
        symbol: "SORO",
        decimals: 7,
        contractId: TEST_CONTRACT_ID.replace("A", "5"),
        ownerPublicKey: "GABCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        createdAt: new Date(),
      }).save();

      const response = await request(app)
        .get(`/api/tokens/${TEST_PUBLIC_KEY}?search=soro`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      // Should only find the 2 tokens belonging to TEST_PUBLIC_KEY
      expect(response.body.data.length).toBe(2);
      expect(response.body.metadata.totalCount).toBe(2);
    });
  });
});
