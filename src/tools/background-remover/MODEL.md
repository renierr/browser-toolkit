# Background Remover — Model Documentation

## How It Works

1. Images are dropped into the UI and queued for processing
2. A **Web Worker** loads an ONNX segmentation model via `onnxruntime-web` (WASM backend)
3. Each image is resized and normalized into a float32 tensor matching the model's expected input
4. The model predicts a **saliency mask** — a grayscale map where bright pixels = foreground, dark pixels = background
5. The mask is upscaled back to the original image dimensions and applied as an **alpha channel**
6. The result is a transparent PNG

### Processing Pipeline

```
Image File (any size)
  → decodeImage()       Blob → RGBA pixels via OffscreenCanvas
  → imageToTensor()     RGBA → [1, 3, H, H] CHW float32, normalized 0–1
  → ONNX inference      model predicts saliency mask [1, 1, H, H]
  → normalizeMask()     raw sigmoid output → 0–255 uint8
  → applyMask()         bilinear upscale mask to original size, set as alpha
  → PNG Blob
```

---

## Current Model

| Property | Value |
|----------|-------|
| Model | `u2netp-q.onnx` |
| Architecture | U²-Net Portable — nested U-shaped encoder-decoder |
| License | **Apache-2.0** ✅ (compatible with AGPL-3.0) |
| File size | ~4.5 MB (uint8 quantized) |
| Input shape | `[1, 3, 320, 320]` — batch, RGB channels, height, width |
| Output shape | `[1, 1, 320, 320]` — single-channel saliency map |
| Source | [U²-Net paper](https://arxiv.org/abs/2005.09007), [GitHub](https://github.com/xuebinqin/U-2-Net) |
| Location | `public/lib/models/u2netp-q.onnx` |

U²-Net produces 7 side-output maps at different scales (d0–d6). Only the first output (**d0**) is used — it is the finest, fused final prediction.

---

## Constants

Model-specific values are split between `index.ts` (URL) and `worker.ts` (model shape/names):

**`index.ts`** — resolves the model URL on the main thread and passes it to the worker via `postMessage`:

```typescript
const MODEL_URL = new URL('./lib/models/u2netp-q.onnx', document.baseURI).href;
```

Resolved on the main thread because relative paths inside web workers resolve against the worker script location, not the page.

**`worker.ts`** — defines the ONNX graph constants:

```typescript
const MODEL_INPUT_SIZE = 320;
const MODEL_INPUT_NAME = 'input.1';
const MODEL_OUTPUT_NAME = '1959';
```

### What these mean

| Constant | Purpose |
|----------|---------|
| `MODEL_INPUT_SIZE` | Spatial dimension the model expects (both H and W). Derived from the input shape: `[1, 3, 320, 320]` → `320`. |
| `MODEL_INPUT_NAME` | The ONNX graph's **input node name**. An arbitrary identifier assigned during PyTorch-to-ONNX export. |
| `MODEL_OUTPUT_NAME` | The ONNX graph's **output node name** to read. Models with multiple outputs (like U²-Net) have several; pick the finest/fused head. |

The names `input.1` and `1959` are **auto-generated tensor IDs** from `torch.onnx.export()`. They have no semantic meaning — they are just the internal node identifiers in the ONNX graph.

---

## How to Swap Models

### 1. Obtain a new ONNX model

Place the `.onnx` file in `public/lib/models/`.

**Where to get models:**

- **[rembg](https://github.com/danielgatis/rembg)** (Apache-2.0) — `pip install rembg`, then run a model once. ONNX files are cached in `~/.u2net/`. Available models: `u2net`, `u2netp`, `u2net_human_seg`, `isnet-general-use`, `isnet-anime`, `silueta`.
- **[HuggingFace](https://huggingface.co/models?pipeline_tag=image-segmentation)** — search for segmentation models. Some include an `onnx/` folder directly.
- **Export from PyTorch** — `torch.onnx.export(model, dummy_input, "model.onnx", opset_version=11)`

**Quantize to reduce size:**

```python
from onnxruntime.quantization import quantize_dynamic, QuantType
quantize_dynamic("model.onnx", "model-q.onnx", weight_type=QuantType.QUInt8)
```

### 2. Find the model's input/output node names and dimensions

Every ONNX graph has named input and output nodes. You must discover these for your new model.

**Option A — [Netron](https://netron.app) (visual, recommended):**

Open the `.onnx` file at [netron.app](https://netron.app). Click the first node to see the input name/shape, and the last node(s) for output names.

**Option B — Python:**

```python
import onnx

model = onnx.load("your-model.onnx")

for inp in model.graph.input:
    dims = [d.dim_value or d.dim_param for d in inp.type.tensor_type.shape.dim]
    print(f"INPUT:  name={inp.name!r}  shape={dims}")

for out in model.graph.output:
    dims = [d.dim_value or d.dim_param for d in out.type.tensor_type.shape.dim]
    print(f"OUTPUT: name={out.name!r}  shape={dims}")
```

Example output for u2netp:

```
INPUT:  name='input.1'  shape=[1, 3, 320, 320]
OUTPUT: name='1959'     shape=[1, 1, 320, 320]   ← d0 (finest — use this one)
OUTPUT: name='1960'     shape=[1, 1, 320, 320]   ← d1
OUTPUT: name='1961'     shape=[1, 1, 320, 320]   ← d2
...
```

**Option C — Node.js (onnxruntime-node):**

```bash
pnpm add -D onnxruntime-node
```

```javascript
const ort = require('onnxruntime-node');
(async () => {
  const s = await ort.InferenceSession.create('your-model.onnx');
  console.log('inputs:', s.inputNames);
  console.log('outputs:', s.outputNames);
  await s.release();
})();
```

### 3. Update the constants

**`index.ts`** — update the model path:

```typescript
const MODEL_URL = new URL('./lib/models/your-model.onnx', document.baseURI).href;
```

**`worker.ts`** — update the ONNX graph constants:

```typescript
const MODEL_INPUT_SIZE = 1024;             // from input shape [1, 3, 1024, 1024]
const MODEL_INPUT_NAME = 'input.1';        // from inspection
const MODEL_OUTPUT_NAME = '1827';          // from inspection (pick first/finest)
```

### 4. Check if preprocessing needs changes

The current `image-processing.ts` assumes:

- **Channel order:** RGB
- **Normalization:** simple `pixel / 255` (range 0–1)
- **Layout:** CHW (channels-first)
- **Output activation:** values passed through min-max normalization

Some models differ. Adjust `image-processing.ts` accordingly:

| Variation | What to change |
|-----------|---------------|
| BGR instead of RGB | Swap R and B channels in `imageToTensor()` |
| ImageNet mean/std normalization | Replace `/ 255` with `(pixel / 255 - mean) / std` |
| Input range −1 to 1 | `pixel / 127.5 - 1.0` |
| Output is raw logits | Apply sigmoid: `1 / (1 + Math.exp(-x))` before normalization |

Always check the model card or paper for expected preprocessing.

---

## Alternative Models and License Compatibility

This project is licensed under **AGPL-3.0**. Model files are distributed alongside the code, so their licenses must be compatible.

### ✅ Compatible with AGPL-3.0

| Model | License | Size (FP32) | Input | Quality | Source |
|-------|---------|-------------|-------|---------|--------|
| **u2netp** (current) | Apache-2.0 | ~17 MB (~4.5 MB quantized) | 320×320 | ★★☆☆☆ | [GitHub](https://github.com/xuebinqin/U-2-Net) |
| **u2net** (full) | Apache-2.0 | ~176 MB | 320×320 | ★★★☆☆ | [GitHub](https://github.com/xuebinqin/U-2-Net) |
| **IS-Net (DIS)** | Apache-2.0 | ~176 MB | 1024×1024 | ★★★★☆ | [GitHub](https://github.com/xuebinqin/DIS) |
| **MODNet** | Apache-2.0 | ~25 MB | 512×512 | ★★★☆☆ | [GitHub](https://github.com/ZHKKKe/MODNet) |
| **silueta** | MIT | ~44 MB | 320×320 | ★★★☆☆ | [GitHub](https://github.com/xuebinqin/U-2-Net/issues/295) |

### ⚠️ NOT compatible — do not bundle

| Model | License | Reason |
|-------|---------|--------|
| **RMBG-1.4** (BRIA) | BRIA RMBG-1.4 License | Non-commercial / research only |
| **RMBG-2.0** (BRIA) | BRIA RMBG-2.0 License | Non-commercial / research only |
| **SAM / SAM 2** (Meta) | Apache-2.0 | License is fine, but requires interactive point/box prompts — not a drop-in replacement |

> **Note:** When adding a new model, verify its license allows redistribution under AGPL-3.0. Add an entry to the project's `THIRD_PARTY_LICENSES.md` with the model name, license, and source URL.

---

## File Structure

```
src/tools/background-remover/
├── index.ts               UI logic, image queue, worker lifecycle
├── worker.ts              Web Worker — loads model, runs inference pipeline
├── image-processing.ts    Image decode, tensor conversion, mask application
├── template.html          Tool HTML template
├── config.json            Tool metadata (name, icon, section)
├── package.json           pnpm workspace package
└── MODEL.md               This file

src/js/
└── onnx-utils.ts          Shared ONNX session cache, inference, tensor helpers

public/lib/models/
└── u2netp-q.onnx          Current model file (Apache-2.0)
```

