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
  },
  PRICING: {
    google: {
      'n1-highcpu-2': 0.0709,
      'n1-highcpu-4': 0.1418,
      'n1-highcpu-8': 0.2836,
      'n1-highcpu-16': 0.5672,
      'n1-highcpu-32': 1.1344,
      'n1-highcpu-64': 2.2688,
      'n1-highcpu-96': 3.402,
      'n1-standard-1': 0.0475,
      'n1-standard-2': 0.0950,
      'n1-standard-4': 0.1900,
      'n1-standard-8': 0.3800,
      'n1-standard-16': 0.7600,
      'n1-standard-32': 1.520,
      'n1-standard-64': 3.0400,
      'n1-standard-96': 4.560,
      'n1-highmem-2': 0.1184,
      'n1-highmem-4': 0.2368,
      'n1-highmem-8': 0.4736,
      'n1-highmem-16': 0.9472,
      'n1-highmem-32': 1.8944,
      'n1-highmem-64': 3.7888,
      'n1-highmem-96': 5.6832,
    }
  }
}
