import subprocess
import json
import sys

# Configuration
KEY_FILE = "/Users/jebin.koshy/Desktop/dev01.pem"
SERVER = "ec2-3-108-190-207.ap-south-1.compute.amazonaws.com"
USER = "ec2-user"
FARMS_API = "http://localhost:4000/api/farms"
DEVICES_API = "http://localhost:4000/api/devices"

def run_remote_curl(url):
    """Executes a curl command on the EC2 instance via SSH and returns parsed JSON."""
    ssh_command = [
        "ssh", "-i", KEY_FILE,
        "-o", "StrictHostKeyChecking=no",
        f"{USER}@{SERVER}",
        f"curl -s {url}"
    ]
    
    try:
        result = subprocess.run(ssh_command, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Error executing SSH command for {url}: {e.stderr}", file=sys.stderr)
        return None
    except json.JSONDecodeError:
        print(f"Error decoding JSON response from {url}.", file=sys.stderr)
        return None

def main():
    farms_data = run_remote_curl(FARMS_API)
    devices_resp = run_remote_curl(DEVICES_API)

    if not farms_data:
        print("No farms data found or error occurred.")
        return

    # Map devices to farms
    devices = devices_resp.get('data', []) if devices_resp else []
    farm_to_devices = {farm['id']: [] for farm in farms_data}
    
    for dev in devices:
        for farm in dev.get('Farms', []):
            f_id = farm.get('id')
            if f_id in farm_to_devices:
                farm_to_devices[f_id].append(dev)

    print(f"\n{'Farm Name':<20} | {'Farm ID':<36}")
    print("=" * 70)

    for farm in farms_data:
        f_id = farm['id']
        print(f"{farm.get('name', 'N/A'):<20} | {f_id}")
        
        farm_devs = farm_to_devices.get(f_id, [])
        if farm_devs:
            print(f"  └─ {'Devices:':<18}")
            for d in farm_devs:
                print(f"     • {d.get('device_name', 'N/A'):<15} | ID: {d.get('id', 'N/A')}")
        else:
            print("  └─ No devices found")
        print("-" * 70)

    if len(sys.argv) > 1:
        search_name = sys.argv[1].lower()
        print(f"\nSearching for: {search_name}")
        found = [f for f in farms_data if search_name in f.get('name', '').lower()]
        if found:
            for f in found:
                print(f"Found Farm: {f['name']} -> {f['id']}")
                devs = farm_to_devices.get(f['id'], [])
                for d in devs:
                    print(f"  - Device: {d['device_name']} -> {d['id']}")
        else:
            print("No matching farm found.")

if __name__ == "__main__":
    main()
