
-- AlterTable
ALTER TABLE "public"."EventType" ADD COLUMN     "useScheduleLocations" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."ScheduleLocation" (
    "id" SERIAL NOT NULL,
    "scheduleId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "address" TEXT,
    "credentialId" INTEGER,

    CONSTRAINT "ScheduleLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScheduleLocationRule" (
    "id" SERIAL NOT NULL,
    "scheduleId" INTEGER NOT NULL,
    "scheduleLocationId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "date" DATE,
    "days" INTEGER[],
    "startTime" TIME,
    "endTime" TIME,
    "locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ScheduleLocationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleLocation_scheduleId_idx" ON "public"."ScheduleLocation"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleLocation_scheduleId_shortCode_key" ON "public"."ScheduleLocation"("scheduleId", "shortCode");

-- CreateIndex
CREATE INDEX "ScheduleLocationRule_scheduleId_position_idx" ON "public"."ScheduleLocationRule"("scheduleId", "position");

-- CreateIndex
CREATE INDEX "ScheduleLocationRule_scheduleLocationId_idx" ON "public"."ScheduleLocationRule"("scheduleLocationId");

-- AddForeignKey
ALTER TABLE "public"."ScheduleLocation" ADD CONSTRAINT "ScheduleLocation_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScheduleLocationRule" ADD CONSTRAINT "ScheduleLocationRule_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScheduleLocationRule" ADD CONSTRAINT "ScheduleLocationRule_scheduleLocationId_fkey" FOREIGN KEY ("scheduleLocationId") REFERENCES "public"."ScheduleLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

