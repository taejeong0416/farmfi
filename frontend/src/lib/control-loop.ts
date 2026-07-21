// ── IoT 환경 자동제어 루프 ───────────────────────────────────────────────────
// 생육레시피·최적화가 정한 목표(setpoint)를 실제 액추에이터로 달성하는 폐루프 제어.
// "설정값을 어떻게 달성하는지"가 이 계층의 역할 — "무엇을 목표로 할지"(레시피)와 분리.
//
// 자동 제어(이 모듈): 온도, CO2, 습도, 양액pH, 광량 — IoT 액추에이터가 처리
// 수동 작업(사람):    설비 고장 수리, 자재 발주, 수확, 액추에이터 고장 대응
//
// ① PID 제어기: 비례·적분·미분 + 안티와인드업(적분 포화 방지)
// ② 액추에이터 제약: 출력 상하한, 램프율 제한, 최소 가동/정지 시간(컴프레서 보호)
// ③ MPC-lite: 1차 플랜트 모델로 N스텝 예측, 선제 제어 (온도 채널 예시)
// ④ 제어 사이클: 센서 → 목표 → 제어기 → 액추에이터 → 다시 센서 (1 함수)
// ⑤ 시뮬레이션: PID vs MPC-lite 오버슈트·에너지·ITAE 비교
//
// 물리 상수: 실내 수직농장 근사치. "교체 지점" 주석 → 현장 스텝응답 계측 후 업데이트.
// 재현성: mulberry32 시드 고정 PRNG.

import type { IoTReading } from "./iot-health";

// ── 자동 vs 수동 작업 분류 ────────────────────────────────────────────────────

/** IoT가 자동으로 처리하는 환경 제어 도메인 */
export type AutoDomain =
  | "temperature"  // 히터 / 냉방기
  | "co2"          // CO2 밸브
  | "humidity"     // 가습기 / 환기
  | "ph"           // 양액 산·염기 펌프
  | "light";       // LED 인버터

/** 사람이 해야 하는 작업 — 이 모듈 범위 밖 */
export type ManualDomain =
  | "equipment-repair"      // 설비 고장 수리
  | "material-order"        // 자재·양액 발주
  | "harvest"               // 수확·출하
  | "actuator-fault"        // 액추에이터 고장 대응 (히터 불작동 등)
  | "physical-maintenance"; // 센서 세척·배관 점검 등

export interface TaskClassification {
  domain: AutoDomain | ManualDomain;
  controlType: "auto" | "manual";
  description: string;
  urgency: "routine" | "high" | "critical";
}

/**
 * 이슈 설명과 현재 측정값을 받아 자동/수동 분류와 긴급도를 반환한다.
 * 환경 편차 → 자동, 물리 한계 초과·설비 이상 → 수동.
 */
export function classifyTask(
  issue: string,
  current?: Partial<IoTReading>
): TaskClassification {
  const s = issue.toLowerCase();

  if (s.includes("temperature") || s.includes("온도") || s.includes("히터") || s.includes("냉방")) {
    const v = current?.temperature;
    return {
      domain: "temperature",
      controlType: "auto",
      description: "히터/냉방기 출력 자동 조절",
      urgency: v !== undefined && (v < 10 || v > 40) ? "critical" : "routine",
    };
  }
  if (s.includes("co2") || s.includes("이산화탄소") || s.includes("밸브")) {
    return { domain: "co2", controlType: "auto", description: "CO2 밸브 개도 자동 조절", urgency: "routine" };
  }
  if (s.includes("humid") || s.includes("습도") || s.includes("가습")) {
    return { domain: "humidity", controlType: "auto", description: "가습기·환기 자동 조절", urgency: "routine" };
  }
  if (s.includes("ph") || s.includes("산도") || s.includes("펌프")) {
    return { domain: "ph", controlType: "auto", description: "양액 pH 보정 펌프 자동 조절", urgency: "routine" };
  }
  if (s.includes("light") || s.includes("광") || s.includes("led")) {
    return { domain: "light", controlType: "auto", description: "LED 인버터 광량 자동 조절", urgency: "routine" };
  }
  if (s.includes("고장") || s.includes("fault") || s.includes("broken") || s.includes("repair")) {
    return { domain: "actuator-fault", controlType: "manual", description: "액추에이터 고장 — 현장 점검 필요", urgency: "critical" };
  }
  if (s.includes("수확") || s.includes("harvest")) {
    return { domain: "harvest", controlType: "manual", description: "수확·출하 — 사람 작업", urgency: "routine" };
  }
  if (s.includes("발주") || s.includes("order") || s.includes("자재")) {
    return { domain: "material-order", controlType: "manual", description: "자재·양액 발주 — 사람 작업", urgency: "high" };
  }
  if (s.includes("점검") || s.includes("세척") || s.includes("maintenance")) {
    return { domain: "physical-maintenance", controlType: "manual", description: "물리 점검 — 사람 작업", urgency: "routine" };
  }
  return { domain: "temperature", controlType: "auto", description: "환경 이상 — 자동 제어 시도", urgency: "high" };
}

