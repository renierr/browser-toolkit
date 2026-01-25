import { downloadFile } from '../../js/file-utils.ts';

interface SignatureData {
    id: string;
    image: string; // Base64 PNG
    svgPath: string;
    width: number;
    height: number;
    timestamp: number;
}

const STORAGE_KEY = 'bt-signatures';

// noinspection JSUnusedGlobalSymbols
export default function init() {
    const canvas = document.getElementById('signature-canvas') as HTMLCanvasElement;
    const container = document.getElementById('canvas-container');
    const clearBtn = document.getElementById('clear-btn');
    const saveBtn = document.getElementById('save-btn');
    const signaturesList = document.getElementById('signatures-list');
    const savedContainer = document.getElementById('saved-signatures-container');
    const template = document.getElementById('signature-item-template') as HTMLTemplateElement;

    if (!canvas || !container || !clearBtn || !saveBtn || !signaturesList || !savedContainer || !template) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let paths: { x: number; y: number }[][] = [];
    let currentPath: { x: number; y: number }[] = [];

    // Set internal canvas resolution to match display size
    const syncCanvasSize = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    };

    syncCanvasSize();

    function getPos(e: MouseEvent | TouchEvent) {
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function startDrawing(e: MouseEvent | TouchEvent) {
        isDrawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;
        currentPath = [{ x: lastX, y: lastY }];
        e.preventDefault();
    }

    function draw(e: MouseEvent | TouchEvent) {
        if (!isDrawing) return;
        const pos = getPos(e);

        ctx!.beginPath();
        ctx!.moveTo(lastX, lastY);
        ctx!.lineTo(pos.x, pos.y);
        ctx!.strokeStyle = '#000';
        ctx!.lineWidth = 2;
        ctx!.lineCap = 'round';
        ctx!.stroke();

        lastX = pos.x;
        lastY = pos.y;
        currentPath.push({ x: lastX, y: lastY });
        e.preventDefault();
    }

    function stopDrawing() {
        if (isDrawing) {
            paths.push(currentPath);
            isDrawing = false;
        }
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);

    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDrawing);

    clearBtn.addEventListener('click', () => {
        paths = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    saveBtn.addEventListener('click', () => {
        if (paths.length === 0) return;

        // Calculate bounds for cropping
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        paths.flat().forEach(p => {
            minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        });

        const padding = 5;
        const width = (maxX - minX) + padding * 2;
        const height = (maxY - minY) + padding * 2;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.strokeStyle = '#000';
        tempCtx.lineWidth = 2;
        tempCtx.lineCap = 'round';

        let svgPath = '';
        paths.forEach(path => {
            if (path.length < 2) return;

            tempCtx.beginPath();
            const startX = path[0].x - minX + padding;
            const startY = path[0].y - minY + padding;
            tempCtx.moveTo(startX, startY);
            svgPath += `M ${startX} ${startY} `;

            for (let i = 1; i < path.length; i++) {
                const x = path[i].x - minX + padding;
                const y = path[i].y - minY + padding;
                tempCtx.lineTo(x, y);
                svgPath += `L ${x} ${y} `;
            }
            tempCtx.stroke();
        });

        const signature: SignatureData = {
            id: crypto.randomUUID(),
            image: tempCanvas.toDataURL('image/png'),
            svgPath: svgPath.trim(),
            width: width,
            height: height,
            timestamp: Date.now()
        };

        const saved: SignatureData[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        saved.unshift(signature);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

        paths = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderSignatures();
    });

    function createFullSvg(sig: SignatureData): string {
        return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${sig.width}" height="${sig.height}" viewBox="0 0 ${sig.width} ${sig.height}" xmlns="http://www.w3.org/2000/svg">
  <path d="${sig.svgPath}" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    }

    function renderSignatures() {
        const saved: SignatureData[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        signaturesList!.innerHTML = '';

        if (saved.length > 0) {
            savedContainer!.classList.remove('hidden');
        } else {
            savedContainer!.classList.add('hidden');
        }

        saved.forEach(sig => {
            const clone = template.content.cloneNode(true) as HTMLElement;
            (clone.querySelector('.signature-preview') as HTMLImageElement).src = sig.image;
            (clone.querySelector('.signature-date') as HTMLElement).textContent = new Date(sig.timestamp).toLocaleString();

            clone.querySelector('.delete-signature-btn')?.addEventListener('click', () => {
                if (confirm('Are you sure you want to delete this signature?')) {
                    const updated = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
                        .filter((s: SignatureData) => s.id !== sig.id);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                    renderSignatures();
                }
            });

            clone.querySelector('.download-svg-btn')?.addEventListener('click', async () => {
                const svgContent = createFullSvg(sig);
                const blob = new Blob([svgContent], { type: 'image/svg+xml' });
                await downloadFile(blob, `signature-${sig.timestamp}.svg`);
            });

            clone.querySelector('.download-png-btn')?.addEventListener('click', () => {
                const link = document.createElement('a');
                link.download = `signature-${sig.timestamp}.png`;
                link.href = sig.image;
                link.click();
            });

            signaturesList!.appendChild(clone);
        });
    }

    renderSignatures();

    return () => {
        window.removeEventListener('mouseup', stopDrawing);
        window.removeEventListener('touchend', stopDrawing);
    };
}
