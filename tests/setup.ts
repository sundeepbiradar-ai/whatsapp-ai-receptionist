if (process.env["SUPABASE_TEST_URL"] && !process.env["NEXT_PUBLIC_SUPABASE_URL"])
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = process.env["SUPABASE_TEST_URL"];
if (process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"] && !process.env["SUPABASE_SERVICE_ROLE_KEY"])
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
