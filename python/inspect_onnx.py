"""
Inspect an ONNX model and print detailed, well-formatted information.
Usage:
  python inspect_onnx.py model.onnx [--max-nodes N] [--full] [--no-nodes] [--show-init]

Options:
  --max-nodes N   Limit node listing to N (default 10)
  --full           Show full node listing (overrides --max-nodes)
  --no-nodes        Do not print node list
  --show-init       Print initializer details (shapes, dtype)

This script focuses on inputs and outputs and provides a concise summary
for large models. Use --full to expand node lists.
"""
import sys
import onnx
import argparse
from onnx import helper, numpy_helper


def shape_to_str(type_proto):
    # type_proto: a TensorTypeProto
    if type_proto is None:
        return "?"
    dims = []
    for d in type_proto.shape.dim:
        if d.dim_value:
            dims.append(str(d.dim_value))
        elif d.dim_param:
            dims.append(d.dim_param)
        else:
            dims.append("?")
    return "[" + ", ".join(dims) + "]"


def dtype_to_str(type_proto):
    # Robustly get a readable dtype string even if `onnx.mapping` isn't exposed.
    try:
        t = type_proto.elem_type
        # prefer public mapping if available, else try internal _mapping
        mapping_mod = None
        if hasattr(onnx, 'mapping'):
            mapping_mod = onnx.mapping
        elif hasattr(onnx, '_mapping'):
            mapping_mod = onnx._mapping
        if mapping_mod and hasattr(mapping_mod, 'TENSOR_TYPE_TO_NP_TYPE'):
            np_type = mapping_mod.TENSOR_TYPE_TO_NP_TYPE.get(t)
            if np_type is not None:
                # numpy dtypes have a .name attribute or can use __name__ for types
                try:
                    return np_type.__name__
                except Exception:
                    return str(np_type)
        # fallback: try to map using TensorProto names
        from onnx import TensorProto
        for name, val in vars(TensorProto).items():
            if isinstance(val, int) and val == t:
                return name
        return str(t)
    except Exception:
        return str(getattr(type_proto, 'elem_type', 'unknown'))


def attrs_to_dict(node):
    return {a.name: helper.get_attribute_value(a) for a in node.attribute}


def print_header(m):
    gi = m.graph
    print("Model ir_version:", getattr(m, 'ir_version', None))
    print("Producer name:", getattr(m, 'producer_name', None))
    print("Producer version:", getattr(m, 'producer_version', None))
    print("Domain:", getattr(m, 'domain', None))
    print("Model version:", getattr(m, 'model_version', None))
    print("Opset imports:")
    for oi in m.opset_import:
        print(f"  - domain={oi.domain or 'ai.onnx'} version={oi.version}")


def print_io(m):
    # map initializer names for skipping inputs that are initializers
    init_names = {init.name for init in m.graph.initializer}

    # inputs
    print('\nInputs:')
    for inp in m.graph.input:
        is_init = inp.name in init_names
        t = None
        try:
            t = inp.type.tensor_type
        except Exception:
            pass
        shape = shape_to_str(t) if t else '[]'
        dtype = dtype_to_str(t) if t else 'unknown'
        print(f"  - name: {inp.name}\n      shape: {shape}\n      dtype: {dtype}\n      initializer: {is_init}")

    # outputs
    print('\nOutputs:')
    for out in m.graph.output:
        t = None
        try:
            t = out.type.tensor_type
        except Exception:
            pass
        shape = shape_to_str(t) if t else '[]'
        dtype = dtype_to_str(t) if t else 'unknown'
        print(f"  - name: {out.name}\n      shape: {shape}\n      dtype: {dtype}")


