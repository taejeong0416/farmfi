"use client";

export function FilterBar() {
  return (
    <div className="card filterbar">
      <div className="input">프로젝트명, 위치, 운영자 검색</div>
      {["지역", "모집 상태", "예상 수익률", "프로젝트 단계", "운영 상태", "역할"].map((item) => (
        <div className="input" key={item}>
          {item} ˅
        </div>
      ))}
    </div>
  );
}
