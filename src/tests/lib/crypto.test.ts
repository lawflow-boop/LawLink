import { describe, it, expect, beforeAll } from "vitest";
import { encryptBuffer, decryptBuffer, sha256 } from "@/lib/storage/crypto";

beforeAll(() => {
  // 测试用固定密钥（32 字节 base64）
  process.env.STORAGE_ENCRYPTION_KEY = "dGVzdC1rZXktMzItYnl0ZXMtbG9uZy1lbm91Z2gteHg=";
});

describe("crypto", () => {
  it("encryptBuffer + decryptBuffer roundtrip", () => {
    const plain = Buffer.from("LawLink 文档加密测试 🔒");
    const { ciphertext, iv, authTag } = encryptBuffer(plain);
    const restored = decryptBuffer(ciphertext, iv.toString("base64"), authTag.toString("base64"));
    expect(restored.toString()).toBe(plain.toString());
  });

  it("不同明文产生不同密文", () => {
    const a = encryptBuffer(Buffer.from("AAA"));
    const b = encryptBuffer(Buffer.from("BBB"));
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("相同明文不同 IV（随机性）", () => {
    const plain = Buffer.from("same");
    const a = encryptBuffer(plain);
    const b = encryptBuffer(plain);
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it("sha256 一致性", () => {
    const data = Buffer.from("hello");
    expect(sha256(data)).toBe(sha256(data));
    expect(sha256(data)).toHaveLength(64); // hex string
  });
});
