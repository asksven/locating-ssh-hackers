import subprocess
import re
import requests
import json
import time

# API endpoint where we'll send the data
API_ENDPOINT = "http://your-server.com/api/ssh-attempts"

# Regex pattern to extract invalid user and IP
pattern = r"Invalid user (\w+) from ([\d\.]+)"

# Function to send data to API
def send_to_api(username, ip):
    payload = {
        "username": username,
        "ip_address": ip,
        "timestamp": int(time.time())
    }
    try:
        response = requests.post(API_ENDPOINT, json=payload)
        print(f"Sent to API: {payload}, Response: {response.status_code}")
    except Exception as e:
        print(f"Error sending to API: {e}")

# Main loop to continuously monitor logs
def monitor_ssh_logs():
    # Use subprocess to continuously read from journalctl
    process = subprocess.Popen(
        ["journalctl", "-u", "ssh", "-f", "-o", "cat"],
        stdout=subprocess.PIPE,
        text=True
    )

    print("Started monitoring SSH logs...")

    # Read each line as it's output
    for line in process.stdout:
        match = re.search(pattern, line)
        if match:
            username = match.group(1)
            ip = match.group(2)
            print(f"Detected invalid login attempt: user={username}, ip={ip}")
            #send_to_api(username, ip)

if __name__ == "__main__":
    monitor_ssh_logs()