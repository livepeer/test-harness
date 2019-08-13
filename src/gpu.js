'use strict'

const utils = require('./utils/helpers')


/**
 * installs openvpn on a given gcp machine.
 * @param {string} machine hostname of the machine
 * @param {string} zone GCP zone where the server is
 */
async function installOpenvpn (machine, zone) {
    return utils.remotelyExec(machine, zone, 
        `sudo apt-get install openvpn`)
}


async function uploadOvpnFile (path, targetPath) {
    return utils.scp(path, targetPath)
}

async function runOpenvpn (machine, zone) {
    return utils.remotelyExec(machine, zone, 
        `sudo openvpn --daemon --config /tmp/livepeer_admin.ovpn`)
}

module.exports = { installOpenvpn, uploadOvpnFile, runOpenvpn }