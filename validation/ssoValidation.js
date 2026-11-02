import Joi from 'joi';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

/**
 * Joi schema for SSO parameters validation
 * Based on NPHIES-CS Single Sign On (SSO) documentation
 */
const ssoParamsSchema = Joi.object({
    practitionerId: Joi.string()
        .required()
        .pattern(/^\d+$/)
        .min(10)
        .messages({
            'string.empty': 'Provider ID is required',
            'string.pattern.base': 'Provider ID must be numeric',
            'string.min': 'Provider ID must be at least 10 digits',
            'any.required': 'Provider ID is required'
        }),
    
    healthId: Joi.string()
        .required()
        .pattern(/^\d+$/)
        .min(10)
        .messages({
            'string.empty': 'Patient Health ID is required',
            'string.pattern.base': 'Patient Health ID must be numeric',
            'string.min': 'Patient Health ID must be at least 10 digits',
            'any.required': 'Patient Health ID is required'
        }),
    
    env: Joi.string()
        .optional()
        .valid('TEST', 'LIVE')
        .default('TEST')
        .messages({
            'any.only': 'Environment must be TEST or LIVE'
        })
});

/**
 * Validation result interface
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether validation passed
 * @property {string[]} errors - List of validation errors
 * @property {Object} [value] - Validated and transformed values
 */

/**
 * Validate SSO parameters from request using Joi
 * From HTML tool: Parameters come from form inputs
 * @param {Object} params - Request parameters
 * @param {string} params.practitionerId - Practitioner ID (National ID/Iqama ID)
 * @param {string} params.healthId - Patient Health ID
 * @param {string} params.key - Organization key
 * @param {string} params.env - Environment (ONA, ONB, PROD)
 * @returns {ValidationResult} Validation result
 */
export const validateSsoParams = (params) => {
    try {
        SSO_LOGGER.verbose(`Validating SSO params: ${JSON.stringify(params)}`);
        
        const { error, value } = ssoParamsSchema.validate(params, { 
            abortEarly: false,
            stripUnknown: true 
        });
        
        if (error) {
            const errors = error.details.map(detail => detail.message);
            SSO_LOGGER.warn(`Validation fail: ${errors.join(', ')}`);
            
            return {
                isValid: false,
                errors,
                value: null
            };
        }
        
        return {
            isValid: true,
            errors: [],
            value
        };
        
    } catch (error) {
        SSO_LOGGER.error(`Validation error: ${error.message}`);
        return {
            isValid: false,
            errors: ['Internal validation error'],
            value: null
        };
    }
};

/**
 * Joi schema for SAML Response validation
 */
const samlResponseSchema = Joi.object({
    samlXml: Joi.string()
        .required()
        .custom((value, helpers) => {
            if (!value) {
                return helpers.error('any.required');
            }
            
            // Check for required SAML elements
            const requiredElements = [
                'samlp:Response',
                'saml:Issuer',
                'saml:Assertion',
                'saml:Subject',
                'saml:AttributeStatement'
            ];
            
            const missingElements = requiredElements.filter(
                element => !value.includes(element)
            );
            
            if (missingElements.length > 0) {
                return helpers.error('xml.missingElements', { missingElements });
            }
            
            // Basic XML structure validation
            if (!value.trim().startsWith('<?xml')) {
                return helpers.error('xml.invalid');
            }
            
            return value;
        })
        .messages({
            'any.required': 'SAML Response is empty',
            'xml.missingElements': 'Missing required SAML elements: {{#missingElements}}',
            'xml.invalid': 'Invalid XML structure'
        })
});

/**
 * Validate SAML Response before sending with time validation
 * @param {string} samlXml - SAML Response XML
 * @returns {ValidationResult} Validation result
 */
