import axios from 'axios';
import { REGISTRY_LOGGER } from '../../config/logger.js';
import { getConfValue } from '../../util/loadConf.js';

// Cache tokens per (type + facility)
const tokenCache = {};

// Map of token types to their conf keys
const TOKEN_TYPE_CONFIG = {
  patient: {
    consumerKey: 'CRS_PATIENT_KEY',
    consumerSecret: 'CRS_PATIENT_SECRET',
  },
  practitioner: {
    consumerKey: 'CRS_PRACTITIONER_KEY',
    consumerSecret: 'CRS_PRACTITIONER_SECRET',
  },
};

// Fallback default credentials if not found in conf table
const DEFAULT_VALUES = {
  patient: {
    consumerKey: 'XuVuKtBUic3nQ6j4p94TdbrGa3ghy91E',
    consumerSecret: '0vTXkQXZJMqRKPNc',
  },
  practitioner: {
    consumerKey: 'pe6nZpDiR7VCWiqHae2mSKunZaustGXF',
    consumerSecret: 'EqGQTZhxvsikf9xd',
  },
};

export const getEnvironmentConfig = async (type, facilityId = null) => {
  const typeConfig = TOKEN_TYPE_CONFIG[type];
  if (!typeConfig) {
    throw new Error(`Unsupported token type: ${type}`);
  }

  const consumerKeyFromDb = await getConfValue({
    key: typeConfig.consumerKey,
    facilityId,
  });
  const consumerSecretFromDb = await getConfValue({
    key: typeConfig.consumerSecret,
    facilityId,
  });

  const defaults = DEFAULT_VALUES[type] || {};

  const consumerKey = consumerKeyFromDb || defaults.consumerKey;
  const consumerSecret = consumerSecretFromDb || defaults.consumerSecret;

  if (!consumerKeyFromDb || !consumerSecretFromDb) {
    REGISTRY_LOGGER.warn(
      `Using default credentials for token type: ${type} (facility: ${facilityId ?? 'default'}) ` +
        `because one or more conf values were missing.`
    );
  }

  return { consumerKey, consumerSecret };
};

export const getAccessToken = async (type, facilityId = null) => {
  try {
    if (!type) {
      throw new Error('Token type is required (e.g., "patient" or "practitioner")');
    }

    const cacheKey = `${type}:${facilityId ?? 'default'}`;

    // Check for valid cached token for this type+facility
    const cached = tokenCache[cacheKey];
    if (cached && cached.token && cached.expiry && Date.now() < cached.expiry) {
      REGISTRY_LOGGER.debug(`Using cached token for ${cacheKey}`);
      return { token: cached.token };
    }

    const config = await getEnvironmentConfig(type, facilityId);
    const baseUrl = await getConfValue({ key: 'NHIC_URL', facilityId });

    if (!config.consumerKey || !config.consumerSecret) {
      throw new Error(`Missing API keys for token type: ${type}`);
    }

    if (!baseUrl) {
      throw new Error(`Missing base URL for token type: ${type}`);
    }

    const credentials = Buffer.from(
      `${config.consumerKey}:${config.consumerSecret}`
    ).toString('base64');

    REGISTRY_LOGGER.debug(
      `Requesting token from ${baseUrl} for ${cacheKey} with consumerKey: ${config.consumerKey}`
    );

    const tokenEndpoint = '/oauth/token';

    const response = await axios({
      method: 'POST',
      url: `${baseUrl}${tokenEndpoint}`,
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: 'grant_type=client_credentials',
    });

    REGISTRY_LOGGER.debug(
      `Token response received for ${cacheKey}: ${JSON.stringify(response.data)}`
    );

    const { access_token, expires_in } = response.data;

    // Store token with expiry (1 hour buffer to be safe)
    tokenCache[cacheKey] = {
      token: access_token,
      expiry: Date.now() + (expires_in - 3600) * 1000,
    };

    REGISTRY_LOGGER.debug(`New token obtained successfully for ${cacheKey}`);
    return { token: access_token };
  } catch (error) {
    REGISTRY_LOGGER.error(
      `Error getting token for type ${type} (facility ${facilityId}):`,
      error.message
    );
    if (error.response) {
      REGISTRY_LOGGER.error('Response status:', error.response.status);
      REGISTRY_LOGGER.error('Response data:', error.response.data);
    }
    throw error;
  }
};

/**
 * Clear token cache.
 * @param {string} [type] - If provided with facilityId, clears that specific entry.
 *                          If only type provided, clears all entries for that type.
 *                          If omitted, clears all cached tokens.
 * @param {number|null} [facilityId] - Optional facility id.
 */
export const clearToken = (type, facilityId = null) => {
  if (type && facilityId !== null) {
    const cacheKey = `${type}:${facilityId}`;
    delete tokenCache[cacheKey];
    REGISTRY_LOGGER.info(`Token cache cleared for ${cacheKey}`);
  } else if (type) {
    Object.keys(tokenCache)
      .filter((k) => k.startsWith(`${type}:`))
      .forEach((k) => delete tokenCache[k]);
    REGISTRY_LOGGER.info(`Token cache cleared for all facilities of type: ${type}`);
  } else {
    Object.keys(tokenCache).forEach((key) => delete tokenCache[key]);
    REGISTRY_LOGGER.info('All token caches cleared');
  }
};