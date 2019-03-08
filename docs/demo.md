# Livepeer Demo deployment guide
-------------

this is intended for livepeer team member who'd like to setup a private testnet livepeer deployment on Google cloud using the
test-harness.


## pre-deployment
----

1. **Building the livepeer binary**: this guide assumes you're using `localBuild:true` option, which require a `go-livepeer` build, currently we're using `et/webhook-fix` branch in `go-livepeer` for this deployment.

```bash

# in go-livepeer dir
git fetch origin && git checkout -b et/webhook-fix origin/et/webhook-fix

#create .git.describe file required for the build
echo $(git describe --tags) > .git.describe

#build the docker image
sudo docker build -t livepeerbinary:debian -f Dockerfile.debian .

```

if all goes will , you should be able to see `livepeerbinary` image in `docker image ls` , to test it try the following command

```
$ sudo docker run livepeerbinary:debian livepeer -version
Livepeer Node Version: 0.3.3-0.3.2-36-gceafc13
```

2. **configure the test-harness**: examples for the config can be found in `examples` folder, for this deployment we're using `demo5.js` which can be found in examples.

		1. open `examples/demo5.js`

		2. edit `name` value to something unique.

		3. change the ratio of B/O to 1/2 (change `nodes.broadcasters.instances`: `1`, and `nodes.orchestrators.instances` : `2`)

		4. save and exit


## Deploying the testnet
-------

in the test-harness root dir, simply run `node examples/demo5.js` and let the test-harness do it's thing, this will take on average 8 to 10 minutes. go grab a coffee.

The test harness will provision the machines, upload the image and run the livepeer containers along with
 - a geth node (private testnet)
 - livepeer metrics server (always accessible on port 3000)
 - supporting services like `mongodb`

since `standardSetup:true` in the config, the test-harness will also fund every livepeer node and do the required setups to be
able to broadcast and transcode jobs.

---------------
## getting endpoints
-------

in order to get the port number of a certain livepeer node, you can use the following test-harness command

```
./test-harness port -t <service_endpoint> <experiment_name> <livepeer_node_name>
```

for example if i named my deployment `y-demo` and want to get the ingest endpoint of broadcaster 0

```
./test-harness port -t rtmp y-demo broadcaster_0

# or

./test-harness port -t rtmp y-demo b_0
```

 `-t` has 3 options `cli` , `rtmp` and `http`


**cool trick**

move `livepeer_cli` to the `test-harness` root dir and try this.

```
./livepeer_cli -host $(docker-machine ip y-demo-manager) -http $(./test-harness port -t cli y-demo b_0)
```
---------------

## simulating a stream
------

```
➜ ./test-harness stream --help                                                
Usage: lpth-stream [options]                                                                               

starts stream simulator to deployed broadcasters. [WIP]                                                    

Options:                                                                                                   
  -m --multiplier <n>                       number of streams per broadcaster to simulate                  
  -r --remote                               remote streamer mode. used with GCP test-harness               
  -d --dir [DIR]                            asset dir, must be absolute dir                                
  -f --file [FILE]                          test mp4 file in the asset dir                                 
  -s --streams <n>                          maximum number of streams to stream                            
  -t --time <n>                             stream length, seconds                                         
  -i --infinite                             use inifinite stream                                           
  -e --end-point [host:rtmpPort:mediaPort]  End point to stream to instead of streaming in config          
  -g --google-check                         check transcoded files in google cloud and print success rate  
  -h, --help                                output usage information                                       

```

### examples

```bash
# stream from my machine
./test-harness stream y-demo

# stream from gcp
./test-harness stream -r y-demo

# simulate 2 stream for each broadcaster from gcp
./test-harness stream -r y-demo -m 2

# loop the stream
./test-harness stream -i y-demo

```
