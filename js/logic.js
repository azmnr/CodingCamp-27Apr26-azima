/**
 * logic.js — Pure logic functions for the Expense & Budget Visualizer.
 *
 * This ES module exports all pure/testable functions so they can be imported
 * by the test suite (app.test.js). The browser entry-point (app.js) duplicates
 * these definitions inline because it runs without a bundler via file:// protocol.
 */

// ---------------------------------------------------------------------------
// SECTION 5: Computation Helpers
// ---------------------------------------------------------------------------

/**
 * Computes the total balance by summing all transaction amounts.
 *
 * @param {Array<{amount: number}>} transactions
 * @returns {number} The arithmetic sum of all amount fields, or 0 for an empty array.
 */
export function computeBalance(transactions) {
  if (transactions.length === 0) return 0;
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Aggregates transaction amounts by category.
 *
 * @param {Array<{category: string, amount: number}>} transactions
 * @returns {Object.<string, number>} An object mapping each category to its summed amount.
 */
export function aggregateByCategory(transactions) {
  return transactions.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount;
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// SECTION 7: Pure transaction mutation helpers
// ---------------------------------------------------------------------------

/**
 * Returns a new array with the given transaction prepended (newest first).
 *
 * @param {Array<{id: string, name: string, amount: number, category: string}>} arr
 * @param {{id: string, name: string, amount: number, category: string}} transaction
 * @returns {Array<{id: string, name: string, amount: number, category: string}>}
 */
export function addTransaction(arr, transaction) {
  return [transaction, ...arr];
}

/**
 * Returns a new array with the transaction matching the given id removed.
 *
 * @param {Array<{id: string, name: string, amount: number, category: string}>} arr
 * @param {string} id
 * @returns {Array<{id: string, name: string, amount: number, category: string}>}
 */
export function deleteTransaction(arr, id) {
  return arr.filter(t => t.id !== id);
}

// ---------------------------------------------------------------------------
// SECTION 4: Validator
// ---------------------------------------------------------------------------

/**
 * Validates the three form fields before a transaction is created.
 *
 * Rules:
 *  - name     : non-empty after trim  → "Item name is required."
 *  - amount   : parseable float > 0   → "Amount must be a positive number."
 *  - category : one of Food | Transport | Fun → "Please select a category."
 *
 * @param {string} name
 * @param {string|number} amount
 * @param {string} category
 * @returns {{ valid: boolean, errors: { name?: string, amount?: string, category?: string } }}
 */
export function validateForm(name, amount, category) {
  const errors = {};

  // name: must be non-empty after trimming whitespace
  if (typeof name !== 'string' || name.trim() === '') {
    errors.name = 'Item name is required.';
  }

  // amount: must parse as a finite float greater than zero
  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed <= 0) {
    errors.amount = 'Amount must be a positive number.';
  }

  // category: must be one of the three allowed values
  const VALID_CATEGORIES = ['Food', 'Transport', 'Fun'];
  if (!VALID_CATEGORIES.includes(category)) {
    errors.category = 'Please select a category.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
