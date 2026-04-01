const express = require("express");
const Token = require("../models/Token");
const DeploymentAudit = require("../models/DeploymentAudit");
const { asyncHandler } = require("../middleware/error-handler");
const { logger } = require("../utils/logger");
const { authenticate } = require("../middleware/auth");
const { tokenDeploymentRateLimiter } = require("../middleware/rate-limiter");
const {
  validateToken,
  validatePagination,
  validateSearch,
} = require("../validators/token-validator");
const { dispatch } = require("../services/webhook-service");
const { getCacheService } = require("../services/cache-service");

const createTokenRouter = ({ deployRateLimiter = tokenDeploymentRateLimiter } = {}) => {
  const router = express.Router();

  /**
   * @route GET /api/tokens/:owner
   * @group Tokens - Token management operations
   * @param {string} owner.path - Owner's Stellar public key
   * @param {number} page.query - Page number (default: 1)
   * @param {number} limit.query - Items per page (default: 20)
   * @param {string} search.query - Search query for token name or symbol (case-insensitive)
   * @returns {Object} 200 - Paginated tokens with metadata
   * @returns {Error} 400 - Invalid parameters
   * @returns {Error} default - Unexpected error
   * @security [JWT]
   */
  router.get(
    "/tokens/:owner",
    authenticate,
    validatePagination,
    validateSearch,
    asyncHandler(async (req, res) => {
      const { owner } = req.params;
      const { page, limit, search } = req.query;
      const cacheService = getCacheService();

      logger.info("Fetching tokens for owner", {
        correlationId: req.correlationId,
        ownerPublicKey: owner,
        page,
        limit,
        search: search || null,
      });

      // Build cache key based on query parameters
      const cacheKey = `tokens:owner:${owner}:page:${page}:limit:${limit}:search:${search || 'none'}`;

      try {
        // Try to get from cache
        const cachedResult = await cacheService.get(cacheKey);
        if (cachedResult) {
          logger.debug("Returning cached token list", {
            correlationId: req.correlationId,
            cacheKey,
          });
          return res.json({
            success: true,
            data: cachedResult.data,
            metadata: cachedResult.metadata,
            cached: true,
          });
        }
      } catch (error) {
        logger.warn("Cache retrieval failed, proceeding with database query", {
          correlationId: req.correlationId,
          error: error.message,
        });
      }

      const skip = (page - 1) * limit;
      const queryFilter = { ownerPublicKey: owner };

      if (search) {
        const searchRegex = new RegExp(search, "i");
        queryFilter.$or = [
          { name: { $regex: searchRegex } },
          { symbol: { $regex: searchRegex } },
        ];

        logger.info("Applying search filter", {
          correlationId: req.correlationId,
          search,
          ownerPublicKey: owner,
        });
      }

      const [tokens, totalCount] = await Promise.all([
        Token.find(queryFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Token.countDocuments(queryFilter),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      const result = {
        data: tokens,
        metadata: {
          totalCount,
          page,
          totalPages,
          limit,
          search: search || null,
        },
      };

      // Cache the result
      try {
        await cacheService.set(cacheKey, result);
        logger.debug("Token list cached", {
          correlationId: req.correlationId,
          cacheKey,
        });
      } catch (error) {
        logger.warn("Cache storage failed", {
          correlationId: req.correlationId,
          error: error.message,
        });
      }

      res.json({
        success: true,
        ...result,
        cached: false,
        * @returns { Token } 201 - Successfully created token
      * @returns { Error } 400 - Missing required fields or validation error
      * @returns { Error } 409 - Token with this contractId already exists
        * @returns { Error } default - Unexpected error
          * @security[JWT]
          */
      router.post(
        "/tokens",
        deployRateLimiter,
        authenticate,
        validateToken,
        asyncHandler(async (req, res) => {
          const { name, symbol, decimals, contractId, ownerPublicKey } = req.body;
          const userId = req.user._id;
          const cacheService = getCacheService();

          logger.info("Creating new token", {
            correlationId: req.correlationId,
            name,
            symbol,
            ownerPublicKey,
            userId,
          });

          try {
            const newToken = new Token({
              name,
              symbol,
              decimals,
              contractId,
              ownerPublicKey,
            });
            await newToken.save();

            logger.info("Token created successfully", {
              correlationId: req.correlationId,
              tokenId: newToken._id,
            });

            // Invalidate cache for this owner to force fresh data on next request
            try {
              const keysDeleted = await cacheService.deleteByPattern(`tokens:owner:${ownerPublicKey}:*`);
              logger.debug("Invalidated owner token cache", {
                correlationId: req.correlationId,
                ownerPublicKey,
                keysDeleted,
              });
            } catch (error) {
              logger.warn("Cache invalidation failed after token creation", {
                correlationId: req.correlationId,
                error: error.message,
              });
            }
            dispatch('token.minted', { tokenId: newToken._id, name, symbol, contractId, ownerPublicKey });

            res.status(201).json(newToken);
          } catch (error) {
            logger.error("Token creation failed", {
              correlationId: req.correlationId,
              error: error.message,
            });

            await DeploymentAudit.create({
              userId,
              tokenName: name,
              contractId,
              status: "FAIL",
              errorMessage: error.message,
            });

            throw error;
          }
        }),
      );

      /**
       * @route GET /api/tokens/metadata/:id
       * @description Get a single token by its ID using the cache-aside pattern
       * @security [JWT]
       */
      router.get(
        "/tokens/metadata/:id",
        authenticate,
        asyncHandler(async (req, res) => {
          const { id } = req.params;
          const cacheService = getCacheService();
          const cacheKey = `token:metadata:${id}`;

          logger.info("Fetching token metadata", {
            correlationId: req.correlationId,
            tokenId: id,
          });

          // Cache-aside pattern via getOrSet 
          const token = await cacheService.getOrSet(
            cacheKey,
            async () => {
              const tokenFromDb = await Token.findById(id).lean();
              if (!tokenFromDb) {
                throw new AppError("Token not found", 404, "NOT_FOUND");
              }
              return tokenFromDb;
            }
          );

          res.json({ success: true, data: token });
        })
      );

      /**
       * @route PUT /api/tokens/metadata/:id
       * @description Update a token's metadata and invalidate the cache
       * @security [JWT]
       */
      router.put(
        "/tokens/metadata/:id",
        authenticate,
        asyncHandler(async (req, res) => {
          const { id } = req.params;
          const { name, symbol } = req.body;
          const cacheService = getCacheService();

          logger.info("Updating token metadata", {
            correlationId: req.correlationId,
            tokenId: id,
          });

          const updatedToken = await Token.findByIdAndUpdate(
            id,
            { $set: { name, symbol } },
            { new: true, runValidators: true }
          ).lean();

          if (!updatedToken) {
            throw new AppError("Token not found", 404, "NOT_FOUND");
          }

          // Invalidate specific token metadata cache
          await cacheService.delete(`token:metadata:${id}`);
          if (updatedToken.ownerPublicKey) {
            // Invalidate the owner's token paginated list caches to match updated metadata
            await cacheService.deleteByPattern(`tokens:owner:${updatedToken.ownerPublicKey}:*`);
          }

          res.json({ success: true, data: updatedToken });
        })
      );
      notifyUser(userId, 'deploymentFailed', () => buildDeploymentFailedContent(name, error.message));

      throw error;
    }
  }),
  );

      return router;
    };

  module.exports = createTokenRouter();
  module.exports.createTokenRouter = createTokenRouter;
