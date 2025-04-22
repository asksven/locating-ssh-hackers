from fastapi import FastAPI, HTTPException, Request
import geoip2.database
import time
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS
import uvicorn
from pydantic import BaseModel
from typing import Optional

# Create FastAPI app
app = FastAPI(title="SSH Invalid Login Tracker")

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

# Define data model for SSH attempt
class SSHAttempt(BaseModel):
    username: str
    ip_address: str
    timestamp: Optional[int] = None

# Response model
class GeoResponse(BaseModel):
    country: str
    city: str
    lat: float
    lon: float

class ApiResponse(BaseModel):
    status: str
    ip: str
    geo: GeoResponse

@app.post("/api/ssh-attempts", response_model=ApiResponse)
async def process_ssh_attempt(attempt: SSHAttempt):
    # Use current timestamp if not provided
    if not attempt.timestamp:
        attempt.timestamp = int(time.time())
    
    # Get geolocation data
    try:
        geo_response = geo_reader.city(attempt.ip_address)
        country = geo_response.country.name or "Unknown"
        city = geo_response.city.name or "Unknown"
        latitude = geo_response.location.latitude or 0.0
        longitude = geo_response.location.longitude or 0.0
    except Exception as e:
        print(f"Error getting geolocation: {e}")
        country = "Unknown"
        city = "Unknown"
        latitude = 0.0
        longitude = 0.0
    
    # Create InfluxDB point
    point = Point("ssh_invalid_login") \
        .tag("ip_address", attempt.ip_address) \
        .tag("username", attempt.username) \
        .tag("country", country) \
        .tag("city", city) \
        .field("latitude", latitude) \
        .field("longitude", longitude) \
        .field("count", 1) \
        .time(attempt.timestamp * 1000000000)  # Convert to nanoseconds
    
    # Write to InfluxDB
    try:
        write_api.write(bucket=INFLUXDB_BUCKET, record=point)
        print(f"Stored in InfluxDB: {attempt.ip_address} ({country}, {city})")
    except Exception as e:
        print(f"Error writing to InfluxDB: {e}")
        raise HTTPException(status_code=500, detail="Database error")
        
    return ApiResponse(
        status="success",
        ip=attempt.ip_address,
        geo=GeoResponse(
            country=country,
            city=city,
            lat=latitude,
            lon=longitude
        )
    )

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=5000)