// ── 목표값(setpoint) — 레시피/최적화가 주입 ─────────────────────────────────

export interface EnvironmentSetpoints {
  temperature: number; // ℃
  humidity: number;    // %
  co2: number;         // ppm
  ph: number;
  lightLux: number;    // lux
}

// ── 액추에이터 명령 — "무엇을 측정할지"가 아니라 "시스템이 무엇을 할지" ────────
// CO2 900ppm(측정값)이 아니라 "CO2 밸브 X% 개방"(제어입력)을 출력한다.

export interface ActuatorCommands {
  heaterOutput: number;     // 0~1 — 히터 출력 분율
  coolerOutput: number;     // 0~1 — 냉방/환기팬 출력 분율
  humidifierOutput: number; // 0~1 — 가습기 출력 분율
  co2ValveOpening: number;  // 0~1 — CO2 공급 밸브 개도
  phAcidPump: number;       // 0~1 — 산(pH↓) 펌프 속도
  phBasePump: number;       // 0~1 — 염기(pH↑) 펌프 속도
  ledIntensity: number;     // 0~1 — LED 인버터 출력 분율
}

// ── 액추에이터 물리 제약 ─────────────────────────────────────────────────────

export interface ActuatorConstraints {
  outputMin: number;       // 최소 출력 (0~1)
  outputMax: number;       // 최대 출력 (0~1)
  rampRatePerStep: number; // 스텝당 최대 변화율 (0.1 = 10%/스텝)
  minOnSteps: number;      // 최소 연속 가동 스텝 수 (압축기 보호)
  minOffSteps: number;     // 최소 연속 정지 스텝 수 (압축기 잠금)
}

// 설비별 기본 제약 (실내 수직농장 근사 — 교체 지점: 설비 사양서 기반으로 업데이트)
export const DEFAULT_ACTUATOR_CONSTRAINTS: Record<keyof ActuatorCommands, ActuatorConstraints> = {
  heaterOutput:     { outputMin: 0, outputMax: 1, rampRatePerStep: 0.15, minOnSteps: 3,  minOffSteps: 5  },
  coolerOutput:     { outputMin: 0, outputMax: 1, rampRatePerStep: 0.10, minOnSteps: 5,  minOffSteps: 10 }, // 냉방 압축기 잠금
  humidifierOutput: { outputMin: 0, outputMax: 1, rampRatePerStep: 0.20, minOnSteps: 2,  minOffSteps: 3  },
  co2ValveOpening:  { outputMin: 0, outputMax: 1, rampRatePerStep: 0.25, minOnSteps: 1,  minOffSteps: 2  }, // 빠른 응답 허용
  phAcidPump:       { outputMin: 0, outputMax: 0.5, rampRatePerStep: 0.05, minOnSteps: 1, minOffSteps: 1 }, // pH 과보정 방지
  phBasePump:       { outputMin: 0, outputMax: 0.5, rampRatePerStep: 0.05, minOnSteps: 1, minOffSteps: 1 },
  ledIntensity:     { outputMin: 0, outputMax: 1, rampRatePerStep: 0.30, minOnSteps: 1,  minOffSteps: 1  }, // LED 즉시 응답
};

export interface ActuatorState {
  consecutiveOnSteps: number;  // 연속 가동 스텝 수
  consecutiveOffSteps: number; // 연속 정지 스텝 수
  lastOutput: number;          // 직전 출력 (램프율 기준)
}

export function createActuatorState(): ActuatorState {
  return { consecutiveOnSteps: 0, consecutiveOffSteps: 999, lastOutput: 0 };
}

/**
 * 제어기 요청 출력에 액추에이터 물리 제약을 적용한다.
 * 순서: ① 최소 정지 시간(압축기 잠금) → ② 최소 가동 시간 → ③ 램프율 → ④ 상하한 클램프
 */
export function applyActuatorConstraints(
  requestedOutput: number,
  state: ActuatorState,
  constraints: ActuatorConstraints
): { output: number; nextState: ActuatorState } {
  const { outputMin, outputMax, rampRatePerStep, minOnSteps, minOffSteps } = constraints;
  const isOn = state.lastOutput > 0;
  const wantsOn = requestedOutput > 0;

  let output = requestedOutput;

  if (!isOn && state.consecutiveOffSteps < minOffSteps) {
    // 최소 정지 시간 미충족 — 켤 수 없음
    output = 0;
  } else if (isOn && state.consecutiveOnSteps < minOnSteps && !wantsOn) {
    // 최소 가동 시간 미충족 — 끌 수 없음, 현재 출력 유지
    output = state.lastOutput;
  }

  // 램프율 제한
  const delta = output - state.lastOutput;
  if (Math.abs(delta) > rampRatePerStep) {
    output = state.lastOutput + Math.sign(delta) * rampRatePerStep;
  }

  // 출력 상하한 클램프
  output = Math.max(outputMin, Math.min(outputMax, output));

  const nowOn = output > 0;
  return {
    output,
    nextState: {
      consecutiveOnSteps: nowOn ? state.consecutiveOnSteps + 1 : 0,
      consecutiveOffSteps: nowOn ? 0 : state.consecutiveOffSteps + 1,
      lastOutput: output,
    },
  };
}

