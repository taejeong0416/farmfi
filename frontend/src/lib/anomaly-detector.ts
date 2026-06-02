export interface IoTReading {
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
}

export interface AnomalyResult {
  anomalyScore: number;
  isAnomaly: boolean;
  affectedSensors: string[];
}

const SENSOR_KEYS: (keyof IoTReading)[] = [
  "temperature",
  "humidity",
  "co2Level",
  "lightIntensity",
  "phLevel",
];

const Z_THRESHOLD = 3;

export function detectAnomalies(data: IoTReading[]): AnomalyResult[] {
  if (data.length === 0) return [];

  // Compute mean and stdDev for each sensor
  const stats = SENSOR_KEYS.map((key) => {
    const values = data.map((d) => d[key]);
    const n = values.length;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    return { key, mean, stdDev };
  });

  return data.map((reading) => {
    const zScores = stats.map(({ key, mean, stdDev }) => ({
      key,
      z: stdDev !== 0 ? Math.abs(reading[key] - mean) / stdDev : 0,
    }));

    const anomalyScore = Math.max(...zScores.map((s) => s.z));
    const affectedSensors = zScores
      .filter((s) => s.z > Z_THRESHOLD)
      .map((s) => s.key);

    return {
      anomalyScore,
      isAnomaly: anomalyScore > Z_THRESHOLD,
      affectedSensors,
    };
  });
}

export function calculateUptimeRate(data: AnomalyResult[]): number {
  if (data.length === 0) return 100;
  const normalCount = data.filter((d) => !d.isAnomaly).length;
  return (normalCount / data.length) * 100;
}
