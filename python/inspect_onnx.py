# inspect_onnx.py
import onnx
import sys

if len(sys.argv) != 2:
    print("Usage: python inspect_onnx.py model.onnx")
    sys.exit(1)

path = sys.argv[1]
m = onnx.load(path)

ceil_nodes = [n for n in m.graph.node if n.op_type == "Ceil"]
maxpool_nodes = [n for n in m.graph.node if n.op_type == "MaxPool"]

print(f"Total nodes: {len(m.graph.node)}")
print(f"Ceil nodes: {len(ceil_nodes)}")
for i,n in enumerate(ceil_nodes,1):
    print(f"  {i}: name={n.name} inputs={n.input} outputs={n.output}")

print(f"MaxPool nodes: {len(maxpool_nodes)}")
for i,n in enumerate(maxpool_nodes,1):
    attrs = {a.name: onnx.helper.get_attribute_value(a) for a in n.attribute}
    print(f"  {i}: name={n.name} attrs={attrs}")
