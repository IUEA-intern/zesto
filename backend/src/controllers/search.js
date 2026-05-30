const db = require('./db');

const reservedOptionKeys = ['sortBy', 'sortOrder', 'sortFunction'];
const filterHandlers = new Map();

function normalizeSearchOptions(termOrOptions = '') {
  if (typeof termOrOptions === 'string') {
    return { term: termOrOptions };
  }

  if (termOrOptions && typeof termOrOptions === 'object') {
    return { ...termOrOptions };
  }

  return {};
}

function extractRows(result) {
  if (Array.isArray(result)) return result.slice();
  if (result && Array.isArray(result.rows)) return result.rows.slice();
  return [];
}

function sortRowsByField(rows, field, order = 'asc') {
  const factor = order === 'desc' ? -1 : 1;
  return rows.sort((a, b) => {
    const va = a && a[field] !== undefined && a[field] !== null ? String(a[field]).toLowerCase() : '';
    const vb = b && b[field] !== undefined && b[field] !== null ? String(b[field]).toLowerCase() : '';
    return va.localeCompare(vb) * factor;
  });
}

function sortRowsByRelevance(rows, term) {
  const lowerTerm = String(term).toLowerCase();
  return rows.sort((a, b) => {
    const aName = a && a.name ? String(a.name).toLowerCase() : '';
    const bName = b && b.name ? String(b.name).toLowerCase() : '';
    const aStarts = aName.startsWith(lowerTerm) ? 0 : 1;
    const bStarts = bName.startsWith(lowerTerm) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return aName.localeCompare(bName);
  });
}

function registerFilterHandler(key, handler) {
  if (typeof key !== 'string' || typeof handler !== 'function') {
    throw new TypeError('registerFilterHandler(key, handler) requires a string key and function handler');
  }
  filterHandlers.set(key, handler);
}

function unregisterFilterHandler(key) {
  filterHandlers.delete(key);
}

function buildFilterPredicates(options) {
  return Object.keys(options)
    .filter(key => !reservedOptionKeys.includes(key))
    .map(key => {
      const value = options[key];
      if (value === undefined || value === null || value === '') return null;

      const handler = filterHandlers.get(key);
      if (handler) {
        return handler(value, options);
      }

      const normalizedValue = String(value).toLowerCase();
      return row => {
        const fieldValue = row && row[key];
        if (fieldValue === undefined || fieldValue === null) return false;
        if (typeof fieldValue === 'string') {
          return fieldValue.toLowerCase().includes(normalizedValue);
        }
        return String(fieldValue) === String(value);
      };
    })
    .filter(Boolean);
}

function applyFilters(rows, predicates) {
  return predicates.reduce((acc, predicate) => acc.filter(predicate), rows);
}

function sortRows(rows, options) {
  if (typeof options.sortFunction === 'function') {
    return rows.slice().sort(options.sortFunction);
  }

  if (options.sortBy) {
    return sortRowsByField(rows, options.sortBy, options.sortOrder);
  }

  return rows;
}

async function performSearch(termOrOptions = '') {
  try {
    const options = normalizeSearchOptions(termOrOptions);
    const result = await db.query();
    let rows = extractRows(result);

    const predicates = buildFilterPredicates(options);
    rows = applyFilters(rows, predicates);

    return sortRows(rows, options);
  } catch (error) {
    console.error(error);
    throw error;
  }
}

module.exports = {
  performSearch,
  registerFilterHandler,
  unregisterFilterHandler,
};