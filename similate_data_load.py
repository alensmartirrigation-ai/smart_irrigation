import time
import random
from datetime import datetime
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

# ========================
# CONFIGURATION
# ========================

INFLUX_URL = "http://localhost:8086"
INFLUX_TOKEN = "smart-irrigation-token"
INFLUX_ORG = "smartfarm"
INFLUX_BUCKET = "farm_sensors"

# List of device IDs to simulate
import sys

# List of device IDs to simulate
if len(sys.argv) > 1:
    DEVICE_IDS = sys.argv[1:]
    print(f"Using device IDs from arguments: {DEVICE_IDS}")
else:
    DEVICE_IDS = [
        "fc9dd0ac-558c-460b-ab78-28efacc0256c", 
        "87bb6936-48e1-48d7-a11f-0ab07a50f75d"
    ]
    print(f"Using default device IDs: {DEVICE_IDS}")

# ========================
# CONNECT TO INFLUXDB
# ========================

print(f"Connecting to InfluxDB at {INFLUX_URL} (Org: {INFLUX_ORG}, Bucket: {INFLUX_BUCKET})")

client = InfluxDBClient(
    url=INFLUX_URL,
    token=INFLUX_TOKEN,
    org=INFLUX_ORG
)

write_api = client.write_api(write_options=SYNCHRONOUS)

print(f"Starting simulation for {len(DEVICE_IDS)} devices...")

# ========================
# SIMULATION LOOP
# ========================


# State tracking for simulation
device_states = {d_id: {"is_irrigating": False, "remaining_duration": 0} for d_id in DEVICE_IDS}

try:
    while True:
        for device_id in DEVICE_IDS:
            state = device_states[device_id]

            # Irrigation Logic
            if state["is_irrigating"]:
                state["remaining_duration"] -= 5
                if state["remaining_duration"] <= 0:
                    state["is_irrigating"] = False
                    state["remaining_duration"] = 0
            else:
                # 10% chance to start irrigation
                if random.random() < 0.1:
                    state["is_irrigating"] = True
                    state["remaining_duration"] = random.randint(30, 120) # 30s to 2m

            temperature = round(random.uniform(20.0, 35.0), 2)
            humidity = round(random.uniform(40.0, 80.0), 2)
            moisture = round(random.uniform(10.0, 60.0), 2)

            point = (
                Point("device_readings")
                .tag("device_id", device_id)
                .field("temperature", temperature)
                .field("humidity", humidity)
                .field("moisture", moisture)
                .field("is_irrigating", int(state["is_irrigating"]))
                .field("irrigation_duration", state["remaining_duration"])
                .time(datetime.utcnow(), WritePrecision.NS)
            )

            write_api.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=point)

            irrigation_status = f"[IRRIGATING: {state['remaining_duration']}s]" if state["is_irrigating"] else ""
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Device {device_id} -> T={temperature}°C, H={humidity}%, M={moisture}% {irrigation_status}")

        # Wait 5 seconds
        time.sleep(5)

except KeyboardInterrupt:
    print("\nStopping simulation.")
    client.close()
except Exception as e:
    print(f"\nError: {e}")
    client.close()