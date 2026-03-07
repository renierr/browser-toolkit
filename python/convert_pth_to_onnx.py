"""CLI tool to convert a PyTorch .pth checkpoint to ONNX.

Usage (via uv):
  uv run convert-pth-to-onnx -- --input model.pth --output model.onnx --class-file mymodel.py --class-name MyModel --input-shape 1,3,224,224

Notes:
- If the model class is not provided, the script will try to load the checkpoint directly and export if it contains a 'model' or 'state_dict'.
- This script minimizes assumptions. For complex models, pass --class-file and --class-name.
"""

from __future__ import annotations
import argparse
import importlib.util
import sys
from pathlib import Path
from typing import Tuple, Optional


def parse_shape(s: str) -> Tuple[int, ...]:
    return tuple(int(x) for x in s.split(','))


def load_class_from_file(path: Path, class_name: str):
    spec = importlib.util.spec_from_file_location("user_module", str(path))
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot import from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not hasattr(mod, class_name):
        raise AttributeError(f"Module {path} has no attribute {class_name}")
    return getattr(mod, class_name)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Convert PyTorch .pth to ONNX")
    parser.add_argument('--input', '-i', required=True, help='Input .pth checkpoint')
    parser.add_argument('--output', '-o', required=True, help='Output .onnx file')
    parser.add_argument('--class-file', '-c', help='Python file path that defines the model class')
    parser.add_argument('--class-name', help='Model class name to instantiate')
    parser.add_argument('--input-shape', default='1,3,224,224', help='Comma separated input tensor shape')
    parser.add_argument('--opset', type=int, default=18, help='ONNX opset version')
    parser.add_argument('--device', default='cpu', choices=['cpu','cuda'], help='Device for loading model')
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args(argv)

    import torch

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        return 2

    device = torch.device(args.device)

    # Try to load checkpoint
    ckpt = torch.load(str(input_path), map_location=device)

    model = None

    # If class file provided, instantiate
    if args.class_file and args.class_name:
        class_file = Path(args.class_file)
        if not class_file.exists():
            print(f"Class file not found: {class_file}")
            return 3
        ModelClass = load_class_from_file(class_file, args.class_name)
        model = ModelClass()
        # load state dict if checkpoint is a state_dict
        if isinstance(ckpt, dict) and ('state_dict' in ckpt or 'model' in ckpt or 'params' in ckpt):
            state = ckpt.get('state_dict') or ckpt.get('model') or ckpt.get('params')
            # try common nested dict formats
            if isinstance(state, dict):
                try:
                    model.load_state_dict(state)
                except Exception:
                    # Sometimes state keys are prefixed
                    new_state = {k.replace('module.', ''): v for k, v in state.items()}
                    model.load_state_dict(new_state)
        else:
            # assume ckpt itself is a state dict
            if isinstance(ckpt, dict):
                try:
                    model.load_state_dict(ckpt)
                except Exception:
                    new_state = {k.replace('module.', ''): v for k, v in ckpt.items()}
                    model.load_state_dict(new_state)

    else:
        # No class provided - try common patterns
        if isinstance(ckpt, dict) and 'model' in ckpt and hasattr(ckpt['model'], 'state_dict'):
            model = ckpt['model']
        elif isinstance(ckpt, dict) and 'state_dict' in ckpt:
            # create simple wrapper? not possible without architecture
            print("Checkpoint contains state_dict but no model class provided. Provide --class-file and --class-name.")
            return 4
        elif hasattr(ckpt, 'state_dict'):
            model = ckpt
        else:
            print("Cannot determine model from checkpoint. Provide --class-file and --class-name.")
            return 5

    model.to(device)
    model.eval()

    input_shape = parse_shape(args.input_shape)

    import torch.onnx

    dummy = torch.randn(*input_shape, device=device)

    try:
        torch.onnx.export(
            model,
            dummy,
            str(output_path),
            export_params=True,
            opset_version=args.opset,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
        )
        print(f"Exported ONNX to {output_path}")
        return 0
    except Exception as e:
        print(f"ONNX export failed: {e}")
        return 6


if __name__ == '__main__':
    raise SystemExit(main())

