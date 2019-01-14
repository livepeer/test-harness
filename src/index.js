'use strict'

const { exec } = require('child_process')
const { timesLimit } = require('async')

const NetworkCreator = require('./networkcreator')
const Streamer = require('./streamer')
const Swarm = require('./swarm')
const utils = require('./utils/helpers')
const DIST_DIR = './dist'
const DEFAULT_MACHINES = 2

class TestHarness {
  constructor () {
    this.swarm = new Swarm()
  }

  run (config, cb) {
    // 1. [ ] validate the configurations
    // 2. [x] provision GCP machines
    // 3. scp docker-compose.yml, livepeer binary and git test-harness
    // 4. create throwaway docker registry
    // 5. initiate swarm, add workers
    // 6. build lpnode with lp binary, push it to registry
    // 7. deploy geth-with-protocol, fund accounts.
    // 8. deploy lpnodes
    // 9. setup transcoders/orchestrators
    // 10. setup broadcasters.
    // 11. initializeRound.
    // 12. start streams.
    // 13. pipe logs to bucket or download them.
    // 14. teardown the cluster.
    // 15. callback.
    config.name = config.name || 'testharness'
    this.swarm._managerName = `${config.name}-manager`

    this.networkCreator = new NetworkCreator(config)
    this.networkCreator.generateComposeFile(`${DIST_DIR}/${config.name}`, (err) => {
      if (err) return handleError(err)

      if (config.local) {

      } else {
        // copy binaries to the manager instance.
        // I have a slow connection . so i'm not uploading the binary for testing.
        //
        // this.networkCreator.loadBinaries(`${DIST_DIR}/${config.name}`, (err) => {
        //   if (err) throw err
        // })
        exec(`cp ./scripts/manager_setup.sh ${DIST_DIR}/${config.name}`, (err, stdout) => {
          if (err) throw err
          console.log('manager_setup.sh copied')
        })

        // provision GCP machines
        this.swarm.createMachines({
          machines: DEFAULT_MACHINES,
          name: config.name || 'testharness',
          tags: `${config.name}-cluster`
        }, (err) => {
          if (err) throw err
          console.log('uploading binaries to the manager node...... this might take a while.')
          // machines are ready.
          this.swarm.scp(
            `${DIST_DIR}/${config.name}`,
            `${config.name}-manager:/tmp/config`,
            `-r`,
            (err, stdout) => {
              if (err) throw err
              // dist folder should be available to the manager now.

              // init Swarm
              this.swarm.init(`${config.name}-manager`, (err, stdout) => {
                if (err) throw err

                console.log('swarm initiated. ', stdout)
                // add the workers to the swarm
                this.swarm.getSwarmToken(`${config.name}-manager`, (err, token) => {
                  if (err) throw err
                  this.swarm.getInternalIP(`${config.name}-manager`, (err, ip) => {
                    if (err) throw err
                    console.log(`adding ${DEFAULT_MACHINES - 1} workers to the swarm, token ${token}, ip: ${ip}`)
                    timesLimit(
                      DEFAULT_MACHINES - 1,
                      1,
                      (i, next) => {
                        this.swarm.join(`${config.name}-worker-${ i+1 }`, token.trim(), ip.trim(), next)
                      }, (err, results) => {
                        if (err) throw err

                        // create network
                        this.swarm.createNetwork('testnet', (err, stdout) => {
                          if (err) throw err
                          console.log('networkid: ', stdout)

                          // create throwaway registry
                          this.swarm.createRegistry((err, stdout) => {
                            if (err) throw err
                            console.log('registry stdout: ', stdout)
                            // now we should be able to build the image on manager and
                            // push it to the registry
                            // git clone test-harness. remotely.
                            // then build it.
                            utils.remotelyExec(
                              `${config.name}-manager`,
                              `cd /tmp/config/${config.name}/ && /bin/sh manager_setup.sh`,
                              (err, outputBuf) => {
                                if (err) throw err
                                console.log('manager-setup done', outputBuf.toString())
                                // push the newly built image to the registry.
                                cb()
                              })


                            })
                          })

                        })
                  })
                })

              })
            })
        })
      }
    })
  }
}

function handleError (err) {
  // TODO handle errors gracefully
  throw err
}

module.exports = TestHarness
