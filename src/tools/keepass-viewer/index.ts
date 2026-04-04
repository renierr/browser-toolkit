import type { SharedFilesPayload } from '../../js/share-target.ts';
import { setupFileDropzone } from '../../js/file-utils.ts';
import { showMessage } from '../../js/ui.ts';
import * as kdbxweb from 'kdbxweb';
import argon2 from 'argon2-browser';
import { initDOM, type DOMEls } from './dom.ts';
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
  switchMobileTab,
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
  const resolved = initDOM('keepass-viewer-app');
  if (!resolved) return;
  const dom: DOMEls = resolved;

  setupArgon2();

  let db: kdbxweb.Kdbx | null = null;
  let pendingFile: ArrayBuffer | null = null;
  let pendingFileName = '';

  function closeDatabase(): void {
    db = null;
    pendingFile = null;
    pendingFileName = '';

    dom.activeContainer.classList.add('hidden');
    dom.introContainer.classList.remove('hidden');
    dom.detailEmpty.classList.remove('hidden');
    dom.detailContent.classList.add('hidden');
    dom.detailEmptyMobile.classList.remove('hidden');
    dom.detailContentMobile.classList.add('hidden');
    dom.groupTree.innerHTML = '';
    dom.groupTreeMobile.innerHTML = '';
    dom.entryList.innerHTML = '';
    dom.entryListMobile.innerHTML = '';
  }

  function onGroupSelect(group: kdbxweb.KdbxGroup): void {
    renderEntryList(dom.entryList, group, group.name || 'Root', onEntrySelect);
    renderEntryList(dom.entryListMobile, group, group.name || 'Root', onEntrySelect);
    if (window.innerWidth < 1024) {
      switchMobileTab('entries', {
        tabGroups: dom.tabGroups,
        tabEntries: dom.tabEntries,
        tabDetails: dom.tabDetails,
        groupPanel: dom.groupPanel,
        entryPanel: dom.entryPanel,
        detailPanel: dom.detailPanel,
      });
    }
  }

  function onEntrySelect(entry: kdbxweb.KdbxEntry): void {
    const titleVal = entry.fields.get('Title');
    const titleText =
      titleVal && typeof (titleVal as any).getText === 'function'
        ? (titleVal as kdbxweb.ProtectedValue).getText()
        : String(titleVal || 'Untitled');

    dom.detailEmpty.classList.add('hidden');
    dom.detailContent.classList.remove('hidden');
    dom.detailTitle.textContent = titleText;
    renderEntryDetail(dom.detailFields, entry);

    dom.detailEmptyMobile.classList.add('hidden');
    dom.detailContentMobile.classList.remove('hidden');
    dom.detailTitleMobile.textContent = titleText;
    renderEntryDetail(dom.detailFieldsMobile, entry);

    if (window.innerWidth < 1024) {
      switchMobileTab('details', {
        tabGroups: dom.tabGroups,
        tabEntries: dom.tabEntries,
        tabDetails: dom.tabDetails,
        groupPanel: dom.groupPanel,
        entryPanel: dom.entryPanel,
        detailPanel: dom.detailPanel,
      });
    }
  }

  async function tryOpenDatabase(password: string, keyFileData?: ArrayBuffer): Promise<boolean> {
    if (!pendingFile) return false;

    showPasswordLoading(dom.passwordLoading);
    hidePasswordError(dom.passwordError);

    try {
      db = await loadDatabase(pendingFile, password, keyFileData);

      hidePasswordDialog(dom.passwordModal);
      hidePasswordLoading(dom.passwordLoading);

      dom.introContainer.classList.add('hidden');
      dom.activeContainer.classList.remove('hidden');

      dom.dbFilename.textContent = pendingFileName;
      const defaultGroup = db.getDefaultGroup();
      const entryCount = Array.from(defaultGroup.allEntries()).length;
      const groupCount = Array.from(defaultGroup.allGroups()).length;
      const info = `${groupCount} groups, ${entryCount} entries`;
      dom.dbInfo.textContent = info;

      renderGroupTree(dom.groupTree, db, onGroupSelect);
      renderGroupTree(dom.groupTreeMobile, db, onGroupSelect);

      switchMobileTab('groups', {
        tabGroups: dom.tabGroups,
        tabEntries: dom.tabEntries,
        tabDetails: dom.tabDetails,
        groupPanel: dom.groupPanel,
        entryPanel: dom.entryPanel,
        detailPanel: dom.detailPanel,
      });

      return true;
    } catch (error) {
      hidePasswordLoading(dom.passwordLoading);
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('BadSignature') || message.includes('invalid')) {
        showPasswordError(
          'Incorrect password or key file',
          dom.passwordError,
          dom.passwordErrorText
        );
      } else {
        showMessage(`Failed to open database: ${message}`, { type: 'alert' });
        hidePasswordDialog(dom.passwordModal);
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
      showPasswordDialog(dom.passwordModal);
      dom.passwordFilename.textContent = pendingFileName;
      dom.passwordInput.value = '';
      dom.passwordInput.focus();
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
        showPasswordDialog(dom.passwordModal);
        dom.passwordFilename.textContent = pendingFileName;
        dom.passwordInput.value = '';
        dom.passwordInput.focus();
      });
    }
  }

  dom.togglePasswordBtn.addEventListener('click', () => {
    togglePasswordVisibility(dom.passwordInput, dom.togglePasswordBtn);
  });

  dom.submitPasswordBtn.addEventListener('click', async () => {
    const password = dom.passwordInput.value;
    const keyFile = dom.keyfileInput.files?.[0];
    let keyFileData: ArrayBuffer | undefined;
    if (keyFile) {
      keyFileData = await keyFile.arrayBuffer();
    }
    await tryOpenDatabase(password, keyFileData);
  });

  dom.passwordInput.addEventListener('keydown', async (ev: KeyboardEvent) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      dom.submitPasswordBtn.click();
    }
  });

  dom.cancelPasswordBtn.addEventListener('click', () => {
    hidePasswordDialog(dom.passwordModal);
    pendingFile = null;
    pendingFileName = '';
  });

  dom.closeDbBtn.addEventListener('click', closeDatabase);

  dom.tabGroups.addEventListener('click', () => {
    switchMobileTab('groups', {
      tabGroups: dom.tabGroups,
      tabEntries: dom.tabEntries,
      tabDetails: dom.tabDetails,
      groupPanel: dom.groupPanel,
      entryPanel: dom.entryPanel,
      detailPanel: dom.detailPanel,
    });
  });

  dom.tabEntries.addEventListener('click', () => {
    switchMobileTab('entries', {
      tabGroups: dom.tabGroups,
      tabEntries: dom.tabEntries,
      tabDetails: dom.tabDetails,
      groupPanel: dom.groupPanel,
      entryPanel: dom.entryPanel,
      detailPanel: dom.detailPanel,
    });
  });

  dom.tabDetails.addEventListener('click', () => {
    switchMobileTab('details', {
      tabGroups: dom.tabGroups,
      tabEntries: dom.tabEntries,
      tabDetails: dom.tabDetails,
      groupPanel: dom.groupPanel,
      entryPanel: dom.entryPanel,
      detailPanel: dom.detailPanel,
    });
  });

  return () => {
    closeDatabase();
  };
}
