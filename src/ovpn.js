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
    if (Array.isArray(machine)) {
        // const res = await Promise.all(machine.map(m => runOpenvpn(m, zone)))
        // return res
        await machine.forEach(async (m) => {
            await runOpenvpn(m, zone)
        })
    } else {
        console.log(`${machine} : OpenVPN client starting...`)
        return utils.remotelyExec(machine, zone, 
            `sudo openvpn --daemon --cd /tmp --config livepeer_admin.ovpn`)
    }
}

module.exports = { installOpenvpn, uploadOvpnFile, runOpenvpn }