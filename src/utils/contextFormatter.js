const formatField = (value, suffix = '') => {
  if (value == null) {
    return 'N/A';
  }
  return `${value}${suffix}`;
};

const formatAlerts = (alerts) => {
  if (!alerts || alerts.length === 0) {
    return 'No active alerts.';
  }
  return alerts
    .map((alert, index) => `${index + 1}. ${alert.message} (${alert.type})`)
    .join('\n');
};

const formatForUser = (context) => {
  const { latest_readings, averages, trend } = context;
  const lines = [];
  lines.push(`Latest readings (most recent):`);
  Object.entries(latest_readings).forEach(([key, reading]) => {
    if (!reading) {
      lines.push(`- ${key}: no data`);
      return;
    }
    const time = reading.timestamp || 'unknown time';
    lines.push(`- ${key}: ${formatField(reading.value)} at ${time}`);
  });
  lines.push('24h averages:');
  Object.entries(averages).forEach(([key, value]) => {
    lines.push(`- ${key}: ${formatField(value)}`);
  });
  lines.push('Short trends (6h vs prior window):');
  Object.entries(trend).forEach(([key, direction]) => {
    lines.push(`- ${key}: ${direction}`);
  });
  lines.push('Alerts:');
  lines.push(formatAlerts(context.alerts));
  return lines.join('\n');
};

const formatForLLM = (context) => {
  const { farm_id, averages, trend, alerts } = context;
  const sentences = [];
  sentences.push(`Farm ${farm_id} latest averages are: temperature ${formatField(averages.temperature, '°C')}, humidity ${formatField(averages.humidity, '%')}, and soil moisture ${formatField(averages.soil_moisture, '%')}.`);
  sentences.push(`Recent trends show temperature is ${trend.temperature}, humidity is ${trend.humidity}, and soil moisture is ${trend.soil_moisture}.`);
  if (alerts && alerts.length > 0) {
    sentences.push(`There are ${alerts.length} active alerts: ${alerts.map((alert) => alert.message).join('; ')}.`);
  } else {
    sentences.push('There are no active alerts at this time.');
  }
  return sentences.join(' ');
};

module.exports = {
  formatForUser,
  formatForLLM,
};
