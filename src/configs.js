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

const grafanaDatasources = {
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

module.exports = {
  prometheus,
  grafanaDatasources,
  grafanaDashboards,
}
