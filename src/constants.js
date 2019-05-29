'use strict'

module.exports = {
  PROJECT_ID: 'test-harness-226018',
  GCE_VM_IMAGE: 'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/family/ubuntu-minimal-1804-lts',
  ports: {
    CLI_PORT: '7935',
    RTMP_PORT: '1935',
    MEDIA_PORT: '8935',
    STREAMER_PORT: '7934',
  },
  NODE_TYPES: ['broadcaster', 'transcoder', 'orchestrator', 'streamer'],
}