// ── PID 제어기 ────────────────────────────────────────────────────────────────
// 안티와인드업: 출력 포화 상태에서 오차가 같은 방향이면 적분항 고정(와인드업 방지).
// 미분항: 측정값 미분(derivative-on-measurement) — 설정값 급변 시 킥 방지.

export interface PIDParams {
  Kp: number;
  Ki: number;
  Kd: number;
  outputMin: number; // PID 내부 출력 하한 (액추에이터 제약과 별도 계층)
  outputMax: number;
}

export interface PIDState {
  integral: number;
  prevMeasured: number;
  initialized: boolean; // 첫 스텝 미분 킥 방지 플래그
}

export function createPIDState(): PIDState {
  return { integral: 0, prevMeasured: 0, initialized: false };
}

export function stepPID(
  params: PIDParams,
  state: PIDState,
  setpoint: number,
  measured: number,
  dt: number
): { output: number; nextState: PIDState } {
  const error = setpoint - measured;

  const P = params.Kp * error;

  // 미분항: 첫 스텝은 D=0 (이전 측정값 없음)
  const dMeasured = state.initialized ? (measured - state.prevMeasured) / dt : 0;
  const D = -params.Kd * dMeasured;

  const tentativeIntegral = state.integral + error * dt;
  const rawOutput = P + params.Ki * tentativeIntegral + D;
  const output = Math.max(params.outputMin, Math.min(params.outputMax, rawOutput));

  // 안티와인드업: 포화 방향으로 오차가 쌓이면 적분 고정
  const saturated = rawOutput > params.outputMax || rawOutput < params.outputMin;
  const windingUp =
    (rawOutput > params.outputMax && error > 0) ||
    (rawOutput < params.outputMin && error < 0);
  const integral = saturated && windingUp ? state.integral : tentativeIntegral;

  return {
    output,
    nextState: { integral, prevMeasured: measured, initialized: true },
  };
}

// 채널별 기본 PID 파라미터 (근사 — 교체 지점: 지글러-니콜스 또는 현장 튜닝 후 업데이트)
// 온도: 1차 플랜트 τ≈100min 기준. alpha=0.01/min, beta_heat=0.25℃/min 근사.
export const DEFAULT_PID_PARAMS: Record<AutoDomain, PIDParams> = {
  temperature: { Kp: 1.5,    Ki: 0.04,   Kd: 5.0,  outputMin: -1,   outputMax: 1   }, // [-1,1]: 음수=냉방
  co2:         { Kp: 0.002,  Ki: 0.0001, Kd: 0.01, outputMin: 0,    outputMax: 1   },
  humidity:    { Kp: 0.04,   Ki: 0.001,  Kd: 0.2,  outputMin: -1,   outputMax: 1   },
  ph:          { Kp: 0.4,    Ki: 0.01,   Kd: 0.5,  outputMin: -1,   outputMax: 1   },
  light:       { Kp: 0.00004,Ki: 0,      Kd: 0,    outputMin: 0,    outputMax: 1   }, // 단순 비례
};

// ── 플랜트 모델 (시뮬레이션·MPC-lite 예측용) ─────────────────────────────────
// 1차 ODE + 오일러 적분. 실제 온실 물리를 단순화한 근사 — "예측이 있는 제어"의
// 핵심은 모델 정밀도가 아니라 방향성이다.
//
// 교체 지점: 현장 스텝응답 실험(히터 100% on → 온도 상승 곡선)으로 alpha, beta 실측.

export interface PlantParams {
  // 온도: dT/dt = -alpha_T*(T-T_ext) + beta_heat*u_heat - beta_cool*u_cool
  alpha_T: number;   // 열손실 계수 [1/min]. 단열 우수 = 낮음. 교체 지점: 스텝응답 계측.
  beta_heat: number; // 히터 이득 [℃/min per unit]. 교체 지점.
  beta_cool: number; // 냉방 이득 [℃/min per unit]. 교체 지점.
  T_ext: number;     // 외기온 [℃]. 실시간 기상 API로 교체 권장.

  // CO2: dC/dt = -alpha_vent*(C-400) + beta_co2*u_valve - delta_plant*(lights_on? 1:0)
  alpha_vent: number;  // 환기 희석율 [1/min]. 교체 지점.
  beta_co2: number;    // CO2 공급율 [ppm/min per unit]. 교체 지점.
  delta_plant: number; // 광합성 흡수율 [ppm/min]. 상추 기준 근사. 교체 지점.

  // 습도: dH/dt = -alpha_H*(H-H_ext) + beta_hum*u_hum
  alpha_H: number;   // 습도 교환율 [1/min]. 교체 지점.
  beta_hum: number;  // 가습기 이득 [%/min per unit]. 교체 지점.
  H_ext: number;     // 외기 습도 [%]. 교체 지점.

