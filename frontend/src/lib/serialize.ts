// bigint를 JSON 직렬화 가능한 number로 변환하는 라우트 응답 공용 헬퍼.
// (Prisma BigInt 필드가 그대로면 JSON.stringify가 throw하므로 응답 직전 변환)
export function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}
