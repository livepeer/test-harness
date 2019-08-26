# External GPU integration guide

The test-harness supports livepeer deployments with GPU transcoders thats outside of the GCP infrastructure.

## Extra Requirements

1. Your dev machine (where the test-harness lives) needs to have ssh access to the GPU rig
2. liveper ovpn key

## Example configuration

```json
{
    name: 'ya-gpu',
    publicImage: true,
    standardSetup: true,
    metrics: true,
    // -------------------[gpu specific]----------------------
    gpu: true,
    sshParams: {
        identityKey: '/absolute/path/to/pem/key',
        ip: 'ip.of.the.transcoding.rig',
        hostname: 'nameOfTheMachine',
        user: 'usernameForSSH'
    },
    // --------------------------------------------------
    // ---------------[in case the rig isn't accessible to the wider web ]-------------------
    openvpn: 'path to ovpn file',
    // -------------------------------------------------------
    blockchain: {
        name: 'lpTestNet',
        networkId: 54321,
        controllerAddress: '0x77A0865438f2EfD65667362D4a8937537CA7a5EF'
    },
    machines: {
        zone: 'us-east1-b',
        transcoderMachineType: 'n1-highcpu-32',
        broadcasterMachineType: 'n1-highcpu-16',
        orchestratorMachineType: 'n1-highcpu-16',
        streamerMachineType: 'n1-standard-2',
        managerMachineType: 'n1-highmem-2'
    },
    nodes: {
        streamers: {
            type: 'streamer',
            instances: 1
        },

        // ---------[GPU transcoder]
        transcoders: {
            type: 'gpu',  // note the type here
            image: 'livepeer/go-livepeer:gpu-edge', // this can override the public image option for this spcific service
            instances: 1,
            // note that the nvidia flags are manually added right now.
            flags: '-nvidia 0,1,2 -v 5 -transcodingOptions P240p30fps16x9,P360p30fps16x9,P720p30fps16x9 -maxSessions 4 -orchSecret foo'
        },
        // -----------------------------------------------------
        orchestrators: {
            type: 'orchestrator',
            instances: 1,
            orchSecret: "foo",
            flags: '-v 5 -initializeRound=true -maxSessions 32 -pricePerUnit 1'
        },
        broadcasters: {
            type: 'broadcaster',
            instances: 1,
            flags: '-v 5 -maxSessions 4 -currentManifest=true -transcodingOptions P240p30fps16x9,P360p30fps16x9,P720p30fps16x9'
        }
    }
```


## pre run steps:

1. Given that we can only run 1 swarm per physical host, this means only 1 test-harness can use a right at any time. first make sure the rig you're about to use isn't being used by someone else.

2. run the ovpn client on your machine in a separate window ( or add `--daemon` flag if you want to run it in the background)

```bash
 sudo openvpn --config <ovpn file>
```

3. update the `name`, `sshParams` and set `gpu` to `true` in the config, (check `examples/gpu.js`)

4. add a node with a `type: gpu` to your `nodes`

5. `node examples/gpu.js` 

Thats it.