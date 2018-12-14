# test-harness
---------

This is a work in progress, so code is :lava:


## Dependencies

- Docker
- Docker-compose
- Nodejs LTS (I tested it on v8.11.3 and v10.14.1)

## installation

1. installing images

```bash
$ git clone https://github.com/livepeer/test-harness.git
$ cd test-harness
$ npm install
# you can also use yarn if npm install fails.
```

2. edit `livepeerBinaryPath`  in `config.toml` to point to the LP binary you would like to use in the harness. **make sure you use the binaries built for linux, not darwin**

3. in the project root directory run

```bash
#if you need sudo to run docker,
#add sudo to this.
# note, if you are using nvm checkout the script in sudonode.sh
$ npm run build
```

4. now you have generated the `docker-compose.yml` file, which is like a network game plan, lets run it.

```bash
$ docker-compose up
```

and now you have a network of 3 Livepeer nodes. go ahead and run `docker ps` to see each container.
