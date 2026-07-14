"use client";

import { useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Metric } from "../ui/Metric";

const SPACE_TYPES = ["옥상", "빈 점포", "실내 유휴공간"] as const;
// 라우트(/api/spaces)는 영문 코드만 허용 — 한글 라벨→코드 매핑.
const SPACE_TYPE_CODES: Record<string, string> = {
  "옥상": "rooftop",
  "빈 점포": "vacant_store",
  "실내 유휴공간": "indoor",
};
const AREAS = ["~50평", "50~100평", "100~200평", "200평~"] as const;
const LIGHTING_OPTIONS = ["매우 좋음", "좋음", "보통", "낮음"] as const;
const MODES = ["임대형", "수익 공유형", "협의 가능"] as const;

const MAX_PHOTOS = 10;

// Visual state that mirrors the mockup's `.seg span:first-child` highlight,
// applied via inline style so we don't have to touch globals.css.
const ACTIVE_SEG_STYLE = {
  borderColor: "#72aa86",
  background: "#f0f8f3",
  color: "var(--green-800)",
  cursor: "pointer",
} as const;
const INACTIVE_SEG_STYLE = { cursor: "pointer" } as const;

type UploadedPhoto = { url: string; name: string };

type SubmitPayload = {
  spaceType: string;
  address: string;
  area: string;
  electricity: string;
  water: string;
  lighting: string;
  preferredMode: string;
  photos: string[];
};

type SubmitResponse = {
  suitabilityScore: number;
  estimatedRent: number;
};

async function uploadPhoto(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (res.status === 401) {
    // 업로드 API는 세션 필수 — 비로그인 사용자에게 원인을 정확히 안내한다.
    throw new Error("사진 업로드는 로그인 후 이용할 수 있어요.");
  }
  if (!res.ok) {
    throw new Error("사진 업로드에 실패했어요. 다시 시도해주세요.");
  }
  const data = await res.json();
  return data.url as string;
}

async function submitSpace(payload: SubmitPayload): Promise<SubmitResponse> {
  const res = await fetch("/api/spaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error("공간 등록에 실패했어요. 잠시 후 다시 시도해주세요.");
  }
  // 라우트는 { space: {...} } 로 래핑해 반환한다.
  const data = (await res.json()) as { space: SubmitResponse };
  return data.space;
}

