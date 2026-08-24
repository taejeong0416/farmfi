// QR 스캐너 — 네이티브(iOS/Android). expo-camera가 OS 디코더를 쓴다.
//
// 웹은 `qr-scanner.web.tsx`가 대신 잡힌다. 브라우저에는 QR을 읽어주는 기능이
// 없는 경우가 많아 구현이 통째로 다르다 — 그래서 파일을 나눴다.
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { C, FS, R, SP } from "./theme";

export type QrScannerProps = {
  /** 스캔을 돌릴지. 대조 중이거나 결과 화면이면 false. */
  active: boolean;
  onScan: (value: string) => void;
  /** 카메라를 못 쓰는 이유. 화면이 대체 경로를 안내하는 데 쓴다. */
  onUnavailable?: (reason: string) => void;
};

export function QrScanner({ active, onScan, onUnavailable }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (permission && !permission.granted && !permission.canAskAgain) {
      onUnavailable?.("카메라 권한이 꺼져 있습니다. 설정에서 허용해 주세요.");
    }
  }, [permission, onUnavailable]);

  if (!permission?.granted) {
    return (
      <View style={s.idle}>
        <Text style={s.idleText}>
          {permission?.canAskAgain === false
            ? "카메라 권한이 필요합니다"
            : "카메라를 준비하는 중"}
        </Text>
      </View>
    );
  }

  return (
    <CameraView
      style={StyleSheet.absoluteFill}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      onBarcodeScanned={active ? ({ data }) => onScan(data) : undefined}
    />
  );
}

const s = StyleSheet.create({
  idle: { flex: 1, alignItems: "center", justifyContent: "center", padding: SP.lg, borderRadius: R.md },
  idleText: { fontSize: FS.body, color: C.paper, opacity: 0.7, textAlign: "center" },
});
