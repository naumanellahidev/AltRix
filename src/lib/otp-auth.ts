export const OTP_RESEND_COOLDOWN_SECONDS = 60;

const cooldownKey = (email: string) => `otp-resend-cooldown:${email.trim().toLowerCase()}`;

export const startOtpCooldown = (email: string, seconds = OTP_RESEND_COOLDOWN_SECONDS) => {
  localStorage.setItem(cooldownKey(email), String(Date.now() + seconds * 1000));
};

export const getOtpCooldownRemaining = (email: string): number => {
  const raw = localStorage.getItem(cooldownKey(email));
  const until = raw ? Number(raw) : 0;
  if (!Number.isFinite(until)) return 0;
  const remaining = Math.ceil((until - Date.now()) / 1000);
  if (remaining <= 0) {
    localStorage.removeItem(cooldownKey(email));
    return 0;
  }
  return remaining;
};
