# ssh login-attempt monitoring

This repo is based on this create article called [Geolocating SSH Hackers In Real-Time](https://medium.com/schkn/geolocating-ssh-hackers-in-real-time-108cbc3b5665), and goes in a little more details in setting-up the environment.
I will be using kubernetes to run the following pieces:
- infludb: the time series database
- grafana: for visualizing the login attempts on a map
- login collector: tcp socket listener called by rsyslogd

In the first step we will go trough the basic setup of the components:
1. influxdb
1. grafana
1. logincollector
1. rsyslog

and in a second step will will configure these components.

## 1. Setting up influxdb

### 1.1. Install

The setup of influxdb is pretty straignt forward: we will not expose influxdb to the network (because we don't need this in this use-case). We will be using helm as the package manager to do the install, based on a slightly modified `values.yml`. 

```
helm install --name influxdb -f ./values7influxdb/values.yaml stable/influxdb --namespace influxdb
```

Done!

The influxdb user is `admin` and you can retrieve the auto-generated password with: `kubectl -n influxdb get secret influxdb-influxdb-auth -o jsonpath="{.data.influxdb-password}" | base64 -d`

### 1.2. Create the database

We will use the influxdb cli to connect and create the database `login-attempts`.

First, retrieve the password: `export PASSWORD=$(kubectl -n influxdb get secret influxdb-influxdb-auth -o jsonpath="{.data.influxdb-password}" | base64 -d)`

Then forward the local port 8086 to the influxdb pod: `kubectl port-forward --namespace influxdb $(kubectl get pods --namespace influxdb -l app=influxdb-influxdb -o jsonpath='{ .items[0].metadata.name }') 8086:8086`

...and finally connect to the database: `influx -host 127.0.0.1 -port 8086 -username admin -password $PASSWORD`

Now create the database: `create database "login-attempts" with duration 30d`

## 2. Setting up grafana

### 2.1. Install
We will use helm to setup grafana as well:
```
helm install --name grafana -f ./values/grafana/values.yaml stable/grafana --namespace grafana
```

and retrieve the password (the username is `admin`): 
```
kubectl get secret --namespace grafana grafana -o jsonpath="{.data.admin-password}" | base64 --decode ; echo
```

To expose grafana to the network we need an ingress and there are two ways to deploy that kubernetes object:
1. let helm create the ingress by setting `ingress.enabled` to `true` in `values/grafana/values.yaml`
1. Deploy an own ingress: this is the way I prefer to do things because I use traefik as an ingress controller on my kubernetes cluster, that takes care of generating Let's Encrypt certificates automatically for any new ingress. Aside from that I did not want to expose grafana to the internet so I added a `whitelist-source-range` definition to the ingress to make sure that grafana only accepts incoming traffic coming from my local network.

To create the ingress using Traefik:
1. Edit the hostname in `manifests/grafana/ingress.yaml`
1. Deploy the ingress: `kubectl -n grafana apply -f manifests/grafana/ingress.yaml` 


### 2.2. Add Worldmap Panel

Next we will add the [Worldmap panel](https://grafana.com/plugins/grafana-worldmap-panel/installation) to grafana.

1. connect to the grafana pod: `kubectl -n grafana exec -it $(kubectl get pods --namespace grafana -l app=grafana -o jsonpath='{.items[0].metadata.name}') /bin/bash`
1. Install the panel: `grafana-cli plugins install grafana-worldmap-panel`
1. Force the pod to restart: `kubectl -n grafana delete pod $(kubectl get pods --namespace grafana -l app=grafana -o jsonpath='{.items[0].metadata.name}')`
1. Wait for grafana to restart and verify that the panel is available: click "Add Dashboard" and check that the "Worldmap Panel" is available

### 2.3. Add datasource to influxdb

1. Go to "Configuration - Datasources" and select "Add Datasource"
1. Select "InfluxDB"
1. Name the datasource `InfluxDB`
1. Add the cluster internal URL: `http://influxdb-influxdb.influxdb.svc:8086`
1. Enter the database name: `_internal` (the default database)
1. Add `admin` and his password as credentials
1. Hit save and test: you should see a positiv test-result

## 3. Deploying the log receiver

### 3.1. Create an ipstack.com account

The tcp listener uses ipstack.com to resolve IPs to geohashes. 

1. Register a free account at `ipstack.com`
1. Grab your API key and add it to `config.json`

### 3.2. Build and deploy
The log receiver is a tcp socket listener written in nodejs that will get called from `rsyslogd`.

We will deploy it as container to kubernetes, and expose it through a nodePort (we can not use an ingress as the communication will happen over tcp, not http):

1. Build the container: `docker build -t <your-dockerhub-name>/logincollector:<tag>`
1. Push the container: `docker push <your-dockerhub-name>/logincollector:<tag>`
1. Change the deployment in `manifests/logincollector/deployment.yaml` according to your docker image
1. Create the namespace: `kubectl create ns logincollector`
1. Deploy: `kubectl -n logincollector apply -f manifests/logincollector/`

You should see the following output:
```
deployment.apps "collector-deployment" created
service "collector-svc" created
```

Now get the details of the service: `kubectl -n logincollector get svc`

That should display something like this:
```
NAME            TYPE       CLUSTER-IP     EXTERNAL-IP   PORT(S)          AGE
collector-svc   NodePort   10.97.41.164   <none>        8080:31829/TCP   40s
```

Where `31829` is the port that is exposed on each closter node. We will need this port to configure the log shipping in the `rsyslogd` config.

## 4. Configure rsyslogd

### 4.1. Find out the log pattern we are looking for

On the node running `sshd` check the result of `less /var/log/auth.log | grep ssh`. The output may look like this:

```
Feb 20 11:59:55 pve sshd[31596]: Invalid user netflow from xxx.xxx.xxx.xxx port 48854
Feb 20 11:59:55 pve sshd[31596]: Invalid user netflow from xxx.xxx.xxx.xxx port 48854
Feb 20 11:59:55 pve sshd[31596]: input_userauth_request: invalid user netflow [preauth]
Feb 20 11:59:55 pve sshd[31596]: input_userauth_request: invalid user netflow [preauth]
Feb 20 11:59:55 pve sshd[31596]: Received disconnect from xxx.xxx.xxx.xxx port 48854:11: Bye Bye [preauth]
Feb 20 11:59:55 pve sshd[31596]: Received disconnect from xxx.xxx.xxx.xxx port 48854:11: Bye Bye [preauth]
Feb 20 11:59:55 pve sshd[31596]: Disconnected from xxx.xxx.xxx.xxx port 48854 [preauth]
Feb 20 11:59:55 pve sshd[31596]: Disconnected from xxx.xxx.xxx.xxx port 48854 [preauth]
Feb 20 12:00:20 pve sshd[31651]: Invalid user mc from xxx.xxx.xxx.xxx port 41876
Feb 20 12:00:20 pve sshd[31651]: Invalid user mc from xxx.xxx.xxx.xxx port 41876
Feb 20 12:00:20 pve sshd[31651]: input_userauth_request: invalid user mc [preauth]
Feb 20 12:00:20 pve sshd[31651]: input_userauth_request: invalid user mc [preauth]
Feb 20 12:00:20 pve sshd[31651]: Received disconnect from xxx.xxx.xxx.xxx port 41876:11: Bye Bye [preauth]
Feb 20 12:00:20 pve sshd[31651]: Received disconnect from xxx.xxx.xxx.xxx port 41876:11: Bye Bye [preauth]
Feb 20 12:00:20 pve sshd[31651]: Disconnected from xxx.xxx.xxx.xxx port 41876 [preauth]
Feb 20 12:00:20 pve sshd[31651]: Disconnected from xxx.xxx.xxx.xxx port 41876 [preauth]
Feb 20 12:01:36 pve sshd[31816]: Invalid user ts3 from xxx.xxx.xxx.xxx port 33903
Feb 20 12:01:36 pve sshd[31816]: Invalid user ts3 from xxx.xxx.xxx.xxx port 33903
Feb 20 12:01:36 pve sshd[31816]: input_userauth_request: invalid user ts3 [preauth]
Feb 20 12:01:36 pve sshd[31816]: input_userauth_request: invalid user ts3 [preauth]
Feb 20 12:01:36 pve sshd[31816]: Received disconnect from xxx.xxx.xxx.xxx port 33903:11: Bye Bye [preauth]
Feb 20 12:01:36 pve sshd[31816]: Received disconnect from xxx.xxx.xxx.xxx port 33903:11: Bye Bye [preauth]
Feb 20 12:01:36 pve sshd[31816]: Disconnected from xxx.xxx.xxx.xxx port 33903 [preauth]
Feb 20 12:01:36 pve sshd[31816]: Disconnected from xxx.xxx.xxx.xxx port 33903 [preauth]
```
(IP addresses have been redacted)

Your log may look different so you may have to adapt the patterns. What we are looking for here is: `Invalid user netflow from xxx.xxx.xxx.xxx port 48854`, so a `less /var/log/auth.log | grep ssh | grep " Invalid user"` will show the list of login attempts we are looking for.

### 4.2. Create the rsysdlog rules

Edit `/etc/rsyslog.d/50-default.conf` and add:

```
#  Default rules for rsyslog.
#
#                       For more information see rsyslog.conf(5) and /etc/rsyslog.conf

#
# First some standard log files.  Log by facility.
#

if $programname == 'sshd' then {
   if $msg startswith ' Invalid user' then {
      # Transform and forward data!
      action(type="omfwd" queue.type="LinkedList" action.resumeRetryCount="-1" queue.size="10000" queue.saveonshutdown="on" target="192.168.178.72" port="31829" protocol="tcp" template="ip-json")
   }
#   stop
}

auth,authpriv.*                 /var/log/auth.log
*.*;auth,authpriv.none          -/var/log/syslog
#cron.*                         /var/log/cron.log
#daemon.*                       -/var/log/daemon.log
kern.*                          -/var/log/kern.log
#lpr.*                          -/var/log/lpr.log
mail.*                          -/var/log/mail.log
#user.*                         -/var/log/user.log
```

What this script does is pretty straight forward:

- `if $programname == 'sshd' then {` filters for log entries coming from `sshd`
- `if $msg startswith ' Invalid user' then {` describes the entries we are lookging for (see 4.1.)
- `action(type="omfwd" target="<your-kubernetes-node-ip-goes-here>" port="<your-nodeport-goes-here>" protocol="tcp" template="ip-json")` uses the `omfwd` forwarder to send log entries as tcp packets (see `protocol`) to the IP defined in `target` and to the port defined in `port`
- additional options to the `action` make sure that no message is lost. See here for more details: https://www.golinuxhub.com/2018/05/how-to-remote-logging-using-rsyslog-omfwd-redhat.html
- `template="ip-json"` describes the format of the tcp packet that we are going to define in the next step


### 4.3. Create the message template

Still on the node running `sshd`, edit `/etc/rsyslog.d/50-default.conf` and add:

```
# We handle "Invalid user q from xxx.xxx.xxx.xxx port 10664"
template(name="ip-json" type="string" string="{\"username\":\"%msg:R,ERE,1,DFLT:^ Invalid.*user ([a-zA-Z]*).* ([0-9][0-9]*[0-9]*.[0-9][0-9]*[0-9]*.[0-9][0-9]*[0-9]*.[0-9][0-9]*[0-9]*).* port ([0-9]*)--end%\",\"ip\":\"%msg:R,ERE,2,DFLT:^ Invalid.*user ([a-zA-Z]*).* ([0-9][0-9]*[0-9]*.[0-9][0-9]*[0-9]*.[0-9][0-9]*[0-9]*.[0-9][0-9]*[0-9]*).* port ([0-9]*)--end%\",\"port\":\"%msg:R,ERE,3,DFLT:^ Invalid.*user ([a-zA-Z]*).* ([0-9][0-9]*[0-9]*.[0-9][0-9]*[0-9]*.[0-9][0-9]*[0-9]*.[0-9][0-9]*[0-9]*).* port ([0-9]*)--end%\"}")
```

Please note that the template needs to be consistent with the pattern we have identified in 4.1.

### 4.4. Start forwarding

To start forwarding we now need to restart syslogd: `/etc/init.d/rsyslog restart`, and check that everything works well: `/etc/init.d/rsyslog status`

### 5. Verify that data flows to influxdb

#### 5.1. Check the socket listener logs

To check the logs execute: `kubectl -n logincollector logs -l app=collectorapp`

If packets are received from syslogd and stored to the database you should see something like:
```
Received data: {"username":"b","ip":"xxx.xxx.xxx.xxx","port":"33614"}

Intruder added
Received data: {"username":"teamspeak","ip":"xxx.xxx.xxx.xxx","port":"34994"}

Intruder added
Received data: {"username":"admin","ip":"xxx.xxx.xxx.xxx","port":"62561"}

Intruder added
Received data: {"username":"sftp","ip":"xxx.xxx.xxx.xxx","port":"53614"}
```

#### 5.2. Check the database

1. Logon to influxdb (see 1.2.) and check if the data gets persisted: `select * from "login-attempts"..geossh`

The result should look like:
```
name: geossh
------------
time                geohash		ip		        port	username	value
1550665352142176076	u09tvnqgx	xxx.xxx.xxx.xxx	33614	b		    1
1550665395520243219	w4rqnpjee	xxx.xxx.xxx.xxx	34994	teamspeak	1
1550665416291991522	qw8nv8qdk	xxx.xxx.xxx.xxx	62561	admin		1
1550665424640376618	w21z773kz	xxx.xxx.xxx.xxx	53614	sftp		1
1550665465950918696	wx4g0kz6e	xxx.xxx.xxx.xxx	39072	yarn		1
1550665718062144620	wx4g0kz6e	xxx.xxx.xxx.xxx	11142	b		    1
```

### 6. Setup the dashboard

Finally we will setup the dashboard in grafana:
1. Create a new dashboard names "Login Attempts"
1. Add the World panel and edit it
1. Go to [General] and edit the title: "Failed Login Attempts"
1. Go to [Metric] and add "InfluxDB" as datasource
1. Edit the query to be `SELECT "value" AS "metric" FROM "login-attempts".."geossh" WHERE $timeFilter GROUP BY "geohash"`
1. Set the format to `Table`
1. Go to [Worldmap] and edit the visual options to suit your needs (defaults are fine as well)
1. In "Map data options" set "Location data" to `geohash`, "Geohash field" to `geohash`, "Metric field" to `metric`


Et voila!
