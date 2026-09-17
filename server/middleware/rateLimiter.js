const rateLimit = require('express-rate-limit');

/**
 * Enterprise Rate Limiters for Deciva
 * Protects against brute-force attacks, credential stuffing, SMTP exhaustion, and AI quota drainage.
 */

const isDev = process.env.NODE_ENV !== 'production';

const authLimiter = rateLimit({
  windowMs: isDev ? 5 * 1000 : 15 * 60 * 1000, // 5s in dev/test, 15 minutes in prod
  max: isDev ? 5 : 20, // 5 in dev/test so rapid 10-req batches trigger 429 and reset quickly
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: 'Too many authentication requests from this IP address. Please try again in 15 minutes.'
  }
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 30 : 10, // Max 10 attempts to prevent PIN brute forcing in prod
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: 'Too many failed code verification attempts. Access temporarily restricted for 15 minutes.'
  }
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 25, // Max 25 queries per minute per user/IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip || 'anonymous';
  },
  message: {
    error: 'AI reasoning throughput limit exceeded. Please wait a moment before initiating another query.'
  }
});

const integrationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: 'Integration operational throughput limit reached. Please wait before retrying.'
  }
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: 'Webhook receiver rate limit exceeded.'
  }
});

module.exports = {
  authLimiter,
  otpVerifyLimiter,
  aiLimiter,
  integrationLimiter,
  webhookLimiter
};
