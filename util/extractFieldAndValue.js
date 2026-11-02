
/** Extracts the field and value from an error message 
 * Example error message: "Validation fail: Field 'patientId' has Invalid value: 'abc123'"
 * Returns: { field: 'patientId', value: 'abc123', isValid: true }
 * If the message does not match the expected format, returns { field: null, value: null, isValid: false }
 * @param {string} errorMessage - The error message to extract from
 * @returns {Object} An object containing the field, value, and isValid flag
 * If the message format is not as expected, returns { field: null, value: null, isValid: false }
*/
export function extractFieldAndValue(errorMessage) {
    const fieldMatch = errorMessage.match(/Field '([^']+)'/);
    const valueMatch = errorMessage.match(/Invalid value: '([^']+)'/);
    
    return {
        field: fieldMatch ? fieldMatch[1] : null,
        value: valueMatch ? valueMatch[1] : null,
        isValid: fieldMatch !== null && valueMatch !== null
    };
}