export const validateSAMLResponse = (samlXml) => {
    try {
        // First validate XML structure
        const { error, value } = samlResponseSchema.validate(
            { samlXml }, 
            { abortEarly: false }
        );
        
        if (error) {
            const errors = error.details.map(detail => {
                if (detail.type === 'xml.missingElements') {
                    const missing = detail.context.missingElements.join(', ');
                    return `Missing required SAML elements: ${missing}`;
                }
                return detail.message;
            });
            
            return {
                isValid: false,
                errors
            };
        }
        
        // Extract time attributes from SAML
        const issueInstantMatch = samlXml.match(/IssueInstant="([^"]+)"/);
        const notBeforeMatch = samlXml.match(/NotBefore="([^"]+)"/);
        const notOnOrAfterMatch = samlXml.match(/NotOnOrAfter="([^"]+)"/);
        
        if (!issueInstantMatch || !notBeforeMatch || !notOnOrAfterMatch) {
            return {
                isValid: false,
                errors: ['Missing time attributes in SAML Response']
            };
        }
        
        const issueInstant = dayjs.utc(issueInstantMatch[1]);
        const notBefore = dayjs.utc(notBeforeMatch[1]);
        const notOnOrAfter = dayjs.utc(notOnOrAfterMatch[1]);
        
        // Get current UTC time
        const now = dayjs.utc();
        
        // Validate time with tolerance (5 minutes = 300 seconds)
        const timeDiffSeconds = Math.abs(now.diff(issueInstant, 'second'));
        
        if (timeDiffSeconds > 300) {
            return {
                isValid: false,
                errors: [`Time difference too large: ${Math.round(timeDiffSeconds / 60)} minutes`]
            };
        }
        
        // Check if SAML is not yet valid
        if (now.isBefore(notBefore)) {
            const waitSeconds = notBefore.diff(now, 'second');
            return {
                isValid: false,
                errors: [`SAML not yet valid, wait ${waitSeconds} seconds`]
            };
        }
        
        // Check if SAML has expired
        if (now.isAfter(notOnOrAfter)) {
            const expiredSeconds = now.diff(notOnOrAfter, 'second');
            return {
                isValid: false,
                errors: [`SAML response has expired by ${expiredSeconds} seconds`]
            };
        }
        
        return {
            isValid: true,
            errors: []
        };
        
    } catch (error) {
        SSO_LOGGER.error(`SAML Response validation error: ${error.message}`);
        return {
            isValid: false,
            errors: [`SAML Response validation fail: ${error.message}`]
        };
    }
};

/**
 * Custom validation for specific SAML attributes
 * @param {Object} attributes - SAML attributes
 * @param {string} attributes.organizationId - Organization ID
 * @param {string} attributes.healthId - Health ID
 * @param {string} attributes.practitionerId - Practitioner ID
 * @returns {ValidationResult} Validation result
 */
export const validateSAMLAttributes = (attributes) => {
    const schema = Joi.object({
        organizationId: Joi.string()
            .required()
            .pattern(/^\d+$/)
            .min(14)
            .messages({
                'string.empty': 'Organization ID is required',
                'string.pattern.base': 'Organization ID must be numeric',
                'string.min': 'Organization ID must be at least 14 digits'
            }),
        
        healthId: Joi.string()
            .required()
            .pattern(/^\d+$/)
            .min(10)
            .messages({
                'string.empty': 'Health ID is required',
                'string.pattern.base': 'Health ID must be numeric',
                'string.min': 'Health ID must be at least 10 digits'
            }),
        
        practitionerId: Joi.string()
            .required()
            .pattern(/^\d+$/)
            .min(10)
            .messages({
                'string.empty': 'Practitioner ID is required',
                'string.pattern.base': 'Practitioner ID must be numeric',
                'string.min': 'Practitioner ID must be at least 10 digits'
            })
    });
    
    const { error } = schema.validate(attributes, { abortEarly: false });
    
    if (error) {
        return {
            isValid: false,
            errors: error.details.map(detail => detail.message)
        };
    }
    
    return {
        isValid: true,
        errors: []
    };
};