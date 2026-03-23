import OverType from 'overtype';
import { MarkdownParser } from 'overtype/parser';
import { isDarkMode } from '../../js/theme.ts';
import { showMessage } from '../../js/ui.ts';
import { openDB, getAllNotes, saveNote, deleteNote, getNoteById, importNotes } from './db.ts';
import { removeMarkdownSyntax, exportNoteToPdf } from './pdf-utils.ts';
import { downloadFile } from '../../js/file-utils.ts';
import type { Note } from './types.ts';

// noinspection JSUnusedGlobalSymbols
export default async function init() {
  const db = await openDB();
  const noteInput = document.getElementById('note-input') as HTMLDivElement;
  const addBtn = document.getElementById('add-note-btn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('cancel-edit-btn') as HTMLButtonElement;
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const container = document.getElementById('notes-container') as HTMLDivElement;
  const exportAllBtn = document.getElementById('export-all-btn') as HTMLButtonElement;
  const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
  const importInput = document.getElementById('import-input') as HTMLInputElement;

  const overType = new OverType(noteInput, {
    toolbar: true,
    theme: isDarkMode() ? 'cave' : 'solar',
  })[0];

  const exportInputBtn = document.getElementById('export-input-btn') as HTMLButtonElement;

  let editingId: number | null = null;

  async function loadNotes(query = '') {
    try {
      let notes = await getAllNotes(db);

      if (query) {
        const q = query.toLowerCase();
        notes = notes.filter((n) => n.content.toLowerCase().includes(q));
      }

      notes.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
      renderNotes(notes);
    } catch (e) {
      console.error('Failed to load notes:', e);
      showMessage('Failed to load notes.', { type: 'alert' });
    }
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
        const previewHtml = removeMarkdownSyntax(MarkdownParser.parse(note.content));

        return `
      <div class="card bg-base-100 border border-base-300 shadow-sm hover:shadow-md transition-shadow">
        <div class="card-body p-4">
          <div class="flex justify-between items-start gap-4 flex-wrap">
            <div class="note-content-wrapper flex-1">
              <div class="overtype-content prose prose-sm max-w-full min-w-32 break-all text-base-content ${hasManyLines ? 'note-content-collapsed' : ''}">
                ${previewHtml}
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
              <button class="btn btn-ghost btn-xs export-md-btn" data-id="${note.id}" title="Save as Markdown">
                <i data-lucide="file-text" class="w-4 h-4"></i>
              </button>
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

  async function handleSave() {
    const content = overType.getValue().trim();
    if (!content) return;

    try {
      await saveNote(db, content, editingId);
      resetForm();
      loadNotes(searchInput.value);
    } catch (e) {
      console.error('Failed to save note:', e);
      showMessage('Failed to save note.', { type: 'alert' });
    }
  }

  function resetForm() {
    editingId = null;
    overType.setValue('');
    addBtn.textContent = 'Add Note';
    cancelBtn.classList.add('hidden');
  }

  async function startEdit(id: number) {
    try {
      const note = await getNoteById(db, id);
      if (note) {
        editingId = id;
        overType.setValue(note.content);
        addBtn.textContent = 'Update Note';
        cancelBtn.classList.remove('hidden');
        overType.focus();
        noteInput.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    } catch (e) {
      console.error('Failed to load note for editing:', e);
      showMessage('Failed to load note for editing.', { type: 'alert' });
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteNote(db, id);
      if (editingId === id) resetForm();
      loadNotes(searchInput.value);
    } catch (e) {
      console.error('Failed to delete note:', e);
      showMessage('Failed to delete note.', { type: 'alert' });
    }
  }

  async function handleExport(id: number) {
    try {
      const note = await getNoteById(db, id);
      if (note) {
        await exportNoteToPdf(note);
      }
    } catch (e) {
      console.error('Failed to export note:', e);
      showMessage('Failed to export note.', { type: 'alert' });
    }
  }

  async function handleExportMarkdown(id: number) {
    try {
      const note = await getNoteById(db, id);
      if (note) {
        const filename = `note-${note.shortId || note.id}.md`;
        const blob = new Blob([note.content], { type: 'text/markdown' });
        await downloadFile(blob, filename, 'text/markdown');
      }
    } catch (e) {
      console.error('Failed to export markdown:', e);
      showMessage('Failed to export markdown.', { type: 'alert' });
    }
  }

  async function handleGlobalExport() {
    try {
      const notes = await getAllNotes(db);
      const structuralData = {
        generator: 'browser-toolkit-notes',
        version: 1,
        exportedAt: Date.now(),
        notes,
      };
      const json = JSON.stringify(structuralData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const date = new Date().toISOString().split('T')[0];
      await downloadFile(blob, `notes-backup-${date}.json`, 'application/json');
    } catch (e) {
      console.error('Failed to export all notes:', e);
      showMessage('Failed to export all notes.', { type: 'alert' });
    }
  }

  async function handleGlobalImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate structural JSON
      if (data.generator !== 'browser-toolkit-notes') {
        throw new Error('Invalid backup file: missing generator signature');
      }

      const notes = data.notes as Note[];
      if (!Array.isArray(notes)) {
        throw new Error('Invalid backup file: notes list is missing or invalid');
      }

      const result = await importNotes(db, notes);
      showMessage(
        `Import complete! Imported: ${result.imported}, Skipped: ${result.skipped} (duplicates).`
      );
      loadNotes(searchInput.value);
    } catch (e) {
      console.error('Failed to import notes:', e);
      showMessage(`Failed to import: ${e instanceof Error ? e.message : 'Invalid JSON backup'}`, {
        type: 'alert',
      });
    } finally {
      importInput.value = '';
    }
  }

  async function handleExportInputPdf() {
    const content = overType.getValue().trim();
    if (!content) return;

    try {
      const tempNote = { content, id: 0, shortId: 'input' } as Note;
      await exportNoteToPdf(tempNote);
    } catch (e) {
      console.error('Failed to export input:', e);
      showMessage('Failed to export PDF.', { type: 'alert' });
    }
  }

  function updateExportButtonState() {
    const content = overType.getValue().trim();
    exportInputBtn.disabled = !content;
  }

  exportInputBtn.addEventListener('click', handleExportInputPdf);
  noteInput.addEventListener('input', updateExportButtonState);

  addBtn.addEventListener('click', handleSave);
  cancelBtn.addEventListener('click', resetForm);
  searchInput.addEventListener('input', () => loadNotes(searchInput.value));
  exportAllBtn.addEventListener('click', handleGlobalExport);
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', handleGlobalImport);

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
        handleDelete(id);
      }
    } else if (target.closest('.export-btn')) {
      const btn = target.closest('.export-btn') as HTMLButtonElement;
      const id = parseInt(btn.getAttribute('data-id') || '0');
      if (id) handleExport(id);
    } else if (target.closest('.export-md-btn')) {
      const btn = target.closest('.export-md-btn') as HTMLButtonElement;
      const id = parseInt(btn.getAttribute('data-id') || '0');
      if (id) handleExportMarkdown(id);
    }
  });

  loadNotes();

  return () => {
    db.close();
  };
}
