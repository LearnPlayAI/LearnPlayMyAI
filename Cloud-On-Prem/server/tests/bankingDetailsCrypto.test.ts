import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import {
  decryptBankAccountNumber,
  encryptBankAccountNumber,
  isEncryptedBankAccountNumber,
} from "../utils/bankingDetailsCrypto";

describe("bankingDetailsCrypto", () => {
  const originalKey = process.env.BANKING_DETAILS_MASTER_KEY;

  beforeEach(() => {
    process.env.BANKING_DETAILS_MASTER_KEY = "banking-crypto-test-master-key";
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.BANKING_DETAILS_MASTER_KEY;
      return;
    }
    process.env.BANKING_DETAILS_MASTER_KEY = originalKey;
  });

  it("encrypts and decrypts account numbers when a key is configured", () => {
    const plain = "1234567890";
    const encrypted = encryptBankAccountNumber(plain);

    expect(encrypted).not.toBe(plain);
    expect(isEncryptedBankAccountNumber(encrypted)).toBe(true);
    expect(decryptBankAccountNumber(encrypted)).toBe(plain);
  });

  it("returns plaintext untouched when value is not encrypted", () => {
    expect(decryptBankAccountNumber("987654321")).toBe("987654321");
    expect(isEncryptedBankAccountNumber("987654321")).toBe(false);
  });

  it("does not double-encrypt already encrypted values", () => {
    const encrypted = encryptBankAccountNumber("1029384756");
    expect(encryptBankAccountNumber(encrypted)).toBe(encrypted);
  });
});
