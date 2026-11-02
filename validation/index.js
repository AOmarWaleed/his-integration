/**
 * Generic validation function
 * @param {Object} schema - Joi schema to validate against
 * @param {Object} data - Data to validate
 * @param {string} context - Context for logging
 * @returns {Object} Validation result
 */
export const validateData = (schema, data, context) => {
  try {
    MEDICATION_LOGGER.debug(`Validating ${context}: ${JSON.stringify(data)}`);

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      MEDICATION_LOGGER.warn(
        `${context} validation fail: ${errors.join(", ")}`,
      );

      return {
        isValid: false,
        errors,
        value: null,
      };
    }

    MEDICATION_LOGGER.debug(`${context} validation passed`);
    return {
      isValid: true,
      errors: [],
      value,
    };
  } catch (err) {
    MEDICATION_LOGGER.error(`Validation error for ${context}:`, err);
    return {
      isValid: false,
      errors: ["Validation process fail"],
      value: null,
    };
  }
};