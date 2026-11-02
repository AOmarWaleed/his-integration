import { TEMPLATE_LOGGER } from "../config/logger.js";

export function escapeXml(value) {
  if(typeof value === "string") {
    return value
      .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
  if (typeof value !== "object") return value;

  for (const key in value) {
    if (typeof value[key] === "string") {
      value[key] = value[key]
        .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    }
  }

  return value;
}


export function escapeXmlV2(value) {
  if (typeof value === "string") {
    return value
      .replace(/^\uFEFF/, "")
      .replace(/\uFFFD/g, "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/[\uFFFE\uFFFF]/g, "")
      .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(escapeXml);
  }

  const result = {};
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      result[key] = escapeXml(value[key]);
    }
  }
  return result;
}

/**
 * Process template with support for:
 * - Variable substitution: {{DATA.key:type}}
 * - Default values: {{DATA.key#default}} or {{DATA.key:type#default}}
 * - Loops: {{#each DATA.array}}...{{/each}}
 * - Type hints: number, integer, boolean
 * - Nested object access: DATA.patient.name
 * - Case-insensitive key matching
 */
export function processTemplate({
  template,
  data,
  pattern = /\{\{DATA\.([\w.]+)(?::(\w+))?(?:#([^}]*))?\}\}/gi,
  templateName,
  isXml = false,
}) {
  if (!template) throw new Error("Template is required");
  if (!data || typeof data !== "object") {
    TEMPLATE_LOGGER.error(
      `Invalid data provided for template: ${templateName || "unknown"}`,
      data,
    );
    throw new Error("Data must be a valid object");
  }
  if (isXml) {
    // loop through the data and normalize XML-specific values if needed
  }

  /**
   * Resolve nested values (DATA.a.b.c) - case-insensitive
   */
  const getValue = (obj, path) => {
    if (!path) return undefined;

    return path.split(".").reduce((acc, key) => {
      if (acc === null || acc === undefined) return undefined;

      // Try exact match first
      if (key in acc) return acc[key];

      // Try case-insensitive match
      const lowerKey = key.toLowerCase();
      const matchedKey = Object.keys(acc).find(
        (k) => k.toLowerCase() === lowerKey,
      );
      return matchedKey ? acc[matchedKey] : undefined;
    }, obj);
  };

  /**
   * Check if string is EXACT placeholder only
   * ex: "{{DATA.X}}" or "{{DATA.X:number}}" or "{{DATA.X#default}}"
   */
  const isFullPlaceholder = (str) => {
    const fullPattern = /^\{\{DATA\.([\w.]+)(?::(\w+))?(?:#([^}]*))?\}\}$/i;
    return fullPattern.test(str);
  };

  /**
   * Parse value based on type hint
   */
  const parseValue = (value, typeHint) => {
    if (value === undefined || value === null) return value;

    switch (typeHint?.toLowerCase()) {
      case "number":
        const num = Number(value);
        if (isNaN(num)) {
          TEMPLATE_LOGGER.warn(
            `Cannot convert "${value}" to number for template: ${templateName || "unknown"}`,
          );
          return value;
        }
        return num;

      case "integer":
        const int = parseInt(value, 10);
        if (isNaN(int)) {
          TEMPLATE_LOGGER.warn(
            `Cannot convert "${value}" to integer for template: ${templateName || "unknown"}`,
          );
          return value;
        }
        return int;

      case "boolean":
        if (typeof value === "string") {
          const lower = value.toLowerCase();
          if (lower === "true" || lower === "1") return true;
          if (lower === "false" || lower === "0") return false;
        }
        return Boolean(value);

      default:
        return value;
    }
  };

  /**
   * Resolve a value, falling back to the default when missing/empty.
   * Returns { value, usedDefault }
   */
  const resolveWithDefault = (contextData, key, typeHint, defaultValueRaw) => {
    const value = getValue(contextData, key);
    const isMissing = value === undefined || value === null || value === "";

    if (isMissing) {
      if (defaultValueRaw !== undefined) {
        TEMPLATE_LOGGER.silly(
          `Using default "${defaultValueRaw}" for key: ${key} in template: ${templateName || "unknown"}`,
        );
        // Parse the default through the type hint as well
        return {
          value: parseValue(defaultValueRaw, typeHint),
          usedDefault: true,
        };
      }
      TEMPLATE_LOGGER.silly(
        `Missing key: ${key} in template: ${templateName || "unknown"}`,
      );
      return { value: undefined, usedDefault: false };
    }

    return { value, usedDefault: false };
  };

  /**
   * Replace string values with support for type hints and defaults
   */
  const replaceString = (str, contextData = data) => {
    // CASE 1: Full placeholder → return raw value
    if (isFullPlaceholder(str)) {
      const match = str.match(
        /\{\{DATA\.([\w.]+)(?::(\w+))?(?:#([^}]*))?\}\}/i,
      );
      const key = match?.[1];
      const typeHint = match?.[2];
      const defaultValue = match?.[3]; // undefined if no '#'

      const { value } = resolveWithDefault(
        contextData,
        key,
        typeHint,
        defaultValue,
      );

      if (value === undefined) return undefined;

      // Handle Date objects
      if (value instanceof Date) {
        TEMPLATE_LOGGER.debug(
          `Processing Date value for key: ${key} - ${value.toISOString()}`,
        );
        return value.toISOString();
      }

      // Parse with type hint (defaults were already parsed, but re-parsing is safe)
      return parseValue(value, typeHint);
    }

    // CASE 2: Partial string → replace inside string
    return str.replace(pattern, (_, key, typeHint, defaultValue) => {
      const { value } = resolveWithDefault(
        contextData,
        key,
        typeHint,
        defaultValue,
      );

      if (value === undefined) return "";

      if (typeof value === "object") {
        // Handle Date objects
        if (value instanceof Date) {
          return value.toISOString();
        }
        return JSON.stringify(value);
      }

      // Parse with type hint for inline replacements
      if (
        typeHint === "number" ||
        typeHint === "integer" ||
        typeHint === "boolean"
      ) {
        const parsed = parseValue(value, typeHint);
        return parsed; // Will be number/boolean
      }

      return String(value);
    });
  };

  /**
   * Process loops: {{#each DATA.path}}...{{/each}}
   */
  const processLoops = (value, contextData = data) => {
    if (typeof value === "string") {
      // Find all loop blocks
      const loopRegex =
        /\{\{#each DATA\.([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/gi;

      let result = value;
      let match;
      let lastIndex = 0;
      const processedParts = [];

      // Reset regex to start from beginning
      const regex = new RegExp(loopRegex.source, "gi");

      while ((match = regex.exec(value)) !== null) {
        const [fullMatch, arrayPath, content] = match;
        const startIndex = match.index;

        // Add text before the match
        if (startIndex > lastIndex) {
          processedParts.push(value.substring(lastIndex, startIndex));
        }

        // Get the array from context data
        const arrayData = getValue(contextData, arrayPath);

        if (!arrayData || !Array.isArray(arrayData)) {
          TEMPLATE_LOGGER.warn(
            `Array not found or not an array: DATA.${arrayPath} in template: ${templateName || "unknown"}`,
          );
          processedParts.push("");
        } else if (arrayData.length === 0) {
          // If array is empty, skip the loop
          processedParts.push("");
        } else {
          // Process each item in the array
          const processedItems = arrayData.map((item, index) => {
            // Create a new context with the array item
            const itemContext = { ...contextData };

            const pathParts = arrayPath.split(".");
            let current = itemContext;

            // Navigate to the parent object
            for (let i = 0; i < pathParts.length - 1; i++) {
              if (!current[pathParts[i]]) {
                current[pathParts[i]] = {};
              }
              current = current[pathParts[i]];
            }

            // Set the last part to the current item
            current[pathParts[pathParts.length - 1]] = item;

            // Add loop helpers
            itemContext["@index"] = index;
            itemContext["@first"] = index === 0;
            itemContext["@last"] = index === arrayData.length - 1;
            itemContext["@total"] = arrayData.length;

            // Process the content with the item context
            return process(content, itemContext);
          });

          // Join items with commas for JSON arrays
          let joinedItems = processedItems.join(",");

          // Clean up trailing commas
          joinedItems = joinedItems.replace(/,\s*$/, "");

          processedParts.push(joinedItems);
        }

        lastIndex = regex.lastIndex;
      }

      // Add remaining text after last match
      if (lastIndex < value.length) {
        processedParts.push(value.substring(lastIndex));
      }

      // If no matches, return original
      if (processedParts.length === 0) {
        return result;
      }

      result = processedParts.join("");
      return result;
    }

    if (Array.isArray(value)) {
      return value.map((item) => process(item, contextData));
    }

    if (typeof value === "object" && value !== null) {
      const result = {};
      for (const key in value) {
        result[key] = process(value[key], contextData);
      }
      return result;
    }

    return value;
  };

  /**
   * Recursive processor with loop support
   */
  const process = (value, contextData = data) => {
    // First, process loops
    if (typeof value === "string") {
      const withLoops = processLoops(value, contextData);
      // Then process replacements in the result
      if (typeof withLoops === "string") {
        return replaceString(withLoops, contextData);
      }
      return withLoops;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => {
          const processed = process(item, contextData);
          return processed !== undefined ? processed : null;
        })
        .filter((v) => v !== undefined && v !== null);
    }

    if (typeof value === "object" && value !== null) {
      const result = {};
      for (const key in value) {
        const processedValue = process(value[key], contextData);
        if (processedValue !== undefined && processedValue !== null) {
          result[key] = processedValue;
        }
      }
      return result;
    }

    return value;
  };

  const result = process(template);

  TEMPLATE_LOGGER.silly("Template processed successfully");
  return result;
}
