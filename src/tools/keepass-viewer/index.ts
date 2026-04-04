import type { SharedFilesPayload } from '../../js/share-target.ts';
import { setupFileDropzone } from '../../js/file-utils.ts';
import { showMessage } from '../../js/ui.ts';
import * as kdbxweb from 'kdbxweb';
import argon2 from 'argon2-browser';
import { initDOM } from './dom.ts';
import {
  renderGroupTree,
  renderEntryList,
  renderEntryDetail,
  showPasswordDialog,
  hidePasswordDialog,
  showPasswordError,
  hidePasswordError,
  showPasswordLoading,
  hidePasswordLoading,
  togglePasswordVisibility,
} from './ui.ts';

let argon2Initialized = false;

async function setupArgon2(): Promise<void> {
  if (argon2Initialized) return;

  kdbxweb.CryptoEngine.setArgon2Impl(
    async (
      password: ArrayBuffer,
      salt: ArrayBuffer,
      memory: number,
      iterations: number,
      length: number,
      parallelism: number,
      type: kdbxweb.CryptoEngine.Argon2Type,
      _version: kdbxweb.CryptoEngine.Argon2Version
    ): Promise<ArrayBuffer> => {
      const result = await argon2.hash({
        pass: new Uint8Array(password),
        salt: new Uint8Array(salt),
        time: iterations,
        mem: memory,
        hashLen: length,
        parallelism,
        type: type as any,
      });
      return result.hash.buffer.slice(0) as ArrayBuffer;
    }
  );
  argon2Initialized = true;
}

async function loadDatabase(
  data: ArrayBuffer,
  password: string,
  keyFileData?: ArrayBuffer
): Promise<kdbxweb.Kdbx> {
  const credentials = new kdbxweb.Credentials(
    kdbxweb.ProtectedValue.fromString(password),
    keyFileData || null
  );

  return await kdbxweb.Kdbx.load(data, credentials);
}

export default function init(payload?: SharedFilesPayload): (() => void) | void {
  const dom = initDOM('keepass-viewer-app');
  if (!dom) return;
  const e = dom;

  setupArgon2();

  let db: kdbxweb.Kdbx | null = null;
  let pendingFile: ArrayBuffer | null = null;
  let pendingFileName = '';

  function closeDatabase(): void {
    db = null;
    pendingFile = null;
    pendingFileName = '';

    e.activeContainer.classList.add('hidden');
    e.introContainer.classList.remove('hidden');
    e.detailEmpty.classList.remove('hidden');
    e.detailContent.classList.add('hidden');
    e.groupTree.innerHTML = '';
    e.entryList.innerHTML = '';
  }

  async function tryOpenDatabase(password: string, keyFileData?: ArrayBuffer): Promise<boolean> {
    if (!pendingFile) return false;

    showPasswordLoading(e.passwordLoading);
    hidePasswordError(e.passwordError);

    try {
      db = await loadDatabase(pendingFile, password, keyFileData);

      hidePasswordDialog(e.passwordModal);
      hidePasswordLoading(e.passwordLoading);

      e.introContainer.classList.add('hidden');
      e.activeContainer.classList.remove('hidden');

      e.dbFilename.textContent = pendingFileName;
      const defaultGroup = db.getDefaultGroup();
      const entryCount = Array.from(defaultGroup.allEntries()).length;
      const groupCount = Array.from(defaultGroup.allGroups()).length;
      e.dbInfo.textContent = `${groupCount} groups, ${entryCount} entries`;

      renderGroupTree(e.groupTree, db, (group: kdbxweb.KdbxGroup) => {
        renderEntryList(e.entryList, group, group.name || 'Root', (entry: kdbxweb.KdbxEntry) => {
          e.detailEmpty.classList.add('hidden');
          e.detailContent.classList.remove('hidden');
          const titleVal = entry.fields.get('Title');
          e.detailTitle.textContent =
            titleVal && typeof (titleVal as any).getText === 'function'
              ? (titleVal as kdbxweb.ProtectedValue).getText()
              : String(titleVal || 'Untitled');
          renderEntryDetail(e.detailFields, entry);
        });
      });

      return true;
    } catch (error) {
      hidePasswordLoading(e.passwordLoading);
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('BadSignature') || message.includes('invalid')) {
        showPasswordError('Incorrect password or key file', e.passwordError, e.passwordErrorText);
      } else {
        showMessage(`Failed to open database: ${message}`, { type: 'alert' });
        hidePasswordDialog(e.passwordModal);
      }
      return false;
    }
  }

  setupFileDropzone('dropzone', 'kdbx-input', async (files: FileList) => {
    const file = files[0];
    if (!file) return;
    pendingFileName = file.name;
    try {
      pendingFile = await file.arrayBuffer();
      showPasswordDialog(e.passwordModal);
      e.passwordFilename.textContent = pendingFileName;
      e.passwordInput.value = '';
      e.passwordInput.focus();
    } catch {
      showMessage('Failed to read file', { type: 'alert' });
    }
  });

  if (payload?.sharedFiles?.length) {
    const kdbxFile = payload.sharedFiles.find((f) => f.name.toLowerCase().endsWith('.kdbx'));
    if (kdbxFile) {
      pendingFileName = kdbxFile.name;
      kdbxFile.arrayBuffer().then((buf) => {
        pendingFile = buf;
        showPasswordDialog(e.passwordModal);
        e.passwordFilename.textContent = pendingFileName;
        e.passwordInput.value = '';
        e.passwordInput.focus();
      });
    }
  }

  e.togglePasswordBtn.addEventListener('click', () => {
    togglePasswordVisibility(e.passwordInput, e.togglePasswordBtn);
  });

  e.submitPasswordBtn.addEventListener('click', async () => {
    const password = e.passwordInput.value;
    const keyFile = e.keyfileInput.files?.[0];
    let keyFileData: ArrayBuffer | undefined;
    if (keyFile) {
      keyFileData = await keyFile.arrayBuffer();
    }
    await tryOpenDatabase(password, keyFileData);
  });

  e.passwordInput.addEventListener('keydown', async (ev: KeyboardEvent) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      e.submitPasswordBtn.click();
    }
  });

  e.cancelPasswordBtn.addEventListener('click', () => {
    hidePasswordDialog(e.passwordModal);
    pendingFile = null;
    pendingFileName = '';
  });

  e.closeDbBtn.addEventListener('click', closeDatabase);

  return () => {
    closeDatabase();
  };
}
