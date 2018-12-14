# test-harness
---------

This is a work in progress, so code is :lava:


## Dependencies

- Docker
- Docker-compose

## installation

1. installing images

```bash
$ git clone https://github.com/livepeer/test-harness.git
$ cd test-harness
$ npm install

# NOTE: this is pending PR https://github.com/livepeer/docker-livepeer/pull/2 and
# https://github.com/livepeer/docker-livepeer/pull/1
$ docker pull darkdragon/geth-with-livepeer-protocol:latest
```

2. edit `livepeerBinaryPath`  in `config.toml` to point to the LP binary you would like to use in the harness. **make sure you use the binaries built for linux, not darwin**

3. in the project root directory run

```bash
#if you need sudo to run docker,
#add sudo to this.
# note, if you are using nvm checkout the script in sudonode.sh
$ npm run build config.toml -- -o .
```

4. now you have generated the `docker-compose.yml` file, which is like a network game plan, lets run it.

```bash
$ docker-compose up
```

and now you have a network of 3 Livepeer nodes. go ahead and run `docker ps` to see each container.
