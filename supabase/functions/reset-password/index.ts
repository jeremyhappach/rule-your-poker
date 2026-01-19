import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a strong random password
function generateStrongPassword(length: number = 16): string {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghjkmnpqrstuvwxyz";
  const numbers = "23456789";
  const special = "!@#$%&*";
  
  const allChars = uppercase + lowercase + numbers + special;
  
  // Ensure at least one of each type
  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split("").sort(() => Math.random() - 0.5).join("");
}

interface ResetPasswordRequest {
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: ResetPasswordRequest = await req.json();

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create admin client to access auth.users
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // First check if email exists in profiles and is active
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, username, is_active")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup error:", profileError);
      return new Response(
        JSON.stringify({ error: "An error occurred. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!profile) {
      // Don't reveal if email exists or not for security
      console.log("Email not found in profiles:", email);
      return new Response(
        JSON.stringify({ success: true, message: "If this email is registered, a password reset has been sent." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!profile.is_active) {
      console.log("Inactive account attempted password reset:", email);
      return new Response(
        JSON.stringify({ error: "This account has been deactivated. Please contact an administrator." }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate new password (only apply it after email is successfully sent)
    const newPassword = generateStrongPassword(16);

    // Send email with new password using Resend API directly
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Peoria Poker League <onboarding@resend.dev>",
        to: [email],
        subject: "Your Password Has Been Reset - Peoria Poker League",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #1a1a2e; color: #ffffff; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background-color: #16213e; border-radius: 12px; padding: 30px; border: 1px solid #d4a843; }
              .header { text-align: center; margin-bottom: 30px; }
              .logo { font-size: 48px; margin-bottom: 10px; }
              h1 { color: #d4a843; margin: 0; font-size: 24px; }
              .password-box { background-color: #0f0f23; border: 2px solid #d4a843; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
              .password { font-family: monospace; font-size: 20px; color: #4ade80; letter-spacing: 2px; word-break: break-all; }
              .warning { background-color: #422006; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
              .warning-text { color: #fbbf24; margin: 0; }
              .instructions { color: #a0aec0; line-height: 1.6; }
              .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
              .suits { color: #d4a843; letter-spacing: 5px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo">♠</div>
                <h1>Peoria Poker League</h1>
              </div>
              
              <p style="color: #e2e8f0;">Hello ${profile.username || "Player"},</p>
              
              <p class="instructions">Your password has been reset. Here is your new temporary password:</p>
              
              <div class="password-box">
                <div class="password">${newPassword}</div>
              </div>
              
              <div class="warning">
                <p class="warning-text">⚠️ Important: For your security, please change this password immediately after logging in.</p>
              </div>
              
              <p class="instructions">
                <strong>To change your password:</strong><br>
                1. Log in with the temporary password above<br>
                2. Go to the main lobby<br>
                3. Open your Profile Settings<br>
                4. Update your password to something memorable
              </p>
              
              <p class="instructions">If you did not request this password reset, please contact an administrator immediately.</p>
              
              <div class="footer">
                <p class="suits">♠ ♥ ♦ ♣</p>
                <p>Peoria Poker League</p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!emailResponse.ok) {
      let errorText = "";
      try {
        const errorData = await emailResponse.json();
        errorText = JSON.stringify(errorData);
        console.error("Resend API error:", errorData);
      } catch {
        errorText = await emailResponse.text();
        console.error("Resend API error (non-json):", errorText);
      }

      // IMPORTANT: Do NOT change the password if we couldn't email it.
      // Also, keep the response generic to avoid leaking whether the email exists.
      return new Response(
        JSON.stringify({
          success: true,
          message: "If this email is registered, a password reset has been sent.",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Only after the email is successfully sent do we update the user's password.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: newPassword,
    });

    if (updateError) {
      console.error("Password update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to reset password. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Password reset email sent successfully.");

    return new Response(
      JSON.stringify({ success: true, message: "If this email is registered, a password reset has been sent." }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in reset-password function:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
