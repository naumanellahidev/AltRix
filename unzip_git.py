import zipfile
import os

def main():
    zip_path = r"d:\Altrix Duplicate\.git.zip"
    dest_dir = r"d:\Altrix Duplicate"
    
    if not os.path.exists(zip_path):
        print(f"Zip file {zip_path} not found.")
        return
        
    print(f"Unzipping {zip_path} to {dest_dir}...")
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(dest_dir)
        print("Unzip successful!")
    except Exception as e:
        print("Error unzipping:", e)

if __name__ == "__main__":
    main()
