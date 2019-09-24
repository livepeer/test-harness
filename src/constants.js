'use strict'
// family test-harness-base
module.exports = {
  PROJECT_ID: 'test-harness-226018',
  GCE_VM_IMAGE: 'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/family/ubuntu-minimal-1804-lts',
  GCE_CUSTOM_VM_IMAGE: 'test-harness-base',
  GCE_CUSTOM_GPU_VM_IMAGE: 'test-harness-gpu-livepeer',
  GCE_CUSTOM_DOCKER_GPU_VM_IMAGE: 'test-harness-docker-gpu',
  // GCE_VM_IMAGE: 'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/family/ubuntu-minimal-1604-lts',
  // GCE_VM_IMAGE: 'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/family/ubuntu-minimal-1604-lts',
  // GCE_VM_IMAGE: 'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/family/ubuntu-minimal-1804-lts',
  // GCE_VM_IMAGE: 'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/family/ubuntu-minimal-1904',
  // GCE_VM_IMAGE: 'ubuntu-os-cloud/global/images/ubuntu-1904-disco-v20190816',
  ports: {
    CLI_PORT: '7935',
    RTMP_PORT: '1935',
    MEDIA_PORT: '8935',
    STREAMER_PORT: '7934',
  },
  NODE_TYPES: ['broadcaster', 'transcoder', 'orchestrator', 'streamer'],
  DEFAULT_GPU: 'v100',
  GPUS_IN_REGION: {
    'us-central1': ['v100'],
  }
}
