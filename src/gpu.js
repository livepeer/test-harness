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

/**
 * upload the OVPN file to the remote GCP machine
 * @param {string} sourcePath relative path from ./dist to the ovpn file
 * @param {string} targetPath machine:path destination
 */
async function uploadOvpnFile (sourcePath, targetPath) {
    return utils.scp(path.resolve(__dirname, sourcePath), targetPath)
}

/**
 * start the openvpn client on a remote GCP machine
 * @param {string} machine GCP machine name
 * @param {string} zone GCP zone
 */
async function runOpenvpn (machine, zone) {
    return utils.remotelyExec(machine, zone, 
        `sudo openvpn --daemon --config /tmp/livepeer_admin.ovpn`)
}

module.exports = { installOpenvpn, uploadOvpnFile, runOpenvpn }