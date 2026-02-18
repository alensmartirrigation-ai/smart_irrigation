const { InfluxDB } = require('@influxdata/influxdb-client');

const {
  INFLUX_URL,
  INFLUX_TOKEN,
  INFLUX_ORG,
  INFLUX_BUCKET,
} = process.env;

if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET) {
  throw new Error('InfluxDB configuration is required in environment variables.');
}

const client = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
const writeApi = client.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ms');
const queryApi = client.getQueryApi(INFLUX_ORG);

module.exports = {
  influxClient: client,
  influxWriteApi: writeApi,
  influxQueryApi: queryApi,
  influxBucket: INFLUX_BUCKET,
};
