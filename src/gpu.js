'use strict'

const path = require('path')
const utils = require('./utils/helpers')

/**
 * installs openvpn on a given gcp machine.
 * @param {string} machine hostname of the machine
 * @param {string} zone GCP zone where the server is
 */
async function installOpenvpn (machine, zone) {
    return utils.remotelyExec(machine, zone, 
        `sudo apt-get -y install openvpn`)
}


async function uploadOvpnFile (sourcePath, targetPath) {
    return utils.scp(path.resolve(__dirname, sourcePath), targetPath)
}

async function runOpenvpn (machine, zone) {
    return utils.remotelyExec(machine, zone, 
        `sudo openvpn --daemon --config /tmp/livepeer_admin.ovpn`)
}

module.exports = { installOpenvpn, uploadOvpnFile, runOpenvpn }