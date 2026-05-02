// =============================================================================
// Expense & Budget Visualizer — app.js
// Architecture: MVC-lite (Storage → Model → Validator → View → Controller → Init)
// =============================================================================

// =============================================================================
// SECTION 1: Constants & Configuration
// =============================================================================

const STORAGE_KEY = 'expense_visualizer_transactions';

/**
 * Maps each spending category to its chart color.
 * @type {{ Food: string, Transport: string, Fun: string }}
 */
const CATEGORY_COLORS = {
  Food:      '#FF6384',
  Transport: '#36A2EB',
  Fun:       '#FFCE56'
};

// =============================================================================
// SECTION 2: Model (in-memory state)
// =============================================================================

/**
 * In-memory array of Transaction objects.
 * Shape: { id: string, name: string, amount: number, category: string }
 * @type {Array<{id: string, name: string, amount: number, category: string}>}
 */
let transactions = [];

/**
 * Holds the Chart.js instance once created; null until first render with data.
 * @type {Chart|null}
 */
let chart = null;

// =============================================================================
// SECTION 3: Storage Module
// =============================================================================

/**
 * Reads the persisted transaction list from localStorage.
 * Returns an empty array if no data exists or if the stored value cannot be parsed.
 *
 * @returns {Array<{id: string, name: string, amount: number, category: string}>}
 */
function loadFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return [];
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[expense-visualizer] Failed to parse stored transactions. Resetting to empty list.', err);
    return [];
  }
}

/**
 * Serializes the given transaction array and writes it to localStorage.
 * Logs a warning (without crashing) if the write fails due to quota or security errors.
 *
 * @param {Array<{id: string, name: string, amount: number, category: string}>} transactions
 */
function saveToStorage(transactions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (err) {
    console.warn('[expense-visualizer] Failed to save transactions to localStorage.', err);
  }
}

// =============================================================================
// SECTION 4: Validator
// =============================================================================

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
function validateForm(name, amount, category) {
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

// =============================================================================
// SECTION 5: Computation Helpers
// =============================================================================

/**
 * Computes the total balance by summing all transaction amounts.
 *
 * @param {Array<{amount: number}>} transactions
 * @returns {number} The arithmetic sum of all amount fields, or 0 for an empty array.
 */
function computeBalance(transactions) {
  if (transactions.length === 0) return 0;
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Aggregates transaction amounts by category.
 *
 * @param {Array<{category: string, amount: number}>} transactions
 * @returns {Object.<string, number>} An object mapping each category to its summed amount.
 */
function aggregateByCategory(transactions) {
  return transactions.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount;
    return acc;
  }, {});
}

// =============================================================================
// SECTION 6: View Functions
// =============================================================================

/**
 * Rebuilds the transaction list `<ul>` DOM from the given array.
 * Renders newest transaction first. Shows a "No transactions yet." message
 * when the array is empty.
 *
 * Each `<li>` contains: name, formatted amount, category, and a delete button
 * with a `data-id` attribute set to the transaction's id.
 *
 * @param {Array<{id: string, name: string, amount: number, category: string}>} transactions
 * Requirements: 2.1, 2.2, 2.3
 */
function renderTransactionList(transactions) {
  const ul = document.getElementById('transaction-list');
  ul.innerHTML = '';

  if (transactions.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No transactions yet.';
    li.className = 'empty-message';
    ul.appendChild(li);
    return;
  }

  // Newest first — iterate in reverse without mutating the original array
  for (let i = transactions.length - 1; i >= 0; i--) {
    const t = transactions[i];
    const li = document.createElement('li');
    li.className = 'transaction-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'transaction-name';
    nameSpan.textContent = t.name;

    const amountSpan = document.createElement('span');
    amountSpan.className = 'transaction-amount';
    amountSpan.textContent = `$${t.amount.toFixed(2)}`;

    const categorySpan = document.createElement('span');
    categorySpan.className = 'transaction-category';
    categorySpan.textContent = t.category;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('data-id', t.id);
    deleteBtn.setAttribute('aria-label', `Delete transaction: ${t.name}`);

    li.appendChild(nameSpan);
    li.appendChild(amountSpan);
    li.appendChild(categorySpan);
    li.appendChild(deleteBtn);
    ul.appendChild(li);
  }
}

/**
 * Computes the current balance and updates the `#balance-display` element.
 * Formats the value as `Total: $X.XX`.
 *
 * @param {Array<{amount: number}>} transactions
 * Requirements: 3.1, 3.4
 */
function renderBalance(transactions) {
  const balance = computeBalance(transactions);
  const display = document.getElementById('balance-display');
  display.textContent = `Total: $${balance.toFixed(2)}`;
}

