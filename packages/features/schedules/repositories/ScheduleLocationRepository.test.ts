import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleLocationRepository } from "./ScheduleLocationRepository";

vi.mock("@calcom/prisma", () => {
  const mockPrisma = {
    scheduleLocation: { findMany: vi.fn() },
    scheduleLocationRule: { findMany: vi.fn() },
  };
  return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
});

const { prisma } = await import("@calcom/prisma");

describe("ScheduleLocationRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.scheduleLocation.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.scheduleLocationRule.findMany).mockResolvedValue([] as never);
  });

  describe("findLocationsByScheduleId", () => {
    it("scopes the query to the schedule", async () => {
      await ScheduleLocationRepository.findLocationsByScheduleId({ scheduleId: 1 });
      const arg = vi.mocked(prisma.scheduleLocation.findMany).mock.calls[0][0];
      expect(arg.where).toEqual({ scheduleId: 1 });
    });

    it("selects explicit fields rather than including the whole row", async () => {
      await ScheduleLocationRepository.findLocationsByScheduleId({ scheduleId: 1 });
      const arg = vi.mocked(prisma.scheduleLocation.findMany).mock.calls[0][0];
      expect(arg).not.toHaveProperty("include");
      expect(Object.keys(arg.select ?? {}).sort()).toEqual([
        "address",
        "credentialId",
        "id",
        "label",
        "shortCode",
        "type",
      ]);
    });
  });

  describe("findRulesByScheduleId", () => {
    it("scopes the query to the schedule", async () => {
      await ScheduleLocationRepository.findRulesByScheduleId({ scheduleId: 2 });
      const arg = vi.mocked(prisma.scheduleLocationRule.findMany).mock.calls[0][0];
      expect(arg.where).toEqual({ scheduleId: 2 });
    });

    it("orders by position so first-match-wins is deterministic", async () => {
      await ScheduleLocationRepository.findRulesByScheduleId({ scheduleId: 2 });
      const arg = vi.mocked(prisma.scheduleLocationRule.findMany).mock.calls[0][0];
      expect(arg.orderBy).toEqual({ position: "asc" });
    });

    it("selects exactly the fields resolveLocation consumes", async () => {
      await ScheduleLocationRepository.findRulesByScheduleId({ scheduleId: 2 });
      const arg = vi.mocked(prisma.scheduleLocationRule.findMany).mock.calls[0][0];
      expect(arg).not.toHaveProperty("include");
      expect(Object.keys(arg.select ?? {}).sort()).toEqual([
        "date",
        "days",
        "endTime",
        "id",
        "locked",
        "position",
        "scheduleLocationId",
        "startTime",
      ]);
    });
  });
});
