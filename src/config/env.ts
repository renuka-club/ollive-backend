import dotenv from 'dotenv';
dotenv.config();

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.warn(`Warning: Environment variable ${name} is missing.`);
    return '';
  }
  return value;
}

export const config = {
  PORT: process.env.PORT || '4000',
  SUPABASE_URL: getEnvVar('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
  GEMINI_API_KEY: getEnvVar('GEMINI_API_KEY'),
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173'
};
