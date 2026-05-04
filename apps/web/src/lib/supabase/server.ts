import "server-only";

import { serverEnv } from "@/config/server";

export const supabaseServerOnlyModuleId = "@/lib/supabase/server" as const;

export const supabaseServiceRoleEnvVariableNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export const supabaseMetadataTableNames = [
  "admin_roles",
  "friend_of_ruby_batches",
  "profiles",
  "subscriptions",
  "transcription_requests",
  "usage_counters",
] as const;

export type SupabaseServiceRoleEnvVariableName =
  (typeof supabaseServiceRoleEnvVariableNames)[number];

export type SupabaseMetadataTableName =
  (typeof supabaseMetadataTableNames)[number];

export type SupabaseMetadataAccessRule = Readonly<{
  access: "server-service-role-only";
  containsPrivateAudioOrTranscriptContent: false;
  tableName: SupabaseMetadataTableName;
}>;

export type SupabaseServiceRoleRuntimeConfig = Readonly<{
  serviceRoleKey: string;
  url: string;
}>;

export type SupabaseServiceRoleClientFactory<Client> = (
  config: SupabaseServiceRoleRuntimeConfig,
) => Client;

export const supabaseMetadataAccessRules: readonly SupabaseMetadataAccessRule[] =
  supabaseMetadataTableNames.map((tableName) => ({
    access: "server-service-role-only",
    containsPrivateAudioOrTranscriptContent: false,
    tableName,
  }));

export const readSupabaseServiceRoleRuntimeConfig =
  (): SupabaseServiceRoleRuntimeConfig => {
    const { serviceRoleKey, url } = serverEnv.supabase;

    if (!url || !serviceRoleKey) {
      const missingNames: SupabaseServiceRoleEnvVariableName[] = [];

      if (!url) {
        missingNames.push("SUPABASE_URL");
      }

      if (!serviceRoleKey) {
        missingNames.push("SUPABASE_SERVICE_ROLE_KEY");
      }

      throw new Error(
        `Supabase service-role access requires server-only env: ${missingNames.join(
          ", ",
        )}.`,
      );
    }

    return { serviceRoleKey, url };
  };

export const createSupabaseServiceRoleClient = <Client>(
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Client => createClient(readSupabaseServiceRoleRuntimeConfig());
