'use strict'

const prometheus = (isLocal, servicesToMonitorByType) => {
  const cfg = {
    global: {
      scrape_interval: '15s', // # By default, scrape targets every 15 seconds.
      evaluation_interval: '15s', // # By default, scrape targets every 15 seconds.
    },
    alerting: {
      alertmanagers: [{
        static_configs: [{
          targets: ['alertmanager:9093']
        }]
      }]
    },
    rule_files: ['alert.rules'],
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
    }, {
      job_name: 'alertmanager',
      scrape_interval: '10s',
      scrape_timeout: '10s',
      static_configs: [{
        targets: ['alertmanager:9093']
      }]
    }]
  }
  const nodeCfg = {
    job_name: 'livepeer-node',
    scrape_interval: '5s',
    static_configs: []
  }
  for (let typ of servicesToMonitorByType.keys()) {
    nodeCfg.static_configs.push({
      targets: servicesToMonitorByType.get(typ).map(sn => sn + ':7935'),
      labels: {
        'livepeer_node_type': typ,
      }
    })
  }
  cfg.scrape_configs.push(nodeCfg)
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
          kvstore: {
            store: 'inmemory',
          },
          'replication_factor': 1
        }
      },
      'chunk_idle_period': '15m'
    },
    'schema_config': {
      'configs': [
        {
          'from': '2019-06-03',
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
const alertManager = (isLocal, servicesToMonitor, name, discordUserId, ips) => {
  // ips - array of public ips, starting from manager machine
  const mention = discordUserId ? `<@${discordUserId}>:` : ''
  const slack_configs = discordUserId ? [{
        channel: "#prod-alerts",
        username: 'Alert - deployment - ' + name,
        send_resolved: true,
        // api_url: 'https://discordapp.com/api/webhooks/563852076615073792/NuijhpwYle3T51fG0Lx2X9VjL2nrN9AxtfAz5D6bTvt4A4eZPhRibo2rBBc46b3l475i/slack'
        api_url: 'https://discordapp.com/api/webhooks/564919423392284687/AyANSgwiSmsFBkSRSiCPoQJAuipqCdvLOWF01qacgCkgF4TKs_udpBbX87AoOuRxh-fm/slack',
        title_link: isLocal || !ips ? '' :  `http://${ips[0]}:3001/`,
        text: `${mention} {{ range .Alerts }}
        *Alert:* {{ .Annotations.summary }} - \`{{ .Labels.severity }}\`
       *Description:* {{ .Annotations.description }}
       *Details:*
       {{ range .Labels.SortedPairs }} • *{{ .Name }}:* \`{{ .Value }}\`
       {{ end }}
     {{ end }}`,

      }] : []

  const cfg = {
    global: {
      // "smtp_smarthost": "localhost:25",
      // "smtp_from": "alertmanager@example.org",
      // "smtp_auth_username": "alertmanager",
      // "smtp_auth_password": "password",
      // "hipchat_auth_token": "1234556789",
      // "hipchat_api_url": "https://hipchat.foobar.org/"
    },
    templates: [
      "/etc/alert/template/*.tmpl"
    ],
    "route": {
      "group_by": [
        "alertname",
        "cluster",
        "service"
      ],
      "group_wait": "30s",
      "group_interval": "5m",
      "repeat_interval": "3h",
      "receiver": "discord-prod",
      "routes": []
    },
    "inhibit_rules": [
      {
        "source_match": {
          "severity": "critical"
        },
        "target_match": {
          "severity": "warning"
        },
        "equal": [
          "alertname",
          "cluster",
          "service"
        ]
      }
    ],
    receivers: [{
      name: "discord-prod",
      slack_configs
    },
    ]
  }
  return cfg
}

const alertRules = (isLocal) => {
  const cfg = {
    groups: [{
      name: "my-group-name",
      rules: [{
        alert: "InstanceDown",
        expr: "up == 0",
        for: "5m",
        labels: {
          severity: "critical"
        },
        annotations: {
          description: "`{{ $labels.instance }} of job {{ $labels.job }} has been down for more than 5 minutes.`",
          summary: "`Instance {{ $labels.instance }} down`"
        }
      }, {
        alert: "WarningOrchestratorUtilisation",
        expr: `sum(livepeer_current_sessions_total{node_type="orch"}) / sum(livepeer_max_sessions_total{node_type="orch"}) > 0.8`,
        for: "1m",
        labels: {
          severity: "warning"
        },
        annotations: {
          description: "`{{ $labels.instance }} has more than 80% Orchestrator utilisation for more than 1 minute.`",
          summary: "`Instance {{ $labels.instance }} - Warning Orchestrator utilisation`"
        }
      }, {
        alert: "CriticalOrchestratorUtilisation",
        expr: `sum(livepeer_current_sessions_total{node_type="orch"}) / sum(livepeer_max_sessions_total{node_type="orch"}) > 0.9`,
        for: "1m",
        labels: {
          severity: "critical"
        },
        annotations: {
          description: "`{{ $labels.instance }} has more than 90% Orchestrator utilisation for more than 1 minutes.`",
          summary: "`Instance {{ $labels.instance }} - Critical Orchestrator utilisation`"
        }
      }, {
        alert: "CriticalBroadcasterOverload",
        expr: `sum(livepeer_current_sessions_total{node_type="bctr"}) - sum(livepeer_max_sessions_total{node_type="orch"}) > 0`,
        for: "1m",
        labels: {
          severity: "critical"
        },
        annotations: {
          description: "`{{ $labels.instance }} Broadcasters handling more streams than Orchestrator's capacity for more than 1 minutes.`",
          summary: "`Instance {{ $labels.instance }} - Broadcaster Overload`"
        }
      }, {
        alert: "WarningSuccessRate",
        expr: `livepeer_success_rate < 0.95`,
        for: "1m",
        labels: {
          severity: "warning"
        },
        annotations: {
          description: "`{{ $labels.instance }} Success rate lower than 95% for more than 1 minutes.`",
          summary: "`Instance {{ $labels.instance }} - Success Rate warning`"
        }
      }, {
        alert: "CriticalSuccessRate",
        expr: `livepeer_success_rate < 0.90`,
        for: "1m",
        labels: {
          severity: "critical"
        },
        annotations: {
          description: "`{{ $labels.instance }} Success rate lower than 90% for more than 1 minutes.`",
          summary: "`Instance {{ $labels.instance }} - Critical Success Rate`"
        }
      }, {
        alert: "CriticalCPULoad",
        // expr: "100 - (avg by (instance) (irate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100) > 96",
        expr: "100 - (avg by (instance) (irate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100) > 90",
        for: "2m",
        labels: {
          severity: "critical"
        },
        annotations: {
          description: "`{{ $labels.instance }} of job {{ $labels.job }} has Critical CPU load for more than 2 minutes.`",
          summary: "`Instance {{ $labels.instance }} - Critical CPU load`"
        }
      }, {
        alert: "CriticalRAMUsage",
        expr: "(1 - ((node_memory_MemFree_bytes + node_memory_Buffers_bytes + node_memory_Cached_bytes) / node_memory_MemTotal_bytes)) * 100 > 98",
        for: "5m",
        labels: {
          severity: "critical"
        },
        annotations: {
          description: "`{{ $labels.instance }} has Critical Memory Usage more than 5 minutes.`",
          summary: "`Instance {{ $labels.instance }} has Critical Memory Usage`"
        }
      }, {
        alert: "CriticalDiskSpace",
        expr: "node_filesystem_free_bytes{filesystem!~\"^/run(/|$)\"} / node_filesystem_size_bytes < 0.1",
        for: "4m",
        labels: {
          severity: "critical"
        },
        annotations: {
          description: "`{{ $labels.instance }} of job {{ $labels.job }} has less than 10% space remaining.`",
          summary: "`Instance {{ $labels.instance }} - Critical disk space usage`"
        }
      }, {
        alert: "RebootRequired",
        expr: "node_reboot_required > 0",
        labels: {
          severity: "warning"
        },
        annotations: {
          description: "`{{ $labels.instance }} requires a reboot.`",
          summary: "`Instance {{ $labels.instance }} - reboot required`"
        }
      }]
    }]
  }
  return cfg
}



module.exports = {
  prometheus,
  grafanaDatasources,
  grafanaDashboards,
  loki,
  alertManager,
  alertRules,
}
