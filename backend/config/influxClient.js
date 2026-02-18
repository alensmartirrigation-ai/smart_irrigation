const { InfluxDB } = require('@influxdata/influxdb-client');
const env = require('./env');

const client = new InfluxDB({
  url: env.INFLUX_URL,
  token: env.INFLUX_TOKEN,
});

const writeApi = client.getWriteApi(env.INFLUX_ORG, env.INFLUX_BUCKET, 'ms');
const queryApi = client.getQueryApi(env.INFLUX_ORG);

module.exports = {
  influxClient: client,
  influxWriteApi: writeApi,
  influxQueryApi: queryApi,
  influxBucket: env.INFLUX_BUCKET,
};
