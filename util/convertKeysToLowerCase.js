/**
 * Converts the keys of each object in an array to lower case
 * @param {Array} rows - An array of objects whose keys need to be converted to lower case
 * @returns {Array} A new array of objects with all keys in lower case
 */
export function convertKeysToLowerCase(rows) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
    ),
  );
}
