
-- AddForeignKey
ALTER TABLE "public"."ScheduleLocation" ADD CONSTRAINT "ScheduleLocation_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "public"."Credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