  // pH (선형 근사, 버퍼계 무시): dpH/dt = -beta_acid*u_acid + beta_base*u_base
  beta_acid: number; // 산 펌프 pH 하강율 [pH/min per unit]. 교체 지점.
  beta_base: number; // 염기 펌프 pH 상승율 [pH/min per unit]. 교체 지점.
}

export const DEFAULT_PLANT_PARAMS: PlantParams = {
  alpha_T: 0.01,    // τ_thermal ≈ 100min. 단열 양호 실내 수직농장 근사. 교체 지점.
  beta_heat: 0.25,  // 교체 지점.
  beta_cool: 0.20,  // 교체 지점.
  T_ext: 15,        // 기상 API 연동 전 기본값.

  alpha_vent: 0.015, // 자연환기 기준. 교체 지점.
  beta_co2: 25,      // CO2 발생기 사양 기반. 교체 지점.
  delta_plant: 3,    // 상추(엽채류) 기준. 교체 지점.

  alpha_H: 0.02,     // 교체 지점.
  beta_hum: 0.3,     // 교체 지점.
  H_ext: 40,         // 교체 지점.

  beta_acid: 0.05,   // pH 스텝응답으로 측정. 교체 지점.
  beta_base: 0.04,   // 교체 지점.
};

export function stepPlantTemperature(
  T: number,
  heaterOutput: number,
  coolerOutput: number,
  dt: number,
  params: PlantParams = DEFAULT_PLANT_PARAMS
): number {
  const dT = -params.alpha_T * (T - params.T_ext)
    + params.beta_heat * heaterOutput
    - params.beta_cool * coolerOutput;
  return T + dT * dt;
}

export function stepPlantCO2(
  co2: number,
  valveOpening: number,
  dt: number,
  params: PlantParams = DEFAULT_PLANT_PARAMS,
  lightsOn = true
): number {
  const dCO2 = -params.alpha_vent * (co2 - 400)
    + params.beta_co2 * valveOpening
    - params.delta_plant * (lightsOn ? 1 : 0);
  return Math.max(400, co2 + dCO2 * dt);
}

export function stepPlantHumidity(
  H: number,
  humidifierOutput: number,
  dt: number,
  params: PlantParams = DEFAULT_PLANT_PARAMS
): number {
  const dH = -params.alpha_H * (H - params.H_ext) + params.beta_hum * humidifierOutput;
  return Math.max(0, Math.min(100, H + dH * dt));
}

export function stepPlantPH(
  ph: number,
  acidPump: number,
  basePump: number,
  dt: number,
  params: PlantParams = DEFAULT_PLANT_PARAMS
): number {
  const dPH = -params.beta_acid * acidPump + params.beta_base * basePump;
  return Math.max(3, Math.min(10, ph + dPH * dt));
}

// ── 전체 제어 사이클 ──────────────────────────────────────────────────────────

export interface ControlLoopState {
  pidStates: Record<AutoDomain, PIDState>;
  actuatorStates: Record<keyof ActuatorCommands, ActuatorState>;
}

export function createControlLoopState(): ControlLoopState {
  return {
    pidStates: {
      temperature: createPIDState(),
      co2: createPIDState(),
      humidity: createPIDState(),
      ph: createPIDState(),
      light: createPIDState(),
    },
    actuatorStates: {
      heaterOutput:     createActuatorState(),
      coolerOutput:     createActuatorState(),
      humidifierOutput: createActuatorState(),
      co2ValveOpening:  createActuatorState(),
      phAcidPump:       createActuatorState(),
      phBasePump:       createActuatorState(),
      ledIntensity:     createActuatorState(),
    },
  };
}

export interface ControlCycleResult {
  commands: ActuatorCommands;
  errors: Record<AutoDomain, number>; // setpoint - measured (양수 = 목표 미달)
  nextState: ControlLoopState;
}

/**
 * 한 제어 사이클: 센서 측정값 + 목표값 → 액추에이터 명령.
 * 이 함수를 매 dt분마다 호출하면 폐루프가 완성된다.
 * 온도·습도·pH는 스플릿 범위 제어: 양수 출력 → 상승 액추에이터, 음수 → 하강 액추에이터.
 */
