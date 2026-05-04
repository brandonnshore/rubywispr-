export const syntheticBackendFixtures = deepFreeze({
  clerk: {
    memberUserId: "user_rw_synthetic_member_001",
    adminUserId: "user_rw_synthetic_admin_001",
    memberSessionId: "rw_synthetic_member_session_001",
    adminSessionId: "rw_synthetic_admin_session_001",
    memberEmail: "member.alpha@example.com",
    adminEmail: "admin.alpha@example.com",
  },
  supabase: {
    profile: {
      id: "profile_rw_synthetic_member_001",
      clerk_user_id: "user_rw_synthetic_member_001",
      email: "member.alpha@example.com",
      plan_state: "trial_active",
      terms_accepted_at: "2026-01-01T00:00:00.000Z",
      trial_words_used: 120,
      trial_words_limit: 5000,
      monthly_words_used: 120,
    },
    requestMetadata: {
      request_id: "req_rw_synthetic_001",
      clerk_user_id: "user_rw_synthetic_member_001",
      plan_state: "trial_active",
      duration_ms: 4200,
      output_word_count: 8,
      provider: "mock_provider",
      provider_latency_ms: 210,
      total_latency_ms: 320,
      app_version: "0.1.0-test",
      os_version: "macOS test",
      error_code: null,
    },
  },
  provider: {
    successMetadata: {
      provider: "mock_provider",
      provider_request_id: "provider_rw_synthetic_001",
      latency_ms: 210,
      duration_ms: 4200,
      output_word_count: 8,
    },
    failureMetadata: {
      provider: "mock_provider",
      provider_request_id: "provider_rw_synthetic_002",
      latency_ms: 175,
      error_code: "provider_error",
    },
  },
  backendErrorCodes: [
    "signed_out",
    "terms_required",
    "trial_exhausted",
    "subscription_required",
    "payment_failed",
    "account_blocked",
    "rate_limited",
    "duration_limit_reached",
    "invalid_audio",
    "provider_error",
    "network_error",
    "service_unavailable",
    "internal_error",
  ],
});

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  for (const childValue of Object.values(value)) {
    deepFreeze(childValue);
  }

  return Object.freeze(value);
}
