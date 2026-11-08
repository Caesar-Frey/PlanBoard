# Can you add to the code how the user can get the url and start ID from the web browser? 
# I got it from inspecting the network data and looking at the images that pop-up on the panel and then check those images URL (see image attached). 
# When you're inspecting and recording the network, red button at the top left (on Brave), scroll through some of the images and the information will pop-up on the network panel.
# I've learnt that the property images number are not always sequential, need to update the code to account for that. Might need to input each individually or put them in a list that can be pulled by the code.
# What's the best way to do this and how will you describe it? Don't write any code before we agree.

import os
import sys
import requests
import time
import tkinter as tk
import subprocess
import platform
from tkinter import filedialog
from tqdm import tqdm
from pathlib import Path

def get_interactive_config():
    """
    Prompts the user for configuration and opens a folder selection dialog.
    """
    # Initialize a hidden tkinter root to use the file dialog
    root = tk.Tk()
    root.withdraw() 
    
    print("\n--- 🛠️  Download Configuration ---")
    
    # 1. URL Pattern
    default_url = "https://images.prop24.com/"
    url_input = input(f"🔗 Enter URL Pattern [{default_url}]: ").strip()
    base_url = url_input if url_input else default_url
    
    # 2. Start ID
    default_id = 377176740
    id_input = input(f"🔢 Enter Start ID [{default_id}]: ").strip()
    try:
        start_id = int(id_input) if id_input else default_id
    except ValueError:
        print("❌ Error: Start ID must be a number.")
        sys.exit(1)

    # 3. Count
    default_count = 70
    count_input = input(f"📦 Enter Number of Images [{default_count}]: ").strip()
    try:
        count = int(count_input) if count_input else default_count
    except ValueError:
        print("❌ Error: Count must be a number.")
        sys.exit(1)

    # 4. Folder Selection
    print("📂 Opening folder selector... (Check your dock if it doesn't appear)")
    save_directory = filedialog.askdirectory(
        title="Select Folder to Save Images",
        initialdir=os.path.expanduser("~/Downloads")
    )
    
    if not save_directory:
        print("❌ Error: Action cancelled. No directory selected.")
        sys.exit(1)

    root.destroy()
    return start_id, count, base_url, save_directory

def download_batch_images(start_id, count, base_url, save_directory):
    """
    Downloads a sequence of images with error handling and progress tracking.
    """
    target_path = Path(save_directory)
    target_path.mkdir(parents=True, exist_ok=True)
    
    print(f"\n🚀 Initializing download task...")
    print(f"📁 Target Folder: {target_path.absolute()}")
    print(f"🔢 Sequence: {start_id} to {start_id + count - 1}\n")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }

    success_count = 0
    error_count = 0

    with tqdm(total=count, desc="Progress", unit="img", colour="#0071E3") as pbar:
        for i in range(count):
            current_id = start_id + i
            url = f"{base_url}{current_id}"
            file_name = f"image_{current_id}.jpg"
            file_path = target_path / file_name

            if file_path.exists():
                pbar.update(1)
                success_count += 1
                continue

            max_retries = 3
            download_success = False
            
            for attempt in range(max_retries):
                try:
                    response = requests.get(url, headers=headers, stream=True, timeout=20)
                    if response.status_code == 200:
                        with open(file_path, 'wb') as f:
                            for chunk in response.iter_content(chunk_size=1024 * 16):
                                if chunk: f.write(chunk)
                        download_success = True
                        success_count += 1
                        break
                    elif response.status_code == 404:
                        break
                    time.sleep(1)
                except Exception:
                    time.sleep(1)

            if not download_success:
                error_count += 1
            
            pbar.update(1)

    print(f"\n✨ Done! {success_count} images secured.")
    if error_count > 0:
        print(f"⚠️ {error_count} images failed. Likely invalid IDs or connection issues.")

    # --- ADDED FEATURES: Create file and open directory ---
    
    # 1. Create the empty text file
    try:
        # Note: Used 'Propery_Details.txt' as requested. If it was a typo, just change it to 'Property_Details.txt'
        details_file = target_path / "Property_Details.txt"
        details_file.touch(exist_ok=True)
        print(f"📝 Created empty file: {details_file.name}")
    except Exception as e:
        print(f"⚠️ Could not create text file: {e}")

    # 2. Open the folder dynamically based on the OS
    print("📂 Opening target folder...")
    try:
        current_os = platform.system()
        if current_os == "Windows":
            os.startfile(target_path)
        elif current_os == "Darwin":  # macOS
            subprocess.run(["open", str(target_path)])
        else:  # Linux / Unix-like
            subprocess.run(["xdg-open", str(target_path)])
    except Exception as e:
        print(f"⚠️ Could not open folder automatically: {e}")

if __name__ == "__main__":
    try:
        # Get config interactively from the user
        s_id, cnt, b_url, s_dir = get_interactive_config()
        download_batch_images(s_id, cnt, b_url, s_dir)
    except KeyboardInterrupt:
        print("\n🛑 Operation cancelled.")
    except Exception as e:
        print(f"\n❌ Critical error: {e}")