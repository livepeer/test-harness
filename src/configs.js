'use strict'

const prometheus = (isLocal, servicesToMonitor) => {
  const cfg = {
    global: {
      scrape_interval: '15s', // # By default, scrape targets every 15 seconds.
      evaluation_interval: '15s', // # By default, scrape targets every 15 seconds.
    },
    //# scrape_timeout is set to the global default (10s).

    // # The labels to add to any time series or alerts when communicating with
    // # external systems (federation, remote storage, Alertmanager).
    //   external_labels: {
    //     monitor: 'master'
    //   },
    // # A list of scrape configurations.
    scrape_configs: [{
      job_name: 'prometheus',
      scrape_interval: '10s',
      scrape_timeout: '10s',
      static_configs: [{
        targets: ['localhost:9090']
      }]
    }]
  }
  if (servicesToMonitor.length) {
    cfg.scrape_configs.push({
      job_name: 'livepeer-node',
      scrape_interval: '5s',
      static_configs: [{
        targets: servicesToMonitor.map(sn => sn + ':7935')
      }]
    })
  }
  if (isLocal) {
    cfg.scrape_configs.push({
      job_name: 'cadvisor',
      scrape_interval: '5s',
      static_configs: [{
        targets: ['cadvisor:8080']
      }]
    }, {
        job_name: 'node-exporter',
        scrape_interval: '5s',
        static_configs: [{
          targets: ['node-exporter:9100']
        }]
      })
  } else {
    cfg.scrape_configs.push({
      job_name: 'cadvisor',
      scrape_interval: '5s',
      dns_sd_configs: [{
        names: ['tasks.cadvisor'],
        type: 'A',
        port: 8080
      }]
    }, {
        job_name: 'node-exporter',
        scrape_interval: '5s',
        dns_sd_configs: [{
          names: ['tasks.node-exporter'],
          type: 'A',
          port: 9100
        }]
      })
  }
  return cfg
}

const grafanaDatasources = (hasLoki) => {
  const cfg = {
    apiVersion: 1,
    deleteDatasources: [],
    datasources: [{
      access: 'proxy',
      isDefault: true,
      name: 'Prometheus',
      type: 'prometheus',
      url: 'http://prometheus:9090'
    }]
  }
  if (hasLoki) {
    cfg.datasources.push({
      access: 'proxy',
      isDefault: false,
      name: 'Loki',
      type: 'loki',
      url: 'http://loki:3100'
    })
  }
  return cfg
}

const grafanaDashboards = {
  apiVersion: 1,
  providers: [{
    name: 'default',
    orgId: 1,
    folder: '',
    type: 'file',
    disableDeletion: false,
    updateIntervalSeconds: 10000,
    options: {
      path: '/var/lib/grafana/dashboards'
    }
  }]
}

const loki = (isLocal) => {
  const cfg = {
    'auth_enabled': false,
    'server': {
      'http_listen_port': 3100
    },
    'ingester': {
      'lifecycler': {
        'address': '127.0.0.1',
        'ring': {
          'store': 'inmemory',
          'replication_factor': 1
        }
      },
      'chunk_idle_period': '15m'
    },
    'schema_config': {
      'configs': [
        {
          'from': 0,
          'store': 'boltdb',
          'object_store': 'filesystem',
          'schema': 'v9',
          'index': {
            'prefix': 'index_',
            'period': '168h'
          }
        }
      ]
    },
    'storage_config': {
      'boltdb': {
        'directory': '/tmp/loki/index'
      },
      'filesystem': {
        'directory': '/tmp/loki/chunks'
      }
    },
    'limits_config': {
      'enforce_metric_name': false
    }
  }
  return cfg
}

module.exports = {
  prometheus,
  grafanaDatasources,
  grafanaDashboards,
  loki,
}
