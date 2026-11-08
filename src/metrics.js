const config = require("./config");

const apiCalls = { GET: 0, POST: 0, PUT: 0, DELETE: 0 };
const loginAttempts = { success: 0, failure: 0 };
const userLoginTimes = {};
const endpointLatency = { totalMs: 0, count: 0 };
const pizzaSales = { sold: 0, failures: 0, revenue: 0 };
const pizzaLatency = { totalMs: 0, count: 0 };

function requestTracker(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    // runs later, after the route has responded
    // 1. count req.method
    if (apiCalls[req.method] !== undefined) {
      apiCalls[req.method]++;
    }
    // 2. add (Date.now() - start) to the endpoint latency totals
    endpointLatency.totalMs += Date.now() - start;
    endpointLatency.count += 1;
    // 3. if req.user exists, note that user as active right now
    if (req.user) {
      userLoginTimes[req.user.id] = Date.now();
    }
    // 4. if this was a login (PUT to /api/auth), count success or failure using res.statusCode
    if (req.method === "PUT" && req.originalUrl === "/api/auth") {
      if (res.statusCode === 200) {
        loginAttempts.success += 1;
      } else {
        loginAttempts.failure += 1;
      }
    }
  });
  next();
}

function pizzaPurchase(success, latencyMs, price, count) {
  if (success) {
    pizzaSales.sold += count;
    pizzaSales.revenue += price;
  } else {
    pizzaSales.failures += 1;
  }
  pizzaLatency.totalMs += latencyMs;
  pizzaLatency.count += 1;
}

function createMetric(name, value, type, unit, attributes = {}) {
  const valueKey = Number.isInteger(value) ? "asInt" : "asDouble";
  const attributeList = [
    { key: "source", value: { stringValue: config.metrics.source } },
    ...Object.entries(attributes).map(([key, val]) => ({
      key: key,
      value: { stringValue: val },
    })),
  ];
  const metric = {
    name: name,
    unit: unit,
    [type]: {
      dataPoints: [
        {
          [valueKey]: value,
          timeUnixNano: Date.now() * 1000000,
          attributes: attributeList,
        },
      ],
    },
  };
  if (type === "sum") {
    metric[type].aggregationTemporality = "AGGREGATION_TEMPORALITY_CUMULATIVE";
    metric[type].isMonotonic = true;
  }
  return metric;
}

function buildMetrics() {
  const metrics = [];
  const cutoff = Date.now() - 5 * 60 * 1000;
  const activeUsers = Object.values(userLoginTimes).filter(
    (time) => time > cutoff,
  ).length;

  for (const [method, count] of Object.entries(apiCalls)) {
    metrics.push(createMetric("http_requests", count, "sum", "1", { method }));
  }
  metrics.push(
    createMetric("auth_attempts", loginAttempts.success, "sum", "1", {
      status: "success",
    }),
  );
  metrics.push(
    createMetric("auth_attempts", loginAttempts.failure, "sum", "1", {
      status: "failure",
    }),
  );
  metrics.push(createMetric("active_users", activeUsers, "gauge", "1"));
  metrics.push(
    createMetric("cpu_usage", getCpuUsagePercentage(), "gauge", "%"),
  );
  metrics.push(
    createMetric(
      "memory_usage",
      Number(getMemoryUsagePercentage()),
      "gauge",
      "%",
    ),
  );
  metrics.push(createMetric("pizzas_sold", pizzaSales.sold, "sum", "1"));
  metrics.push(
    createMetric("pizzas_failures", pizzaSales.failures, "sum", "1"),
  );
  metrics.push(createMetric("pizzas_revenue", pizzaSales.revenue, "sum", "1"));
  if (endpointLatency.count > 0) {
    metrics.push(
      createMetric(
        "endpoint_latency",
        endpointLatency.totalMs / endpointLatency.count,
        "gauge",
        "ms",
      ),
    );
  }
  if (pizzaLatency.count > 0) {
    metrics.push(
      createMetric(
        "pizza_latency",
        pizzaLatency.totalMs / pizzaLatency.count,
        "gauge",
        "ms",
      ),
    );
  }

  endpointLatency.totalMs = 0;
  endpointLatency.count = 0;
  pizzaLatency.totalMs = 0;
  pizzaLatency.count = 0;

  return metrics;
}

function sendMetricsPeriodically(period) {
  setInterval(() => {
    try {
      const metrics = buildMetrics();
      const body = JSON.stringify({
        resourceMetrics: [{ scopeMetrics: [{ metrics }] }],
      });
      fetch(`${config.metrics.endpointUrl}`, {
        method: "POST",
        body: body,
        headers: {
          Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`,
          "Content-Type": "application/json",
        },
      })
        .then((response) => {
          if (!response.ok) {
            response.text().then((text) => {
              console.error(
                `Failed to push metrics data to Grafana: ${text}\n${body}`,
              );
            });
          } else {
            console.log(`Pushed metrics`);
          }
        })
        .catch((error) => {
          console.error("Error pushing metrics:", error);
        });
    } catch (error) {
      console.error("Error building metrics:", error);
    }
  }, period);
}

const os = require("os");

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

module.exports = { requestTracker, pizzaPurchase, sendMetricsPeriodically };
