"""
Fix ONNX MaxPool nodes that use ceil_mode=1 by setting ceil_mode to 0.
Usage: python fix_onnx_maxpool_ceil.py input.onnx [output.onnx]
If output not provided, adds suffix _noceil.onnx
This is a low-risk, mechanical change to avoid runtime errors in runtimes
that don't support ceil() in shape computation (for example WASM fallback).
"""
import sys
import os
import onnx
from onnx import helper

if len(sys.argv) < 2:
    print("Usage: python fix_onnx_maxpool_ceil.py input.onnx [output.onnx]")
    sys.exit(1)

in_path = sys.argv[1]
if len(sys.argv) >= 3:
    out_path = sys.argv[2]
else:
    base, ext = os.path.splitext(in_path)
    out_path = base + "_noceil" + ext

m = onnx.load(in_path)
changed = False
count_before = 0
count_changed = 0
for node in m.graph.node:
    if node.op_type == 'MaxPool':
        # inspect attributes
        for attr in node.attribute:
            if attr.name == 'ceil_mode':
                count_before += 1
                try:
                    val = helper.get_attribute_value(attr)
                except Exception:
                    val = None
                if val == 1:
                    # set integer field to 0
                    attr.i = 0
                    changed = True
                    count_changed += 1

print(f"MaxPool nodes with explicit ceil_mode before change: {count_before}")
print(f"MaxPool nodes changed (ceil_mode 1 -> 0): {count_changed}")
if changed:
    onnx.save(m, out_path)
    print(f"Saved fixed model to: {out_path}")
else:
    print("No changes needed. No model written.")