/**
 * Renders or updates the spending doughnut chart using Chart.js.
 *
 * - If there are no transactions: hides the canvas, shows `#chart-placeholder`.
 * - If there are transactions: shows the canvas, hides the placeholder.
 *   - On first render: creates a new Chart instance stored in the module-level `chart` variable.
 *   - On subsequent renders: mutates `chart.data` and calls `chart.update()`.
 * - Guards against `window.Chart` being undefined (CDN load failure).
 *
 * @param {Array<{category: string, amount: number}>} transactions
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
function renderChart(transactions) {
  const canvas = document.getElementById('spending-chart');
  const placeholder = document.getElementById('chart-placeholder');
  const aggregated = aggregateByCategory(transactions);
  const categories = Object.keys(aggregated);

  if (categories.length === 0) {
    // Empty state: hide canvas, show placeholder
    canvas.style.display = 'none';
    placeholder.style.display = '';
    return;
  }

  // Data available: show canvas, hide placeholder
  canvas.style.display = '';
  placeholder.style.display = 'none';

  if (typeof window.Chart === 'undefined') {
    console.warn('[expense-visualizer] Chart.js is not available. Skipping chart render.');
    return;
  }

  const labels = categories;
  const data = categories.map(cat => aggregated[cat]);
  const backgroundColors = categories.map(cat => CATEGORY_COLORS[cat] || '#CCCCCC');

  if (chart === null) {
    // First render: create a new Chart instance
    chart = new window.Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: backgroundColors,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
      },
    });
  } else {
    // Subsequent renders: mutate existing chart data and update
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[0].backgroundColor = backgroundColors;
    chart.update();
  }
}

/**
 * Populates inline error `<span>` elements for each invalid form field.
 * Only sets text content for keys that exist in the errors object.
 *
 * @param {{ name?: string, amount?: string, category?: string }} errors
 */
function showFormErrors(errors) {
  if (errors.name !== undefined) {
    document.getElementById('name-error').textContent = errors.name;
  }
  if (errors.amount !== undefined) {
    document.getElementById('amount-error').textContent = errors.amount;
  }
  if (errors.category !== undefined) {
    document.getElementById('category-error').textContent = errors.category;
  }
}

/**
 * Clears all inline form error spans.
 */
function clearFormErrors() {
  document.getElementById('name-error').textContent = '';
  document.getElementById('amount-error').textContent = '';
  document.getElementById('category-error').textContent = '';
}

/**
 * Resets all form fields to their default empty state.
 * Requirements: 1.6
 */
function clearForm() {
  document.getElementById('item-name').value = '';
  document.getElementById('item-amount').value = '';
  document.getElementById('item-category').value = '';
}

// =============================================================================
// SECTION 7: Controller & Event Handlers
// =============================================================================

/**
 * Handles the transaction form submit event.
 * Validates input, creates a Transaction, persists it, and re-renders all views.
 *
 * @param {Event} event
 * Requirements: 1.3, 1.4, 1.5, 1.6, 3.2, 4.3, 5.1
 */
function handleFormSubmit(event) {
  event.preventDefault();

  const name     = document.getElementById('item-name').value;
  const amount   = document.getElementById('item-amount').value;
  const category = document.getElementById('item-category').value;

  clearFormErrors();

  const result = validateForm(name, amount, category);
  if (!result.valid) {
    showFormErrors(result.errors);
    return;
  }

  const transaction = {
    // crypto.randomUUID() is available in Chrome 92+, Firefox 95+, Edge 92+, Safari 15.4+.
    // The fallback (Date.now + Math.random) covers older Safari and any edge cases
    // where the Crypto API is unavailable (e.g. non-secure contexts). Requirements: 7.1, 7.3
    id:       (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + Math.random().toString(36).slice(2)),
    name:     name.trim(),
    amount:   parseFloat(amount),
    category,
  };

  // Prepend so newest appears first (same logic as addTransaction in logic.js)
  transactions = [transaction, ...transactions];

  saveToStorage(transactions);
  renderTransactionList(transactions);
  renderBalance(transactions);
  renderChart(transactions);
  clearForm();
}

/**
 * Removes the transaction with the given id from the model, persists, and re-renders.
 *
 * @param {string} id
 * Requirements: 2.4, 3.3, 4.4, 5.2
 */
function handleDelete(id) {
  // Filter out the matching transaction (same logic as deleteTransaction in logic.js)
  transactions = transactions.filter(t => t.id !== id);

  saveToStorage(transactions);
  renderTransactionList(transactions);
  renderBalance(transactions);
  renderChart(transactions);
}

// Event delegation for delete buttons on the transaction list.
// This listener is registered at script parse time (outside DOMContentLoaded).
// It is safe to do so because both scripts in index.html use the defer attribute,
// which guarantees the full DOM is parsed before any deferred script executes.
// Requirements: 2.4
document.getElementById('transaction-list').addEventListener('click', function (event) {
  const btn = event.target.matches('button[data-id]')
    ? event.target
    : event.target.closest('button[data-id]');

  if (btn) {
    const id = btn.getAttribute('data-id');
    handleDelete(id);
  }
});

// =============================================================================
// SECTION 8: Init
// =============================================================================

/**
 * Initialises the application:
 *  1. Loads persisted transactions from localStorage.
 *  2. Renders the transaction list, balance, and chart.
 *  3. Attaches the form submit handler.
 *
 * Requirements: 5.3, 5.4, 8.2, 8.3
 */
function init() {
  transactions = loadFromStorage();
  renderTransactionList(transactions);
  renderBalance(transactions);
  renderChart(transactions);

  document.getElementById('transaction-form').addEventListener('submit', handleFormSubmit);
}

document.addEventListener('DOMContentLoaded', init);
