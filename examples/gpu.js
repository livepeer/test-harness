'use strict'

const TestHarness = require('../src/index')
const th = new TestHarness()

th.run({
    name: 'ya-gpu',
    publicImage: true,
    standardSetup: true,
    metrics: true,
    gpu: true,
    sshParams: {
        identityKey: 'path_to_pem_file',
        ip: 'add.ip.here',
        hostname: 'machine_name_here',
        user: 'livepeer'
    },
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
        transcoders: {
            type: 'gpu',
            instances: 1,
            flags: '-v 5 -transcodingOptions P240p30fps16x9,P360p30fps16x9,P720p30fps16x9 -maxSessions 4 -orchSecret foo'
        },
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
}, (err, experiment) => {
    if (err) throw err
    console.log('done!')
})