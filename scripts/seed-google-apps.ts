/**
 * Seed ONLY the Google Calendar + Google Meet app rows from GOOGLE_API_CREDENTIALS.
 *
 * Why not `scripts/seed-app-store.ts`? That script is marked @deprecated and
 * seeds every app in the store, creating App rows we never asked for. Cal-ID
 * reads OAuth keys from the App table at request time (see getGoogleAppKeys),
 * not from the environment, so *something* has to write these two rows -- this
 * does exactly that and nothing else.
 *
 * Idempotent: safe to re-run after rotating the client secret.
 *
 *   yarn workspace @calcom/prisma exec ts-node --transpile-only \
 *     ../../scripts/seed-google-apps.ts
 */
import dotEnv from "dotenv";
import path from "node:path";

import { shouldEnableApp } from "@calcom/app-store/_utils/validateAppKeys";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";

dotEnv.config({ path: path.resolve(__dirname, "../.env") });

async function upsertApp(
  slug: string,
  dirName: string,
  categories: Prisma.AppCreateInput["categories"],
  keys: Prisma.AppCreateInput["keys"]
) {
  // Match seed-app-store's lookup: slug and dirName are both unique, so either
  // can identify a previously-seeded row even if the other was renamed.
  const found = await prisma.app.findFirst({
    where: { OR: [{ slug }, { dirName }] },
  });

  const enabled = shouldEnableApp(dirName, keys as Prisma.JsonValue);
  const data = { slug, dirName, categories, keys, enabled };

  if (!found) {
    await prisma.app.create({ data });
    console.log(`created  ${slug} (enabled=${enabled})`);
  } else {
    await prisma.app.update({ where: { slug: found.slug }, data });
    console.log(`updated  ${slug} (enabled=${enabled})`);
  }
}

async function main() {
  const raw = process.env.GOOGLE_API_CREDENTIALS;
  if (!raw) throw new Error("GOOGLE_API_CREDENTIALS is not set");

  const { client_id, client_secret, redirect_uris } = JSON.parse(raw).web;
  if (!client_id || !client_secret || !redirect_uris?.length) {
    throw new Error("GOOGLE_API_CREDENTIALS.web is missing client_id/client_secret/redirect_uris");
  }
  const keys = { client_id, client_secret, redirect_uris };

  // One OAuth client backs both apps, exactly as seed-app-store.ts does.
  await upsertApp("google-calendar", "googlecalendar", ["calendar"], keys);
  await upsertApp("google-meet", "googlevideo", ["conferencing"], keys);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