def print_initializers(m):
    if not m.graph.initializer:
        print('\nInitializers: none')
        return
    print('\nInitializers:')
    for init in m.graph.initializer:
        try:
            arr = numpy_helper.to_array(init)
            print(f"  - name: {init.name}\n      shape: {list(arr.shape)}\n      dtype: {arr.dtype}\n      bytes: {arr.nbytes}")
        except Exception:
            # fallback to proto info
            dims = list(init.dims)
            print(f"  - name: {init.name}\n      shape: {dims}\n      dtype: {init.data_type}")


def print_value_info(m):
    if not m.graph.value_info:
        return
    print('\nValueInfo (intermediate tensors):')
    for vi in m.graph.value_info:
        t = None
        try:
            t = vi.type.tensor_type
        except Exception:
            pass
        shape = shape_to_str(t) if t else '[]'
        dtype = dtype_to_str(t) if t else 'unknown'
        print(f"  - name: {vi.name}\n      shape: {shape}\n      dtype: {dtype}")


def print_node_summary(m, max_nodes=10, full=False, no_nodes=False):
    nodes = list(m.graph.node)
    print(f"\nTotal nodes: {len(nodes)}")
    # type counts
    type_counts = {}
    for n in nodes:
        type_counts[n.op_type] = type_counts.get(n.op_type, 0) + 1
    print('Node type counts:')
    for k in sorted(type_counts.keys()):
        print(f"  {k}: {type_counts[k]}")

    if no_nodes:
        print('\nNode listing suppressed (--no-nodes)')
        return

    to_show = nodes if full else nodes[:max_nodes]
    print(f"\nListing {'all' if full else f'first {len(to_show)}'} nodes:")
    for i, n in enumerate(to_show, 1):
        attrs = attrs_to_dict(n)
        print(f"  {i}: name={n.name or '<unnamed>'} op_type={n.op_type} inputs={list(n.input)} outputs={list(n.output)} attrs={attrs}")
    if not full and len(nodes) > max_nodes:
        print(f"  ... ({len(nodes)-max_nodes} more nodes suppressed, use --full to show all)\n")


def check_maxpool_ceil(m):
    """Return (count, examples) of MaxPool nodes with ceil_mode == 1."""
    nodes = list(m.graph.node)
    count = 0
    examples = []
    for n in nodes:
        if n.op_type != 'MaxPool':
            continue
        for attr in n.attribute:
            if attr.name == 'ceil_mode':
                try:
                    val = helper.get_attribute_value(attr)
                except Exception:
                    val = None
                if val == 1:
                    count += 1
                    if len(examples) < 10:
                        examples.append(n.name or '<unnamed>')
                break
    return count, examples


def main():
    p = argparse.ArgumentParser(description='Inspect ONNX model and print detailed info')
    p.add_argument('model', help='path to model.onnx')
    p.add_argument('--max-nodes', type=int, default=10, help='max nodes to list when not using --full')
    p.add_argument('--full', action='store_true', help='show full node listing')
    p.add_argument('--no-nodes', action='store_true', help='do not print node list')
    p.add_argument('--show-init', action='store_true', help='print initializer details')
    args = p.parse_args()

    path = args.model
    try:
        m = onnx.load(path)
    except Exception as e:
        print('Failed to load model:', e)
        sys.exit(2)

    print('='*60)
    print('Model:', path)
    print('='*60)

    print_header(m)
    print_io(m)
    if args.show_init:
        print_initializers(m)
    print_value_info(m)
    print_node_summary(m, max_nodes=args.max_nodes, full=args.full, no_nodes=args.no_nodes)

    # check for MaxPool ceil_mode usage and warn
    ceil_count, examples = check_maxpool_ceil(m)
    if ceil_count:
        print('\nWARNING: Model contains MaxPool nodes with ceil_mode=1')
        print(f"  Occurrences: {ceil_count}")
        if examples:
            print(f"  Examples (up to 10): {examples}")
        print("  These can cause shape/compatibility issues in some runtimes. See python/fix_onnx_maxpool_ceil.py to automatically set ceil_mode=0 and save a fixed model.")


if __name__ == '__main__':
    main()
