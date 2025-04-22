from flask import Flask, request, jsonify
import geoip2.database
import time
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

app = Flask(__name__)

# InfluxDB setup
INFLUXDB_URL = "http://localhost:8086"
INFLUXDB_TOKEN = "your-influxdb-token"
INFLUXDB_ORG = "your-org"
INFLUXDB_BUCKET = "ssh-attempts"

# GeoIP database
GEOIP_DB_PATH = "/path/to/GeoLite2-City.mmdb"
geo_reader = geoip2.database.Reader(GEOIP_DB_PATH)

# Create InfluxDB client
influx_client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
write_api = influx_client.write_api(write_options=SYNCHRONOUS)

@app.route('/api/ssh-attempts', methods=['POST'])
def process_ssh_attempt():
    data = request.json
    
    if not data or 'ip_address' not in data:
        return jsonify({"error": "Invalid data"}), 400
    
    ip_address = data['ip_address']
    username = data.get('username', 'unknown')
    timestamp = data.get('timestamp', int(time.time()))
    
    # Get geolocation data
    try:
        geo_response = geo_reader.city(ip_address)
        country = geo_response.country.name
        city = geo_response.city.name
        latitude = geo_response.location.latitude
        longitude = geo_response.location.longitude
    except Exception as e:
        print(f"Error getting geolocation: {e}")
        country = "Unknown"
        city = "Unknown"
        latitude = 0.0
        longitude = 0.0
    
    # Create InfluxDB point
    point = Point("ssh_invalid_login") \
        .tag("ip_address", ip_address) \
        .tag("username", username) \
        .tag("country", country) \
        .tag("city", city) \
        .field("latitude", latitude) \
        .field("longitude", longitude) \
        .field("count", 1) \
        .time(timestamp * 1000000000)  # Convert to nanoseconds
    
    # Write to InfluxDB
    try:
        write_api.write(bucket=INFLUXDB_BUCKET, record=point)
        print(f"Stored in InfluxDB: {ip_address} ({country}, {city})")
    except Exception as e:
        print(f"Error writing to InfluxDB: {e}")
        return jsonify({"error": "Database error"}), 500
        
    return jsonify({
        "status": "success",
        "ip": ip_address,
        "geo": {
            "country": country,
            "city": city,
            "lat": latitude,
            "lon": longitude
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)