export function controlCycle(opts: {
  measured: IoTReading;
  setpoints: EnvironmentSetpoints;
  state: ControlLoopState;
  dt?: number;
  pidParams?: Partial<Record<AutoDomain, PIDParams>>;
  actuatorConstraints?: Partial<Record<keyof ActuatorCommands, ActuatorConstraints>>;
}): ControlCycleResult {
  const dt = opts.dt ?? 1;
  const { measured, setpoints, state } = opts;

  const pp: Record<AutoDomain, PIDParams> = {
    temperature: opts.pidParams?.temperature ?? DEFAULT_PID_PARAMS.temperature,
    co2:         opts.pidParams?.co2         ?? DEFAULT_PID_PARAMS.co2,
    humidity:    opts.pidParams?.humidity     ?? DEFAULT_PID_PARAMS.humidity,
    ph:          opts.pidParams?.ph           ?? DEFAULT_PID_PARAMS.ph,
    light:       opts.pidParams?.light        ?? DEFAULT_PID_PARAMS.light,
  };
  const ac: Record<keyof ActuatorCommands, ActuatorConstraints> = {
    ...DEFAULT_ACTUATOR_CONSTRAINTS,
    ...opts.actuatorConstraints,
  };

  // 온도: PID[-1,1] → 스플릿: 양수=히터, 음수=냉방
  const tempR = stepPID(pp.temperature, state.pidStates.temperature, setpoints.temperature, measured.temperature, dt);
  const heaterR = applyActuatorConstraints(Math.max(0, tempR.output),  state.actuatorStates.heaterOutput, ac.heaterOutput);
  const coolerR = applyActuatorConstraints(Math.max(0, -tempR.output), state.actuatorStates.coolerOutput, ac.coolerOutput);

  // CO2: 단방향 (밸브 개방)
  const co2R  = stepPID(pp.co2,      state.pidStates.co2,      setpoints.co2,      measured.co2Level,      dt);
  const co2vR = applyActuatorConstraints(Math.max(0, co2R.output), state.actuatorStates.co2ValveOpening, ac.co2ValveOpening);

  // 습도: 양수=가습기 (제습은 환기 — 단순화)
  const humR  = stepPID(pp.humidity, state.pidStates.humidity,  setpoints.humidity, measured.humidity,      dt);
  const humvR = applyActuatorConstraints(Math.max(0, humR.output), state.actuatorStates.humidifierOutput, ac.humidifierOutput);

  // pH: 양수=pH 상승 필요→염기 펌프, 음수=pH 하강 필요→산 펌프
  const phR    = stepPID(pp.ph,      state.pidStates.ph,        setpoints.ph,       measured.phLevel,       dt);
  const phBaseR = applyActuatorConstraints(Math.max(0,  phR.output), state.actuatorStates.phBasePump, ac.phBasePump);
  const phAcidR = applyActuatorConstraints(Math.max(0, -phR.output), state.actuatorStates.phAcidPump, ac.phAcidPump);

  // 광량: 단방향 비례 (LED)
  const lightR = stepPID(pp.light,   state.pidStates.light,     setpoints.lightLux, measured.lightIntensity, dt);
  const ledR   = applyActuatorConstraints(Math.max(0, lightR.output), state.actuatorStates.ledIntensity, ac.ledIntensity);

  const commands: ActuatorCommands = {
    heaterOutput:     Math.round(heaterR.output  * 1000) / 1000,
    coolerOutput:     Math.round(coolerR.output  * 1000) / 1000,
    humidifierOutput: Math.round(humvR.output    * 1000) / 1000,
    co2ValveOpening:  Math.round(co2vR.output    * 1000) / 1000,
    phAcidPump:       Math.round(phAcidR.output  * 1000) / 1000,
    phBasePump:       Math.round(phBaseR.output  * 1000) / 1000,
    ledIntensity:     Math.round(ledR.output     * 1000) / 1000,
  };

  const errors: Record<AutoDomain, number> = {
    temperature: Math.round((setpoints.temperature - measured.temperature) * 100) / 100,
    co2:         Math.round(setpoints.co2 - measured.co2Level),
    humidity:    Math.round((setpoints.humidity - measured.humidity) * 100) / 100,
    ph:          Math.round((setpoints.ph - measured.phLevel) * 1000) / 1000,
    light:       Math.round(setpoints.lightLux - measured.lightIntensity),
  };

  const nextState: ControlLoopState = {
    pidStates: {
      temperature: tempR.nextState,
      co2:         co2R.nextState,
      humidity:    humR.nextState,
      ph:          phR.nextState,
      light:       lightR.nextState,
    },
    actuatorStates: {
      heaterOutput:     heaterR.nextState,
      coolerOutput:     coolerR.nextState,
      humidifierOutput: humvR.nextState,
      co2ValveOpening:  co2vR.nextState,
      phAcidPump:       phAcidR.nextState,
      phBasePump:       phBaseR.nextState,
      ledIntensity:     ledR.nextState,
    },
  };

  return { commands, errors, nextState };
}

// ── MPC-lite: 온도 채널, receding-horizon ─────────────────────────────────────
// PID는 현재 오차에 반응. MPC는 "지금 이 출력이면 N분 뒤 어떻게 되나"를 예측하며
// 미리 출력을 줄여 오버슈트를 억제한다 — lookahead가 핵심.
//
// 구현: K개 상수 입력 후보에 대해 N스텝 플랜트 시뮬레이션 → 비용함수 최소 입력 선택.
// 제로스텝 홀드(상수 입력 홀드). O(K*N) ≈ 21*10 = 210 연산 — 무시할 수 있는 비용.

export interface MPCLiteParams {
  horizon: number;           // 예측 스텝 수 (기본 10)
  candidates: number;        // 후보 입력 수 (기본 21: -1.0, -0.9, ..., 1.0)
  weightError: number;       // 추적 오차 페널티
  weightInput: number;       // 입력 에너지 페널티
  weightInputChange: number; // 입력 급변 페널티 (갑작스런 변화 억제)
}

export const DEFAULT_MPC_PARAMS: MPCLiteParams = {
  horizon: 10,
  candidates: 21,
  weightError: 1.0,
  weightInput: 0.02,
  weightInputChange: 0.5,
};

