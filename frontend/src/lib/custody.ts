import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { prisma } from "@/lib/db";

/**
 * 투자자 수탁 지갑.
 *
 * 투자자는 주소·개인키·가스비를 다루지 않는다(명세 0.2·3.3). 서버가 투자자
 * 1인당 지갑 하나를 만들어 보관하고, 보유 구좌는 그 지갑 앞으로 발행된다.
 *
 * 키 보관: 개발은 AES-256-GCM 암호화 키스토어, 운영은 KMS/HSM이다. 어느 쪽이든
 * DB에 드는 것은 `keyRef` 하나뿐이고 그 값만으로는 키를 복원할 수 없다 —
 * 마스터 키가 따로 있어야 한다. 평문 키는 파일·DB·환경변수 어디에도 두지 않는다.
 *
 * Open DID의 Wallet SDK(신원·VC 보관용)와는 다른 층이다. 이름이 같아도 섞지 않는다.
 */

const MASTER_KEY_HEX = process.env.CUSTODY_MASTER_KEY ?? "";

/** 마스터 키가 없으면 지갑을 만들지 않는다 — 평문 저장으로 물러서지 않는다. */
export function isCustodyEnabled(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(MASTER_KEY_HEX);
}

function masterKey(): Buffer {
  if (!isCustodyEnabled()) {
    throw new Error(
      "CUSTODY_MASTER_KEY가 없거나 32바이트 hex가 아닙니다. 수탁 지갑을 만들 수 없습니다.",
    );
  }
  return Buffer.from(MASTER_KEY_HEX, "hex");
}

/** `local:v1:<iv>:<tag>:<ciphertext>` — 전부 base64. 복호에 마스터 키가 필요하다. */
function sealPrivateKey(privateKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "local:v1",
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

/**
 * 서명이 필요한 순간에만 복호한다. 반환값을 로그·응답·에러 메시지에 담지 않는다.
 * 운영에서 `kms:`로 바뀌면 이 함수가 KMS 서명 호출로 교체된다.
 */
export function openPrivateKey(keyRef: string): `0x${string}` {
  if (keyRef.startsWith("kms:")) {
    throw new Error("KMS 키 참조는 아직 지원하지 않습니다 (운영 전환 시 구현).");
  }
  const [scheme, version, ivB64, tagB64, dataB64] = keyRef.split(":");
  if (scheme !== "local" || version !== "v1") {
    throw new Error("알 수 없는 키 참조 형식입니다.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return out.toString("utf8") as `0x${string}`;
}

/**
 * 투자자의 수탁 지갑을 가져오고, 없으면 만든다.
 * userId에 unique가 걸려 있어 동시 호출이 두 개를 만들지 못한다 — 충돌하면 읽어서 돌려준다.
 */
export async function getOrCreateCustodyWallet(userId: string) {
  const existing = await prisma.custodyWallet.findUnique({ where: { userId } });
  if (existing) return existing;

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  try {
    return await prisma.custodyWallet.create({
      data: {
        userId,
        chainAddress: account.address,
        keyRef: sealPrivateKey(privateKey),
      },
    });
  } catch {
    // 경쟁에서 진 쪽. 먼저 만들어진 지갑을 쓴다 — 1인 1지갑을 깨지 않는다.
    const winner = await prisma.custodyWallet.findUnique({ where: { userId } });
    if (winner) return winner;
    throw new Error("수탁 지갑을 만들지 못했습니다.");
  }
}

/**
 * 체인 신원 레지스트리에 올릴 DID 해시.
 * CI 해시가 있으면 그것을, 없으면 userId를 근거로 만든다. 어느 쪽도 원문이 아니다.
 */
export function didHashFor(user: { id: string; ciHash: string | null }): `0x${string}` {
  const seed = user.ciHash ?? `farmfi:user:${user.id}`;
  return `0x${createHash("sha256").update(seed).digest("hex")}`;
}
