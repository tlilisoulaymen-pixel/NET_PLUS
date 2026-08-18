import urllib.request
import zipfile
import os

url = "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip"
zip_path = "ngrok.zip"
extract_dir = "ngrok"

print("Downloading ngrok...")
urllib.request.urlretrieve(url, zip_path)
print("Download complete.")

print("Extracting ngrok...")
with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    zip_ref.extractall(extract_dir)
print("Extraction complete.")

if os.path.exists(os.path.join(extract_dir, "ngrok.exe")):
    print("ngrok.exe successfully extracted.")
else:
    print("Error: ngrok.exe not found after extraction.")
