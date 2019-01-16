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

2. run `node examples/local.js` to fire up the test-harness.

3. thats it. now you got a running setup. note that in the `dist` folder there
will be a folder for this experiment, which will contain the docker-compose
generated. this will have the port forwarding for each node and should be
accessible at your dev machine's `localhost`

### GCP integrated Test-harness

1. setup `gcloud`, `docker-machine` Google driver uses [Application Default Credentials]() to get authorization credentials for use in calling Google APIs. follow https://cloud.google.com/sdk/docs/#deb to `gcloud init`.

2. run `gcloud auth login`

3. now you should have `gcloud` and ready to spin up instances, if you're having issues
, let me know (open an issue or buzz me at discord @Yahya#0606 )

4. there is a ready made example in [`/examples/index.js`](/examples/index.js),
**Change the test `name`** and run in `node examples/index.js` which will spin up
a docker cluster of 2 hosts, with livepeer containers and  `geth with protocol` ready to go


## Automating Livepeer `actions`
------

this isn't complete yet. but it's functioning .
checkout [this example](https://github.com/livepeer/test-harness/blob/b1f8b12d849e43c33da31b3349bfbac2a488d3a3/examples/local.js#L50-L67) along with the comments in the code to get an
idea of how to use it. 
