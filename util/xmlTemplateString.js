/**
 * Regex/string-based XML template CRUD utility.
 * Preserves original formatting, comments, placeholders, and namespaces.
 *
 * All public functions accept a `path` string like "/ClinicalDocument/recordTarget/patientRole"
 * to target a specific nested element rather than just the first match of a tag name.
 *
 * Use an index to target repeated siblings: "/ClinicalDocument/documentationOf[1]"
 * Indices are 0-based. Omitting the index is the same as [0].
 */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the full element substring starting at a given `<tagName` position,
 * correctly handling nested elements with the same tag name.
 */
function extractFullElement(xml, tagName, startIndex) {
  const esc = escapeRegex(tagName);
  const sub = xml.slice(startIndex);

  // Self-closing at this position
  const selfClose = new RegExp(`^<${esc}(\\s[^>]*)?\\/>`);
  const selfMatch = sub.match(selfClose);
  if (selfMatch) return selfMatch[0];

  // Must start with open tag
  const openCheck = new RegExp(`^<${esc}(\\s[^>]*)?>`);
  if (!openCheck.test(sub)) return null;

  // Walk through open/close tags counting depth
  const combined = new RegExp(`<${esc}(?:\\s[^>]*)?\\/?>|<\\/${esc}\\s*>`, "g");
  let depth = 0;
  let match;
  while ((match = combined.exec(sub)) !== null) {
    const m = match[0];
    if (m.startsWith(`</${tagName}`)) {
      depth--;
      if (depth === 0) return sub.slice(0, match.index + m.length);
    } else if (m.endsWith("/>")) {
      if (depth === 0) return m;
    } else {
      depth++;
    }
  }
  return null;
}

/**
 * Find the index of the Nth opening tag for `tagName`, skipping comments.
 * @param {number} [nth=0] - 0-based occurrence to find
 */
function findTagIndex(xml, tagName, from = 0, nth = 0) {
  const esc = escapeRegex(tagName);
  const tagStart = new RegExp(`<${esc}(\\s|>|\\/)`, "g");
  tagStart.lastIndex = from;

  let found = 0;
  let match;
  while ((match = tagStart.exec(xml)) !== null) {
    const before = xml.slice(0, match.index);
    const lastOpen = before.lastIndexOf("<!--");
    if (lastOpen !== -1 && before.lastIndexOf("-->") < lastOpen) continue;
    if (found === nth) return match.index;
    found++;
  }
  return -1;
}

/**
 * Parse a path segment like "tagName[2]" into { tag, nth }.
 * If no index, nth defaults to 0.
 */
function parseSegment(segment) {
  const m = segment.match(/^(.+?)\[(\d+)\]$/);
  if (m) return { tag: m[1], nth: parseInt(m[2], 10) };
  return { tag: segment, nth: 0 };
}

/**
 * Resolve a path like "/Parent/Child/Target" to the absolute index + element string
 * of the target (last segment) within the xml.
 *
 * Each segment narrows the search scope to within the parent's content.
 * Returns { index, element } where index is relative to the full xml string.
 *
 * A plain tag name (no slashes) is also accepted for backwards compatibility.
 *
 * @param {string} xml
 * @param {string} path - e.g. "/ClinicalDocument/recordTarget/patientRole" or just "patientRole"
 * @returns {{ index: number, element: string } | null}
 */
