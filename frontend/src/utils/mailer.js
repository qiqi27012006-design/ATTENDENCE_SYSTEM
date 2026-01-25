// src/utils/mailer.js
import emailjs from "@emailjs/browser";

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_RESET_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

let inited = false;

/**
 * Gửi OTP reset password qua EmailJS
 * Template đang dùng các biến:
 *  - {{email}}
 *  - {{otp_code}}
 *  - {{minutes}}
 *  - {{app_name}}
 */
export async function sendResetCodeEmail({
  email,
  otp_code,
  minutes = 15,
  app_name = "Attendance System",
}) {
  // Debug env (nếu thiếu sẽ biết ngay)
  console.log("EMAILJS ENV:", {
    SERVICE_ID,
    TEMPLATE_ID,
    PUBLIC_KEY: PUBLIC_KEY ? "(ok)" : "(missing)",
  });

  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error("Thiếu cấu hình EmailJS trong .env");
  }

  // init 1 lần
  if (!inited) {
    emailjs.init(PUBLIC_KEY);
    inited = true;
  }

  // params phải khớp tên biến trong template
  const params = {
    email,       // {{email}}
    otp_code,    // {{otp_code}}
    minutes,     // {{minutes}}
    app_name,    // {{app_name}}
  };

  console.log("EMAILJS PARAMS:", params);

  try {
    const res = await emailjs.send(SERVICE_ID, TEMPLATE_ID, params);
    console.log("EMAILJS SEND OK:", res);
    return res;
  } catch (err) {
    console.error("EMAILJS SEND ERROR FULL:", err);
    console.error("EMAILJS SEND ERROR TEXT:", err?.text);
    throw err;
  }
}
