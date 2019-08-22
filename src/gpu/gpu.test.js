'use strict'

// const { assert } = require('mocha')
const { expect, should, assert } = require('chai')
const GpuT = require('./gpu')

describe('external GPU integration',function () {
    const sshParams = {
        identityKey: 'path_to_certs_file',
        ip: 'external_machine_ip',
        hostname: 'hostname_of_external_machine',
        user: 'livepeer'
    }
    const gpu = new GpuT({
        name: 'ya-gpu',
        publicImage: true,
        standardSetup: true,
        metrics: true,
        gpu: true,
        sshParams: {
            identityKey: 'path_to_certs_file',
            ip: 'external_machine_ip',
            hostname: 'hostname_of_external_machine',
            user: 'livepeer'
        },
        // openvpn: '../../genesis/livepeer_admin.ovpn',
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
    }, {sshParams})
    
    it('_getSwarmStatus', async () => {
        let status = await gpu._getSwarmStatus(sshParams)
        console.log('status: ', status)
        assert.isNotEmpty(status)
        expect(status.LocalNodeState).to.exist
    }).timeout(10000)

    it('leaveSwarm', async () => {
        let resp = await gpu.leaveSwarm()
        assert.isNotEmpty(resp)
    }).timeout(100000)

    it('join swarm', async () => {
        let resp = await gpu.joinSwarm(
            `SWMTKN-1-6b2q8rh7fvf5z9zx9n2p7kmfidwsq30b9jo5g4cq4y0kfiw1at-8o7jm6n76apyigfoytio2p4dq`,
            `35.243.137.144:2377`
        )

        assert.isNotEmpty(resp)

    }).timeout(10000)
})