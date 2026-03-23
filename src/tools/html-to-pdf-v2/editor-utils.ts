export const setupImageResize = (container: HTMLElement, img: HTMLImageElement): void => {
  if (!container || !img) return;

  const resizeHandle = container.querySelector('.editor-image-container__handle') as HTMLElement;
  if (!resizeHandle) return;

  img.setAttribute('draggable', 'true');

  const startResize = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    startX = e.clientX;
    startWidth = img.offsetWidth;

    const doResize = (ev: PointerEvent) => {
      if (!isResizing) return;
      const diff = ev.clientX - startX;
      const newWidth = Math.max(50, Math.min(startWidth + diff, 800));
      img.style.width = newWidth + 'px';
      img.style.maxWidth = 'none';
    };

    const stopResize = () => {
      isResizing = false;
      container.removeEventListener('pointermove', doResize);
      container.removeEventListener('pointerup', stopResize);
    };

    container.addEventListener('pointermove', doResize);
    container.addEventListener('pointerup', stopResize);
  };

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizeHandle.addEventListener('pointerdown', startResize);

  const selectImage = (e: MouseEvent | PointerEvent) => {
    e.stopPropagation();
    container.classList.add('editor-image-container--selected');
  };

  container.addEventListener('click', selectImage);
  container.addEventListener('pointerdown', selectImage);
};

export const wrapImageInContainer = (img: HTMLImageElement): HTMLElement => {
  const container = document.createElement('div');
  container.className = 'editor-image-container';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'editor-image-container__handle';

  img.parentNode?.insertBefore(container, img);
  container.appendChild(img);
  container.appendChild(resizeHandle);

  return container;
};

export const setupAllImages = (editor: HTMLElement): void => {
  const images = editor.querySelectorAll('img');
  images.forEach((img) => {
    let container = img.closest('.editor-image-container') as HTMLElement;
    if (!container) {
      container = wrapImageInContainer(img);
    }

    const handle = container.querySelector('.editor-image-container__handle') as HTMLElement;
    if (handle) {
      img.dataset.imageSetup = 'false';
      setupImageResize(container, img);
    }
  });
};

export const handleEditorClick = (e: MouseEvent | PointerEvent): void => {
  const target = e.target as Node;
  const editor = document.getElementById('editor');
  if (!editor) return;

  const allImages = editor.querySelectorAll('.editor-image-container');
  allImages.forEach((imgContainer) => {
    if (!imgContainer.contains(target)) {
      imgContainer.classList.remove('editor-image-container--selected');
    }
  });
};

export const insertImageToEditor = (editor: HTMLElement, file: File, fileContent: string): void => {
  const selection = window.getSelection();
  let inserted = false;

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      const imgContainer = document.createElement('div');
      imgContainer.className = 'editor-image-container';

      const img = document.createElement('img');
      img.src = fileContent;
      img.alt = file.name;

      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'editor-image-container__handle';

      imgContainer.appendChild(img);
      imgContainer.appendChild(resizeHandle);

      try {
        range.deleteContents();
        range.insertNode(imgContainer);
        inserted = true;

        const newRange = document.createRange();
        newRange.setStartAfter(imgContainer);
        newRange.setEndAfter(imgContainer);
        selection.removeAllRanges();
        selection.addRange(newRange);
      } catch (e) {
        console.warn('Failed to insert at cursor, appending to editor:', e);
      }
    }
  }

  if (!inserted) {
    const imgContainer = document.createElement('div');
    imgContainer.className = 'editor-image-container';

    const img = document.createElement('img');
    img.src = fileContent;
    img.alt = file.name;

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';

    imgContainer.appendChild(img);
    imgContainer.appendChild(resizeHandle);
    editor.appendChild(imgContainer);
  }

  setupAllImages(editor);
};