export function SpaceForm() {
  const [spaceType, setSpaceType] = useState<string>(SPACE_TYPES[0]);
  const [address, setAddress] = useState("");
  const [area, setArea] = useState<string>(AREAS[0]);
  const [electricity, setElectricity] = useState(true);
  const [water, setWater] = useState(true);
  const [lighting, setLighting] = useState<string>(LIGHTING_OPTIONS[0]);
  const [preferredMode, setPreferredMode] = useState<string>(MODES[0]);

  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitMutation = useMutation<SubmitResponse, Error, SubmitPayload>({
    mutationFn: submitSpace,
  });

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setUploadError(null);
    const remainingSlots = MAX_PHOTOS - photos.length;
    const files = Array.from(fileList).slice(0, remainingSlots);

    if (files.length === 0) {
      setUploadError(`사진은 최대 ${MAX_PHOTOS}장까지 업로드할 수 있어요`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => ({ url: await uploadPhoto(file), name: file.name }))
      );
      setPhotos((prev) => [...prev, ...uploaded].slice(0, MAX_PHOTOS));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "사진 업로드에 실패했어요");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = (url: string) => {
    setPhotos((prev) => prev.filter((photo) => photo.url !== url));
  };

  const handleSubmit = () => {
    if (!address.trim() || submitMutation.isPending || uploading) return;
    submitMutation.mutate({
      spaceType: SPACE_TYPE_CODES[spaceType] ?? "indoor",
      address: address.trim(),
      area,
      electricity: electricity ? "가능" : "불가",
      water: water ? "가능" : "불가",
      lighting,
      preferredMode,
      photos: photos.map((photo) => photo.url),
    });
  };

  const report = submitMutation.data;
  const score = report?.suitabilityScore ?? 0;
  const rentDisplay =
    report != null ? `₩${report.estimatedRent.toLocaleString()}` : "등록 후 확인 가능";

  return (
    <div className="form-grid">
      <article className="card form-panel">
        <h2>유휴공간 정보 입력</h2>
        <div className="field-grid" style={{ marginTop: 26 }}>
          <Field
            label="공간 유형"
            control={<SegGroup options={SPACE_TYPES} value={spaceType} onChange={setSpaceType} />}
          />
          <Field
            label="주소"
            control={
              <input
                className="fake-control"
                style={{ width: "100%", font: "inherit" }}
                placeholder="도로명 주소를 입력해주세요"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            }
          />
          <Field
            label="면적"
            control={<SegGroup options={AREAS} value={area} onChange={setArea} />}
          />
          <Field
            label="전기 / 수도"
            control={
              <div className="seg">
                <ToggleChip label="전기 가능" active={electricity} onToggle={() => setElectricity((v) => !v)} />
                <ToggleChip label="수도 가능" active={water} onToggle={() => setWater((v) => !v)} />
              </div>
            }
          />
          <Field
            label="채광 조건"
            control={<SegGroup options={LIGHTING_OPTIONS} value={lighting} onChange={setLighting} />}
          />
          <Field
            label="희망 운영 방식"
            control={<SegGroup options={MODES} value={preferredMode} onChange={setPreferredMode} />}
          />
          <Field
            label="사진 업로드"
            control={
              <PhotoUpload
                photos={photos}
                uploading={uploading}
                error={uploadError}
                fileInputRef={fileInputRef}
                onSelect={handleFiles}
                onRemove={removePhoto}
              />
            }
          />
        </div>

        {submitMutation.isError && (
          <p style={{ color: "#c0392b", fontSize: 13, marginTop: 12 }}>
            {submitMutation.error.message}
          </p>
        )}
        {!address.trim() && (
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            주소를 입력하면 등록할 수 있어요.
          </p>
        )}

        <button
          className="btn"
          type="button"
          style={{ width: "100%", marginTop: 24, opacity: submitMutation.isPending ? 0.7 : 1 }}
          disabled={!address.trim() || submitMutation.isPending || uploading}
          onClick={handleSubmit}
        >
          {submitMutation.isPending ? "등록 중..." : "공간 등록 & 예상 리포트 받기 →"}
        </button>
      </article>

      <aside className="card report-card">
        <h2>예상 전환 리포트</h2>
        <p className="muted">스마트팜 적합도</p>
        <p className="big-number">{report != null ? `${score}%` : "—"}</p>
        <div className="progress">
          <span className="bar" style={{ width: `${report != null ? score : 0}%` }} />
        </div>
        <Metric label="예상 월 임대 수익" value={rentDisplay} />
        <Metric label="예상 프로젝트 오픈 기간" value="2.5개월" />
        <Metric label="예상 운영 형태" value={preferredMode} />
      </aside>
    </div>
  );
}

export function Field({ label, control }: { label: string; control: ReactNode }) {
  return (
    <div className="field">
      <label>{label} *</label>
      {control}
    </div>
  );
}

function SegGroup({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((option) => {
        const active = option === value;
        return (
          <span
            key={option}
            role="radio"
            aria-checked={active}
            tabIndex={0}
            style={active ? ACTIVE_SEG_STYLE : INACTIVE_SEG_STYLE}
            onClick={() => onChange(option)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onChange(option);
              }
            }}
          >
            {option}
          </span>
        );
      })}
    </div>
  );
}

function ToggleChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <span
      role="switch"
      aria-checked={active}
      tabIndex={0}
      style={active ? ACTIVE_SEG_STYLE : INACTIVE_SEG_STYLE}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      {label}
    </span>
  );
}

function PhotoUpload({
  photos,
  uploading,
  error,
  fileInputRef,
  onSelect,
  onRemove,
}: {
  photos: UploadedPhoto[];
  uploading: boolean;
  error: string | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onSelect: (files: FileList | null) => void;
  onRemove: (url: string) => void;
}) {
  const full = photos.length >= MAX_PHOTOS;

  return (
    <div>
      <label
        className="fake-control"
        style={{
          display: "block",
          cursor: full || uploading ? "not-allowed" : "pointer",
          opacity: full ? 0.6 : 1,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={full || uploading}
          style={{ display: "none" }}
          onChange={(event) => onSelect(event.target.files)}
        />
        {uploading
          ? "업로드 중..."
          : full
          ? `사진 ${MAX_PHOTOS}장을 모두 업로드했어요`
          : `공간 사진을 업로드해주세요. 최대 ${MAX_PHOTOS}장 (${photos.length}/${MAX_PHOTOS})`}
      </label>

      {error && (
        <p style={{ color: "#c0392b", fontSize: 12, marginTop: 6 }}>{error}</p>
      )}

      {photos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {photos.map((photo) => (
            <div key={photo.url} style={{ position: "relative", width: 64, height: 64 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                }}
              />
              <button
                type="button"
                onClick={() => onRemove(photo.url)}
                aria-label={`${photo.name} 삭제`}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  border: "none",
                  background: "#111612",
                  color: "#fff",
                  fontSize: 12,
                  lineHeight: "20px",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
