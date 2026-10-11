import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(body: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return jsonResponse({ error: "Authentication is required." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Account deletion is missing required Supabase environment variables.");
    return jsonResponse({ error: "Account deletion is not configured." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: "Your session is invalid or expired. Sign in again." }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const files: string[] = [];
    const folders = [user.id];

    while (folders.length > 0) {
      const folder = folders.pop();
      if (folder === undefined) continue;
      let offset = 0;

      while (true) {
        const { data: entries, error: listError } = await adminClient.storage
          .from("speech-recordings")
          .list(folder, { limit: 1000, offset });
        if (listError) throw listError;

        for (const entry of entries ?? []) {
          const path = `${folder}/${entry.name}`;
          if (entry.id === null) {
            folders.push(path);
          } else {
            files.push(path);
          }
        }

        if (!entries || entries.length < 1000) break;
        offset += entries.length;
      }
    }

    for (let index = 0; index < files.length; index += 100) {
      const { error: removeError } = await adminClient.storage
        .from("speech-recordings")
        .remove(files.slice(index, index + 100));
      if (removeError) throw removeError;
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return jsonResponse({ message: "Account and associated data deleted." });
  } catch (error) {
    console.error("Failed to delete account data:", error);
    return jsonResponse({ error: "Could not delete the account and its data. Please try again." }, 500);
  }
});
