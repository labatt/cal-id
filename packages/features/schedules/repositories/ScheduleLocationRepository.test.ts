import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleLocationRepository } from "./ScheduleLocationRepository";

vi.mock("@calcom/prisma", () => {
  const mockPrisma = {
    scheduleLocation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    scheduleLocationRule: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
  };
  return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
});

const { prisma } = await import("@calcom/prisma");

describe("ScheduleLocationRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.scheduleLocation.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.scheduleLocationRule.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.scheduleLocation.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.scheduleLocation.create).mockResolvedValue({ id: 1 } as never);
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
        "compactCode",
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

  describe("writes", () => {
    it("scopes updateLocation by scheduleId so an id alone cannot reach another schedule", async () => {
      await ScheduleLocationRepository.updateLocation({ id: 5, scheduleId: 1, data: { label: "x" } });
      const arg = vi.mocked(prisma.scheduleLocation.updateMany).mock.calls[0][0];
      expect(arg.where).toEqual({ id: 5, scheduleId: 1 });
    });

    it("scopes deleteLocation by scheduleId", async () => {
      await ScheduleLocationRepository.deleteLocation({ id: 5, scheduleId: 1 });
      const arg = vi.mocked(prisma.scheduleLocation.deleteMany).mock.calls[0][0];
      expect(arg.where).toEqual({ id: 5, scheduleId: 1 });
    });

    it("scopes findLocationByShortCode by scheduleId", async () => {
      await ScheduleLocationRepository.findLocationByShortCode({ scheduleId: 1, shortCode: "TPA" });
      const arg = vi.mocked(prisma.scheduleLocation.findFirst).mock.calls[0][0];
      expect(arg.where).toEqual({ scheduleId: 1, shortCode: "TPA" });
    });

    it("replaces rather than stacks a dated rule", async () => {
      const date = new Date("2026-09-08T00:00:00Z");
      await ScheduleLocationRepository.upsertDateRule({ scheduleId: 1, scheduleLocationId: 2, date });
      expect(vi.mocked(prisma.scheduleLocationRule.deleteMany).mock.calls[0][0].where).toEqual({
        scheduleId: 1,
        date,
      });
      expect(vi.mocked(prisma.scheduleLocationRule.create).mock.calls[0][0].data).toMatchObject({
        scheduleId: 1,
        scheduleLocationId: 2,
        date,
        days: [],
        position: 0,
        locked: false,
      });
    });

    it("deletes only dated rules for that date", async () => {
      const date = new Date("2026-09-08T00:00:00Z");
      await ScheduleLocationRepository.deleteDateRule({ scheduleId: 1, date });
      expect(vi.mocked(prisma.scheduleLocationRule.deleteMany).mock.calls[0][0].where).toEqual({
        scheduleId: 1,
        date,
      });
    });

    it("replaceRecurringRules clears only recurring rows, leaving dated ones alone", async () => {
      await ScheduleLocationRepository.replaceRecurringRules({
        scheduleId: 1,
        rules: [{ scheduleLocationId: 2, days: [2, 3], startTime: null, endTime: null, locked: false }],
      });
      expect(vi.mocked(prisma.scheduleLocationRule.deleteMany).mock.calls[0][0].where).toEqual({
        scheduleId: 1,
        date: null,
      });
    });

    it("assigns ascending positions to recurring rules in the order given", async () => {
      await ScheduleLocationRepository.replaceRecurringRules({
        scheduleId: 1,
        rules: [
          { scheduleLocationId: 2, days: [2], startTime: null, endTime: null, locked: false },
          { scheduleLocationId: 3, days: [5], startTime: null, endTime: null, locked: true },
        ],
      });
      const rows = vi.mocked(prisma.scheduleLocationRule.createMany).mock.calls[0][0].data as {
        position: number;
      }[];
      expect(rows.map((row) => row.position)).toEqual([0, 1]);
    });

    it("skips the insert entirely when clearing all recurring rules", async () => {
      await ScheduleLocationRepository.replaceRecurringRules({ scheduleId: 1, rules: [] });
      expect(prisma.scheduleLocationRule.deleteMany).toHaveBeenCalled();
      expect(prisma.scheduleLocationRule.createMany).not.toHaveBeenCalled();
    });
  });
});
