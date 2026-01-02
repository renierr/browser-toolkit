interface Note {
  id?: number;
  content: string;
  createdAt: number;
  updatedAt?: number;
}

const DB_NAME = 'NotesDB';
const STORE_NAME = 'notes';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// noinspection JSUnusedGlobalSymbols
export default async function init() {
  const db = await openDB();
  const noteInput = document.getElementById('note-input') as HTMLTextAreaElement;
  const addBtn = document.getElementById('add-note-btn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('cancel-edit-btn') as HTMLButtonElement;
  const formTitle = document.getElementById('form-title') as HTMLSpanElement;
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const container = document.getElementById('notes-container') as HTMLDivElement;

  let editingId: number | null = null;

  async function loadNotes(query = '') {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      let notes: Note[] = request.result;

      if (query) {
        const q = query.toLowerCase();
        notes = notes.filter(n => n.content.toLowerCase().includes(q));
      }

      notes.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
      renderNotes(notes);
    };
  }

  function renderNotes(notes: Note[]) {
    if (notes.length === 0) {
      container.innerHTML = `<div class="text-center p-8 opacity-50 italic">No notes found</div>`;
      return;
    }

    container.innerHTML = notes.map(note => `
      <div class="card bg-base-100 border border-base-300 shadow-sm hover:shadow-md transition-shadow">
        <div class="card-body p-4">
          <div class="flex justify-between items-start gap-4">
            <p class="whitespace-pre-wrap wrap-break-word flex-1">${escapeHtml(note.content)}</p>
            <div class="flex gap-1">
              <button class="btn btn-ghost btn-xs edit-btn" data-id="${note.id}">
                <i data-lucide="pencil" class="w-4 h-4"></i>
              </button>
              <button class="btn btn-ghost btn-xs text-error delete-btn" data-id="${note.id}">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
          <div class="text-[10px] opacity-40 mt-2">
            ${note.updatedAt ? 'Updated: ' + new Date(note.updatedAt).toLocaleString() : new Date(note.createdAt).toLocaleString()}
          </div>
        </div>
      </div>
    `).join('');
  }

  function escapeHtml(text: string) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function saveNote() {
    const content = noteInput.value.trim();
    if (!content) return;

    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    if (editingId !== null) {
      const request = store.get(editingId);
      request.onsuccess = () => {
        const note = request.result;
        note.content = content;
        note.updatedAt = Date.now();
        store.put(note);
      };
    } else {
      const note: Note = {
        content,
        createdAt: Date.now()
      };
      store.add(note);
    }

    transaction.oncomplete = () => {
      resetForm();
      loadNotes(searchInput.value);
    };
  }

  function resetForm() {
    editingId = null;
    noteInput.value = '';
    addBtn.textContent = 'Add Note';
    formTitle.textContent = 'New Note';
    cancelBtn.classList.add('hidden');
  }

  async function startEdit(id: number) {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const note = request.result;
      if (note) {
        editingId = id;
        noteInput.value = note.content;
        addBtn.textContent = 'Update Note';
        formTitle.textContent = 'Edit Note';
        cancelBtn.classList.remove('hidden');
        noteInput.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
  }

  async function deleteNote(id: number) {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
    transaction.oncomplete = () => {
      if (editingId === id) resetForm();
      loadNotes(searchInput.value);
    };
  }

  addBtn.addEventListener('click', saveNote);
  cancelBtn.addEventListener('click', resetForm);
  searchInput.addEventListener('input', () => loadNotes(searchInput.value));

  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest('.edit-btn');
    const deleteBtn = target.closest('.delete-btn');

    if (editBtn) {
      const id = parseInt(editBtn.getAttribute('data-id') || '0');
      if (id) startEdit(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.getAttribute('data-id') || '0');
      if (id && confirm('Delete this note?')) {
        deleteNote(id);
      }
    }
  });

  loadNotes();

  return () => {
    db.close();
  };
}
