import {
  openDB,
  getAllItems,
  saveItem,
  deleteItem,
  clearCheckedItems,
  reAddCheckedItems,
  getHistory,
  importItems,
} from './db.ts';
import type { GroceryItem } from './types.ts';
import { showMessage } from '@js/ui.ts';
import { downloadFile } from '@js/file-utils.ts';

export default async function init() {
  const db = await openDB();

  const nameInput = document.getElementById('item-name-input') as HTMLInputElement;
  const amountInput = document.getElementById('item-amount-input') as HTMLInputElement;
  const unitSelect = document.getElementById('item-unit-select') as HTMLSelectElement;
  const addBtn = document.getElementById('add-item-btn') as HTMLButtonElement;
  const suggestionsDropdown = document.getElementById('suggestions-dropdown') as HTMLDivElement;
  const reAddBtn = document.getElementById('re-add-btn') as HTMLButtonElement;
  const clearBoughtBtn = document.getElementById('clear-bought-btn') as HTMLButtonElement;
  const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
  const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
  const importInput = document.getElementById('import-input') as HTMLInputElement;
  const itemsContainer = document.getElementById('items-container') as HTMLDivElement;
  const uncheckedCount = document.getElementById('unchecked-count') as HTMLSpanElement;
  const checkedCount = document.getElementById('checked-count') as HTMLSpanElement;

  let editingId: number | null = null;
  let historyCache: string[] = [];

  async function loadHistory() {
    const history = await getHistory(db);
    historyCache = history.map((h) => h.name);
  }

  async function loadItems() {
    try {
      const items = await getAllItems(db);
      renderItems(items);
      updateCounts(items);
    } catch (e) {
      console.error('Failed to load items:', e);
      showMessage('Failed to load items.', { type: 'alert' });
    }
  }

  function updateCounts(items: GroceryItem[]) {
    const unchecked = items.filter((i) => !i.checked).length;
    const checked = items.filter((i) => i.checked).length;
    uncheckedCount.textContent = String(unchecked);
    checkedCount.textContent = String(checked);
  }

  function renderItems(items: GroceryItem[]) {
    if (items.length === 0) {
      itemsContainer.innerHTML = `<div class="text-center p-8 opacity-50 italic">No items in your grocery list</div>`;
      return;
    }

    const sorted = [...items].sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    itemsContainer.innerHTML = sorted
      .map((item) => {
        const checkedAttr = item.checked ? 'checked' : '';
        const checkedClass = item.checked ? 'line-through opacity-50' : '';
        const checkedLabelClass = item.checked ? 'text-error' : '';

        return `
        <div class="flex items-center gap-2 p-3 bg-base-100 border border-base-300 rounded-lg hover:shadow-sm transition-shadow ${item.checked ? 'opacity-60' : ''}" data-id="${item.id}">
          <input
            type="checkbox"
            class="checkbox checkbox-primary checkbox-sm item-checkbox"
            ${checkedAttr}
            data-id="${item.id}"
          />
          <span class="flex-1 min-w-0 ${checkedClass}">${escapeHtml(item.name)}</span>
          <span class="text-sm ${checkedLabelClass}">${item.amount} ${item.unit}</span>
          <button class="btn btn-ghost btn-xs edit-item-btn" data-id="${item.id}" title="Edit">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button class="btn btn-ghost btn-xs text-error delete-item-btn" data-id="${item.id}" title="Delete">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `;
      })
      .join('');
  }

  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function handleAdd() {
    const name = nameInput.value.trim();
    const amount = parseInt(amountInput.value) || 1;
    const unit = unitSelect.value;

    if (!name) {
      nameInput.focus();
      return;
    }

    try {
      const item: GroceryItem = {
        name,
        amount,
        unit,
        checked: false,
        createdAt: Date.now(),
      };

      if (editingId !== null) {
        item.id = editingId;
        const items = await getAllItems(db);
        const existing = items.find((i) => i.id === editingId);
        if (existing) {
          item.checked = existing.checked;
          item.createdAt = existing.createdAt;
        }
      }

      await saveItem(db, item);
      resetForm();
      await loadItems();
      await loadHistory();
    } catch (e) {
      console.error('Failed to save item:', e);
      showMessage('Failed to save item.', { type: 'alert' });
    }
  }

  function resetForm() {
    editingId = null;
    nameInput.value = '';
    amountInput.value = '1';
    unitSelect.value = 'pcs';
    addBtn.textContent = 'Add';
    nameInput.focus();
  }

  async function startEdit(id: number) {
    try {
      const items = await getAllItems(db);
      const item = items.find((i) => i.id === id);
      if (item) {
        editingId = id;
        nameInput.value = item.name;
        amountInput.value = String(item.amount);
        unitSelect.value = item.unit;
        addBtn.textContent = 'Update';
        nameInput.focus();
      }
    } catch (e) {
      console.error('Failed to load item for editing:', e);
      showMessage('Failed to load item.', { type: 'alert' });
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteItem(db, id);
      if (editingId === id) resetForm();
      await loadItems();
    } catch (e) {
      console.error('Failed to delete item:', e);
      showMessage('Failed to delete item.', { type: 'alert' });
    }
  }

  async function handleToggleCheck(id: number) {
    try {
      const items = await getAllItems(db);
      const item = items.find((i) => i.id === id);
      if (item) {
        item.checked = !item.checked;
        await saveItem(db, item);
        await loadItems();
      }
    } catch (e) {
      console.error('Failed to toggle item:', e);
      showMessage('Failed to update item.', { type: 'alert' });
    }
  }

  async function handleReAddBought() {
    try {
      await reAddCheckedItems(db);
      await loadItems();
      showMessage('All bought items moved back to list.');
    } catch (e) {
      console.error('Failed to re-add items:', e);
      showMessage('Failed to re-add items.', { type: 'alert' });
    }
  }

  async function handleClearBought() {
    const items = await getAllItems(db);
    const boughtCount = items.filter((i) => i.checked).length;
    if (boughtCount === 0) {
      showMessage('No bought items to clear.');
      return;
    }

    if (!confirm(`Remove ${boughtCount} bought item(s)?`)) return;

    try {
      await clearCheckedItems(db);
      await loadItems();
      showMessage('Cleared all bought items.');
    } catch (e) {
      console.error('Failed to clear bought items:', e);
      showMessage('Failed to clear items.', { type: 'alert' });
    }
  }

  async function handleExport() {
    try {
      const items = await getAllItems(db);
      const structuralData = {
        generator: 'browser-toolkit-grocery-list',
        version: 1,
        exportedAt: Date.now(),
        items,
      };
      const json = JSON.stringify(structuralData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const date = new Date().toISOString().split('T')[0];
      await downloadFile(blob, `grocery-list-${date}.json`, 'application/json');
    } catch (e) {
      console.error('Failed to export:', e);
      showMessage('Failed to export.', { type: 'alert' });
    }
  }

  async function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.generator !== 'browser-toolkit-grocery-list') {
        throw new Error('Invalid backup file: missing generator signature');
      }

      const items = data.items as GroceryItem[];
      if (!Array.isArray(items)) {
        throw new Error('Invalid backup file: items list is missing or invalid');
      }

      const result = await importItems(db, items);
      showMessage(
        `Import complete! Imported: ${result.imported}, Skipped: ${result.skipped} (duplicates).`
      );
      await loadItems();
      await loadHistory();
    } catch (e) {
      console.error('Failed to import:', e);
      showMessage(`Failed to import: ${e instanceof Error ? e.message : 'Invalid JSON'}`, {
        type: 'alert',
      });
    } finally {
      importInput.value = '';
    }
  }

  function showSuggestions(query: string) {
    if (!query || historyCache.length === 0) {
      suggestionsDropdown.classList.add('hidden');
      return;
    }

    const q = query.toLowerCase();
    const matches = historyCache.filter((name) => name.includes(q)).slice(0, 10);

    if (matches.length === 0) {
      suggestionsDropdown.classList.add('hidden');
      return;
    }

    suggestionsDropdown.innerHTML = matches
      .map(
        (name) => `
        <div class="p-2 hover:bg-base-200 cursor-pointer suggestion-item">${escapeHtml(name)}</div>
      `
      )
      .join('');

    suggestionsDropdown.classList.remove('hidden');
  }

  function hideSuggestions() {
    suggestionsDropdown.classList.add('hidden');
  }

  nameInput.addEventListener('input', () => showSuggestions(nameInput.value));
  nameInput.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      hideSuggestions();
      handleAdd();
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  suggestionsDropdown.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.suggestion-item') as HTMLDivElement;
    if (item) {
      nameInput.value = item.textContent || '';
      hideSuggestions();
      nameInput.focus();
    }
  });

  addBtn.addEventListener('click', handleAdd);
  reAddBtn.addEventListener('click', handleReAddBought);
  clearBoughtBtn.addEventListener('click', handleClearBought);
  importBtn.addEventListener('click', () => importInput.click());
  exportBtn.addEventListener('click', handleExport);
  importInput.addEventListener('change', handleImport);

  itemsContainer.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const checkbox = target.closest('.item-checkbox') as HTMLInputElement;
    const editBtn = target.closest('.edit-item-btn');
    const deleteBtn = target.closest('.delete-item-btn');

    if (checkbox) {
      const id = parseInt(checkbox.getAttribute('data-id') || '0');
      if (id) await handleToggleCheck(id);
    } else if (editBtn) {
      const id = parseInt(editBtn.getAttribute('data-id') || '0');
      if (id) await startEdit(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.getAttribute('data-id') || '0');
      if (id && confirm('Delete this item?')) {
        await handleDelete(id);
      }
    }
  });

  await loadHistory();
  await loadItems();

  return () => {
    db.close();
  };
}
