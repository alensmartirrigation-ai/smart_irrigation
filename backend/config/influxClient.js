const { InfluxDB } = require('@influxdata/influxdb-client');
const { DeleteAPI } = require('@influxdata/influxdb-client-apis');
const env = require('./env');

const client = new InfluxDB({
  url: env.INFLUX_URL,
  token: env.INFLUX_TOKEN,
});

const writeApi = client.getWriteApi(env.INFLUX_ORG, env.INFLUX_BUCKET, 'ms');
const queryApi = client.getQueryApi(env.INFLUX_ORG);
const deleteApi = new DeleteAPI(client);

module.exports = {
  influxClient: client,
  influxWriteApi: writeApi,
  influxQueryApi: queryApi,
  influxDeleteApi: deleteApi,
  influxBucket: env.INFLUX_BUCKET,
  influxOrg: env.INFLUX_ORG,
};
