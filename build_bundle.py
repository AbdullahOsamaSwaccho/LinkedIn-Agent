import os
import json
import base64

def generate_bundle():
    text_files = [
        "manifest.json",
        "background.js",
        "content.js",
        "prompts.js",
        "styles.css",
        "popup.html",
        "popup.js"
    ]
    
    binary_files = [
        os.path.join("icons", "icon16.png"),
        os.path.join("icons", "icon48.png"),
        os.path.join("icons", "icon128.png")
    ]
    
    bundle_text = {}
    for fname in text_files:
        if os.path.exists(fname):
            with open(fname, "r", encoding="utf-8") as f:
                bundle_text[fname] = f.read()

    bundle_binary = {}
    for fname in binary_files:
        if os.path.exists(fname):
            with open(fname, "rb") as f:
                bundle_binary[fname.replace("\\", "/")] = base64.b64encode(f.read()).decode("ascii")

    exporter_code = [
        "import os",
        "import base64",
        "",
        f"text_files = {json.dumps(bundle_text, indent=2, ensure_ascii=False)}",
        f"binary_files = {json.dumps(bundle_binary, indent=2)}",
        "",
        "output_dir = 'linkedin_agent_extension'",
        "os.makedirs(output_dir, exist_ok=True)",
        "os.makedirs(os.path.join(output_dir, 'icons'), exist_ok=True)",
        "",
        "for fname, content in text_files.items():",
        "    path = os.path.join(output_dir, fname)",
        "    os.makedirs(os.path.dirname(path), exist_ok=True)",
        "    with open(path, 'w', encoding='utf-8') as f:",
        "        f.write(content)",
        "    print(f'Wrote {fname} ({len(content)} chars)')",
        "",
        "for fname, b64content in binary_files.items():",
        "    path = os.path.join(output_dir, fname)",
        "    os.makedirs(os.path.dirname(path), exist_ok=True)",
        "    with open(path, 'wb') as f:",
        "        f.write(base64.b64decode(b64content))",
        "    print(f'Wrote binary {fname} ({len(b64content)} b64 chars)')",
        "",
        "print(\"Extension files generated in 'linkedin_agent_extension' folder.\")",
        ""
    ]

    with open("generate_extension.py", "w", encoding="utf-8") as f:
        f.write("\n".join(exporter_code))
    print("generate_extension.py created successfully.")

if __name__ == "__main__":
    generate_bundle()
