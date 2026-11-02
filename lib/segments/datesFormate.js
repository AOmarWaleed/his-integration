// lib/segments/datesFormate.js
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const SAUDI_TIMEZONE = 'Asia/Riyadh';

/**
 * Format date/time for HL7
 */
export const formatDateTime = (
  dateInput,
  includeTime = true,
  includeTimezone = true,
) => {
  try {
    clientLogger.verbose(
      `Formatting date/time ${JSON.stringify({ dateInput, includeTime, includeTimezone })}`,
    );
    if (!dateInput) return "";

    if (typeof dateInput === "string" && /^\d{14}$/.test(dateInput)) {
      return dateInput;
    }

    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    if (!includeTime) {
      return `${year}${month}${day}`;
    }

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    let result = `${year}${month}${day}${hours}${minutes}${seconds}`;

    if (includeTimezone) {
      const timezoneOffset = date.getTimezoneOffset();
      const sign = timezoneOffset <= 0 ? "+" : "-";
      const offsetHours = Math.abs(Math.floor(timezoneOffset / 60));
      const offsetMinutes = Math.abs(timezoneOffset % 60);
      result += `${sign}${String(offsetHours).padStart(2, "0")}${String(
        offsetMinutes,
      ).padStart(2, "0")}`;
    }

    return result;
  } catch (e) {
    console.error("Error formatting date:", e, dateInput);
    return "";
  }
};

/**
 * Format date only (YYYYMMDD)
 */
export const formatDateOnly = (dateInput) => {
  clientLogger.verbose(`Formatting date only ${JSON.stringify({ dateInput })}`);
  return formatDateTime(dateInput, false, false);
};

/**
 * Format date/time with timezone
 */
export const formatDateTimeWithTimezone = (dateInput) => {
  clientLogger.verbose(
    `Formatting date/time with timezone ${JSON.stringify({ dateInput })}`,
  );
  return formatDateTime(dateInput, true, true);
};

/**
 * Format date/time without timezone
 */
export const formatDateTimeWithoutTimezone = (dateInput) => {
  clientLogger.verbose(
    `Formatting date/time without timezone ${JSON.stringify({ dateInput })}`,
  );
  return formatDateTime(dateInput, true, false);
};

/**
 * Get current date/time in Asia/Riyadh timezone formatted as "YYYY-MM-DDTHH:mm:ss"
 * @returns {string} Formatted date/time string
 */
export function getCurrentDateWithRiyadh() {
  const options = { timeZone: "Asia/Riyadh", hour12: false };
  const now = new Date().toLocaleString("en-GB", options);
  const [datePart, timePart] = now.split(", ");
  const [day, month, year] = datePart.split("/");
  const formatted = `${year}-${month}-${day}T${timePart}`;
  return formatted;
}

/**
 * SAML specific: Get formatted UTC date in ISO format without milliseconds
 * From HTML tool: DateTime format should be YYYY-MM-DDTHH:MM:SSZ in UTC
 * @param {Date|string} dateInput - Date to format
 * @returns {string} Formatted UTC date string (e.g., 2025-04-22T08:14:46Z)
 */
export const getSAMLFormattedDate = (dateInput = new Date()) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return dayjs(date).utc().format('YYYY-MM-DDTHH:mm:ss') + 'Z';
};
/**
 * SAML specific: Get validity period dates (IssueInstant, NotBefore, NotOnOrAfter)
 * @param {number} validityMinutes - Minutes until expiration (default: 5)
 * @param {boolean} useSaudiTime - true for Saudi timezone, false for UTC (default: false)
 * @returns {Object} SAML validity dates
 */
export const getSAMLValidityDates = (validityMinutes = 5, useSaudiTime = false) => {
  let now;
  
  if (useSaudiTime) {
    // Get current time in Saudi timezone
    now = dayjs().tz(SAUDI_TIMEZONE);
  } else {
    // Get current time in UTC
    now = dayjs().utc();
  }
  
  // IssueInstant: current time
  const issueInstant = now.clone();
  
  // NotBefore: current time - 1 minute (for buffer)
  const notBefore = now.clone().subtract(1, 'minute');
  
  // NotOnOrAfter: current time + validity minutes
  const notOnOrAfter = now.clone().add(validityMinutes, 'minute');
  
  // AuthnInstant: same as IssueInstant
  const authnInstant = issueInstant.clone();
  
  // Return dates in the appropriate format
  if (useSaudiTime) {
    // Return in Saudi timezone (without Z)
    return {
      issueInstant: issueInstant.format('YYYY-MM-DDTHH:mm:ss+03:00'),
      notBefore: notBefore.format('YYYY-MM-DDTHH:mm:ss+03:00'),
      notOnOrAfter: notOnOrAfter.format('YYYY-MM-DDTHH:mm:ss+03:00'),
      authnInstant: authnInstant.format('YYYY-MM-DDTHH:mm:ss+03:00'),
    };
  } else {
    // Return in UTC (with Z)
    return {
      issueInstant: issueInstant.utc().format('YYYY-MM-DDTHH:mm:ss') + 'Z',
      notBefore: notBefore.utc().format('YYYY-MM-DDTHH:mm:ss') + 'Z',
      notOnOrAfter: notOnOrAfter.utc().format('YYYY-MM-DDTHH:mm:ss') + 'Z',
      authnInstant: authnInstant.utc().format('YYYY-MM-DDTHH:mm:ss') + 'Z',
    };
  }
};
/**
 * Parse expiredOn parameter from request
 * Supports multiple formats:
 * - ISO format: YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DDTHH:MM:SS
 * - DD-MM-YYYY format: DD-MM-YYYYTHH:MM:SS
 * @param {string} expiredOn - Expiry date string from request
 * @returns {Date|null} Parsed Date object or null if invalid
 */
export const parseExpiredOn = (expiredOn) => {
  if (!expiredOn) return null;

  try {
    // Try DD-MM-YYYYTHH:MM:SS format first
    const ddmmyyyyMatch = expiredOn.match(
      /^(\d{2})-(\d{2})-(\d{4})T(\d{2}):(\d{2}):(\d{2})$/,
    );
    if (ddmmyyyyMatch) {
      const [, day, month, year, hours, minutes, seconds] = ddmmyyyyMatch;
      const date = dayjs.tz(
        `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`,
        'YYYY-MM-DD HH:mm:ss',
        SAUDI_TIMEZONE
      );
      if (date.isValid()) {
        return date.toDate();
      }
    }

    // Try standard Date parsing for ISO format
    const date = new Date(expiredOn);
    if (isNaN(date.getTime())) {
      clientLogger.warn(`Invalid expiredOn format: ${expiredOn}`);
      return null;
    }
    return date;
  } catch (error) {
    clientLogger.error(`Error parsing expiredOn: ${error}`);
    return null;
  }
};

/**
 * Get session expiry date (8 hours from current time in Saudi timezone)
 * @returns {string} Formatted session expiry date in UTC
 */
export const getSessionExpiry = () => {
  const sessionExpiry = dayjs().tz(SAUDI_TIMEZONE).add(8, 'hour').utc();
  return sessionExpiry.format('YYYY-MM-DDTHH:mm:ss') + 'Z';
};