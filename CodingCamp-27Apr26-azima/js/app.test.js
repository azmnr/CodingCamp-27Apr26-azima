/**
 * Property-based tests for the Expense & Budget Visualizer
 * Feature: expense-budget-visualizer
 *
 * Uses fast-check (https://github.com/dubzzz/fast-check) with a minimum of
 * 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateForm, computeBalance, aggregateByCategory, addTransaction, deleteTransaction } from './logic.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid category string */
const categoryArb = fc.constantFrom('Food', 'Transport', 'Fun');

/** Generates a valid Transaction object */
const transactionArb = fc.record({
  id:       fc.string({ minLength: 1, maxLength: 36 }),
  name:     fc.string({ minLength: 1, maxLength: 100 }),
  amount:   fc.float({ min: 0.01, max: 1_000_000, noNaN: true }),
  category: categoryArb,
});

/** Generates an array of Transaction objects (0–50 items) */
const transactionArrayArb = fc.array(transactionArb, { minLength: 0, maxLength: 50 });

// ---------------------------------------------------------------------------
// Property 3: Transaction serialization round-trip
// Validates: Requirements 5.1, 5.2, 5.3
// ---------------------------------------------------------------------------

describe('Feature: expense-budget-visualizer', () => {
  describe('Property 3: Transaction serialization round-trip', () => {
    it(
      'serializing a Transaction array to JSON and parsing it back produces a deeply equal array',
      () => {
        fc.assert(
          fc.property(transactionArrayArb, (arr) => {
            const serialized   = JSON.stringify(arr);
            const deserialized = JSON.parse(serialized);
            expect(deserialized).toEqual(arr);
          }),
          { numRuns: 100 }
        );
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Arbitraries for validator tests
// ---------------------------------------------------------------------------

/** Generates a non-empty string that is not purely whitespace */
const nonEmptyNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Generates a positive float suitable as an amount */
const positiveAmountArb = fc.float({ min: 0.01, max: 1_000_000, noNaN: true });

// ---------------------------------------------------------------------------
// Property 1: Validation rejects invalid inputs
// Validates: Requirements 1.3, 1.4
// ---------------------------------------------------------------------------

describe('Feature: expense-budget-visualizer', () => {
  describe('Property 1: Validation rejects invalid inputs', () => {
    it(
      'returns valid=false with at least one error when at least one field is invalid',
      () => {
        // Generate a triple where at least one field is invalid.
        // We use oneof to pick which field(s) to make invalid.
        const invalidTripleArb = fc.oneof(
          // invalid name (empty or whitespace-only)
          fc.tuple(
            fc.oneof(fc.constant(''), fc.stringOf(fc.constantFrom(' ', '\t', '\n'))),
            positiveAmountArb,
            categoryArb,
          ),
          // invalid amount (non-positive or NaN string)
          fc.tuple(
            nonEmptyNameArb,
            fc.oneof(fc.constant(0), fc.float({ max: 0, noNaN: true }), fc.constant('abc'), fc.constant('')),
            categoryArb,
          ),
          // invalid category (empty string or unrecognised value)
          fc.tuple(
            nonEmptyNameArb,
            positiveAmountArb,
            fc.oneof(fc.constant(''), fc.constant('Other'), fc.constant('food')),
          ),
        );

        fc.assert(
          fc.property(invalidTripleArb, ([name, amount, category]) => {
            const result = validateForm(name, amount, category);
            expect(result.valid).toBe(false);
            expect(Object.keys(result.errors).length).toBeGreaterThan(0);
          }),
          { numRuns: 100 },
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // Property 2: Validation accepts valid inputs
  // Validates: Requirements 1.3
  // -------------------------------------------------------------------------

  describe('Property 2: Validation accepts valid inputs', () => {
    it(
      'returns valid=true with no errors when all fields are valid',
      () => {
        fc.assert(
          fc.property(
            nonEmptyNameArb,
            positiveAmountArb,
            categoryArb,
            (name, amount, category) => {
              const result = validateForm(name, amount, category);
              expect(result.valid).toBe(true);
              expect(Object.keys(result.errors).length).toBe(0);
            },
          ),
          { numRuns: 100 },
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // Property 9: Whitespace-only names are invalid
  // Validates: Requirements 1.3, 1.4
  // -------------------------------------------------------------------------

  describe('Property 9: Whitespace-only names are invalid', () => {
    it(
      'treats a string composed entirely of whitespace as an empty name and returns valid=false',
      () => {
        // Generate strings of at least one whitespace character
        const whitespaceArb = fc
          .stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 50 });

        fc.assert(
          fc.property(whitespaceArb, (ws) => {
            const result = validateForm(ws, 1, 'Food');
            expect(result.valid).toBe(false);
            expect(result.errors.name).toBe('Item name is required.');
          }),
          { numRuns: 100 },
        );
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 4.4 — Unit tests for validateForm
// Requirements: 1.3, 1.4
// ---------------------------------------------------------------------------

describe('validateForm — unit tests', () => {
  it('accepts a fully valid input', () => {
    const result = validateForm('Coffee', 3.5, 'Food');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('rejects an empty name', () => {
    const result = validateForm('', 3.5, 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('Item name is required.');
  });

  it('rejects a whitespace-only name', () => {
    const result = validateForm('   ', 3.5, 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('Item name is required.');
  });

  it('rejects a zero amount', () => {
    const result = validateForm('Coffee', 0, 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBe('Amount must be a positive number.');
  });

  it('rejects a negative amount', () => {
    const result = validateForm('Coffee', -5, 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBe('Amount must be a positive number.');
  });

  it('rejects a non-numeric amount string', () => {
    const result = validateForm('Coffee', 'abc', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBe('Amount must be a positive number.');
  });

  it('rejects a missing (empty) category', () => {
    const result = validateForm('Coffee', 3.5, '');
    expect(result.valid).toBe(false);
    expect(result.errors.category).toBe('Please select a category.');
  });

  it('rejects an unrecognised category', () => {
    const result = validateForm('Coffee', 3.5, 'Entertainment');
    expect(result.valid).toBe(false);
    expect(result.errors.category).toBe('Please select a category.');
  });

  it('collects errors for multiple invalid fields simultaneously', () => {
    const result = validateForm('', -1, '');
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('Item name is required.');
    expect(result.errors.amount).toBe('Amount must be a positive number.');
    expect(result.errors.category).toBe('Please select a category.');
  });

  it('accepts all three valid categories', () => {
    for (const cat of ['Food', 'Transport', 'Fun']) {
      const result = validateForm('Item', 10, cat);
      expect(result.valid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Property 4: Balance equals sum of amounts
// Validates: Requirements 3.1, 3.2, 3.3
// ---------------------------------------------------------------------------

describe('Feature: expense-budget-visualizer', () => {
  describe('Property 4: Balance equals sum of amounts', () => {
    it(
      'computeBalance(arr) equals arr.reduce((s, t) => s + t.amount, 0) for any non-empty array',
      () => {
        fc.assert(
          fc.property(transactionArrayArb, (arr) => {
            const expected = arr.reduce((s, t) => s + t.amount, 0);
            expect(computeBalance(arr)).toBe(expected);
          }),
          { numRuns: 100 }
        );
      }
    );
  });

  // -------------------------------------------------------------------------
  // Property 5: Balance is zero for empty list
  // Validates: Requirements 3.4
  // -------------------------------------------------------------------------

  describe('Property 5: Balance is zero for empty list', () => {
    it('computeBalance([]) === 0', () => {
      expect(computeBalance([])).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: Category aggregation covers all transactions
  // Validates: Requirements 4.1, 4.6
  // -------------------------------------------------------------------------

  describe('Property 6: Category aggregation covers all transactions', () => {
    it(
      'sum of all per-category totals equals computeBalance(arr) for any transaction array',
      () => {
        fc.assert(
          fc.property(transactionArrayArb, (arr) => {
            const categoryTotals = aggregateByCategory(arr);
            const categorySum = Object.values(categoryTotals).reduce((s, v) => s + v, 0);
            expect(categorySum).toBeCloseTo(computeBalance(arr), 10);
          }),
          { numRuns: 100 }
        );
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5.4 — Unit tests for computeBalance and aggregateByCategory
// Requirements: 3.1, 3.4, 4.1
// ---------------------------------------------------------------------------

describe('computeBalance — unit tests', () => {
  it('returns 0 for an empty array', () => {
    expect(computeBalance([])).toBe(0);
  });

  it('returns the amount for a single-item array', () => {
    expect(computeBalance([{ amount: 3.5 }])).toBe(3.5);
  });

  it('returns the sum for multiple items', () => {
    expect(computeBalance([{ amount: 3.5 }, { amount: 2.0 }])).toBe(5.5);
  });

  it('handles amounts that sum to a whole number', () => {
    expect(computeBalance([{ amount: 1.25 }, { amount: 2.75 }])).toBe(4.0);
  });
});

describe('aggregateByCategory — unit tests', () => {
  it('returns an empty object for an empty array', () => {
    expect(aggregateByCategory([])).toEqual({});
  });

  it('returns a single-entry object for a single transaction', () => {
    expect(aggregateByCategory([{ category: 'Food', amount: 3.5 }])).toEqual({ Food: 3.5 });
  });

  it('sums amounts within the same category', () => {
    const result = aggregateByCategory([
      { category: 'Food', amount: 3.5 },
      { category: 'Food', amount: 1.5 },
    ]);
    expect(result).toEqual({ Food: 5.0 });
  });

  it('handles multiple distinct categories', () => {
    const result = aggregateByCategory([
      { category: 'Food',      amount: 3.5 },
      { category: 'Food',      amount: 1.5 },
      { category: 'Transport', amount: 2.0 },
    ]);
    expect(result).toEqual({ Food: 5.0, Transport: 2.0 });
  });

  it('handles all three default categories mixed together', () => {
    const result = aggregateByCategory([
      { category: 'Food',      amount: 10.0 },
      { category: 'Transport', amount: 5.0  },
      { category: 'Fun',       amount: 3.0  },
      { category: 'Food',      amount: 2.0  },
    ]);
    expect(result).toEqual({ Food: 12.0, Transport: 5.0, Fun: 3.0 });
  });
});

// ---------------------------------------------------------------------------
// Property 7: Adding a transaction grows the list
// Validates: Requirements 1.5, 2.3
// ---------------------------------------------------------------------------

describe('Feature: expense-budget-visualizer', () => {
  describe('Property 7: Adding a transaction grows the list', () => {
    it(
      'addTransaction(arr, t) increases length by exactly one and places t as the first element',
      () => {
        fc.assert(
          fc.property(transactionArrayArb, transactionArb, (arr, transaction) => {
            const result = addTransaction(arr, transaction);
            expect(result.length).toBe(arr.length + 1);
            expect(result[0]).toEqual(transaction);
          }),
          { numRuns: 100 }
        );
      }
    );
  });

  // -------------------------------------------------------------------------
  // Property 8: Deleting a transaction removes it from the list
  // Validates: Requirements 2.4
  // -------------------------------------------------------------------------

  describe('Property 8: Deleting a transaction removes it from the list', () => {
    it(
      'deleteTransaction(arr, id) removes the matching transaction and decreases length by exactly one',
      () => {
        // Generate a non-empty array and pick one of its ids to delete
        const nonEmptyArrayArb = fc.array(transactionArb, { minLength: 1, maxLength: 50 });

        fc.assert(
          fc.property(nonEmptyArrayArb, (arr) => {
            // Pick the id of the first element as the target to delete
            const targetId = arr[0].id;
            // Ensure the id is unique in the array so length decreases by exactly one
            const uniqueArr = [arr[0], ...arr.slice(1).filter(t => t.id !== targetId)];

            const result = deleteTransaction(uniqueArr, targetId);

            expect(result.length).toBe(uniqueArr.length - 1);
            expect(result.every(t => t.id !== targetId)).toBe(true);
          }),
          { numRuns: 100 }
        );
      }
    );
  });
});
