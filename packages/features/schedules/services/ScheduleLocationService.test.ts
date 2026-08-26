import { ErrorCode } from "@calcom/lib/errorCodes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IScheduleLocationRepository } from "./ScheduleLocationService";
import { ScheduleLocationService } from "./ScheduleLocationService";

const repo = {
  findLocationsByScheduleId: vi.fn(),
  findRulesByScheduleId: vi.fn(),
  createLocation: vi.fn(),
  deleteLocation: vi.fn(),
  findLocationByShortCode: vi.fn(),
  upsertDateRule: vi.fn(),
  deleteDateRule: vi.fn(),
  replaceRecurringRules: vi.fn(),
} satisfies IScheduleLocationRepository;

const OWNER = 42;

const build = (ownerId: number | null = OWNER) =>
  new ScheduleLocationService({
    scheduleLocationRepo: repo,
    findScheduleOwner: vi.fn(async () => ownerId),
  });

describe("ScheduleLocationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findLocationsByScheduleId.mockResolvedValue([]);
    repo.findRulesByScheduleId.mockResolvedValue([]);
    repo.findLocationByShortCode.mockResolvedValue(null);
    repo.createLocation.mockResolvedValue({
      id: 1,
      label: "Tampa",
      shortCode: "TPA",
      type: "inPerson",
      address: null,
      credentialId: null,
    });
  });

  describe("ownership", () => {
    it("refuses to read a schedule the user does not own", async () => {
      await expect(build(99).listForSchedule({ scheduleId: 1, userId: OWNER })).rejects.toMatchObject({
        code: ErrorCode.Forbidden,
      });
    });

    it("refuses to write to a schedule the user does not own, and does not touch the repository", async () => {
      await expect(
        build(99).assignDate({ scheduleId: 1, userId: OWNER, date: new Date(), scheduleLocationId: 2 })
      ).rejects.toMatchObject({ code: ErrorCode.Forbidden });
      expect(repo.upsertDateRule).not.toHaveBeenCalled();
    });

    it("reports a missing schedule as not found rather than forbidden", async () => {
      await expect(build(null).listForSchedule({ scheduleId: 1, userId: OWNER })).rejects.toMatchObject({
        code: ErrorCode.NotFound,
      });
    });

    it("refuses setRecurringRules for a schedule the user does not own", async () => {
      await expect(
        build(99).setRecurringRules({ scheduleId: 1, userId: OWNER, rules: [] })
      ).rejects.toMatchObject({ code: ErrorCode.Forbidden });
      expect(repo.replaceRecurringRules).not.toHaveBeenCalled();
    });
  });

  describe("createLocation", () => {
    it("rejects a duplicate short code within the schedule", async () => {
      repo.findLocationByShortCode.mockResolvedValue({ id: 7 });
      await expect(
        build().createLocation({
          scheduleId: 1,
          userId: OWNER,
          label: "Tampa",
          shortCode: "TPA",
          type: "inPerson",
        })
      ).rejects.toMatchObject({ code: ErrorCode.BadRequest });
      expect(repo.createLocation).not.toHaveBeenCalled();
    });

    it("normalises the short code to upper case and trims it", async () => {
      await build().createLocation({
        scheduleId: 1,
        userId: OWNER,
        label: "Tampa",
        shortCode: " tpa ",
        type: "inPerson",
      });
      expect(repo.createLocation).toHaveBeenCalledWith(expect.objectContaining({ shortCode: "TPA" }));
    });

    it("checks the short code clash against the normalised form", async () => {
      await build().createLocation({
        scheduleId: 1,
        userId: OWNER,
        label: "Tampa",
        shortCode: "tpa",
        type: "inPerson",
      });
      expect(repo.findLocationByShortCode).toHaveBeenCalledWith({ scheduleId: 1, shortCode: "TPA" });
    });

    it("rejects an empty label", async () => {
      await expect(
        build().createLocation({
          scheduleId: 1,
          userId: OWNER,
          label: "  ",
          shortCode: "TPA",
          type: "inPerson",
        })
      ).rejects.toMatchObject({ code: ErrorCode.BadRequest });
    });

    it("rejects a short code longer than four characters", async () => {
      await expect(
        build().createLocation({
          scheduleId: 1,
          userId: OWNER,
          label: "Tampa",
          shortCode: "TAMPA",
          type: "inPerson",
        })
      ).rejects.toMatchObject({ code: ErrorCode.BadRequest });
    });
  });

  describe("assignDate", () => {
    it("clears a date when given a null location", async () => {
      const date = new Date("2026-09-08T00:00:00Z");
      await build().assignDate({ scheduleId: 1, userId: OWNER, date, scheduleLocationId: null });
      expect(repo.deleteDateRule).toHaveBeenCalledWith({ scheduleId: 1, date });
      expect(repo.upsertDateRule).not.toHaveBeenCalled();
    });

    it("assigns a date to a location", async () => {
      const date = new Date("2026-09-08T00:00:00Z");
      await build().assignDate({ scheduleId: 1, userId: OWNER, date, scheduleLocationId: 3 });
      expect(repo.upsertDateRule).toHaveBeenCalledWith({ scheduleId: 1, scheduleLocationId: 3, date });
    });
  });

  describe("setRecurringRules", () => {
    it("rejects a weekday outside 0-6", async () => {
      await expect(
        build().setRecurringRules({
          scheduleId: 1,
          userId: OWNER,
          rules: [{ scheduleLocationId: 2, days: [7], startTime: null, endTime: null, locked: false }],
        })
      ).rejects.toMatchObject({ code: ErrorCode.BadRequest });
      expect(repo.replaceRecurringRules).not.toHaveBeenCalled();
    });

    it("rejects a time window that ends before it starts", async () => {
      await expect(
        build().setRecurringRules({
          scheduleId: 1,
          userId: OWNER,
          rules: [
            {
              scheduleLocationId: 2,
              days: [4],
              startTime: new Date("1970-01-01T12:00:00Z"),
              endTime: new Date("1970-01-01T09:00:00Z"),
              locked: false,
            },
          ],
        })
      ).rejects.toMatchObject({ code: ErrorCode.BadRequest });
    });

    it("rejects a zero-length window", async () => {
      await expect(
        build().setRecurringRules({
          scheduleId: 1,
          userId: OWNER,
          rules: [
            {
              scheduleLocationId: 2,
              days: [4],
              startTime: new Date("1970-01-01T09:00:00Z"),
              endTime: new Date("1970-01-01T09:00:00Z"),
              locked: false,
            },
          ],
        })
      ).rejects.toMatchObject({ code: ErrorCode.BadRequest });
    });

    it("accepts a half-day window", async () => {
      const rules = [
        {
          scheduleLocationId: 2,
          days: [4],
          startTime: new Date("1970-01-01T09:30:00Z"),
          endTime: new Date("1970-01-01T12:00:00Z"),
          locked: false,
        },
      ];
      await build().setRecurringRules({ scheduleId: 1, userId: OWNER, rules });
      expect(repo.replaceRecurringRules).toHaveBeenCalledWith({ scheduleId: 1, rules });
    });

    it("passes valid rules through in the order given", async () => {
      const rules = [
        { scheduleLocationId: 2, days: [2, 3], startTime: null, endTime: null, locked: false },
        { scheduleLocationId: 3, days: [5], startTime: null, endTime: null, locked: true },
      ];
      await build().setRecurringRules({ scheduleId: 1, userId: OWNER, rules });
      expect(repo.replaceRecurringRules).toHaveBeenCalledWith({ scheduleId: 1, rules });
    });

    it("accepts an empty rule set as a way to clear the baseline", async () => {
      await build().setRecurringRules({ scheduleId: 1, userId: OWNER, rules: [] });
      expect(repo.replaceRecurringRules).toHaveBeenCalledWith({ scheduleId: 1, rules: [] });
    });
  });
});
