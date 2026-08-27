import { ErrorWithCode } from "@calcom/lib/errors";
import type { LocationRule } from "../lib/resolveLocation";
import type { ScheduleLocationRow } from "../repositories/ScheduleLocationRepository";

const SHORT_CODE_MAX_LENGTH = 4;
const COMPACT_CODE_MAX_LENGTH = 2;
const MINUTES_PER_DAY = 24 * 60;

export type RecurringRuleInput = {
  scheduleLocationId: number;
  days: number[];
  startTime: Date | null;
  endTime: Date | null;
  locked: boolean;
};

/**
 * Declared structurally rather than as `typeof ScheduleLocationRepository` so a test can
 * supply a plain object of mocks without casting through `any`.
 */
export interface IScheduleLocationRepository {
  findLocationsByScheduleId(args: { scheduleId: number }): Promise<ScheduleLocationRow[]>;
  findRulesByScheduleId(args: { scheduleId: number }): Promise<LocationRule[]>;
  createLocation(args: {
    scheduleId: number;
    label: string;
    shortCode: string;
    compactCode: string | null;
    type: string;
    address: string | null;
    credentialId: number | null;
  }): Promise<ScheduleLocationRow>;
  deleteLocation(args: { id: number; scheduleId: number }): Promise<void>;
  findLocationByShortCode(args: { scheduleId: number; shortCode: string }): Promise<{ id: number } | null>;
  upsertDateRule(args: { scheduleId: number; scheduleLocationId: number; date: Date }): Promise<void>;
  deleteDateRule(args: { scheduleId: number; date: Date }): Promise<void>;
  replaceRecurringRules(args: { scheduleId: number; rules: RecurringRuleInput[] }): Promise<void>;
}

export interface IScheduleLocationServiceDeps {
  scheduleLocationRepo: IScheduleLocationRepository;
  findScheduleOwner: (scheduleId: number) => Promise<number | null>;
}

const minutesFromTimeColumn = (value: Date): number => value.getUTCHours() * 60 + value.getUTCMinutes();

export class ScheduleLocationService {
  constructor(private deps: IScheduleLocationServiceDeps) {}

  /**
   * Every public method funnels through this first. Schedule ids are small integers and so
   * trivially guessable, and the transport layer is not a trustworthy place to enforce who
   * owns what.
   *
   * A schedule that does not exist is reported as not found rather than forbidden: there is
   * nothing to protect, and conflating the two makes a real bug look like a permissions
   * problem.
   */
  private async assertOwnership(scheduleId: number, userId: number): Promise<void> {
    const ownerId = await this.deps.findScheduleOwner(scheduleId);
    if (ownerId === null) throw ErrorWithCode.Factory.NotFound("Schedule not found");
    if (ownerId !== userId) throw ErrorWithCode.Factory.Forbidden("This schedule belongs to someone else");
  }

  async listForSchedule({ scheduleId, userId }: { scheduleId: number; userId: number }): Promise<{
    locations: ScheduleLocationRow[];
    rules: LocationRule[];
  }> {
    await this.assertOwnership(scheduleId, userId);
    const [locations, rules] = await Promise.all([
      this.deps.scheduleLocationRepo.findLocationsByScheduleId({ scheduleId }),
      this.deps.scheduleLocationRepo.findRulesByScheduleId({ scheduleId }),
    ]);
    return { locations, rules };
  }

  async createLocation({
    scheduleId,
    userId,
    label,
    shortCode,
    compactCode = null,
    type,
    address = null,
    credentialId = null,
  }: {
    scheduleId: number;
    userId: number;
    label: string;
    shortCode: string;
    compactCode?: string | null;
    type: string;
    address?: string | null;
    credentialId?: number | null;
  }): Promise<ScheduleLocationRow> {
    await this.assertOwnership(scheduleId, userId);

    const trimmedLabel = label.trim();
    if (!trimmedLabel) throw ErrorWithCode.Factory.BadRequest("A location needs a label");

    // Upper-cased before both the clash check and the write, so uniqueness cannot be
    // defeated by casing and the calendar marker looks the same however it was typed.
    const normalisedCode = shortCode.trim().toUpperCase();
    if (!normalisedCode || normalisedCode.length > SHORT_CODE_MAX_LENGTH) {
      throw ErrorWithCode.Factory.BadRequest(`A short code must be 1-${SHORT_CODE_MAX_LENGTH} characters`);
    }

    const clash = await this.deps.scheduleLocationRepo.findLocationByShortCode({
      scheduleId,
      shortCode: normalisedCode,
    });
    if (clash) {
      throw ErrorWithCode.Factory.BadRequest(`Short code ${normalisedCode} is already used on this schedule`);
    }

    /**
     * Defaults to the first two characters, which is right for TPA and wrong for ZOOM — ZM is
     * not a prefix of it. So it is only a default, and a location whose abbreviation is not
     * its opening letters needs one typed.
     */
    const normalisedCompact = (compactCode ?? "").trim().toUpperCase() || normalisedCode.slice(0, 2);
    if (normalisedCompact.length > COMPACT_CODE_MAX_LENGTH) {
      throw ErrorWithCode.Factory.BadRequest(
        `A compact code must be 1-${COMPACT_CODE_MAX_LENGTH} characters`
      );
    }

    return this.deps.scheduleLocationRepo.createLocation({
      scheduleId,
      label: trimmedLabel,
      shortCode: normalisedCode,
      compactCode: normalisedCompact,
      type,
      address,
      credentialId,
    });
  }

  async deleteLocation({
    scheduleId,
    userId,
    locationId,
  }: {
    scheduleId: number;
    userId: number;
    locationId: number;
  }): Promise<void> {
    await this.assertOwnership(scheduleId, userId);
    // Rules pointing at it go too, via onDelete: Cascade. That is the wanted behaviour here:
    // a rule whose location no longer exists has nothing left to resolve to.
    await this.deps.scheduleLocationRepo.deleteLocation({ id: locationId, scheduleId });
  }

  async assignDate({
    scheduleId,
    userId,
    date,
    scheduleLocationId,
  }: {
    scheduleId: number;
    userId: number;
    date: Date;
    scheduleLocationId: number | null;
  }): Promise<void> {
    await this.assertOwnership(scheduleId, userId);
    if (scheduleLocationId === null) {
      await this.deps.scheduleLocationRepo.deleteDateRule({ scheduleId, date });
      return;
    }
    await this.deps.scheduleLocationRepo.upsertDateRule({ scheduleId, scheduleLocationId, date });
  }

  async setRecurringRules({
    scheduleId,
    userId,
    rules,
  }: {
    scheduleId: number;
    userId: number;
    rules: RecurringRuleInput[];
  }): Promise<void> {
    await this.assertOwnership(scheduleId, userId);

    // Validated in full before anything is written, so a bad rule late in the list cannot
    // leave the baseline half-replaced.
    for (const rule of rules) {
      if (rule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        throw ErrorWithCode.Factory.BadRequest("Weekdays must be integers between 0 and 6");
      }
      const from = rule.startTime ? minutesFromTimeColumn(rule.startTime) : 0;
      const to = rule.endTime ? minutesFromTimeColumn(rule.endTime) : MINUTES_PER_DAY;
      if (to <= from) {
        throw ErrorWithCode.Factory.BadRequest("A location window must end after it starts");
      }
    }

    await this.deps.scheduleLocationRepo.replaceRecurringRules({ scheduleId, rules });
  }
}
