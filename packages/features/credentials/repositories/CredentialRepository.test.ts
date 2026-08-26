import { describe, expect, it, vi, beforeEach } from "vitest";

import { CredentialRepository } from "./CredentialRepository";

vi.mock("@calcom/prisma", () => {
  const mockPrisma = {
    credential: {
      update: vi.fn(),
    },
  };
  return {
    __esModule: true,
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

const { prisma } = await import("@calcom/prisma");

const KEY = { access_token: "new-access", refresh_token: "new-refresh" };

describe("CredentialRepository.updateKeyByIdAndUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.credential.update).mockResolvedValue({ id: 1 } as never);
  });

  it("scopes the update by userId and appId so a credential id alone cannot target another user's row", async () => {
    await CredentialRepository.updateKeyByIdAndUserId({
      id: 1,
      userId: 42,
      appId: "google-calendar",
      key: KEY,
    });

    expect(prisma.credential.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, userId: 42, appId: "google-calendar" } })
    );
  });

  it("clears the invalid flag, since a successful reconnect is what makes the credential usable again", async () => {
    await CredentialRepository.updateKeyByIdAndUserId({
      id: 1,
      userId: 42,
      appId: "google-calendar",
      key: KEY,
    });

    const { data } = vi.mocked(prisma.credential.update).mock.calls[0][0];
    expect(data).toMatchObject({ key: KEY, invalid: false });
  });

  it("writes encryptedKey alongside key so the two copies of the token cannot drift apart", async () => {
    await CredentialRepository.updateKeyByIdAndUserId({
      id: 1,
      userId: 42,
      appId: "google-calendar",
      key: KEY,
      encryptedKey: "encrypted-blob",
    });

    const { data } = vi.mocked(prisma.credential.update).mock.calls[0][0];
    expect(data).toMatchObject({ encryptedKey: "encrypted-blob" });
  });

  it("leaves encryptedKey untouched when the keyring is not configured and none is supplied", async () => {
    await CredentialRepository.updateKeyByIdAndUserId({
      id: 1,
      userId: 42,
      appId: "google-calendar",
      key: KEY,
    });

    const { data } = vi.mocked(prisma.credential.update).mock.calls[0][0];
    expect(data).not.toHaveProperty("encryptedKey");
  });

  it("marks the returned credential as non-delegated", async () => {
    const result = await CredentialRepository.updateKeyByIdAndUserId({
      id: 1,
      userId: 42,
      appId: "google-calendar",
      key: KEY,
    });

    expect(result).toMatchObject({ id: 1, delegatedTo: null, delegatedToId: null });
  });
});
