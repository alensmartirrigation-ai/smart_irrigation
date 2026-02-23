import subprocess
import json
import sys

# Configuration
KEY_FILE = "/Users/jebin.koshy/Desktop/dev01.pem"
SERVER = "ec2-3-108-190-207.ap-south-1.compute.amazonaws.com"
USER = "ec2-user"
API_URL = "http://localhost:4000/api/farms"

def get_farms():
    """Fetches the list of farms from the EC2 instance via SSH."""
    ssh_command = [
        "ssh", "-i", KEY_FILE,
        "-o", "StrictHostKeyChecking=no",
        f"{USER}@{SERVER}",
        f"curl -s {API_URL}"
    ]
    
    try:
        result = subprocess.run(ssh_command, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Error executing SSH command: {e.stderr}")
        return None
    except json.JSONDecodeError:
        print("Error decoding JSON response from server.")
        return None

def main():
    farms = get_farms()
    if not farms:
        print("No farms found or error occurred.")
        return

    print(f"{'Name':<20} | {'ID':<36}")
    print("-" * 60)
    for farm in farms:
        print(f"{farm.get('name', 'N/A'):<20} | {farm.get('id', 'N/A'):<36}")

    if len(sys.argv) > 1:
        search_name = sys.argv[1].lower()
        print(f"\nSearching for: {search_name}")
        found = [f for f in farms if search_name in f.get('name', '').lower()]
        if found:
            for f in found:
                print(f"Found: {f['name']} -> {f['id']}")
        else:
            print("No matching farm found.")

if __name__ == "__main__":
    main()