/**
 * MPC-lite 온도 한 스텝: 플랜트 예측으로 최적 히터/냉방기 입력을 반환한다.
 * bestInput ∈ [-1, 1]: 양수=히터 출력 분율, 음수=냉방기 출력 분율.
 */
export function mpcLiteStepTemperature(opts: {
  currentTemp: number;
  setpoint: number;
  prevInput: number;
  dt?: number;
  plant?: PlantParams;
  mpc?: MPCLiteParams;
}): { bestInput: number; predictedTrajectory: number[]; predictedCost: number } {
  const dt    = opts.dt   ?? 1;
  const plant = opts.plant ?? DEFAULT_PLANT_PARAMS;
  const mpc   = opts.mpc  ?? DEFAULT_MPC_PARAMS;
  const K = mpc.candidates;

  // 후보 입력 [-1, 1] 등분
  const candidates = Array.from({ length: K }, (_, i) => -1 + (2 * i) / (K - 1));

  let bestCost = Infinity;
  let bestInput = 0;
  let bestTrajectory: number[] = [];

  for (const u of candidates) {
    const heater = Math.max(0, u);
    const cooler = Math.max(0, -u);
    let T = opts.currentTemp;
    const trajectory: number[] = [];
    let cost = 0;

    for (let k = 1; k <= mpc.horizon; k++) {
      T = stepPlantTemperature(T, heater, cooler, dt, plant);
      trajectory.push(T);

      const errCost    = mpc.weightError       * (T - opts.setpoint) ** 2;
      const inputCost  = mpc.weightInput        * u * u;
      // 입력 변화 페널티는 첫 스텝에만 적용 (receding-horizon 첫 결정 비용)
      const changeCost = k === 1 ? mpc.weightInputChange * (u - opts.prevInput) ** 2 : 0;
      cost += errCost + inputCost + changeCost;
    }

    if (cost < bestCost) {
      bestCost      = cost;
      bestInput     = u;
      bestTrajectory = trajectory;
    }
  }

  return {
    bestInput,
    predictedTrajectory: bestTrajectory,
    predictedCost: Math.round(bestCost * 100) / 100,
  };
}

// ── 시뮬레이션 ──────────────────────────────────────────────────────────────
// PID vs MPC-lite 성능 비교. 재현성: mulberry32 시드 고정.

export interface SimStep {
  step: number;
  temperature: number;
  heaterOutput: number; // 실제 적용된 히터 출력 (제약 후)
  coolerOutput: number;
  error: number;        // setpoint - temperature
}

