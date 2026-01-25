interface SignatureData {
    id: string;
    image: string; // Base64 PNG
    svgPath: string;
    timestamp: number;
}

const STORAGE_KEY = 'bt-signatures';

// noinspection JSUnusedGlobalSymbols
export default function init() {
    const canvas = document.getElementById('signature-canvas') as HTMLCanvasElement;
    const clearBtn = document.getElementById('clear-btn');
    const saveBtn = document.getElementById('save-btn');
    const signaturesList = document.getElementById('signatures-list');
    const container = document.getElementById('saved-signatures-container');
    const template = document.getElementById('signature-item-template') as HTMLTemplateElement;

    if (!canvas || !clearBtn || !saveBtn || !signaturesList || !container || !template) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let paths: { x: number; y: number }[][] = [];
    let currentPath: { x: number; y: number }[] = [];

    const resizeCanvas = () => {
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (rect) {
            canvas.width = rect.width;
            canvas.height = rect.height;
            drawAllPaths();
        }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

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

    function drawAllPaths() {
        ctx!.clearRect(0, 0, canvas.width, canvas.height);
        ctx!.strokeStyle = '#000';
        ctx!.lineWidth = 2;
        ctx!.lineCap = 'round';

        paths.forEach(path => {
            if (path.length < 2) return;
            ctx!.beginPath();
            ctx!.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                ctx!.lineTo(path[i].x, path[i].y);
            }
            ctx!.stroke();
        });
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

        // Create SVG path
        let svgPath = '';
        paths.forEach(path => {
            if (path.length < 2) return;
            svgPath += `M ${path[0].x} ${path[0].y} `;
            for (let i = 1; i < path.length; i++) {
                svgPath += `L ${path[i].x} ${path[i].y} `;
            }
        });

        const signature: SignatureData = {
            id: crypto.randomUUID(),
            image: canvas.toDataURL('image/png'),
            svgPath: svgPath.trim(),
            timestamp: Date.now()
        };

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        saved.unshift(signature);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

        paths = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderSignatures();
    });

    function renderSignatures() {
        const saved: SignatureData[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        signaturesList!.innerHTML = '';

        if (saved.length > 0) {
            container!.classList.remove('hidden');
        } else {
            container!.classList.add('hidden');
        }

        saved.forEach(sig => {
            const clone = template.content.cloneNode(true) as HTMLElement;

            const img = clone.querySelector('.signature-preview') as HTMLImageElement;
            img.src = sig.image;

            const date = clone.querySelector('.signature-date') as HTMLElement;
            date.textContent = new Date(sig.timestamp).toLocaleString();

            clone.querySelector('.delete-signature-btn')?.addEventListener('click', () => {
                const updated = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
                    .filter((s: SignatureData) => s.id !== sig.id);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                renderSignatures();
            });

            clone.querySelector('.copy-svg-btn')?.addEventListener('click', () => {
                navigator.clipboard.writeText(sig.svgPath);
            });

            clone.querySelector('.download-png-btn')?.addEventListener('click', () => {
                const link = document.createElement('a');
                link.download = `signature-${sig.timestamp}.png`;
                link.href = sig.image;
                link.click();
            });

            signaturesList!.appendChild(clone);
        });

        // Re-run lucide icons if they are used in the template
        // (Assuming a global lucide object or similar is available if needed,
        // but the toolkit usually handles this on render)
    }

    renderSignatures();

    return () => {
        window.removeEventListener('resize', resizeCanvas);
        window.removeEventListener('mouseup', stopDrawing);
        window.removeEventListener('touchend', stopDrawing);
    };
}
