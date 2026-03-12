import onnx
import sys
import os

def embed_data(input_path, output_path):
    print(f"Loading model from {input_path}")
    model = onnx.load(input_path)
    
    # By default, onnx.save will embed data if it's not explicitly asked to save to external file.
    # However, to be sure, we can clear the external data field if it exists.
    # Actually, loading the model with onnx.load should load the external data if present 
    # and then saving it without specifying external data will bundle it.
    
    print(f"Saving model to {output_path}")
    onnx.save_model(model, output_path)
    print("Done!")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python embed_onnx_data.py <input_path> <output_path>")
        sys.exit(1)
    
    embed_data(sys.argv[1], sys.argv[2])