export interface SimResult {
  controller: "PID" | "MPC-lite";
  trajectory: SimStep[];
  maxOvershootC: number;       // 최대 오버슈트 (℃, 양수)
  settlingStep: number | null; // 오차 ±0.5℃ 이내 최초 진입 스텝
  itae: number;                // Integral of Time-weighted Absolute Error
  energyUsed: number;          // 히터+냉방기 출력 누적 (에너지 비례 지표)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** PID 시뮬레이션: T_initial → setpoint, 소량 센서 노이즈(±0.1℃) 포함 */
export function simulatePID(opts: {
  initialTemp?: number;
  setpoint?: number;
  steps?: number;
  dt?: number;
  pidParams?: PIDParams;
  plant?: PlantParams;
  seed?: number;
}): SimResult {
  const T0    = opts.initialTemp ?? 15;
  const sp    = opts.setpoint    ?? 22;
  const steps = opts.steps       ?? 80;
  const dt    = opts.dt          ?? 1;
  const plant = opts.plant       ?? DEFAULT_PLANT_PARAMS;
  const pidP  = opts.pidParams   ?? DEFAULT_PID_PARAMS.temperature;
  const rand  = mulberry32(opts.seed ?? 42);
  const hC    = DEFAULT_ACTUATOR_CONSTRAINTS.heaterOutput;
  const cC    = DEFAULT_ACTUATOR_CONSTRAINTS.coolerOutput;

  let T         = T0;
  let pidState  = createPIDState();
  let heaterAS  = createActuatorState();
  let coolerAS  = createActuatorState();

  const trajectory: SimStep[] = [];
  let itae = 0, maxOvershoot = 0, energyUsed = 0;
  let settlingStep: number | null = null;

  for (let step = 0; step < steps; step++) {
    const { output, nextState } = stepPID(pidP, pidState, sp, T, dt);
    pidState = nextState;

    const hR = applyActuatorConstraints(Math.max(0,  output), heaterAS, hC);
    heaterAS = hR.nextState;
    const cR = applyActuatorConstraints(Math.max(0, -output), coolerAS, cC);
    coolerAS = cR.nextState;

    T = stepPlantTemperature(T, hR.output, cR.output, dt, plant);
    T += (rand() - 0.5) * 0.2; // ±0.1℃ 센서 노이즈

    const error    = sp - T;
    const overshoot = T - sp;
    itae       += step * Math.abs(error) * dt;
    energyUsed += (hR.output + cR.output) * dt;
    if (overshoot > maxOvershoot) maxOvershoot = overshoot;
    if (Math.abs(error) <= 0.5 && settlingStep === null) settlingStep = step;

    trajectory.push({
      step,
      temperature: Math.round(T * 100) / 100,
      heaterOutput: Math.round(hR.output * 1000) / 1000,
      coolerOutput: Math.round(cR.output * 1000) / 1000,
      error: Math.round(error * 100) / 100,
    });
  }

  return {
    controller: "PID",
    trajectory,
    maxOvershootC: Math.round(Math.max(0, maxOvershoot) * 100) / 100,
    settlingStep,
    itae: Math.round(itae * 10) / 10,
    energyUsed: Math.round(energyUsed * 100) / 100,
  };
}

/** MPC-lite 시뮬레이션 — PID와 동일 조건, 동일 시드 */
export function simulateMPCLite(opts: {
  initialTemp?: number;
  setpoint?: number;
  steps?: number;
  dt?: number;
  plant?: PlantParams;
  mpcParams?: MPCLiteParams;
  seed?: number;
}): SimResult {
  const T0    = opts.initialTemp ?? 15;
  const sp    = opts.setpoint    ?? 22;
  const steps = opts.steps       ?? 80;
  const dt    = opts.dt          ?? 1;
  const plant = opts.plant       ?? DEFAULT_PLANT_PARAMS;
  const mpcP  = opts.mpcParams   ?? DEFAULT_MPC_PARAMS;
  const rand  = mulberry32(opts.seed ?? 42);
  const hC    = DEFAULT_ACTUATOR_CONSTRAINTS.heaterOutput;
  const cC    = DEFAULT_ACTUATOR_CONSTRAINTS.coolerOutput;

  let T          = T0;
  let prevInput  = 0;
  let heaterAS   = createActuatorState();
  let coolerAS   = createActuatorState();

  const trajectory: SimStep[] = [];
  let itae = 0, maxOvershoot = 0, energyUsed = 0;
  let settlingStep: number | null = null;

  for (let step = 0; step < steps; step++) {
    const { bestInput } = mpcLiteStepTemperature({ currentTemp: T, setpoint: sp, prevInput, dt, plant, mpc: mpcP });
    prevInput = bestInput;

    const hR = applyActuatorConstraints(Math.max(0,  bestInput), heaterAS, hC);
    heaterAS = hR.nextState;
    const cR = applyActuatorConstraints(Math.max(0, -bestInput), coolerAS, cC);
    coolerAS = cR.nextState;

    T = stepPlantTemperature(T, hR.output, cR.output, dt, plant);
    T += (rand() - 0.5) * 0.2;

    const error     = sp - T;
    const overshoot = T - sp;
    itae        += step * Math.abs(error) * dt;
    energyUsed  += (hR.output + cR.output) * dt;
    if (overshoot > maxOvershoot) maxOvershoot = overshoot;
    if (Math.abs(error) <= 0.5 && settlingStep === null) settlingStep = step;

    trajectory.push({
      step,
      temperature: Math.round(T * 100) / 100,
      heaterOutput: Math.round(hR.output * 1000) / 1000,
      coolerOutput: Math.round(cR.output * 1000) / 1000,
      error: Math.round(error * 100) / 100,
    });
  }

  return {
    controller: "MPC-lite",
    trajectory,
    maxOvershootC: Math.round(Math.max(0, maxOvershoot) * 100) / 100,
    settlingStep,
    itae: Math.round(itae * 10) / 10,
    energyUsed: Math.round(energyUsed * 100) / 100,
  };
}

export interface ControllerComparison {
  scenario: string;
  pid: SimResult;
  mpc: SimResult;
  winner: "PID" | "MPC-lite" | "tie";
  summary: string;
}

/** PID vs MPC-lite 비교. 검증 3개 축: 오버슈트, ITAE, 에너지 */
export function compareControllers(opts?: {
  initialTemp?: number;
  setpoint?: number;
  steps?: number;
  plant?: PlantParams;
  seed?: number;
}): ControllerComparison {
  const shared = {
    initialTemp: opts?.initialTemp ?? 15,
    setpoint:    opts?.setpoint    ?? 22,
    steps:       opts?.steps       ?? 80,
    plant:       opts?.plant,
    seed:        opts?.seed        ?? 42,
  };
  const pid = simulatePID(shared);
  const mpc = simulateMPCLite(shared);

  const mpcBetter =
    mpc.maxOvershootC < pid.maxOvershootC - 0.05 ||
    (Math.abs(mpc.maxOvershootC - pid.maxOvershootC) < 0.05 && mpc.itae < pid.itae - 1) ||
    (mpc.itae <= pid.itae && mpc.energyUsed < pid.energyUsed - 0.5);

  const winner: ControllerComparison["winner"] = mpcBetter ? "MPC-lite" : "PID";

  const sp = shared.setpoint;
  const T0 = shared.initialTemp;
  const summary = [
    `시나리오: ${T0}℃ → 목표 ${sp}℃ | ${shared.steps}스텝(분)`,
    `PID      오버슈트 ${pid.maxOvershootC.toFixed(2)}℃ | 정착 ${pid.settlingStep ?? "미달"}스텝 | 에너지 ${pid.energyUsed.toFixed(1)} | ITAE ${pid.itae.toFixed(0)}`,
    `MPC-lite 오버슈트 ${mpc.maxOvershootC.toFixed(2)}℃ | 정착 ${mpc.settlingStep ?? "미달"}스텝 | 에너지 ${mpc.energyUsed.toFixed(1)} | ITAE ${mpc.itae.toFixed(0)}`,
    `승자: ${winner}`,
  ].join("\n");

  return { scenario: `${T0}→${sp}℃`, pid, mpc, winner, summary };
}

// ── CLI 검증 (npx tsx src/lib/control-loop.ts) ───────────────────────────────
if (typeof process !== "undefined" && process.argv[1]?.includes("control-loop")) {
  console.log("=== FarmFi IoT 자동제어 루프 검증 ===\n");

  // (a) PID 수렴 검증
  console.log("【(a) PID 수렴 검증 — 15℃→22℃, 80분】");
  const pidResult = simulatePID({ initialTemp: 15, setpoint: 22, steps: 80, seed: 42 });
  const pidSample = [0, 10, 20, 30, 40, 50, 60, 70, 79].map(
    (i) => `스텝${String(i).padStart(2)} T=${pidResult.trajectory[i]?.temperature.toFixed(2)}℃`
  ).join("  ");
  console.log(pidSample);
  console.log(`최대 오버슈트: ${pidResult.maxOvershootC.toFixed(2)}℃ | 정착(±0.5℃): ${pidResult.settlingStep}스텝`);
  const pidPass = pidResult.maxOvershootC < 1.5;
  console.log(`→ ${pidPass ? "PASS" : "FAIL"} (오버슈트 < 1.5℃ 기준)\n`);

  // (b) 액추에이터 제약 검증
  console.log("【(b) 액추에이터 제약 검증】");
  const hC = DEFAULT_ACTUATOR_CONSTRAINTS.heaterOutput;
  let rampViolations = 0;
  for (let i = 1; i < pidResult.trajectory.length; i++) {
    const change = Math.abs(
      pidResult.trajectory[i].heaterOutput - pidResult.trajectory[i - 1].heaterOutput
    );
    if (change > hC.rampRatePerStep + 0.001) rampViolations++;
  }
  console.log(`히터 램프율 위반: ${rampViolations}건 (허용 ≤${hC.rampRatePerStep}/스텝)`);

  // 최소 가동 시간 검증
  let minOnViolations = 0;
  let onStreak = 0;
  for (let i = 0; i < pidResult.trajectory.length; i++) {
    const wasOn = i > 0 && pidResult.trajectory[i - 1].heaterOutput > 0;
    const nowOn = pidResult.trajectory[i].heaterOutput > 0;
    if (wasOn) onStreak++;
    else onStreak = 0;
    if (wasOn && !nowOn && onStreak < hC.minOnSteps) minOnViolations++;
  }
  console.log(`히터 최소가동(${hC.minOnSteps}스텝) 위반: ${minOnViolations}건`);
  const constraintPass = rampViolations === 0 && minOnViolations === 0;
  console.log(`→ ${constraintPass ? "PASS" : "FAIL"}\n`);

  // (c) MPC-lite vs PID 비교
  console.log("【(c) MPC-lite vs PID 비교】");
  const cmp = compareControllers({ initialTemp: 15, setpoint: 22, steps: 80, seed: 42 });
  console.log(cmp.summary);
  const mpcPass = cmp.winner === "MPC-lite" || cmp.mpc.itae <= cmp.pid.itae;
  console.log(`→ ${mpcPass ? "PASS" : "FAIL"} (MPC-lite ITAE ≤ PID 기준)\n`);

  // 제어 사이클 한 번 실행 예시
  console.log("【단발 제어 사이클 예시】");
  const measured: IoTReading = { temperature: 18, humidity: 65, co2Level: 800, lightIntensity: 10000, phLevel: 5.8 };
  const setpoints: EnvironmentSetpoints = { temperature: 22, humidity: 70, co2: 900, ph: 6.0, lightLux: 12000 };
  const loopState = createControlLoopState();
  const cycle = controlCycle({ measured, setpoints, state: loopState });
  console.log("측정값:", measured);
  console.log("목표값:", setpoints);
  console.log("오차  :", cycle.errors);
  console.log("명령  :", cycle.commands);

  // 작업 분류 예시
  console.log("\n【작업 분류 예시】");
  const tasks = ["온도 이상", "CO2 밸브 점검", "히터 고장", "수확 일정", "양액 발주"];
  for (const t of tasks) {
    const cls = classifyTask(t);
    console.log(`  "${t}" → [${cls.controlType}/${cls.urgency}] ${cls.description}`);
  }

  const allPass = pidPass && constraintPass && mpcPass;
  console.log(`\n=== 종합: ${allPass ? "전체 PASS" : "일부 FAIL"} ===`);
  process.exit(allPass ? 0 : 1);
}
