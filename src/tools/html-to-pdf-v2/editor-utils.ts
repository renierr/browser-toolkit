export const setupImageResize = (container: HTMLElement, img: HTMLImageElement): void => {
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  const resizeHandle = container.querySelector('.resize-handle') as HTMLElement;
  if (!resizeHandle) return;

  const startResize = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    startX = e.clientX;
    startWidth = img.offsetWidth;
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
  };

  const doResize = (e: MouseEvent) => {
    if (!isResizing) return;
    const diff = e.clientX - startX;
    const newWidth = Math.max(50, Math.min(startWidth + diff, 800));
    img.style.width = newWidth + 'px';
    img.style.maxWidth = 'none';
  };

  const stopResize = () => {
    isResizing = false;
    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
  };

  resizeHandle.addEventListener('mousedown', startResize);

  img.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.toggle('selected');
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      container.classList.remove('selected');
    }
  });
};

export const insertImageToEditor = (editor: HTMLElement, file: File, fileContent: string): void => {
  const imgContainer = document.createElement('div');
  imgContainer.className = 'editor-image-container';
  imgContainer.style.display = 'inline-block';
  imgContainer.style.position = 'relative';
  imgContainer.style.margin = '8px 0';

  const img = document.createElement('img');
  img.src = fileContent;
  img.alt = file.name;
  img.style.maxWidth = '300px';
  img.style.display = 'block';
  img.style.cursor = 'move';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  resizeHandle.innerHTML = '⋮⋮';

  imgContainer.appendChild(img);
  imgContainer.appendChild(resizeHandle);
  editor.appendChild(imgContainer);

  setupImageResize(imgContainer, img);
};