function resolvePath(xml, path) {
  // Normalize: remove leading slash, split segments
  const rawSegments = path.replace(/^\//, "").split("/").filter(Boolean);
  if (rawSegments.length === 0) return null;

  let scopeStart = 0;
  let scopeXml = xml;

  for (let i = 0; i < rawSegments.length; i++) {
    const { tag, nth } = parseSegment(rawSegments[i]);
    const idx = findTagIndex(scopeXml, tag, 0, nth);
    if (idx === -1) return null;

    const el = extractFullElement(scopeXml, tag, idx);
    if (!el) return null;

    const absIndex = scopeStart + idx;

    if (i === rawSegments.length - 1) {
      return { index: absIndex, element: el };
    }

    // Narrow scope to inside this element's content
    const esc = escapeRegex(tag);
    const openEnd = el.match(new RegExp(`^<${esc}[^>]*>`));
    if (!openEnd) return null;
    if (el.trimEnd().endsWith("/>")) return null;

    const innerStart = openEnd[0].length;
    const closeStart = el.lastIndexOf(`</${tag}`);
    if (closeStart === -1) return null;

    scopeStart = absIndex + innerStart;
    scopeXml = el.slice(innerStart, closeStart);
  }

  return null;
}

// --- Public API ---

/**
 * Find all occurrences of the target element within the path scope.
 * @param {string} xml
 * @param {string} path - e.g. "/ClinicalDocument/recordTarget" or "recordTarget"
 * @returns {string[]} Full element strings
 */
export function findElements(xml, path) {
  const rawSegments = path.replace(/^\//, "").split("/").filter(Boolean);
  if (rawSegments.length === 0) return [];

  const { tag: targetTag } = parseSegment(rawSegments[rawSegments.length - 1]);

  let scopeXml = xml;
  let scopeStart = 0;

  if (rawSegments.length > 1) {
    const parentPath = rawSegments.slice(0, -1).join("/");
    const resolved = resolvePath(xml, parentPath);
    if (!resolved) return [];

    const { tag: parentTag } = parseSegment(
      rawSegments[rawSegments.length - 2],
    );
    const esc = escapeRegex(parentTag);
    const openEnd = resolved.element.match(new RegExp(`^<${esc}[^>]*>`));
    if (!openEnd || resolved.element.trimEnd().endsWith("/>")) return [];

    const innerStart = openEnd[0].length;
    const closeStart = resolved.element.lastIndexOf(`</${parentTag}`);
    scopeXml = resolved.element.slice(innerStart, closeStart);
    scopeStart = resolved.index + innerStart;
  }

  const results = [];
  let from = 0;
  while (true) {
    const idx = findTagIndex(scopeXml, targetTag, from);
    if (idx === -1) break;
    const el = extractFullElement(scopeXml, targetTag, idx);
    if (!el) {
      from = idx + 1;
      continue;
    }
    results.push(el);
    from = idx + el.length;
  }
  return results;
}

/**
 * Get the inner content of the element at the given path.
 * @param {string} xml
 * @param {string} path
 * @returns {string|null}
 */
export function getElementContent(xml, path) {
  const resolved = resolvePath(xml, path);
  if (!resolved) return null;

  const { element } = resolved;
  if (element.trimEnd().endsWith("/>")) return "";

  const rawSegments = path.replace(/^\//, "").split("/").filter(Boolean);
  const { tag: tagName } = parseSegment(rawSegments[rawSegments.length - 1]);
  const esc = escapeRegex(tagName);

  const openEnd = element.match(new RegExp(`^<${esc}[^>]*>`));
  if (!openEnd) return "";
  const closeStart = element.lastIndexOf(`</${tagName}`);
  if (closeStart === -1) return "";
  return element.slice(openEnd[0].length, closeStart);
}

/**
 * Get attributes of the element at the given path.
 * @param {string} xml
 * @param {string} path
 * @returns {object|null}
 */
export function getElementAttributes(xml, path) {
  const resolved = resolvePath(xml, path);
  if (!resolved) return null;

  const rawSegments = path.replace(/^\//, "").split("/").filter(Boolean);
  const { tag: tagName } = parseSegment(rawSegments[rawSegments.length - 1]);
  const esc = escapeRegex(tagName);

  const openTag = resolved.element.match(new RegExp(`^<${esc}[^>]*?\\/?>`));
  if (!openTag) return null;

  const attrs = {};
  const attrPart = openTag[0]
    .replace(new RegExp(`^<${esc}`), "")
    .replace(/\/?>$/, "");
  const attrRegex = /([\w:\-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = attrRegex.exec(attrPart)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/**
 * Add a child element inside the element at the given path.
 * @param {string} xml
 * @param {string} path - Path to the parent element
 * @param {string} childXml - Raw XML to insert
 * @param {"start"|"end"} [position="end"]
 * @returns {string}
 */
export function addElement(xml, path, childXml, position = "end") {
  const resolved = resolvePath(xml, path);
  if (!resolved) throw new Error(`Element at path "${path}" not found`);

  const { index: idx, element: el } = resolved;
  const rawSegments = path.replace(/^\//, "").split("/").filter(Boolean);
  const { tag: tagName } = parseSegment(rawSegments[rawSegments.length - 1]);
  const esc = escapeRegex(tagName);

  // Self-closing → convert to open/close
  if (el.trimEnd().endsWith("/>")) {
    const converted = el.replace(/\/>$/, `>\n${childXml}\n</${tagName}>`);
    return xml.slice(0, idx) + converted + xml.slice(idx + el.length);
  }

  if (position === "start") {
    const openEnd = el.match(new RegExp(`^<${esc}[^>]*>`));
    if (!openEnd) throw new Error(`Malformed <${tagName}>`);
    const insertAt = idx + openEnd[0].length;
    return xml.slice(0, insertAt) + "\n" + childXml + xml.slice(insertAt);
  }

  // Default: insert before closing tag
  const closeOffset = el.lastIndexOf(`</${tagName}`);
  const closeIdx = idx + closeOffset;
  return xml.slice(0, closeIdx) + childXml + "\n" + xml.slice(closeIdx);
}

/**
 * Update/merge attributes on the element at the given path.
 * @param {string} xml
 * @param {string} path
 * @param {object} attributes - Key/value pairs
 * @returns {string}
 */
export function updateElementAttributes(xml, path, attributes) {
  const resolved = resolvePath(xml, path);
  if (!resolved) throw new Error(`Element at path "${path}" not found`);

  const { index: idx, element: el } = resolved;
  const rawSegments = path.replace(/^\//, "").split("/").filter(Boolean);
  const { tag: tagName } = parseSegment(rawSegments[rawSegments.length - 1]);
  const esc = escapeRegex(tagName);

  const openTag = el.match(new RegExp(`^<${esc}[^>]*?\\/?>`));
  if (!openTag) throw new Error(`Malformed <${tagName}>`);

  let tag = openTag[0];
  for (const [key, val] of Object.entries(attributes)) {
    const attrRegex = new RegExp(`(${escapeRegex(key)})\\s*=\\s*"[^"]*"`);
    if (attrRegex.test(tag)) {
      tag = tag.replace(attrRegex, `${key}="${val}"`);
    } else {
      tag = tag.replace(/(\s*\/?>)$/, ` ${key}="${val}"$1`);
    }
  }

  return xml.slice(0, idx) + tag + xml.slice(idx + openTag[0].length);
}

/**
 * Replace the inner content of the element at the given path.
 * @param {string} xml
 * @param {string} path
 * @param {string} newContentXml
 * @returns {string}
 */
export function updateElementContent(xml, path, newContentXml) {
  const resolved = resolvePath(xml, path);
  if (!resolved) throw new Error(`Element at path "${path}" not found`);

  const { index: idx, element: el } = resolved;
  const rawSegments = path.replace(/^\//, "").split("/").filter(Boolean);
  const { tag: tagName } = parseSegment(rawSegments[rawSegments.length - 1]);
  const esc = escapeRegex(tagName);

  // Self-closing → convert
  if (el.trimEnd().endsWith("/>")) {
    const converted = el.replace(/\s*\/>$/, `>${newContentXml}</${tagName}>`);
    return xml.slice(0, idx) + converted + xml.slice(idx + el.length);
  }

  const openEnd = el.match(new RegExp(`^<${esc}[^>]*>`));
  if (!openEnd) throw new Error(`Malformed <${tagName}>`);

  const newElement = `${openEnd[0]}${newContentXml}</${tagName}>`;
  return xml.slice(0, idx) + newElement + xml.slice(idx + el.length);
}

/**
 * Remove the element at the given path.
 * @param {string} xml
 * @param {string} path
 * @returns {string}
 */
export function removeElement(xml, path) {
  const resolved = resolvePath(xml, path);
  if (!resolved) {
    // console.warn(`Element at path "${path}" not found for removal`);
    return xml;
  }

  const { index: idx, element: el } = resolved;
  let end = idx + el.length;
  if (xml[end] === "\n") end++;
  return xml.slice(0, idx) + xml.slice(end);
}

/**
 * Remove all occurrences of the target within the path scope.
 * @param {string} xml
 * @param {string} path
 * @returns {string}
 */
export function removeAllElements(xml, path) {
  const rawSegments = path.replace(/^\//, "").split("/").filter(Boolean);
  if (rawSegments.length === 0) return xml;

  let result = xml;
  while (true) {
    const resolved = resolvePath(result, path);
    if (!resolved) break;
    const { index: idx, element: el } = resolved;
    let end = idx + el.length;
    if (result[end] === "\n") end++;
    result = result.slice(0, idx) + result.slice(end);
  }
  return result;
}



// -------------------------------
// -------------------------------
// -------------------------------
// -------------------------------
// -------------------------------
/**
 * Remove an element by multiple attributes
 * @param {string} xml - The XML string
 * @param {Object} attributes - Object with key-value pairs of attributes to match
 * @param {string} [tagName] - Optional: specific tag name to narrow the search
 * @returns {string} - XML with the element removed
 * 
 * @example
 * // Remove element with id="cl07a" and classificationScheme="urn:uuid:xxx"
 * removeElementByAttributes(xml, { 
 *   id: 'cl07a', 
 *   classificationScheme: 'urn:uuid:2c6b8cb7-8b2a-4051-b291-b1ae6a575ef4' 
 * });
 */
export function removeElementByAttributes(xml, attributes, tagName = null) {
    // console.log('========================================');
    // console.log('🔍 removeElementByAttributes called');
    // console.log(`📋 Attributes: ${JSON.stringify(attributes)}`);
    // console.log(`🏷️ TagName: ${tagName || 'ANY'}`);
    
    // Build attribute pattern: attr1="value1" and attr2="value2"
    const attrPatterns = [];
    for (const [attrName, attrValue] of Object.entries(attributes)) {
        const escapedAttr = escapeRegex(attrName);
        const escapedValue = escapeRegex(attrValue);
        attrPatterns.push(`${escapedAttr}\\s*=\\s*["']${escapedValue}["']`);
        // console.log(`   - ${attrName}="${attrValue}"`);
    }
    const combinedPattern = attrPatterns.join('\\s+');
    // console.log(`📐 Combined Pattern: ${combinedPattern}`);
    
    let pattern;
    if (tagName) {
        const escapedTag = escapeRegex(tagName);
        // Match specific tag with all attributes
        pattern = new RegExp(
            `<[a-zA-Z0-9]+:?${escapedTag}[^>]*\\b${combinedPattern}[^>]*>([\\s\\S]*?)<\\/[a-zA-Z0-9]+:?${escapedTag}>`,
            'g'
        );
        // console.log(`🔎 Searching for tag: ${tagName}`);
    } else {
        // Match any tag with all attributes
        pattern = new RegExp(
            `<[a-zA-Z0-9]+:?[a-zA-Z0-9]+[^>]*\\b${combinedPattern}[^>]*>([\\s\\S]*?)<\\/[a-zA-Z0-9]+:?[a-zA-Z0-9]+>`,
            'g'
        );
        // console.log(`🔎 Searching for ANY tag`);
    }
    
    // Self-closing version
    let selfPattern;
    if (tagName) {
        const escapedTag = escapeRegex(tagName);
        selfPattern = new RegExp(
            `<[a-zA-Z0-9]+:?${escapedTag}[^>]*\\b${combinedPattern}[^>]*\\/>`,
            'g'
        );
    } else {
        selfPattern = new RegExp(
            `<[a-zA-Z0-9]+:?[a-zA-Z0-9]+[^>]*\\b${combinedPattern}[^>]*\\/>`,
            'g'
        );
    }
    
    let result = xml;
    
    // Find and count matches before removal
    // console.log('📊 Before removal:');
    const matchesBefore = result.match(pattern);
    const selfMatchesBefore = result.match(selfPattern);
    // console.log(`   - Regular elements found: ${matchesBefore ? matchesBefore.length : 0}`);
    // console.log(`   - Self-closing elements found: ${selfMatchesBefore ? selfMatchesBefore.length : 0}`);
    
    if (matchesBefore && matchesBefore.length > 0) {
        // console.log(`   - First match preview: ${matchesBefore[0].substring(0, 150)}...`);
    }
    if (selfMatchesBefore && selfMatchesBefore.length > 0) {
        // console.log(`   - First self-closing match preview: ${selfMatchesBefore[0].substring(0, 150)}...`);
    }
    
    // Remove elements with content
    // console.log('🗑️ Removing elements with content...');
    result = result.replace(pattern, '');
    
    // Remove self-closing elements
    // console.log('🗑️ Removing self-closing elements...');
    result = result.replace(selfPattern, '');
    
    // Remove preceding comments that reference any of the attribute values
    const allValues = Object.values(attributes).join('|');
    if (allValues) {
        const commentPattern = new RegExp(`<!--[\\s\\S]*?(${escapeRegex(allValues)})[\\s\\S]*?-->\\s*`, 'g');
        const commentsBefore = result.match(commentPattern);
        // console.log(`🗑️ Removing comments (${commentsBefore ? commentsBefore.length : 0} found)`);
        result = result.replace(commentPattern, '');
    }
    
    // Find matches after removal
    // console.log('📊 After removal:');
    const matchesAfter = result.match(pattern);
    const selfMatchesAfter = result.match(selfPattern);
    // console.log(`   - Regular elements remaining: ${matchesAfter ? matchesAfter.length : 0}`);
    // console.log(`   - Self-closing elements remaining: ${selfMatchesAfter ? selfMatchesAfter.length : 0}`);
    
    // Check if removal was successful
    const wasRemoved = (matchesBefore && matchesBefore.length > 0) || (selfMatchesBefore && selfMatchesBefore.length > 0);
    if (wasRemoved) {
        const remaining = (matchesAfter ? matchesAfter.length : 0) + (selfMatchesAfter ? selfMatchesAfter.length : 0);
        // console.log(`✅ Removal ${remaining === 0 ? 'COMPLETE' : 'PARTIAL'} - ${remaining} element(s) remaining`);
    } else {
        // console.log(`⚠️ No elements found with attributes ${JSON.stringify(attributes)}`);
    }
    
    // Clean up extra newlines
    const beforeCleanup = result.length;
    result = result.replace(/\n\s*\n/g, '\n');
    // console.log(`🧹 Cleaned up whitespace: ${beforeCleanup - result.length} characters removed`);
    
    // console.log('========================================');
    // console.log('');
    
    return result;
}
/**
 * Alias for removeElementByAttributes with id attribute
 */
export function removeElementById(xml, id, tagName = null) {
    return removeElementByAttributes(xml, { id }, tagName);
}

/**
 * Alias for removeElementByAttributes with name attribute
 */
export function removeElementByName(xml, name, tagName = null) {
    return removeElementByAttributes(xml, { name }, tagName);
}


// !!!!!!!!!!!!!!!!!!! 

