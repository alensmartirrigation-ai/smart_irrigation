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
DEVICE_IDS = [
    "fc9dd0ac-558c-460b-ab78-28efacc0256c", 
    "87bb6936-48e1-48d7-a11f-0ab07a50f75d"
]

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

try:
    while True:
        for device_id in DEVICE_IDS:
            temperature = round(random.uniform(20.0, 35.0), 2)
            humidity = round(random.uniform(40.0, 80.0), 2)
            moisture = round(random.uniform(10.0, 60.0), 2)

            point = (
                Point("device_readings")
                .tag("device_id", device_id)
                .field("temperature", temperature)
                .field("humidity", humidity)
                .field("moisture", moisture)
                .time(datetime.utcnow(), WritePrecision.NS)
            )

            write_api.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=point)

            print(f"[{datetime.now().strftime('%H:%M:%S')}] Device {device_id} -> T={temperature}°C, H={humidity}%, M={moisture}%")

        # Wait 5 seconds
        time.sleep(5)

except KeyboardInterrupt:
    print("\nStopping simulation.")
    client.close()
except Exception as e:
    print(f"\nError: {e}")
    client.close()