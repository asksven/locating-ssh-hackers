var geohash = require("ngeohash");
const config = require("./config.json");
const axios = require("axios");
const Influx = require("influx");

console.log("Config: " + JSON.stringify(config));

// TCP handles
const net = require('net');
const port = 8080;
const host = '0.0.0.0';

const server = net.createServer();
server.listen(port, host, () => {
    console.log('TCP Server is running on port ' + port + '.');
});

// InfluxDB Initialization.
const influx = new Influx.InfluxDB({
    host: config.influxHost,
    database: config.influxDatabase
});

console.log("InfluxDB: host=" + influx.host + ", database=" + influx.database);

let sockets = [];


server.on('connection', function(sock) {
    console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
    sockets.push(sock);

    sock.on('data', function(data) {
        console.log("Received data: " + data);
        try {
            let message = JSON.parse("" + data)
            // API Initialization.
            const instance = axios.create({
                baseURL: "http://api.ipstack.com"
            });
            instance
                .get(`/${message.ip}?access_key=${config.apikey}`)
                .then(function(response) {
                    const apiResponse = response.data;
                    influx.writePoints(
                        [{
                            measurement: "geossh",
                            fields: {
                                value: 1
                            },
                            tags: {
                                geohash: geohash.encode(apiResponse.latitude, apiResponse.longitude),
                                username: message.username,
                                port: message.port,
                                ip: message.ip
                            }
                        }]
                    );
                    console.log("Intruder added")
                })
                .catch(function(error) {
                    console.log(error);
                });
        } catch(error) {
            console.log(error);
        };
    });

    // Add a 'close' event handler to this instance of socket
    sock.on('close', function(data) {
        let index = sockets.findIndex(function(o) {
            return o.remoteAddress === sock.remoteAddress && o.remotePort === sock.remotePort;
        })
        if (index !== -1) sockets.splice(index, 1);
        console.log('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
    });
});
