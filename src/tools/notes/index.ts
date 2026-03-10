import OverType from 'overtype';
import { MarkdownParser } from 'overtype/parser';
import * as mupdf from 'mupdf';
import { isDarkMode } from '../../js/theme.ts';
import { downloadFile } from '../../js/file-utils.ts';

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
  const noteInput = document.getElementById('note-input') as HTMLDivElement;
  const addBtn = document.getElementById('add-note-btn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('cancel-edit-btn') as HTMLButtonElement;
  const formTitle = document.getElementById('form-title') as HTMLSpanElement;
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const container = document.getElementById('notes-container') as HTMLDivElement;

  const overType = new OverType(noteInput, {
    toolbar: true,
    theme: isDarkMode() ? 'cave' : 'solar',
  })[0];

  let editingId: number | null = null;

  async function loadNotes(query = '') {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      let notes: Note[] = request.result;

      if (query) {
        const q = query.toLowerCase();
        notes = notes.filter((n) => n.content.toLowerCase().includes(q));
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

    container.innerHTML = notes
      .map((note) => {
        const lines = note.content.split('\n');
        const hasManyLines = lines.length > 3 || note.content.length > 200;

        return `
      <div class="card bg-base-100 border border-base-300 shadow-sm hover:shadow-md transition-shadow">
        <div class="card-body p-4">
          <div class="flex justify-between items-start gap-4 flex-wrap">
            <div class="note-content-wrapper flex-1">
              <div class="overtype-content prose prose-sm max-w-full min-w-32 break-all text-base-content ${hasManyLines ? 'note-content-collapsed' : ''}">
                ${MarkdownParser.parse(note.content)}
              </div>
              ${
                hasManyLines
                  ? `
              <button class="btn btn-link btn-xs p-0 h-auto min-h-0 mt-2 expand-btn" data-id="${note.id}">
                Show more
              </button>
              `
                  : ''
              }
            </div>
            <div class="flex gap-1">
              <button class="btn btn-ghost btn-xs export-btn" data-id="${note.id}" title="Export to PDF">
                <i data-lucide="file-down" class="w-4 h-4"></i>
              </button>
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
    `;
      })
      .join('');
  }

  async function saveNote() {
    const content = overType.getValue().trim();
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
        createdAt: Date.now(),
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
    overType.setValue('');
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
        overType.setValue(note.content);
        addBtn.textContent = 'Update Note';
        formTitle.textContent = 'Edit Note';
        cancelBtn.classList.remove('hidden');
        overType.focus();
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

  async function exportToPdf(id: number) {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = async () => {
      const note = request.result;
      if (note) {
        // Use preview mode to output clean HTML without markdown syntax markers
        let htmlContent = MarkdownParser.parse(note.content);
        htmlContent = htmlContent.replace(/<span class="syntax-marker[^"]*">.*?<\/span>/g, "");
        htmlContent = htmlContent.replace(/\sclass="(bullet-list|ordered-list|code-fence|hr-marker|blockquote|url-part)"/g, "");
        htmlContent = htmlContent.replace(/\sclass=""/g, "");
        const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 20px; line-height: 1.5; color: #000; background: #fff; }
    h1, h2, h3 { font-weight: bold; margin-top: 0.5em; margin-bottom: 0.2em; }
    h1 { font-size: 1.5em; }
    h2 { font-size: 1.25em; }
    h3 { font-size: 1.1em; }
    ul, ol { margin-left: 0; padding-left: 20px; }
    .blockquote { display: block; border-left: 4px solid #ccc; padding-left: 1em; margin: 0.5em 0; opacity: 0.8; }
    code { background-color: #f0f0f0; padding: 0.1em 0.2em; border-radius: 0.2em; font-size: 0.9em; }
    .code-block { background-color: #f0f0f0; padding: 1em; border-radius: 0.5em; margin: 1em 0; overflow-x: auto; white-space: pre; }
    .code-fence { opacity: 0.3; font-size: 0.8em; }
    a { color: #0000ee; text-decoration: underline; }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;

        const encoded = new TextEncoder().encode(fullHtml);
        try {
          const doc = mupdf.Document.openDocument(encoded, "application/xhtml+xml");
          doc.layout(595, 842, 12); // A4 page size at 72 dpi (595x842) and font size 12
          const buf = new mupdf.Buffer();
          const writer = new mupdf.DocumentWriter(buf, "pdf", "compress");
          
          for (let i = 0; i < doc.countPages(); i++) {
            const page = doc.loadPage(i);
            const dev = writer.beginPage(page.getBounds());
            page.run(dev, mupdf.Matrix.identity);
            writer.endPage();
            dev.destroy();
            page.destroy();
          }
          writer.close();
          
          const bytes = buf.asUint8Array();
          await downloadFile(bytes, `note-${id}.pdf`, "application/pdf");

          // Clean up mupdf resources
          writer.destroy();
          buf.destroy();
          doc.destroy();
        } catch (e) {
          console.error("Failed to export PDF:", e);
          alert("Failed to export PDF. See console for details.");
        }
      }
    };
  }

  addBtn.addEventListener('click', saveNote);
  cancelBtn.addEventListener('click', resetForm);
  searchInput.addEventListener('input', () => loadNotes(searchInput.value));

  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest('.edit-btn');
    const deleteBtn = target.closest('.delete-btn');
    const expandBtn = target.closest('.expand-btn') as HTMLButtonElement;

    if (expandBtn) {
      const wrapper = expandBtn.closest('.note-content-wrapper');
      const content = wrapper?.querySelector('.overtype-content');
      if (content && expandBtn) {
        const isCollapsed = content.classList.contains('note-content-collapsed');
        if (isCollapsed) {
          content.classList.remove('note-content-collapsed');
          content.classList.add('note-content-expanded');
          expandBtn.textContent = 'Show less';
        } else {
          content.classList.remove('note-content-expanded');
          content.classList.add('note-content-collapsed');
          expandBtn.textContent = 'Show more';
        }
      }
    } else if (editBtn) {
      const id = parseInt(editBtn.getAttribute('data-id') || '0');
      if (id) startEdit(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.getAttribute('data-id') || '0');
      if (id && confirm('Delete this note?')) {
        deleteNote(id);
      }
    } else if (target.closest('.export-btn')) {
      const btn = target.closest('.export-btn') as HTMLButtonElement;
      const id = parseInt(btn.getAttribute('data-id') || '0');
      if (id) exportToPdf(id);
    }
  });

  loadNotes();

  return () => {
    db.close();
  };
}
