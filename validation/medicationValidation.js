import Joi from "joi";
import { MEDICATION_LOGGER } from "../config/logger.js";
import { validateData } from "./index.js";


/**
 * Joi schema for prescription parameters
 */
const prescriptionSchema = Joi.object({
  startDate: Joi.string()
    .optional()
    .pattern(/^\d{4}-\d{2}-\d{2}$|^\d{2}-\d{2}-\d{4}$/)
    .messages({
      "string.empty": "startDate is required",
      "string.pattern.base": "startDate must be in YYYY-MM-DD or DD-MM-YYYY format",
    }),
  endDate: Joi.string()
    .optional()
    .pattern(/^\d{4}-\d{2}-\d{2}$|^\d{2}-\d{2}-\d{4}$/)
    .messages({
      "string.empty": "endDate is required",
      "string.pattern.base": "endDate must be in YYYY-MM-DD or DD-MM-YYYY format",
    }),
  patientId: Joi.number().optional().integer().positive().messages({
    "number.base": "patientId must be a number",
    "number.integer": "patientId must be an integer",
    "number.positive": "patientId must be positive",
  }),
  facilityId: Joi.number().integer().positive().required().messages({
    "number.base": "facilityId must be a number",
    "number.integer": "facilityId must be an integer",
    "number.positive": "facilityId must be positive",
    "any.required": "facilityId is required",
  }),
  episodeNo: Joi.number().integer().positive().optional().messages({
    "number.base": "episodeNo must be a number",
    "number.integer": "episodeNo must be an integer",
    "number.positive": "episodeNo must be positive",
  }),
  status: Joi.string().optional(),
  orderLine: Joi.number().integer().positive().optional().messages({
    "number.base": "orderLine must be a number",
    "number.integer": "orderLine must be an integer",
    "number.positive": "orderLine must be positive",
  }),
  
}).unknown(false);









/**
 * Validate prescription parameters
 */
export const validatePrescription = (params) => {
  const result = validateData(prescriptionSchema, params, "prescription");

  return result;
};



