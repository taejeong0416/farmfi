// QR 스캐너 — 웹. 카메라 영상을 우리가 직접 해독한다.
//
// expo-camera의 웹 구현은 브라우저 내장 `BarcodeDetector`에 통째로 기댄다.
// 그게 없는 브라우저에서는 **카메라만 켜지고 아무리 비춰도 반응이 없다** —
// 고장난 것처럼 보인다. 실측: macOS Chrome에 그 API가 없다(헤드리스·헤드 둘 다).
// iOS Safari·Firefox도 없다. 안드로이드 Chrome에만 있다.
//
// 그래서 브라우저에 맡기지 않고 프레임을 직접 떠서 jsQR로 읽는다. 해독은 전부
// 이 기기 안에서 끝나고 영상은 밖으로 나가지 않는다. 서버로 가는 건 해독된
// 문자열 하나뿐이고, 유효한 보증서인지는 거기서 다시 판정한다.
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import jsQR from "jsqr";

import { C, FS, R, SP } from "./theme";
// 타입만 가져온다. 웹에서 `./qr-scanner`는 이 파일 자신으로 풀리지만 type import는
// 빌드 시 지워져 순환이 남지 않는다. 값을 가져오면 그때 깨진다 — 넣지 말 것.
import type { QrScannerProps } from "./qr-scanner";

/** 해독 시도 간격. 매 프레임 돌리면 발열만 늘고 인식률은 그대로다. */
const SCAN_INTERVAL_MS = 160;

export function QrScanner({ active, onScan, onUnavailable }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // 콜백이 바뀔 때마다 카메라를 다시 열면 화면이 깜빡인다. ref로 최신 것만 본다.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  const [status, setStatus] = useState<"starting" | "running" | "failed">("starting");

  // active는 "지금 읽을까"만 정한다. 카메라는 화면이 살아 있는 동안 계속 켜 둔다 —
  // 대조할 때마다 껐다 켜면 화면이 깜빡이고, 실패해서 돌아오면 매번 다시 연다.
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    function tick() {
      if (stopped) return;
      const video = videoRef.current;
      if (activeRef.current && video && ctx && video.readyState >= 2 && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // dontInvert: 흰 바탕 검은 코드만 본다. 반전까지 시도하면 느려진다.
        const found = jsQR(frame.data, frame.width, frame.height, {
          inversionAttempts: "dontInvert",
        });
        if (found?.data) {
          // 여기서 멈추지 않는다. 호출부가 잠금을 걸고, 대조에 실패해 다시
          // 스캔으로 돌아오면 카메라를 새로 열지 않고 이어서 읽는다.
          onScanRef.current(found.data);
        }
      }
      timer = setTimeout(tick, SCAN_INTERVAL_MS);
    }


    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("failed");
        onUnavailableRef.current?.("이 브라우저는 카메라를 지원하지 않습니다.");
        return;
      }
      try {
        // 후면 카메라를 선호하되 없으면 아무거나 — 노트북은 전면뿐이다.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) { return; }
        video.srcObject = stream;
        video.setAttribute("playsinline", "true"); // iOS가 전체화면으로 뺏어가는 걸 막는다
        await video.play();
        setStatus("running");
        tick();
      } catch {
        setStatus("failed");
        onUnavailableRef.current?.(
          "브라우저가 카메라를 막았습니다. 주소창 옆 자물쇠에서 허용하거나 번호를 입력해 주세요.",
        );
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* RN Web은 DOM으로 렌더되므로 video를 그대로 쓸 수 있다. */}
      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      {status !== "running" && (
        <View style={s.overlay}>
          <Text style={s.overlayText}>
            {status === "failed" ? "카메라를 열지 못했습니다" : "카메라를 여는 중"}
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: SP.lg,
    borderRadius: R.md,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  overlayText: { fontSize: FS.body, color: C.paper, opacity: 0.85, textAlign: "center" },
});
