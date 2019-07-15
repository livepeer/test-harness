# test-harness
---------

This is a work in progress, so code is :lava:


## Dependencies

- Docker [Mac](https://docs.docker.com/docker-for-mac/install/) , [Ubuntu](https://docs.docker.com/install/linux/docker-ce/ubuntu/)

- [Docker-compose](https://docs.docker.com/compose/install/)

- [Docker-machine](https://docs.docker.com/machine/install-machine/)

- Nodejs LTS (I tested it on v8.11.3 and v10.14.1) [I recommend nvm](https://github.com/creationix/nvm/blob/master/README.md)

- [Gcloud SDK](https://cloud.google.com/sdk/install)

That's alotta dependencies, I know. technically you don't need `docker-compose` if
if you're not going to run the test harness locally. so there is that :)

## installation

```bash
$ git clone https://github.com/livepeer/test-harness.git
$ cd test-harness
$ npm install

```

### Local Mode

1. check [`examples/local.js`](/examples/local.js), note that in the `config`
object `local` is `true`. note that this will use `docker-compose up` to run
instead of docker-swarm. this is easier to debug for smallish setups locally.

2. **important** edit the `examples/local.js` file `livepeerBinaryPath` value to
the livepeer binary you'd like to test. **this has to be built for linux**

2. run `node examples/local.js` to fire up the test-harness.

3. thats it. now you got a running setup. note that in the `dist` folder there
will be a folder for this experiment, which will contain the docker-compose
generated. this will have the port forwarding for each node and should be
accessible at your dev machine's `localhost`

### Using official docker image

If flag `publicImage` is set to true in config, then image from Docker Hub will be used ([livepeer/go-livepeer:edge](https://cloud.docker.com/u/livepeer/repository/docker/livepeer/go-livepeer/general)). This image is built on Docker Hub from `master` branch of `go-livepeer` repository. Also `publicImage` could be set to name of any other public image, which in turn will be used.

### Local Build

If flag `localBuild` is set to true in config, then livepeer binary will be taken from local
docker image tagged `livepeerbinary:debian`. It should be build by running
`make localdocker`

### GCP integrated Test-harness

1. setup `gcloud`, `docker-machine` Google driver uses [Application Default Credentials]() to get authorization credentials for use in calling Google APIs. follow https://cloud.google.com/sdk/docs/#deb to `gcloud init`.

2. run `gcloud auth login`

3. now you should have `gcloud` and ready to spin up instances, if you're having issues
, let me know (open an issue or buzz me at discord @Yahya#0606 )

4. there is a ready made example in [`/examples/index.js`](/examples/index.js),
**Change the test `name`** and run in `node examples/index.js` which will spin up
a docker cluster of 2 hosts, with livepeer containers and  `geth with protocol` ready to go


----------

## Config Options
----

- `local`: must be `true` for local test-harness runs.
- `localBuild`: build the livepeer binary locally or use the binary in the gcp bucket.
- `publicImage`: if `true`, use `livepeer/go-livepeer:edge` image from Docker Hub, which is being built from master branch of `go-livepeer` repository. Can be set to string, - in this case it should refer to any image publicly available on Docker Hub.
- `metrics`: it will start Prometheus and Grafana if `true`.
- `standardSetup`: request token, register orchestartors, etc...
- `updateMachines`: if `true`, will run `apt upgrade` on newly created VMs. Not really needed for benchmarking, so it is now `false` by default.
- `installNodeExporter`: if `true` installs Prometheus Node Explorer on newly created machines (allows to scrape system metrics like CPU, Memory load etc). `false` by default to save time.
- `installGoogleMonitoring`: if `true` installs Google's montiring agent. `false` by default, not really needed for benchmarking.
- `constrainResources`: flag to activate resource constraint within docker swarm.
- `name`: name of the configuration or experiment, must be unique for each deployment.
- `livepeerBinaryPath`: relative path to the livepeer binary, set it to `null` to use the binary in the gcp bucket.

- `blockchain`:
  - `name`: network name, should be 'lpTestNet' for test networks, or 'offchain' for offchain mode.
  - `networkId`:  network id, default `54321`,
  - `controllerAddress`: address of the livepeer controller contract

- `machines`: an object used for remote deployments configurations like number of
host machines, zones, machine types and so on.

  - `zone`: gcp zone defaults to 'us-east1-b' **OR** `zones`: an array of gcp zones for multi region support

  - `orchestratorMachineType`: type of machine for Orchestrator , ex: 'n1-highcpu-8',
  - `broadcasterMachineType`: type of machine for Broadcaster , ex: 'n1-highcpu-8',
  - `transcoderMachineType`: type of machine for Transcoder , ex: 'n1-highcpu-8',
  - `streamerMachineType`: type of machine for Streamer , ex: 'n1-standard-1',
  - `managerMachineType`: type of the instance used as manager,

- `nodes`: the object that plans the O/T/B within a deployment.
  - `transcoders`: the transcoder group.
    - `instances`: how many containers to run as transcoders.
  ```
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
  ```
    - `flags`:the livepeer flags passed to the livepeer binary container.
  - `orchestrators`: the orchestrator group.
  - `broadcasters`: the broadcaster group.
    - `googleStorage`: optional object if you would like to use google buckets as storage.
      - `bucket`: bucket name,
      - `key`: the path key to access the bucket. usually a JSON key
    - `instances`: number of livepeer broadcaster containers

------------

## Automating Livepeer `actions`
------

this isn't complete yet. but it's functioning .
checkout [this example](https://github.com/livepeer/test-harness/blob/b1f8b12d849e43c33da31b3349bfbac2a488d3a3/examples/local.js#L50-L67) along with the comments in the code to get an
idea of how to use it.


----------

## Pumba (Chaos Monkey) support
----

### stopping a random container within a livepeer group

```bash
$ ./test-harness disrupt -h
Usage: disrupt [options] [name] [group]                                                                         

uses pumba to kill containers in a specified livepeer group randomly                                            

Options:                                                                                                        
  -i --interval <interval>  recurrent interval for chaos command; use with optional unit suffix: 'ms/s/m/h'     
  -h, --help                output usage information                                                            
example: ./test-harness disrupt -i 30s my-deployment o_a
# Kill a random livepeer container in group o_a every 30 seconds
```

To stop an ongoing disruption

```bash
./test-harness disrupt-stop my-deployment
```

### simulating network delays

```bash
$ ./test-harness delay -h                                                                         
Usage: delay [options] [name] [group]                                                                                                         

uses pumba to cause network delays for a livepeer group                                                                                       

Options:                                                                                                                                      
  -i --interval <interval>  recurrent interval for chaos command; use with optional unit suffix: 'ms/s/m/h'                                   
  -d --duration <duration>   network emulation duration; should be smaller than recurrent interval; use with optional unit suffix: 'ms/s/m/h'
  -h, --help                output usage information                                                                                          

```

to stop a network delay run the following command

```bash
./test-harness delay-stop my-deployment
```
